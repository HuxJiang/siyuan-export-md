/*
 * siyuan-export-md — 表格导出：HTML（保留合并单元格）与 GFM 两种形态
 * 由单文件 index.js 按功能拆分而来，业务代码保持原样。
 */
"use strict";

const { getBlockDom } = require("../../api");
const { blockMarkdown } = require("../../kramdown");
const { parseBlockDom, convertInlineMathNodes, convertDataHrefAnchors, sanitizeElement } = require("../../dom");

function domTableToGfm(tableEl) {
  const rows = Array.from(tableEl.querySelectorAll("tr"));
  if (!rows.length) return "";
  const matrix = [];
  for (const row of rows) {
    const cells = Array.from(row.querySelectorAll("td, th"));
    if (!cells.length) continue;
    if (cells.some((cell) => cell.hasAttribute("colspan") || cell.hasAttribute("rowspan"))) return "";
    matrix.push(
      cells.map((cell) => (cell.textContent || "").replace(/\s+/g, " ").replace(/\|/g, "\\|").trim())
    );
  }
  if (!matrix.length) return "";
  const cols = Math.max(...matrix.map((row) => row.length));
  const pad = (row) => {
    const filled = row.slice();
    while (filled.length < cols) filled.push("");
    return `| ${filled.join(" | ")} |`;
  };
  const head = pad(matrix[0]);
  const sep = `| ${new Array(cols).fill("---").join(" | ")} |`;
  const body = matrix.slice(1).map(pad).join("\n");
  return body ? `${head}\n${sep}\n${body}` : `${head}\n${sep}`;
}

async function cleanTableHtml(tableEl) {
  const clone = tableEl.cloneNode(true);
  convertInlineMathNodes(clone);
  convertDataHrefAnchors(clone);
  sanitizeElement(clone);
  return clone.outerHTML;
}

async function exportTable(meta, ctx) {
  if (ctx.opts.tableFormat === "html") {
    try {
      const html = await getBlockDom(meta.id);
      const el = parseBlockDom(html);
      const tableEl = el && (el.tagName === "TABLE" ? el : el.querySelector("table"));
      if (tableEl) {
        const cleaned = await cleanTableHtml(tableEl);
        return `<div class="table-wrapper">\n${cleaned}\n</div>\n\n`;
      }
    } catch (e) {
      /* 退回 kramdown */
    }
  }

  const md = await blockMarkdown(meta.id);
  if (md && md.includes("|")) {
    ctx.warnings.push(`表格以 GFM 输出（合并单元格会丢失）：${meta.id}`);
    return `${ensureTableSeparator(md)}\n\n`;
  }

  try {
    const el = parseBlockDom(await getBlockDom(meta.id));
    const tableEl = el && el.querySelector("table");
    if (!tableEl) return "";
    ctx.warnings.push(`表格无法转 GFM，改用 HTML：${meta.id}`);
    const cleaned = await cleanTableHtml(tableEl);
    return `<div class="table-wrapper">\n${cleaned}\n</div>\n\n`;
  } catch (e) {
    return "";
  }
}

function ensureTableSeparator(md) {
  const lines = md.split("\n");
  const headIndex = lines.findIndex((line) => line.includes("|"));
  if (headIndex < 0) return md;
  const next = lines[headIndex + 1] || "";
  if (/^\s*\|?\s*:?-{2,}/.test(next)) return md;
  const cols = lines[headIndex].split("|").filter((cell, index, arr) => {
    if (index === 0 && !cell.trim()) return false;
    if (index === arr.length - 1 && !cell.trim()) return false;
    return true;
  }).length;
  lines.splice(headIndex + 1, 0, `| ${new Array(Math.max(1, cols)).fill("---").join(" | ")} |`);
  return lines.join("\n");
}

module.exports = {
  domTableToGfm,
  cleanTableHtml,
  exportTable,
  ensureTableSeparator,
};
