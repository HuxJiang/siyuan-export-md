/*
 * siyuan-export-md — 公式：data-latex 契约与 Markdown 内公式转换
 * 由单文件 index.js 按功能拆分而来，业务代码保持原样。
 */
"use strict";

const { stripZeroWidth, escapeHtml, MD_ESCAPABLE } = require("./utils");
const { splitFencedCode, splitInlineCode } = require("./markdown-text");

/* ------------------------------------------------------------------ *
 * 3. 公式：data-latex 契约
 * ------------------------------------------------------------------ */

function normalizeLatex(latex) {
  return stripZeroWidth(String(latex == null ? "" : latex))
    .replace(/\r\n?/g, "\n")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 行内公式的可见降级文本。
 * data-latex 给 KaTeX；span 里的文本仍会被 Markdown 引擎解析，
 * 所以 _ * ` 以及「反斜杠 + 标点」都要转义，否则下划线会被当成斜体。
 */
function visibleLatexText(latex) {
  const esc = escapeHtml(latex);
  let out = "";
  for (let i = 0; i < esc.length; i++) {
    const ch = esc[i];
    if (ch === "\\" && i + 1 < esc.length && MD_ESCAPABLE.has(esc[i + 1])) {
      out += "\\\\";
    } else if (ch === "_" || ch === "*" || ch === "`") {
      out += "\\" + ch;
    } else {
      out += ch;
    }
  }
  return out;
}

function mathInline(latex) {
  const tex = normalizeLatex(latex);
  if (!tex) return "";
  return `<span class="math-inline" data-latex="${escapeHtml(tex)}">${visibleLatexText(tex)}</span>`;
}

function mathBlock(latex) {
  const tex = normalizeLatex(latex);
  if (!tex) return "";
  return `<div class="math-block" data-latex="${escapeHtml(tex)}">${escapeHtml(tex)}</div>`;
}

function convertMathOutsideCode(text) {
  let out = text;

  // 块级：$$…$$（可跨行）
  out = out.replace(/\$\$([\s\S]*?)\$\$/g, (all, tex) => {
    const body = normalizeLatex(tex);
    return body ? `\n\n${mathBlock(body)}\n\n` : all;
  });

  // 块级：\[…\]
  out = out.replace(/\\\[([\s\S]*?)\\\]/g, (all, tex) => {
    const body = normalizeLatex(tex);
    return body ? `\n\n${mathBlock(body)}\n\n` : all;
  });

  // 行内：$…$（遵循 pandoc 规则：内侧不能紧贴空白，避免把金额当公式）
  out = out.replace(/(^|[^\\$])\$(?!\$)([^\n$]+?)\$(?!\$)/g, (all, lead, tex) => {
    const body = normalizeLatex(tex);
    if (!body) return all;
    if (/^\s/.test(tex) || /\s$/.test(tex)) return all;
    return lead + mathInline(body);
  });

  // 行内：\(…\)
  out = out.replace(/\\\(([\s\S]*?)\\\)/g, (all, tex) => {
    const body = normalizeLatex(tex);
    return body ? mathInline(body) : all;
  });

  return out;
}

function convertMathInText(text) {
  return splitInlineCode(text)
    .map((piece) => (piece.code ? piece.text : convertMathOutsideCode(piece.text)))
    .join("");
}

function applyMathFormat(md, format) {
  if (format === "raw") return md;
  if (!md || md.indexOf("$") < 0 && md.indexOf("\\(") < 0 && md.indexOf("\\[") < 0) return md;
  return splitFencedCode(md)
    .map((part) => (part.code ? part.text : convertMathInText(part.text)))
    .join("\n");
}

module.exports = {
  normalizeLatex,
  visibleLatexText,
  mathInline,
  mathBlock,
  convertMathOutsideCode,
  convertMathInText,
  applyMathFormat,
};
