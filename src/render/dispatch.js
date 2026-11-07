/*
 * siyuan-export-md — 类型分发：块类型注册表与渲染入口
 * 由单文件 index.js 按功能拆分而来，业务代码保持原样。
 */
"use strict";

const { normalizeType } = require("../api");
const { logWarn } = require("../utils");
const { renderBlockHtml, wrapHtmlFragment } = require("./html");
const { exportHeading, exportParagraph, exportList, exportQuote, exportCode } = require("./exporters/text");
const { exportMath } = require("./exporters/math");
const { exportTable } = require("./exporters/table");
const { exportImage } = require("./exporters/image");
const { exportCallout } = require("./exporters/callout");
const { exportSuperblock } = require("./exporters/superblock");
const { exportDatabase } = require("./exporters/database");
const { exportDiagram } = require("./exporters/diagram");
const { exportMedia, exportWidget, exportHtmlBlock } = require("./exporters/media");
const { exportToc, exportQueryEmbed, exportUnknown } = require("./exporters/placeholder");

/* ------------------------------------------------------------------ *
 * 9. 分发
 * ------------------------------------------------------------------ */

const REGISTRY = {
  h: exportHeading,
  p: exportParagraph,
  l: exportList,
  i: exportList,
  b: exportQuote,
  c: exportCode,
  m: exportMath,
  t: exportTable,
  s: exportSuperblock,
  img: exportImage,
  html: exportHtmlBlock,
  widget: exportWidget,
  iframe: exportMedia,
  video: exportMedia,
  audio: exportMedia,
  av: exportDatabase,
  toc: exportToc,
  query_embed: exportQueryEmbed,
  diagram: exportDiagram,
  callout: exportCallout,
  embed: exportUnknown,
  bookmark: exportUnknown
};

async function renderBlock(meta, ctx) {
  const type = normalizeType(meta.type);
  if (!type || type === "d") return "";
  if (ctx.htmlOnly) return renderBlockHtml(meta, ctx);
  const exporter = REGISTRY[type] || exportUnknown;
  try {
    const out = (await exporter(meta, ctx)) || "";
    return wrapHtmlFragment(out, ctx, type);
  } catch (e) {
    ctx.warnings.push(`块导出失败：${type} ${meta.id}`);
    logWarn("块导出失败", meta, e);
    try {
      return wrapHtmlFragment(await exportUnknown(meta, ctx), ctx, type);
    } catch (inner) {
      return "";
    }
  }
}

async function renderBlockSafe(meta, ctx) {
  try {
    return await renderBlock(meta, ctx);
  } catch (e) {
    ctx.warnings.push(`块渲染失败：${meta.id}`);
    return "";
  }
}

module.exports = {
  REGISTRY,
  renderBlock,
  renderBlockSafe,
};
