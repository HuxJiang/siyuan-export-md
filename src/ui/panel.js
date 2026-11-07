/*
 * siyuan-export-md — 导出管理页：按笔记本文档树列出所有页面，标注是否导出过与导出路径
 *
 * 页面是思源的自定义页签（addTab + openTab），移动端退回对话框；数据来源分两路：
 *   1. 文档树：内核 SQL 的 blocks 表（每个笔记本一次查询），还原 hpath 层级；
 *   2. 导出状态：ExportLog 持久化记录（导出流程写入，控制页只读）。
 * 页面本身不保存状态，导出后由 RECORDS_EVENT 事件触发重绘。
 */
"use strict";

const { openTab, getFrontend, showMessage, confirm, Dialog } = require("siyuan");
const { listNotebooks, listDocsOfNotebook } = require("../api");
const {
  buildDocTree,
  countTreeDocs,
  walkDocs,
  matchesNode,
  normalizeQuery
} = require("../doc-tree");
const { RECORDS_EVENT, pathOf, timeOf } = require("../export-log");
const { exportDocs } = require("./dialog");
const { isDesktopWritable, defaultOutputDir } = require("../output");

const MANAGER_TAB_TYPE = "siyuan-export-md-manager";
const STYLE_ID = "siyuan-export-md-style";

const PANEL_CSS = [
  ".syxm-tab{display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden;}",
  ".syxm-page{display:flex;flex-direction:column;flex:1;height:100%;min-height:0;font-size:13px;color:var(--b3-theme-on-background);background:var(--b3-theme-background);}",
  ".syxm-head{flex:none;padding:12px 16px 10px;border-bottom:1px solid var(--b3-border-color);display:flex;flex-direction:column;gap:8px;}",
  ".syxm-title-row{display:flex;align-items:center;gap:10px;}",
  ".syxm-title{font-size:15px;font-weight:600;}",
  ".syxm-sub{color:var(--b3-theme-on-surface-variant);font-size:12px;}",
  ".syxm-spacer{flex:1;}",
  ".syxm-stats{display:flex;gap:8px;flex-wrap:wrap;}",
  ".syxm-stat{display:inline-flex;align-items:center;gap:4px;padding:2px 9px;border-radius:12px;background:var(--b3-theme-surface);border:1px solid var(--b3-border-color);font-size:12px;color:var(--b3-theme-on-surface-variant);}",
  ".syxm-stat b{font-weight:600;color:var(--b3-theme-on-background);}",
  ".syxm-toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;}",
  ".syxm-search{flex:1;min-width:140px;height:30px;}",
  ".syxm-body{flex:1;min-height:0;overflow:auto;padding:4px 8px 24px;}",
  ".syxm-node{position:relative;}",
  ".syxm-row{display:grid;grid-template-columns:16px 20px minmax(110px,min(38vw,320px)) 62px minmax(80px,1fr) auto;align-items:center;gap:6px;padding-top:3px;padding-bottom:3px;padding-right:6px;border-radius:6px;line-height:20px;}",
  ".syxm-row:hover{background:var(--b3-list-hover);}",
  ".syxm-row--nb{font-weight:600;}",
  ".syxm-caret{border:0;background:transparent;cursor:pointer;color:var(--b3-theme-on-surface-variant);padding:0;height:18px;width:16px;font-size:11px;line-height:18px;}",
  ".syxm-caret--empty{cursor:default;}",
  ".syxm-icon{font-size:13px;text-align:center;opacity:.85;}",
  ".syxm-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
  ".syxm-badge{justify-self:start;font-size:11px;padding:1px 7px;border-radius:9px;border:1px solid transparent;white-space:nowrap;}",
  ".syxm-badge--ok{color:#1f7a4d;background:rgba(31,122,77,.12);border-color:rgba(31,122,77,.35);}",
  ".syxm-badge--none{color:var(--b3-theme-on-surface-variant);background:var(--b3-theme-surface);border-color:var(--b3-border-color);}",
  ".syxm-badge--nb{color:var(--b3-theme-on-surface-variant);background:transparent;border-color:var(--b3-border-color);}",
  ".syxm-path{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--b3-theme-on-surface-variant);font-size:12px;}",
  ".syxm-actions{display:flex;gap:6px;justify-content:flex-end;}",
  ".syxm-mini{height:22px;line-height:20px;padding:0 8px;font-size:12px;border-radius:4px;flex:none;white-space:nowrap;}",
  ".syxm-children{margin-left:9px;border-left:1px dashed var(--b3-border-color);}",
  ".syxm-empty{padding:32px 16px;text-align:center;color:var(--b3-theme-on-surface-variant);line-height:1.9;}",
  ".syxm-foot{flex:none;padding:6px 16px;border-top:1px solid var(--b3-border-color);color:var(--b3-theme-on-surface-variant);font-size:12px;min-height:28px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
  ".syxm-tab-dialog .syxm-page{height:68vh;}"
].join("");

function injectStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = PANEL_CSS;
  (document.head || document.body || document.documentElement).appendChild(style);
}

function removeStyles() {
  if (typeof document === "undefined") return;
  const style = document.getElementById(STYLE_ID);
  if (style) style.remove();
}

function isMobileUI() {
  try {
    const frontend = String(getFrontend() || "");
    return frontend.indexOf("mobile") !== -1;
  } catch (e) {
    return false;
  }
}

function copyText(text) {
  if (!text) return false;
  try {
    const req = typeof window !== "undefined" && window.require;
    const clipboard = req && req("electron").clipboard;
    if (clipboard && typeof clipboard.writeText === "function") {
      clipboard.writeText(text);
      return true;
    }
  } catch (e) {
    /* 不是 Electron 就换下一个通道 */
  }
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) {
    /* 没有剪贴板权限 */
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand && document.execCommand("copy");
    area.remove();
    return !!ok;
  } catch (e) {
    return false;
  }
}

function revealPath(fullPath) {
  if (!fullPath) return false;
  try {
    const req = typeof window !== "undefined" && window.require;
    const shell = req && req("electron").shell;
    if (shell && typeof shell.showItemInFolder === "function") {
      shell.showItemInFolder(fullPath);
      return true;
    }
  } catch (e) {
    /* 非桌面端没有 shell */
  }
  return false;
}

function makeButton(label, className, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className || "b3-button b3-button--outline syxm-mini";
  button.textContent = label;
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick(button);
  });
  return button;
}

/**
 * 创建控制页。返回 { element, refresh, reload, destroy }。
 * refresh 只重绘（读内存里的记录），reload 重新拉文档树。
 */
