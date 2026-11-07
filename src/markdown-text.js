/*
 * siyuan-export-md — Markdown 文本切分（围栏代码 / 行内代码）与空白整理
 * 由单文件 index.js 按功能拆分而来，业务代码保持原样。
 */
"use strict";

/**
 * 把 md 文本切成「围栏代码 / 普通文本」两类片段。
 * 返回片段按行切分，用 "\n" 重新 join 可无损还原原文。
 */
function splitFencedCode(md) {
  const lines = String(md).split("\n");
  const parts = [];
  let buf = [];
  let fenceChar = "";
  let fenceLen = 0;

  const flush = (code) => {
    if (buf.length) {
      parts.push({ code, text: buf.join("\n") });
      buf = [];
    }
  };

  for (const line of lines) {
    if (fenceChar) {
      buf.push(line);
      const close = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line);
      if (close && close[1][0] === fenceChar && close[1].length >= fenceLen) {
        flush(true);
        fenceChar = "";
        fenceLen = 0;
      }
      continue;
    }
    const open = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (open) {
      flush(false);
      fenceChar = open[1][0];
      fenceLen = open[1].length;
      buf.push(line);
      continue;
    }
    buf.push(line);
  }
  flush(!!fenceChar);
  return parts;
}

/** 再按行内代码（`…`）切分，避免把代码里的 $ 当公式。 */
function splitInlineCode(text) {
  const out = [];
  let i = 0;
  let start = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch !== "`") {
      i += 1;
      continue;
    }
    let run = 0;
    while (text[i + run] === "`") run += 1;
    const marker = "`".repeat(run);
    const close = text.indexOf(marker, i + run);
    if (close < 0) {
      i += run;
      continue;
    }
    if (i > start) out.push({ code: false, text: text.slice(start, i) });
    out.push({ code: true, text: text.slice(i, close + run) });
    i = close + run;
    start = i;
  }
  if (start < text.length) out.push({ code: false, text: text.slice(start) });
  return out;
}

/* ------------------------------------------------------------------ *
 * 4. Markdown 空白整理
 * ------------------------------------------------------------------ */

function normalizeMarkdownWhitespace(md) {
  return splitFencedCode(md)
    .map((part) => {
      if (part.code) return part.text;
      return part.text
        .split("\n")
        .map((line) => line.replace(/[ \t]+$/, ""))
        .join("\n")
        .replace(/\n{3,}/g, "\n\n");
    })
    .join("\n");
}

module.exports = {
  splitFencedCode,
  splitInlineCode,
  normalizeMarkdownWhitespace,
};
