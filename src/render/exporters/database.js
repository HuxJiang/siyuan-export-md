/*
 * siyuan-export-md — 数据库块（属性视图）导出
 * 由单文件 index.js 按功能拆分而来，业务代码保持原样。
 */
"use strict";

const { getBlockDom } = require("../../api");
const { parseBlockDom, toCleanHtml } = require("../../dom");
const { domTableToGfm, cleanTableHtml } = require("./table");

async function exportDatabase(meta, ctx) {
  try {
    const el = parseBlockDom(await getBlockDom(meta.id));
    const tableEl = el && el.querySelector("table");
    if (tableEl) {
      const gfm = domTableToGfm(tableEl);
      if (gfm) {
        ctx.warnings.push(`数据库块导出为当前视图表格：${meta.id}`);
        return `${gfm}\n\n`;
      }
      const cleaned = await cleanTableHtml(tableEl);
      ctx.warnings.push(`数据库块退化为 HTML 表格：${meta.id}`);
      return `<div class="table-wrapper">\n${cleaned}\n</div>\n\n`;
    }
    if (el) {
      ctx.warnings.push(`数据库块退化为 HTML：${meta.id}`);
      return `${toCleanHtml(el)}\n\n`;
    }
    return "";
  } catch (e) {
    return "";
  }
}

module.exports = {
  exportDatabase,
};