function createPanel(plugin, options) {
  injectStyles();
  const log = plugin.exportLog;
  const opts = options || {};

  const state = {
    trees: [],
    loading: false,
    query: "",
    error: "",
    stamp: "",
    done: 0,
    total: 0
  };

  const root = document.createElement("div");
  root.className = "syxm-page";
  root.innerHTML = [
    '<div class="syxm-head">',
    '  <div class="syxm-title-row">',
    '    <span class="syxm-title">导出管理</span>',
    '    <span class="syxm-sub" data-el="stamp"></span>',
    '    <span class="syxm-spacer"></span>',
    '    <button class="b3-button b3-button--outline" data-el="reload">刷新</button>',
    "  </div>",
    '  <div class="syxm-stats">',
    '    <span class="syxm-stat">页面<b data-el="total">0</b></span>',
    '    <span class="syxm-stat">已导出<b data-el="done">0</b></span>',
    '    <span class="syxm-stat">未导出<b data-el="todo">0</b></span>',
    '    <span class="syxm-stat">输出<b data-el="mode">-</b></span>',
    "  </div>",
    '  <div class="syxm-toolbar">',
    '    <input class="b3-text-field syxm-search" data-el="search" placeholder="搜索标题或路径" />',
    '    <button class="b3-button b3-button--outline" data-el="batch">导出全部未导出</button>',
    '    <button class="b3-button b3-button--text" data-el="clear">清空导出记录</button>',
    "  </div>",
    "</div>",
    '<div class="syxm-body" data-el="body"><div class="syxm-empty">正在读取文档树…</div></div>',
    '<div class="syxm-foot" data-el="status"></div>'
  ].join("\n");

  const el = {};
  root.querySelectorAll("[data-el]").forEach((node) => {
    el[node.getAttribute("data-el")] = node;
  });

  function setStatus(text) {
    el.status.textContent = text || "";
  }

  function updateStats() {
    el.total.textContent = String(state.total);
    el.done.textContent = String(state.done);
    el.todo.textContent = String(Math.max(0, state.total - state.done));
    el.mode.textContent = plugin.opts.outputMode === "folder" ? "文件夹" : "压缩包";
    el.mode.title = plugin.opts.outputMode === "folder"
      ? plugin.opts.outputDir || defaultOutputDir() || "默认目录"
      : "下载 zip";
    el.stamp.textContent = state.stamp ? "更新于 " + state.stamp : "";
  }

  function buildActions(node, notebookName) {
    const actions = document.createElement("div");
    actions.className = "syxm-actions";
    const doc = node.doc;
    const record = log.get(doc.id);

    if (record && record.mode === "folder" && record.fullPath && isDesktopWritable()) {
      actions.appendChild(
        makeButton("打开目录", "b3-button b3-button--text syxm-mini", () => {
          if (!revealPath(record.fullPath)) {
            if (copyText(record.fullPath)) showMessage("无法调用文件管理器，路径已复制", 4000);
          }
        })
      );
    }
    if (record) {
      actions.appendChild(
        makeButton("复制路径", "b3-button b3-button--text syxm-mini", () => {
          const target = pathOf(record);
          showMessage(copyText(target) ? "已复制导出路径" : "复制失败，请手动复制", 4000);
        })
      );
    }

    const exportBtn = makeButton(
      record ? "重新导出" : "导出",
      "b3-button b3-button--outline syxm-mini",
      async () => {
        exportBtn.disabled = true;
        const label = exportBtn.textContent;
        exportBtn.textContent = "导出中…";
        setStatus("正在导出：" + doc.title);
        try {
          await exportDocs(plugin, { ...plugin.opts, scope: "doc" }, [doc.id], notebookName || "", setStatus);
        } catch (e) {
          setStatus("导出失败：" + ((e && e.message) || e));
          showMessage("导出失败：" + ((e && e.message) || e), 6000, "error");
        } finally {
          exportBtn.disabled = false;
          exportBtn.textContent = label;
          refresh();
        }
      }
    );
    actions.appendChild(exportBtn);
    return actions;
  }

  /** 懒渲染：子树第一次展开时才建 DOM，避免几千篇文档一次性铺满 */
  function buildNode(node, depth, notebookName) {
    const wrap = document.createElement("div");
    wrap.className = "syxm-node";

    const row = document.createElement("div");
    row.className = "syxm-row" + (node.kind === "notebook" ? " syxm-row--nb" : "");
    row.style.paddingLeft = (4 + depth * 14) + "px";

    let childBox = null;
    const caret = document.createElement("button");
    caret.type = "button";
    caret.className = "syxm-caret" + (node.children.length ? "" : " syxm-caret--empty");

    const icon = document.createElement("span");
    icon.className = "syxm-icon";
    icon.textContent = node.kind === "notebook" ? "📚" : node.doc && !node.children.length ? "📄" : "📁";

    const name = document.createElement("span");
    name.className = "syxm-name";
    name.textContent = node.doc ? node.doc.title : node.name;
    name.title = node.doc ? node.doc.hpath || node.doc.title : node.name;

    const badge = document.createElement("span");
    if (node.doc) {
      const record = log.get(node.doc.id);
      badge.className = "syxm-badge " + (record ? "syxm-badge--ok" : "syxm-badge--none");
      badge.textContent = record ? "已导出" : "未导出";
      if (record) {
        const when = timeOf(record);
        badge.title = when ? "最近导出：" + when : "";
      }
    } else if (node.kind === "notebook") {
      const subtreeDone = countDone(node);
      badge.className = "syxm-badge syxm-badge--nb";
      badge.textContent = node.closed ? "已关闭" : subtreeDone + "/" + countTreeDocs(node);
      badge.title = node.closed ? "笔记本处于关闭状态，未读取文档" : "该笔记本下已导出 / 总数";
    }

    const path = document.createElement("span");
    path.className = "syxm-path";
    if (node.doc) {
      const record = log.get(node.doc.id);
      const text = record ? pathOf(record) : "";
      path.textContent = text || "—";
      if (text) path.title = text;
    }

    row.appendChild(caret);
    row.appendChild(icon);
    row.appendChild(name);
    row.appendChild(badge);
    row.appendChild(path);
    row.appendChild(node.doc ? buildActions(node, notebookName) : document.createElement("span"));

    wrap.appendChild(row);

    const buildChildren = () => {
      childBox = document.createElement("div");
      childBox.className = "syxm-children";
      const query = state.query;
      node.children.forEach((child) => {
        if (query && !matchesNode(child, query)) return;
        childBox.appendChild(buildNode(child, depth + 1, notebookName));
      });
      wrap.appendChild(childBox);
    };

    if (node.children.length) {
      const expand = () => {
        if (!childBox) buildChildren();
        childBox.style.display = "";
        caret.textContent = "▾";
      };
      const collapse = () => {
        if (childBox) childBox.style.display = "none";
        caret.textContent = "▸";
      };
      caret.textContent = "▾";
      caret.addEventListener("click", () => {
        if (childBox && childBox.style.display !== "none") collapse();
        else expand();
      });

      /* 笔记本与一层子目录默认展开，更深的层级收起，点箭头再渲染 */
      const defaultOpen = depth <= 1 || !!state.query;
      if (defaultOpen) expand();
      else collapse();
    }

    return wrap;
  }

  function countDone(node) {
    let total = node.doc && log.get(node.doc.id) ? 1 : 0;
    (node.children || []).forEach((child) => {
      total += countDone(child);
    });
    return total;
  }

  function refresh() {
    el.body.textContent = "";
    state.total = 0;
    state.done = 0;
    state.trees.forEach((tree) => {
      state.total += countTreeDocs(tree);
      state.done += countDone(tree);
    });
    updateStats();

    if (state.loading) {
      const loading = document.createElement("div");
      loading.className = "syxm-empty";
      loading.textContent = "正在读取文档树…";
      el.body.appendChild(loading);
      return;
    }
    if (state.error) {
      const error = document.createElement("div");
      error.className = "syxm-empty";
      error.textContent = "读取失败：" + state.error;
      el.body.appendChild(error);
      return;
    }
    if (!state.trees.length) {
      const empty = document.createElement("div");
      empty.className = "syxm-empty";
      empty.textContent = "没有可用的笔记本，或笔记本都处于关闭状态。";
      el.body.appendChild(empty);
      return;
    }

    const query = state.query;
    state.trees.forEach((tree) => {
      if (query && !matchesNode(tree, query)) return;
      el.body.appendChild(buildNode(tree, 0, tree.name));
    });
  }

  async function reload() {
    state.loading = true;
    state.error = "";
    refresh();
    try {
      const notebooks = await listNotebooks();
      const docsByBox = {};
      await Promise.all(
        notebooks.map(async (notebook) => {
          if (notebook.closed) {
            docsByBox[notebook.id] = [];
            return;
          }
          const rows = await listDocsOfNotebook(notebook.id);
          docsByBox[notebook.id] = (rows || []).map((row) => ({
            id: row.id,
            content: (row.content || "").trim(),
            hpath: row.hpath || "",
            updated: row.updated || ""
          }));
        })
      );
      state.trees = buildDocTree(notebooks, docsByBox);
      state.stamp = new Date().toLocaleTimeString();
    } catch (e) {
      state.error = (e && e.message) || String(e);
    } finally {
      state.loading = false;
      refresh();
      setStatus("");
    }
  }

  async function exportPending(button) {
    const groups = [];
    state.trees.forEach((tree) => {
      const ids = [];
      walkDocs(tree, (doc) => {
        if (!log.get(doc.id)) ids.push(doc.id);
      });
      if (ids.length) groups.push({ name: tree.name, ids });
    });
    if (!groups.length) {
      showMessage("没有需要导出的页面", 4000);
      return;
    }

    button.disabled = true;
    const label = button.textContent;
    button.textContent = "导出中…";
    let ok = 0;
    let failed = 0;
    try {
      for (const group of groups) {
        setStatus(`正在导出「${group.name}」：${group.ids.length} 篇…`);
        try {
          await exportDocs(plugin, { ...plugin.opts, scope: "notebook" }, group.ids, group.name, setStatus);
          ok += group.ids.length;
        } catch (e) {
          failed += group.ids.length;
          setStatus(`「${group.name}」导出失败：` + ((e && e.message) || e));
        }
        refresh();
      }
      setStatus(`批量导出完成：${ok} 篇${failed ? `，失败 ${failed} 篇` : ""}`);
      showMessage(`批量导出完成：${ok} 篇${failed ? `，失败 ${failed} 篇` : ""}`, 6000);
    } finally {
      button.disabled = false;
      button.textContent = label;
      refresh();
    }
  }

  el.reload.addEventListener("click", () => {
    void reload();
  });
  el.search.addEventListener("input", () => {
    state.query = normalizeQuery(el.search.value);
    refresh();
  });
  el.batch.addEventListener("click", () => {
    void exportPending(el.batch);
  });
  el.clear.addEventListener("click", () => {
    const count = log.size();
    if (!count) {
      showMessage("还没有导出记录", 4000);
      return;
    }
    confirm("清空导出记录", `将清空 ${count} 条导出记录，已导出的文件不会被删除。`, async () => {
      await log.clear();
      refresh();
      setStatus("已清空导出记录");
    });
  });

  const onRecordsChanged = () => {
    refresh();
  };
  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    window.addEventListener(RECORDS_EVENT, onRecordsChanged);
  }

  refresh();
  void reload();

  return {
    element: root,
    refresh,
    reload,
    destroy() {
      if (typeof window !== "undefined" && typeof window.removeEventListener === "function") {
        window.removeEventListener(RECORDS_EVENT, onRecordsChanged);
      }
      root.remove();
    }
  };
}

