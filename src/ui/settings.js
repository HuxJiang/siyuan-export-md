/*
 * siyuan-export-md — 共享导出配置表单
 *
 * 导出对话框和控制页共用同一份 plugin.opts：任何一处改动都会
 *   1) 合并进 plugin.opts 并写盘（saveData("options")）；
 *   2) 派发 CONFIG_EVENT，另一个打开的页面监听到后把控件同步过来。
 * 这样两个页面永远显示同一份配置。
 */
"use strict";

const { isDesktopWritable, defaultOutputDir, pickDirectory } = require("../output");
const { CONFIG_EVENT } = require("../export-log");

const TREE_KEY = "treePrefix";

function isTree(opts) {
  return opts.site === "hugo" && opts.hugoLayout === "bundle";
}

function fmDefault(opts) {
  return isTree(opts) ? "toml" : "yaml";
}

/** 广播配置变更，让另一个页面同步控件 */
function notifyChanged() {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return;
  try {
    window.dispatchEvent(new CustomEvent(CONFIG_EVENT));
  } catch (e) {
    /* 老内核没有 CustomEvent 就算了，同页面内已经是最新值 */
  }
}

/** 合并 + 写盘 + 广播；对话框和控制页都走这里 */
function applyOptions(plugin, patch) {
  if (!plugin || !patch) return plugin && plugin.opts;
  plugin.opts = { ...plugin.opts, ...patch };
  try {
    const saved = plugin.saveData("options", plugin.opts);
    if (saved && typeof saved.catch === "function") saved.catch(() => {});
  } catch (e) {
    /* 写盘失败不影响本次导出 */
  }
  notifyChanged();
  return plugin.opts;
}

function normalizeValue(key, opts) {
  const value = opts[key];
  switch (key) {
    case "site":
      return value === "hexo" ? "hexo" : "hugo";
    case "hugoLayout":
      return value === "file" ? "file" : "bundle";
    case "outputMode":
      return value === "folder" ? "folder" : "zip";
    case "treeMissingParent":
      return value === "flat" ? "flat" : "mirror";
    case "frontmatterSyntax":
      return value === "yaml" ? "yaml" : value === "toml" ? "toml" : fmDefault(opts);
    case "headingStyle":
      return value === "html" ? "html" : "markdown";
    case "copyAssets":
    case "headingDemote":
      return value !== false;
    case "superblockWidth":
      return value !== false;
    default:
      return value == null ? "" : String(value);
  }
}

const FIELDS = [
  {
    key: "site",
    label: "站点类型",
    type: "select",
    options: [
      ["hugo", "Hugo"],
      ["hexo", "Hexo"]
    ]
  },
  {
    key: "hugoLayout",
    label: "Hugo 布局",
    type: "select",
    options: [
      ["bundle", "page bundle（文档树）"],
      ["file", "单文件 + static"]
    ],
    visible: (opts) => opts.site === "hugo"
  },
  {
    key: "outputMode",
    label: "导出方式",
    type: "select",
    options: [
      ["zip", "下载压缩包（.zip）"],
      ["folder", "直接写入文件夹"]
    ]
  },
  {
    key: "outputDir",
    label: "项目根目录",
    type: "path",
    wide: true,
    placeholder: "绝对路径，例如 C:\\Users\\你\\Desktop\\Hugo\\content"
  },
  {
    key: TREE_KEY,
    label: "相对目录前缀",
    type: "text",
    placeholder: "可空，例如 docs",
    visible: isTree
  },
  {
    key: "treeMissingParent",
    label: "父页面未导出",
    type: "select",
    options: [
      ["mirror", "按父路径建目录"],
      ["flat", "不建父目录"]
    ],
    visible: isTree
  },
  {
    key: "frontmatterSyntax",
    label: "Front Matter",
    type: "select",
    options: [
      ["toml", "TOML（+++）"],
      ["yaml", "YAML（---）"]
    ],
    visible: (opts) => opts.site === "hugo"
  },
  {
    key: "headingStyle",
    label: "标题语法",
    type: "select",
    options: [
      ["markdown", "Markdown（##）"],
      ["html", "HTML（<h2>）"]
    ]
  },
  {
    key: "copyAssets",
    label: "打包附件",
    type: "checkbox"
  },
  {
    key: "headingDemote",
    label: "标题降一级",
    type: "checkbox"
  },
  {
    key: "superblockWidth",
    label: "保留超级块栏宽",
    type: "checkbox"
  }
];

