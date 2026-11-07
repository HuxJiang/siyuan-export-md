/*
 * siyuan-export-md — 公式：统一输出 data-latex 的 HTML 容器
 *
 * 纯 HTML 导出不需要再做 Markdown 转义（不再有「行内公式的可见文本会被 Markdown
 * 引擎当斜体」这个问题），可见文本就是 escape 后的 LaTeX 源码，交给站点侧的
 * KaTeX 脚本按 data-latex 渲染。
 */
"use strict";

const { stripZeroWidth } = require("./utils");

/* ------------------------------------------------------------------ *
 * 2. 公式
 * ------------------------------------------------------------------ */

function normalizeLatex(latex) {
  return stripZeroWidth(String(latex == null ? "" : latex))
    .replace(/\r\n?/g, "\n")
    .replace(/\s+/g, " ")
    .trim();
}

/** 行内公式元素；空公式返回 null。 */
function mathInlineEl(doc, latex) {
  const tex = normalizeLatex(latex);
  if (!tex || !doc) return null;
  const span = doc.createElement("span");
  span.className = "math-inline";
  span.setAttribute("data-latex", tex);
  span.textContent = tex;
  return span;
}

/** 块级公式元素；空公式返回 null。 */
function mathBlockEl(doc, latex) {
  const tex = normalizeLatex(latex);
  if (!tex || !doc) return null;
  const div = doc.createElement("div");
  div.className = "math-block";
  div.setAttribute("data-latex", tex);
  div.textContent = tex;
  return div;
}

function mathInline(latex) {
  const tex = normalizeLatex(latex);
  if (!tex) return "";
  return `<span class="math-inline" data-latex="${escapeAttr(tex)}">${escapeText(tex)}</span>`;
}

function mathBlock(latex) {
  const tex = normalizeLatex(latex);
  if (!tex) return "";
  return `<div class="math-block" data-latex="${escapeAttr(tex)}">${escapeText(tex)}</div>`;
}

function escapeAttr(value) {
  return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeText(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * 从公式块 DOM 里取 LaTeX：
 *   data-content（思源私有属性）→ 任意子节点的 data-content →
 *   KaTeX 的 annotation → 最后退回纯文本。
 */
function extractLatex(el) {
  if (!el) return "";
  let tex = "";
  if (el.getAttribute) tex = el.getAttribute("data-content") || "";
  if (!tex && el.querySelector) {
    const holder = el.querySelector("[data-content]");
    if (holder) tex = holder.getAttribute("data-content") || "";
  }
  if (!tex && el.querySelector) {
    const annot = el.querySelector('annotation[encoding="application/x-tex"]');
    if (annot) tex = annot.textContent || "";
  }
  if (!tex) tex = el.textContent || "";
  return normalizeLatex(tex);
}

/** 图表块：mermaid 判断（subType 之外再看源码开头） */
const MERMAID_HEAD_RE = /^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|mindmap|timeline|journey|quadrantChart|gitGraph|sankey-beta|xychart-beta)\b/;

function looksLikeMermaid(text) {
  return MERMAID_HEAD_RE.test(String(text || "").trim());
}

module.exports = {
  normalizeLatex,
  mathInlineEl,
  mathBlockEl,
  mathInline,
  mathBlock,
  extractLatex,
  looksLikeMermaid,
};
