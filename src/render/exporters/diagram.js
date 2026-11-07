/*
 * siyuan-export-md — 图表块导出（mermaid 走代码围栏，其余退化为 HTML）
 * 由单文件 index.js 按功能拆分而来，业务代码保持原样。
 */
"use strict";

const { getBlockDom } = require("../../api");
const { parseBlockDom, toCleanHtml } = require("../../dom");
const { fence } = require("../exporter-common");

async function exportDiagram(meta, ctx) {
  const sub = String(meta.subType || "").toLowerCase();
  try {
    const el = parseBlockDom(await getBlockDom(meta.id));
    const text = (el ? el.textContent : "").trim();
    if (sub.includes("mermaid") || /^(graph|flowchart|sequenceDiagram|classDiagram|gantt|pie|erDiagram|stateDiagram)\b/.test(text)) {
      return fence(text, "mermaid");
    }
    if (el) {
      ctx.warnings.push(`图表块退化为 HTML：${meta.id}`);
      return `${toCleanHtml(el)}\n\n`;
    }
    return "";
  } catch (e) {
    return "";
  }
}

module.exports = {
  exportDiagram,
};
