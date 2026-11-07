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

function wrapHtmlFragment(html, ctx, kind) {
  if (!html) return "";
  let out = html;
  if (!ctx.inHtml && ctx.opts.site === "hugo" && ctx.opts.hugoRawHtmlShortcode) {
    out = `{{< rawhtml >}}\n${out}\n{{< /rawhtml >}}`;
  }
  if (!ctx.inHtml && ctx.opts.debugComment) {
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
  const childCtx = { ...ctx, htmlOnly: true, inHtml: true, depth: ctx.depth + 1 };
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
