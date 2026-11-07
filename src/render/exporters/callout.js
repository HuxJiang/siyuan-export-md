/*
 * siyuan-export-md — 标注块（callout）导出
 * 由单文件 index.js 按功能拆分而来，业务代码保持原样。
 */
"use strict";

const { getBlockDom, getChildBlocks } = require("../../api");
const { parseBlockDom } = require("../../dom");
const { textOf, escapeHtml } = require("../../utils");
const { renderChildrenHtml } = require("../html");

const CALLOUT_META = {
  note: { icon: "📝", title: "Note", cls: "note" },
  tip: { icon: "💡", title: "Tip", cls: "tip" },
  important: { icon: "❗", title: "Important", cls: "important" },
  warning: { icon: "⚠️", title: "Warning", cls: "warning" },
  caution: { icon: "🔥", title: "Caution", cls: "danger" },
  danger: { icon: "🔥", title: "Danger", cls: "danger" }
};

async function exportCallout(meta, ctx) {
  const sub = String(meta.subType || "note").toLowerCase();
  const info = CALLOUT_META[sub] || CALLOUT_META.note;

  let title = info.title;
  let icon = info.icon;
  try {
    const el = parseBlockDom(await getBlockDom(meta.id));
    if (el) {
      const titleEl = el.querySelector(".callout-title");
      const iconEl = el.querySelector(".callout-icon");
      if (titleEl && textOf(titleEl).trim()) title = textOf(titleEl).trim();
      if (iconEl && textOf(iconEl).trim()) icon = textOf(iconEl).trim();
    }
  } catch (e) {
    /* 保留默认图标与标题 */
  }

  const children = await getChildBlocks(meta.id);
  const body = await renderChildrenHtml(children, ctx);
  if (!body.trim()) return "";

  return (
    `<div class="callout callout-${info.cls}">\n` +
    `  <div class="callout-title">${escapeHtml(icon + " " + title)}</div>\n` +
    `  <div class="callout-body">\n${body}\n  </div>\n` +
    `</div>\n\n`
  );
}

module.exports = {
  CALLOUT_META,
  exportCallout,
};
