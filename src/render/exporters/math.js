/*
 * siyuan-export-md — 公式块导出
 * 由单文件 index.js 按功能拆分而来，业务代码保持原样。
 */
"use strict";

const { getBlockDom } = require("../../api");
const { blockMarkdown } = require("../../kramdown");
const { textOf } = require("../../utils");
const { parseBlockDom } = require("../../dom");
const { mathBlock } = require("../../math");

async function extractLatex(meta) {
  const md = await blockMarkdown(meta.id);
  const m = /\$\$([\s\S]*?)\$\$/.exec(md || "");
  if (m) return m[1];
  try {
    const el = parseBlockDom(await getBlockDom(meta.id));
    if (!el) return "";
    return el.getAttribute("data-content") || textOf(el);
  } catch (e) {
    return "";
  }
}

async function exportMath(meta, ctx) {
  const latex = await extractLatex(meta);
  if (!latex || !latex.trim()) return "";
  if (ctx.opts.mathFormat === "raw") {
    return `$$\n${String(latex).trim()}\n$$\n\n`;
  }
  return `${mathBlock(latex)}\n\n`;
}

module.exports = {
  extractLatex,
  exportMath,
};