function fieldRow(field) {
  const row = document.createElement("div");
  row.className = "syx-settings__row";
  row.style.display = "flex";
  row.style.alignItems = "center";
  row.style.gap = "8px";
  if (field.wide) row.style.gridColumn = "1 / -1";

  const label = document.createElement("label");
  label.textContent = field.label;
  label.style.width = "88px";
  label.style.flex = "none";
  label.style.color = "var(--b3-theme-on-surface-variant)";
  row.appendChild(label);

  if (field.type === "checkbox") {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = "b3-switch fn__flex-center";
    input.setAttribute("data-key", field.key);
    row.appendChild(input);
    return row;
  }

  if (field.type === "select") {
    const select = document.createElement("select");
    select.className = "b3-select";
    select.style.flex = "1";
    select.setAttribute("data-key", field.key);
    field.options.forEach(([value, text]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = text;
      select.appendChild(option);
    });
    row.appendChild(select);
    return row;
  }

  const input = document.createElement("input");
  input.className = "b3-text-field";
  input.style.flex = "1";
  input.setAttribute("data-key", field.key);
  input.placeholder = field.placeholder || "";
  row.appendChild(input);

  if (field.type === "path") {
    const pick = document.createElement("button");
    pick.type = "button";
    pick.className = "b3-button b3-button--outline";
    pick.style.flex = "none";
    pick.textContent = "选择…";
    pick.addEventListener("click", async (event) => {
      event.preventDefault();
      if (!isDesktopWritable()) {
        pick.title = "当前环境不能直接写盘";
        return;
      }
      pick.disabled = true;
      try {
        const picked = await pickDirectory(input.value);
        if (picked) {
          input.value = picked;
          input.dispatchEvent(new Event("change"));
        }
      } finally {
        pick.disabled = false;
      }
    });
    row.appendChild(pick);
  }
  return row;
}

/**
 * 生成共享配置表单。
 * options.exclude 可传字段 key 数组，用来只渲染其中一部分（面板的「高级设置」）。
 * options.hint 传 false 时不渲染底部说明。
 * 返回 { element, sync, read, destroy }；read() 只包含本表单渲染的字段。
 */
function createSettings(plugin, options) {
  const opts = options || {};
  const excluded = Array.isArray(opts.exclude) ? opts.exclude : [];
  const fields = FIELDS.filter((field) => excluded.indexOf(field.key) === -1);
  const root = document.createElement("div");
  root.className = "syx-settings";
  root.style.display = "grid";
  root.style.gridTemplateColumns = opts.columns === 1 ? "1fr" : "1fr 1fr";
  root.style.gap = "8px 14px";
  root.style.fontSize = "13px";

  const rows = [];
  fields.forEach((field) => {
    const row = fieldRow(field);
    row.setAttribute("data-field", field.key);
    root.appendChild(row);
    rows.push({ field, row });
  });

  let hints = null;
  if (opts.hint !== false) {
    hints = document.createElement("div");
    hints.className = "syx-settings__hint";
    hints.style.gridColumn = "1 / -1";
    hints.style.color = "var(--b3-theme-on-surface-variant)";
    hints.style.fontSize = "12px";
    hints.style.lineHeight = "1.7";
    root.appendChild(hints);
  }

  function controlOf(key) {
    return root.querySelector(`[data-key="${key}"]`);
  }

  function read() {
    const current = {};
    fields.forEach((field) => {
      const control = controlOf(field.key);
      if (!control) return;
      current[field.key] = field.type === "checkbox" ? control.checked : control.value;
    });
    return current;
  }

  function sync() {
    const current = plugin.opts || {};
    fields.forEach((field) => {
      const control = controlOf(field.key);
      if (!control) return;
      if (typeof document !== "undefined" && document.activeElement === control) return;
      if (field.type === "checkbox") control.checked = normalizeValue(field.key, current) !== false;
      else control.value = normalizeValue(field.key, current);
    });
    syncVisibility();
  }

  function syncVisibility() {
    const current = plugin.opts || {};
    rows.forEach(({ field, row }) => {
      row.style.display = field.visible && !field.visible(current) ? "none" : "flex";
    });
    if (!hints) return;
    const tree = isTree(current);
    const root = current.outputDir || defaultOutputDir();
    hints.textContent = tree
      ? "文档树：页面目录直接建在「项目根目录」下（不再加 content / posts 层）。当前：" + (root || "未设置")
      : "文件按相对路径写入「项目根目录」；当前：" + (root || "未设置");
  }

  function onControlChange(event) {
    const target = event.target;
    if (!target || !target.getAttribute) return;
    const key = target.getAttribute("data-key");
    if (!key) return;
    const field = fields.find((item) => item.key === key);
    if (!field) return;
    const value = field.type === "checkbox" ? target.checked : target.value;
    applyOptions(plugin, { [key]: value });
    sync();
  }

  root.addEventListener("change", onControlChange);

  const onExternalChange = () => sync();
  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    window.addEventListener(CONFIG_EVENT, onExternalChange);
  }

  sync();

  return {
    element: root,
    sync,
    read,
    destroy() {
      if (typeof window !== "undefined" && typeof window.removeEventListener === "function") {
        window.removeEventListener(CONFIG_EVENT, onExternalChange);
      }
      root.remove();
    }
  };
}

module.exports = {
  TREE_KEY,
  isTree,
  fmDefault,
  applyOptions,
  notifyChanged,
  createSettings
};