function registerManagerTab(plugin) {
  if (plugin.managerTabRegistered) return;
  plugin.managerTabRegistered = true;
  plugin.addTab({
    type: MANAGER_TAB_TYPE,
    init() {
      const host = this.element;
      host.classList.add("syxm-tab");
      if (plugin.managerPanel) plugin.managerPanel.destroy();
      plugin.managerPanel = createPanel(plugin, { container: "tab" });
      host.appendChild(plugin.managerPanel.element);
    },
    destroy() {
      if (plugin.managerPanel) {
        plugin.managerPanel.destroy();
        plugin.managerPanel = null;
      }
    }
  });
}

function openManagerDialog(plugin) {
  const dialog = new Dialog({
    title: "导出管理",
    content: '<div class="syxm-tab-dialog" data-el="host"></div>',
    width: "94vw",
    destroyCallback: () => {
      if (plugin.managerDialogPanel) {
        plugin.managerDialogPanel.destroy();
        plugin.managerDialogPanel = null;
      }
    }
  });
  const host = dialog.element.querySelector('[data-el="host"]');
  const panel = createPanel(plugin, { container: "dialog" });
  host.appendChild(panel.element);
  plugin.managerDialogPanel = panel;
}

/** 打开控制页：桌面端开自定义页签（已打开时聚焦并刷新），移动端退回对话框 */
function openManager(plugin) {
  if (isMobileUI()) {
    openManagerDialog(plugin);
    return;
  }
  registerManagerTab(plugin);
  if (plugin.managerPanel) plugin.managerPanel.refresh();
  try {
    openTab({
      app: plugin.app,
      custom: {
        id: plugin.name + MANAGER_TAB_TYPE,
        title: "导出管理",
        icon: "iconExport"
      },
      afterOpen: () => {
        if (plugin.managerPanel) plugin.managerPanel.refresh();
      }
    });
  } catch (e) {
    /* 老版本内核可能不支持 custom tab，退回对话框 */
    console.warn("[siyuan-export-md] 打开自定义页签失败，改用对话框", e);
    openManagerDialog(plugin);
  }
}

module.exports = {
  MANAGER_TAB_TYPE,
  injectStyles,
  removeStyles,
  createPanel,
  registerManagerTab,
  openManager
};
