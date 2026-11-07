/*
 * siyuan-export-md — HTML 片段渲染：短代码包裹、容器内子块渲染
 * 由单文件 index.js 按功能拆分而来，业务代码保持原样。
 */
"use strict";

const { getBlockDom, normalizeType } = require("../api");
const { mathBlock } = require("../math");
const { parseBlockDom, convertInlineMathNodes, toCleanHtml } = require("../dom");
const { cleanTableHtml } = require("./exporters/table");
const { extractLatex } = require("./exporters/math");
const { logWarn } = require("../utils");

/**
 * 顶层 HTML 片段的统一收尾：按开关包 Hugo shortcode、加来源注释。
 * 只处理 HTML 片段（以 "<" 开头）；Markdown（段落、列表、图片等）原样返回。
 * 在 HTML 容器内部（ctx.inHtml）不再包裹，避免短代码嵌套。
 */
function wrapHtmlFragment(html, ctx, kind) {
  const body = String(html == null ? "" : html).trim();
  if (!body) return "";
  if (!body.startsWith("<")) return html;
  const opts = ctx.opts || {};
  let out = body;
  if (!ctx.inHtml && opts.site === "hugo" && opts.hugoRawHtmlShortcode) {
    out = `{{< rawhtml >}}\n${out}\n{{< /rawhtml >}}`;
  }
  if (!ctx.inHtml && opts.debugComment) {
    out = `<!-- siyuan:${kind} -->\n${out}`;
  }
  return `${out}\n\n`;
}

/** 在 HTML 容器内部（callout / 分栏）渲染子块：一律产出 HTML，且不再套 rawhtml 短代码。 */
async function renderBlockHtml(meta, ctx) {
  const type = normalizeType(meta.type);
  if (type === "m") {
    const latex = await extractLatex(meta);
    return latex ? `${mathBlock(latex)}\n` : "";
  }
  if (type === "t" || type === "av") {
    try {
      const el = parseBlockDom(await getBlockDom(meta.id));
      const tableEl = el && (el.tagName === "TABLE" ? el : el.querySelector("table"));
      if (tableEl) return `<div class="table-wrapper">\n${await cleanTableHtml(tableEl)}\n</div>\n`;
    } catch (e) {
      /* 退回通用 DOM */
    }
  }
  try {
    const el = parseBlockDom(await getBlockDom(meta.id));
    if (!el) return "";
    convertInlineMathNodes(el);
    return `${toCleanHtml(el)}\n`;
  } catch (e) {
    return "";
  }
}

async function renderChildrenHtml(metas, ctx) {
  const childCtx = { ...ctx, htmlOnly: true, inHtml: true };
  let out = "";
  for (const meta of metas) {
    if (!meta || normalizeType(meta.type) === "d") continue;
    try {
      out += await renderBlockHtml(meta, childCtx);
    } catch (e) {
      logWarn("子块 HTML 渲染失败", meta, e);
    }
  }
  return out;
}

module.exports = {
  wrapHtmlFragment,
  renderBlockHtml,
  renderChildrenHtml,
};
