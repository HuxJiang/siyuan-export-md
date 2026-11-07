/*
 * siyuan-export-md — 媒体、挂件与 HTML 块导出
 * 由单文件 index.js 按功能拆分而来，业务代码保持原样。
 */
"use strict";

const { getBlockDom } = require("../../api");
const { parseBlockDom, toCleanHtml } = require("../../dom");
const { escapeHtml } = require("../../utils");

async function exportMedia(meta, ctx) {
  try {
    const el = parseBlockDom(await getBlockDom(meta.id));
    if (!el) return "";
    const target = el.tagName === "IFRAME" ? el : el.querySelector("video, audio, iframe");
    if (!target) return "";
    ctx.warnings.push(`媒体文件需自行部署：${meta.id}`);
    return `${toCleanHtml(target)}\n\n`;
  } catch (e) {
    return "";
  }
}

async function exportWidget(meta, ctx) {
  try {
    const el = parseBlockDom(await getBlockDom(meta.id));
    const iframe = el && el.querySelector("iframe");
    if (iframe) return `${toCleanHtml(iframe)}\n\n`;
    ctx.warnings.push(`挂件无法静态导出，已输出占位：${meta.id}`);
    return (
      `<div class="siyuan-widget" data-block="${escapeHtml(meta.id)}" style="padding:12px;border:1px dashed #bbb;color:#888;font-size:13px">` +
      `思源挂件依赖运行时，静态站点中无法渲染，此处为占位。</div>\n\n`
    );
  } catch (e) {
    return "";
  }
}

async function exportHtmlBlock(meta, ctx) {
  try {
    const el = parseBlockDom(await getBlockDom(meta.id));
    if (!el) return "";
    return `${toCleanHtml(el)}\n\n`;
  } catch (e) {
    return "";
  }
}

module.exports = {
  exportMedia,
  exportWidget,
  exportHtmlBlock,
};
