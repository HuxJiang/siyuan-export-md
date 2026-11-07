/*
 * siyuan-export-md — 通用工具：日志、零宽字符、HTML/SQL/YAML 转义、日期、HTML 压缩
 *
 * 纯 HTML 导出的两个关键约束都在 compactHtml 里：
 *   1. HTML 块在 CommonMark/Hugo goldmark 里遇到空行即结束，之后的正文会被重新按
 *      Markdown 解析，所以整篇正文不能有连续空行；
 *   2. <pre> 里的空行是代码内容，不能直接删，换成一行 &#32;（视觉上仍是空行），
 *      这样既保留代码排版，又不会触发 HTML 块结束。
 */
"use strict";

const { LOG_PREFIX } = require("./config");

/* ------------------------------------------------------------------ *
 * 0. 通用工具
 * ------------------------------------------------------------------ */

function logWarn(...args) {
  console.warn(LOG_PREFIX, ...args);
}

const ZERO_WIDTH_RE = /[\u200b\u200c\u200d\ufeff]/g;

function stripZeroWidth(text) {
  return String(text == null ? "" : text).replace(ZERO_WIDTH_RE, "");
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function escapeSql(value) {
  return String(value == null ? "" : value).replace(/'/g, "''");
}

function pad2(n) {
  return n < 10 ? "0" + n : String(n);
}

function formatDate(date, withTime) {
  const base = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  if (!withTime) return base;
  return `${base} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

function yamlString(value) {
  const text = String(value == null ? "" : value).replace(/\r?\n/g, " ").trim();
  if (!text) return '""';
  if (/[:#\[\]{}&*!|>'"%@`]/.test(text) || text !== String(value).trim()) {
    return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return text;
}

function yamlList(items) {
  const list = (items || []).filter(Boolean).map((it) => yamlString(it));
  return list.length ? `[${list.join(", ")}]` : "[]";
}

function textOf(el) {
  if (!el) return "";
  if (typeof el.innerText === "string" && el.innerText) return el.innerText;
  return el.textContent == null ? "" : el.textContent;
}

function replaceAllLiteral(haystack, needle, replacement) {
  if (!needle) return haystack;
  return haystack.split(needle).join(replacement);
}

/* ------------------------------------------------------------------ *
 * 1. HTML 正文压缩：不留空行，保护 <pre>
 * ------------------------------------------------------------------ */

/** 目录占位：文档层收集完标题后替换成 <nav class="sy-toc">…</nav> */
const TOC_PLACEHOLDER = "<!--SY-TOC-PLACEHOLDER-->";

function compactHtml(html) {
  const src = String(html == null ? "" : html).replace(/\r\n?/g, "\n");
  // 按 <pre>…</pre> 切片：奇数下标是 pre 内部
  const parts = src.split(/(<pre\b[^>]*>[\s\S]*?<\/pre>)/i);
  const out = parts
    .map((part, index) => {
      if (index % 2 === 1) {
        return part
          .split("\n")
          .map((line) => (line.trim() === "" ? "&#32;" : line))
          .join("\n");
      }
      return part.replace(/[ \t]+\n/g, "\n").replace(/\n(?:[ \t]*\n)+/g, "\n");
    })
    .join("");
  return out.replace(/^[ \t]*\n+/g, "").replace(/\n+[ \t]*$/g, "");
}

module.exports = {
  logWarn,
  ZERO_WIDTH_RE,
  TOC_PLACEHOLDER,
  stripZeroWidth,
  escapeHtml,
  escapeSql,
  pad2,
  formatDate,
  yamlString,
  yamlList,
  textOf,
  replaceAllLiteral,
  compactHtml,
};
