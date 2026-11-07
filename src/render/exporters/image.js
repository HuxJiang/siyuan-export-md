/*
 * siyuan-export-md — 图片块导出
 * 由单文件 index.js 按功能拆分而来，业务代码保持原样。
 */
"use strict";

const { getBlockDom } = require("../../api");
const { blockMarkdown } = require("../../kramdown");
const { parseBlockDom } = require("../../dom");

async function exportImage(meta, ctx) {
  const md = await blockMarkdown(meta.id);
  if (md) return `${md}\n\n`;
  try {
    const el = parseBlockDom(await getBlockDom(meta.id));
    const img = el && (el.tagName === "IMG" ? el : el.querySelector("img"));
    if (!img) return "";
    const src = img.getAttribute("src") || "";
    const alt = img.getAttribute("alt") || img.getAttribute("title") || "";
    return src ? `![${alt}](${src})\n\n` : "";
  } catch (e) {
    return "";
  }
}

module.exports = {
  exportImage,
};
