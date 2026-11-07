/*
 * siyuan-export-md — 分发层：块元信息 → DOM → HTML
 *
 * 职责很薄：
 *   1. 拉块 DOM（/api/block/getBlockDOM），交给 render/block.js 渲染；
 *   2. DOM 缺失（接口降级、容器被折叠）时按类型拉子块兜底；
 *   3. 顶层块按 debugComment 加来源注释。
 * 容器块内部的子块递归走 renderBlockHtml，不再重复拉子块列表。
 */
"use strict";

const { getBlockDom, getChildBlocks, normalizeType } = require("../api");
const { parseBlockDom, SUPERBLOCK_STYLE, layoutOf } = require("../dom");
const { renderElement, CALLOUT_META, calloutInfo, styleChildRoot } = require("./block");
const { TOC_PLACEHOLDER, escapeHtml, logWarn } = require("../utils");

const LEAF_TYPES = ["h", "p", "c", "m", "t", "img", "html", "widget", "iframe", "video", "audio", "diagram"];

async function blockDomOf(meta) {
  try {
    return parseBlockDom(await getBlockDom(meta.id));
  } catch (e) {
    logWarn("获取块 DOM 失败", meta, e);
    return null;
  }
}

/**
 * 容器块拿不到 DOM（或 DOM 里没有子块）时的兜底：拉子块列表，按类型用语义容器包起来。
 * （列表项的 DOM 本身就是 <li> 内容，直接由 renderElement 处理。）
 * el 是已经拿到的块 DOM：布局（col/row）、callout 标题图标还能从它读，别丢。
 */
async function renderFallback(meta, ctx, type, el) {
  if (type === "toc") return TOC_PLACEHOLDER;

  let children = [];
  try {
    children = await getChildBlocks(meta.id);
  } catch (e) {
    children = [];
  }
  if (!children.length) {
    if (!el && LEAF_TYPES.includes(type)) ctx.warnings.push(`块没有可用的 DOM：${type} ${meta.id}`);
    return "";
  }

  const childCtx = { ...ctx, inHtml: true };
  const layout = type === "s" ? layoutOf(el) : "row";
  const parts = [];
  for (const child of children) {
    if (!child || normalizeType(child.type) === "d") continue;
    const html = await renderBlockHtml(child, childCtx);
    if (!html) continue;
    parts.push(type === "s" ? styleChildRoot(html, layout) : html);
  }
  if (!parts.length) return "";
  const inner = parts.join("\n");

  switch (type) {
    case "s":
      return (
        `<div class="sy-superblock sy-superblock-${layout}" data-sb-layout="${layout}"` +
        ` style="${SUPERBLOCK_STYLE[layout].container}">\n${inner}\n</div>`
      );
    case "callout": {
      const info = el ? calloutInfo(el, meta) : CALLOUT_META[String(meta.subType || "note").toLowerCase()] || CALLOUT_META.note;
      return (
        `<div class="callout callout-${info.cls}" data-callout="${info.cls}">` +
        `<div class="callout-title">${escapeHtml(`${info.icon} ${info.title}`.trim())}</div>` +
        `<div class="callout-body">\n${inner}\n</div></div>`
      );
    }
    case "b":
      return `<blockquote>\n${inner}\n</blockquote>`;
    case "l":
    case "i":
      return `<ul class="sy-list-fallback">\n${inner}\n</ul>`;
    default:
      return "";
  }
}

/** 内核 API 版本差异可能不返回 DOM，这里统一拿到 HTML（容器内部用，不加注释）。 */
async function renderBlockHtml(meta, ctx) {
  const type = normalizeType(meta.type);
  if (!type || type === "d") return "";

  const el = await blockDomOf(meta);
  if (el) {
    try {
      const html = renderElement(el, ctx, meta);
      if (html) return html;
    } catch (e) {
      ctx.warnings.push(`块渲染失败：${type} ${meta.id}`);
      logWarn("块渲染失败", meta, e);
    }
  }
  return await renderFallback(meta, ctx, type, el);
}

function decorate(html, type, ctx) {
  const body = String(html == null ? "" : html).trim();
  if (!body) return "";
  const head = !ctx.inHtml && ctx.opts && ctx.opts.debugComment ? `<!-- siyuan:${type} -->\n` : "";
  return `${head}${body}\n`;
}

/** 顶层入口：渲染一个块并收尾（注释、换行）。 */
async function renderBlock(meta, ctx) {
  const type = normalizeType(meta.type);
  if (!type || type === "d") return "";
  let html = "";
  try {
    html = await renderBlockHtml(meta, ctx);
  } catch (e) {
    ctx.warnings.push(`块导出失败：${type} ${meta.id}`);
    logWarn("块导出失败", meta, e);
    return "";
  }
  return decorate(html, type, ctx);
}

/** 顶层安全入口：任何异常都降级成空串 + 告警，不中断整篇导出。 */
async function renderBlockSafe(meta, ctx) {
  try {
    return await renderBlock(meta, ctx);
  } catch (e) {
    ctx.warnings.push(`块渲染失败：${meta && meta.id}`);
    return "";
  }
}

/** 按元信息列表批量渲染（容器块、文档正文共用）。 */
async function renderChildrenHtml(metas, ctx) {
  const childCtx = { ...ctx, inHtml: true };
  let out = "";
  for (const meta of metas) {
    if (!meta || normalizeType(meta.type) === "d") continue;
    out += await renderBlockHtml(meta, childCtx);
  }
  return out;
}

module.exports = {
  renderBlock,
  renderBlockSafe,
  renderBlockHtml,
  renderChildrenHtml,
  renderFallback,
};
