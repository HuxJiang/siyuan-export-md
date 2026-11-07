/*
 * siyuan-export-md — 超级块（分栏容器）导出
 * 由单文件 index.js 按功能拆分而来，业务代码保持原样。
 */
"use strict";

const { getBlockDom, getChildBlocks } = require("../../api");
const { parseBlockDom } = require("../../dom");
const { renderChildrenHtml } = require("../html");

async function exportSuperblock(meta, ctx) {
  const children = await getChildBlocks(meta.id);
  const inner = await renderChildrenHtml(children, ctx);
  if (!inner.trim()) return "";
  let layout = "block";
  try {
    const el = parseBlockDom(await getBlockDom(meta.id));
    const hint = (el && (el.getAttribute("data-layout") || "")) || "";
    const cls = (el && el.getAttribute("class")) || "";
    if (hint.includes("flex") || cls.includes("flex")) layout = "flex";
  } catch (e) {
    /* 默认纵向 */
  }
  const style = layout === "flex" ? "display:flex;gap:1rem;align-items:flex-start;flex-wrap:wrap" : "display:block";
  return `<div class="sy-superblock" style="${style}">\n${inner}</div>\n\n`;
}

module.exports = {
  exportSuperblock,
};
