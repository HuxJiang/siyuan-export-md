/*
 * siyuan-export-md — 通用工具：日志、零宽字符、HTML/SQL/YAML 转义、日期与文本读取
 * 由单文件 index.js 按功能拆分而来，业务代码保持原样。
 */
"use strict";

/* ------------------------------------------------------------------ *
 * 0. 通用工具
 * ------------------------------------------------------------------ */

function logWarn(...args) {
  console.warn(LOG_PREFIX, ...args);
}

const ZERO_WIDTH_RE = /[\u200b\u200c\u200d\ufeff]/g;
const MD_ESCAPABLE = new Set(Array.from("!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~"));

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
  return el.innerText != null ? el.innerText : el.textContent != null ? el.textContent : "";
}

function replaceAllLiteral(haystack, needle, replacement) {
  if (!needle) return haystack;
  return haystack.split(needle).join(replacement);
}

module.exports = {
  logWarn,
  ZERO_WIDTH_RE,
  MD_ESCAPABLE,
  stripZeroWidth,
  escapeHtml,
  escapeSql,
  pad2,
  formatDate,
  yamlString,
  yamlList,
  textOf,
  replaceAllLiteral,
};
