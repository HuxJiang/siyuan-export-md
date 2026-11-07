/*
 * siyuan-export-md — 导出对话框：表单、进度、下载（由插件实例调用）
 *
 * 正文以 HTML 为主，标题可在 Markdown（## 标题）与 HTML（<h2>）之间切换，
 * 面板上不再有公式格式 / 表格格式 / rawhtml 短代码这些开关。
 */
"use strict";

const { LOG_PREFIX } = require("../config");
const { listNotebooks } = require("../api");
const { escapeHtml } = require("../utils");
const { docsOfNotebook } = require("../document");
const { exportSite } = require("../site");
const { defaultOutputDir, writeFilesToFolder, joinRelative } = require("../output");
const { createSettings, applyOptions } = require("./settings");
const { Dialog, showMessage } = require("siyuan");

const DOC_ID_RE = /^\d{14}-[a-z0-9]{7}$/;

function isDocId(id) {
  return DOC_ID_RE.test(String(id == null ? "" : id).trim());
}

/** 从 protyle 上取文档 id：缩进 / 聚焦到子块时 block.id 是子块，rootID 才是文档 */
function idFromProtyle(protyle) {
  if (!protyle) return "";
  const block = protyle.block || {};
  const candidates = [block.rootID, block.id, protyle.background && protyle.background.id];
  for (const id of candidates) {
    if (isDocId(id)) return id;
  }
  return "";
}

function visibleEnough(el) {
  if (!el) return false;
  if (typeof el.getClientRects === "function" && el.getClientRects().length > 0) return true;
  const view = el.ownerDocument && el.ownerDocument.defaultView;
  const styleOf =
    view && typeof view.getComputedStyle === "function"
      ? view.getComputedStyle.bind(view)
      : typeof getComputedStyle === "function"
      ? getComputedStyle
      : null;
  if (styleOf) {
    let node = el;
    while (node && node.nodeType === 1) {
      if (node.style && node.style.display === "none") return false;
      const style = styleOf(node);
      if (style && (style.display === "none" || style.visibility === "hidden")) return false;
      node = node.parentElement;
    }
    return true; // 没有布局信息（如测试环境）时，display 没藏就算可见
  }
  return el.offsetParent !== null;
}

/**
 * 当前文档 id：protyle 上下文优先，其次是插件跟踪到的最后激活编辑器，
 * 最后才退回 DOM 查询（只用来兜底：打开插件前就已经在编辑的文档）。
 * 多个标签页时 DOM 里会有多个 .protyle-title，必须按可见性挑，不能直接取第一个。
 */
function currentDocId(protyle, activeProtyle) {
  const fromArg = idFromProtyle(protyle);
  if (fromArg) return fromArg;

  const tracked = idFromProtyle(activeProtyle);
  if (tracked) {
    // 跟踪到的是后台标签页的编辑器时（不可见），交给下面的可见性兜底
    const trackedEl = activeProtyle && activeProtyle.element;
    if (!trackedEl || visibleEnough(trackedEl)) return tracked;
  }

  if (typeof document === "undefined") return tracked || "";
  const titles = Array.prototype.slice.call(document.querySelectorAll(".protyle-title[data-node-id]"));
  if (!titles.length) {
    const editor = document.querySelector(".protyle-wysiwyg[data-node-id]");
    const id = editor && editor.getAttribute("data-node-id");
    return isDocId(id) ? id : tracked || "";
  }

  // 焦点还在编辑区时（没用鼠标点顶栏的情况），直接取焦点所在编辑器
  const focused = document.activeElement && document.activeElement.closest
    ? document.activeElement.closest(".protyle")
    : null;
  if (focused) {
    const inside = focused.querySelector(".protyle-title[data-node-id]");
    const id = inside && inside.getAttribute("data-node-id");
    if (isDocId(id)) return id;
  }

  const visible = titles.filter((el) => visibleEnough(el.closest(".protyle") || el));
  const pool = visible.length ? visible : titles;
  const title = pool[0];
  const id = title && title.getAttribute("data-node-id");
  return isDocId(id) ? id : tracked || "";
}

