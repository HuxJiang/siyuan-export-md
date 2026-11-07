/*
 * siyuan-export-md — 文本类块导出：标题、段落、列表、引用、代码块
 * 由单文件 index.js 按功能拆分而来，业务代码保持原样。
 */
"use strict";

const { getBlockDom } = require("../../api");
const { blockMarkdown } = require("../../kramdown");
const { textOf } = require("../../utils");
const { parseBlockDom, toCleanHtml } = require("../../dom");
const { headingLevelFromSubType, headingLevelFromDom, fence, ensureFenceLang, normalizeListMarkers } = require("../exporter-common");
const { exportUnknown } = require("./placeholder");

async function exportHeading(meta, ctx) {
  let level = headingLevelFromSubType(meta.subType);
  let text = await blockMarkdown(meta.id);
  text = text.replace(/^\s*#{1,6}\s*/, "").replace(/\n+/g, " ").trim();

  if (!text || !level) {
    try {
      const html = await getBlockDom(meta.id);
      if (!text) text = textOf(parseBlockDom(html)).replace(/\n+/g, " ").trim();
      if (!level) level = headingLevelFromDom(html);
    } catch (e) {
      if (!level) level = 1;
    }
  }
  if (!text) return "";

  if (ctx.opts.headingDemote) level = Math.min(level + 1, 6);
  level = Math.max(1, Math.min(6, level || 1));
  ctx.headings.push({ level, text });
  return `${"#".repeat(level)} ${text}\n\n`;
}

async function exportParagraph(meta, ctx) {
  const md = await blockMarkdown(meta.id);
  if (md) return `${md}\n\n`;
  try {
    const el = parseBlockDom(await getBlockDom(meta.id));
    if (!el) return "";
    return `${toCleanHtml(el)}\n\n`;
  } catch (e) {
    return "";
  }
}

async function exportList(meta, ctx) {
  const md = await blockMarkdown(meta.id);
  if (!md) return await exportUnknown(meta, ctx);
  return `${normalizeListMarkers(md)}\n\n`;
}

async function exportQuote(meta, ctx) {
  const md = await blockMarkdown(meta.id);
  if (!md) return await exportUnknown(meta, ctx);
  const lines = md.split("\n").map((line) => (line.startsWith(">") ? line : line ? `> ${line}` : ">"));
  return `${lines.join("\n")}\n\n`;
}

async function exportCode(meta, ctx) {
  const lang = String(meta.subType || "").trim();
  const md = await blockMarkdown(meta.id);
  if (md && /^(`{3,}|~{3,})/.test(md)) {
    return `${ensureFenceLang(md, lang)}\n\n`;
  }
  if (md) return fence(md, lang);
  try {
    const el = parseBlockDom(await getBlockDom(meta.id));
    if (!el) return "";
    const codeEl = el.querySelector(".hljs") || el.querySelector("pre") || el.querySelector("code") || el;
    return fence(textOf(codeEl), lang);
  } catch (e) {
    return "";
  }
}

module.exports = {
  exportHeading,
  exportParagraph,
  exportList,
  exportQuote,
  exportCode,
};
