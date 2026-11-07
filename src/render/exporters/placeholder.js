/*
 * siyuan-export-md — 占位类块导出：查询嵌入、目录、未知类型兜底
 * 由单文件 index.js 按功能拆分而来，业务代码保持原样。
 */
"use strict";

const { getBlockDom, getChildBlocks } = require("../../api");
const { parseBlockDom, toCleanHtml } = require("../../dom");
const { logWarn } = require("../../utils");
const { renderChildrenHtml } = require("../html");

async function exportQueryEmbed(meta, ctx) {
  ctx.warnings.push(`查询嵌入未展开：${meta.id}`);
  return (
    `<div class="siyuan-query-embed" style="padding:12px;border:1px dashed #bbb;color:#888;font-size:13px">` +
    `思源查询嵌入块：依赖动态查询，静态站点中不生效。</div>\n\n`
  );
}

const TOC_PLACEHOLDER = "<!--SY-TOC-PLACEHOLDER-->";

async function exportToc() {
  return `${TOC_PLACEHOLDER}\n\n`;
}

async function exportUnknown(meta, ctx) {
  try {
    const html = await getBlockDom(meta.id);
    const el = parseBlockDom(html);
    if (!el) return "";
    const hasChildren = !!el.querySelector("[data-node-id]");
    let out = toCleanHtml(el);
    if (!hasChildren) {
      const children = await getChildBlocks(meta.id);
      if (children.length) out += await renderChildrenHtml(children, ctx);
    }
    return out.trim() ? `${out}\n\n` : "";
  } catch (e) {
    logWarn("兜底 HTML 失败", meta, e);
    return "";
  }
}

module.exports = {
  exportQueryEmbed,
  TOC_PLACEHOLDER,
  exportToc,
  exportUnknown,
};