function openDialog(plugin, protyle) {
  const self = plugin;
  let settingsRef = null;
  if (self.dialog) {
    self.dialog.destroy();
    self.dialog = null;
  }
  const docId = self.currentDocId(protyle, self.activeProtyle);
  const content = `
<div class="b3-dialog__content" style="padding: 8px 24px 0;">
  <div style="display:flex;flex-direction:column;gap:12px;font-size:13px;">
    <div id="sySettings"></div>
    <div style="display:flex;align-items:center;gap:8px;">
      <label style="width:88px;color:var(--b3-theme-on-surface-variant);">导出范围</label>
      <select id="syScope" class="b3-select" style="width:170px;">
        <option value="doc">当前文档</option>
        <option value="notebook">整个笔记本</option>
      </select>
      <select id="syNotebook" class="b3-select" style="width:230px;display:none;"></select>
    </div>
    <div id="syDocRow" style="display:flex;align-items:center;gap:8px;">
      <label style="width:88px;color:var(--b3-theme-on-surface-variant);">文档 ID</label>
      <input id="syDocId" class="b3-text-field fn__flex-1" placeholder="留空则导出当前打开的文档" value="${escapeHtml(docId)}" />
    </div>
    <div style="color:var(--b3-theme-on-surface-variant);font-size:12px;line-height:1.7;">
      配置与「导出管理」页共用，任何一处改动都会同步到另一处。
      正文是 HTML，标题可用 Markdown（<code>## 标题</code>）或 HTML（<code>&lt;h2&gt;</code>），
      站点需允许内联 HTML（Hugo：<code>markup.goldmark.renderer.unsafe = true</code>）。
    </div>
    <div id="syStatus" style="color:var(--b3-theme-on-surface-variant);min-height:20px;line-height:1.6;">准备就绪</div>
  </div>
</div>
<div class="b3-dialog__action" style="padding: 12px 24px 20px;display:flex;justify-content:flex-end;gap:8px;">
  <button class="b3-button b3-button--cancel" id="syCancel">取消</button>
  <button class="b3-button b3-button--text" id="syRun">开始导出</button>
</div>`;

  const dialog = new Dialog({
    title: String((self.i18n && self.i18n.dialogTitle) || "导出为 Hexo / Hugo（HTML 正文）"),
    content,
    width: "720px",
    destroyCallback: () => {
      if (settingsRef) {
        settingsRef.destroy();
        settingsRef = null;
      }
      self.dialog = null;
    }
  });
  self.dialog = dialog;

  const body = dialog.element;
  const scopeEl = body.querySelector("#syScope");
  const notebookEl = body.querySelector("#syNotebook");
  const docRowEl = body.querySelector("#syDocRow");
  const docIdEl = body.querySelector("#syDocId");
  const statusEl = body.querySelector("#syStatus");
  const runEl = body.querySelector("#syRun");
  const cancelEl = body.querySelector("#syCancel");

  /* 配置表单与「导出管理」页共用同一份 plugin.opts，改动即时互相同步 */
  const settings = createSettings(self);
  settingsRef = settings;
  body.querySelector("#sySettings").appendChild(settings.element);

  scopeEl.value = self.opts.scope === "notebook" ? "notebook" : "doc";
  const syncScope = () => {
    const isNotebook = scopeEl.value === "notebook";
    notebookEl.style.display = isNotebook ? "" : "none";
    docRowEl.style.display = isNotebook ? "none" : "flex";
  };
  syncScope();
  scopeEl.addEventListener("change", syncScope);

  listNotebooks().then((notebooks) => {
    notebookEl.innerHTML = notebooks
      .map((nb) => `<option value="${escapeHtml(nb.id)}">${escapeHtml(nb.name)}</option>`)
      .join("");
  });

  const setStatus = (text) => {
    statusEl.textContent = text;
  };

  cancelEl.addEventListener("click", () => dialog.destroy());

  runEl.addEventListener("click", async () => {
    const config = settings.read();
    const opts = {
      ...config,
      scope: scopeEl.value,
      hugoContentDir: self.opts.hugoContentDir,
      frontmatter: self.opts.frontmatter,
      outputDir: String(config.outputDir || "").trim()
    };
    /* 配置控件已经在改动时写盘，这里再合并一次，把 outputDir 的 trim 结果落进去 */
    applyOptions(self, opts);
    runEl.disabled = true;
    try {
      // 点「开始导出」时再取一次，面板打开后又切了文档也不会导错
      const docIdInput = docIdEl.value.trim() || self.currentDocId(null, self.activeProtyle);
      await self.doExport(opts, docIdInput, notebookEl, setStatus);
      dialog.destroy();
    } catch (e) {
      console.error(LOG_PREFIX, e);
      setStatus("导出失败：" + ((e && e.message) || e));
      showMessage("导出失败：" + ((e && e.message) || e), 5000, "error");
    } finally {
      runEl.disabled = false;
    }
  });
}

/**
 * 把导出结果记进 ExportLog：控制页据此显示「导出过没有 / 导出到了哪里」。
 * 写盘模式记绝对路径；压缩包模式记包名 + 包内相对路径（浏览器下载目录我们拿不到）。
 */
