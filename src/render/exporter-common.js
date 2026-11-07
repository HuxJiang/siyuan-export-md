/*
 * siyuan-export-md — 导出器公用：标题层级推断、代码围栏、列表标记归一
 * 由单文件 index.js 按功能拆分而来，业务代码保持原样。
 */
"use strict";

function headingLevelFromSubType(subType) {
  const sub = String(subType || "").toLowerCase();
  const m = /^h?([1-6])$/.exec(sub);
  return m ? Number(m[1]) : 0;
}

function headingLevelFromDom(html) {
  const m = /class="[^"]*\b(h[1-6])\b/.exec(html || "");
  return m ? Number(m[1][1]) : 1;
}

function fence(code, lang) {
  const body = String(code == null ? "" : code).replace(/\n$/, "");
  const runs = body.match(/`+/g) || [];
  const maxRun = runs.reduce((max, run) => Math.max(max, run.length), 0);
  const marker = "`".repeat(Math.max(3, maxRun + 1));
  return `${marker}${lang || ""}\n${body}\n${marker}\n\n`;
}

function ensureFenceLang(md, lang) {
  if (!lang) return md;
  const first = md.split("\n")[0];
  const m = /^(`{3,}|~{3,})(.*)$/.exec(first);
  if (!m || m[2].trim()) return md;
  return md.replace(first, `${m[1]}${lang}`);
}

function normalizeListMarkers(md) {
  return md
    .split("\n")
    .map((line) => {
      let out = line.replace(/^(\s*)[*+]\s+/, "$1- ");
      out = out.replace(/^(\s*)[-*]\s*\[([ xX])\]\s*/, (_all, indent, checked) => {
        return `${indent}- [${checked.toLowerCase() === "x" ? "x" : " "}] `;
      });
      return out;
    })
    .join("\n");
}

module.exports = {
  headingLevelFromSubType,
  headingLevelFromDom,
  fence,
  ensureFenceLang,
  normalizeListMarkers,
};