async function recordExport(plugin, result, opts, notebookName, mode, targetDir, zipName) {
  const log = plugin && plugin.exportLog;
  if (!log || typeof log.recordMany !== "function") return;
  const stamp = Date.now();
  const tree = opts.site === "hugo" && opts.hugoLayout === "bundle";
  const records = (result.docs || []).map((doc) => ({
    docId: doc.id,
    title: doc.title,
    hpath: doc.hpath,
    box: doc.box,
    notebook: notebookName || "",
    site: opts.site,
    layout: opts.hugoLayout,
    mode,
    /* 文档树 bundle 记页面目录（一页可能有两个 md），其余布局记 md 文件 */
    relPath: tree ? doc.pageDir || doc.path : doc.path,
    pageDir: tree ? doc.pageDir || "" : "",
    targetDir: mode === "folder" ? targetDir || "" : "",
    fullPath: mode === "folder" ? joinRelative(targetDir || "", tree ? doc.pageDir || doc.path : doc.path) : "",
    zipName: mode === "zip" ? zipName || "" : "",
    exportedAt: stamp
  }));
  try {
    await log.recordMany(records);
  } catch (e) {
    console.warn(LOG_PREFIX, "写入导出记录失败", e);
  }
}

/**
 * 真正干活的一层：导出 + 落盘/打包 + 记录，返回 { result, wrote, zipName }。
 * 对话框和控制页都走这里，保证两条入口的记录口径一致。
 */
async function exportDocs(plugin, opts, docIds, notebookName, setStatus) {
  const self = plugin;
  const status = typeof setStatus === "function" ? setStatus : () => {};
  status(`开始导出，共 ${docIds.length} 篇…`);
  const result = await exportSite(
    docIds,
    opts,
    notebookName,
    (done, total, title) => {
      status(`(${done}/${total}) ${title}`);
    },
    { exportLog: self.exportLog, pathOverrides: self.pathOverrides || null }
  );

  const warnText = result.warnings.length
    ? `；${result.warnings.length} 条告警见 ${
        opts.outputMode === "folder" ? "导出目录" : "压缩包"
      }内 SIYUAN-EXPORT-REPORT.html`
    : "";

  if (opts.outputMode === "folder") {
    const target = opts.outputDir || defaultOutputDir();
    if (!target) {
      status("请先填写导出目录（绝对路径），或点「选择…」挑一个文件夹");
      return { result, wrote: null, zipName: "" };
    }
    status(`正在写入 ${target} …`);
    const wrote = writeFilesToFolder(target, result.files, (done, total, path) => {
      status(`写入 (${done}/${total}) ${path}`);
    });
    await recordExport(self, result, opts, notebookName, "folder", wrote.dir, "");
    const skippedText = wrote.skipped.length ? `；${wrote.skipped.length} 个路径越界已跳过` : "";
    status(
      `完成：${result.docCount} 篇文档、${result.assetCount} 个资源，已写入 ${wrote.written} 个文件到 ${wrote.dir}${warnText}${skippedText}`
    );
    showMessage(`导出完成：${result.docCount} 篇文档，已写入 ${wrote.written} 个文件${warnText}`, 6000);
    return { result, wrote, zipName: "" };
  }

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const filename = `siyuan-${opts.site}-${stamp}.zip`;
  self.download(result.zip, filename);
  await recordExport(self, result, opts, notebookName, "zip", "", filename);

  status(`完成：${result.docCount} 篇文档、${result.assetCount} 个资源、共 ${result.fileCount} 个文件${warnText}`);
  showMessage(`导出完成：${result.docCount} 篇文档${warnText}`, 6000);
  return { result, wrote: null, zipName: filename };
}

async function doExport(plugin, opts, docIdInput, notebookEl, setStatus) {
  let docIds = [];
  let notebookName = "";

  if (opts.scope === "notebook") {
    const box = notebookEl.value;
    if (!box) {
      setStatus("请先选择笔记本");
      return;
    }
    notebookName = (notebookEl.selectedOptions[0] && notebookEl.selectedOptions[0].textContent) || "";
    setStatus("正在读取文档列表…");
    docIds = await docsOfNotebook(box);
    if (!docIds.length) {
      setStatus("该笔记本下没有文档");
      return;
    }
  } else {
    if (!docIdInput) {
      setStatus("没有取到文档 ID：请先打开一篇文档，或手动粘贴文档 ID");
      return;
    }
    docIds = [docIdInput];
  }

  return exportDocs(plugin, opts, docIds, notebookName, setStatus);
}

function downloadBytes(bytes, filename) {
  const blob = new Blob([bytes], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

module.exports = {
  isDocId,
  idFromProtyle,
  currentDocId,
  openDialog,
  doExport,
  exportDocs,
  recordExport,
  downloadBytes,
};
