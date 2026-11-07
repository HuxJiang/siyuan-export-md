/*
 * siyuan-export-md — 文档级导出：元信息、Front Matter、目录、正文收尾
 * 由单文件 index.js 按功能拆分而来，业务代码保持原样。
 */
"use strict";

const { getDocRow, getChildBlocks, listDocsOfNotebook, normalizeType } = require("./api");
const { stripZeroWidth, formatDate, yamlString, yamlList } = require("./utils");
const { slugify, docPaths } = require("./naming");
const { applyMathFormat } = require("./math");
const { normalizeMarkdownWhitespace } = require("./markdown-text");
const { renderBlockSafe } = require("./render/dispatch");
const { rewriteAssetRefs } = require("./assets");
const { TOC_PLACEHOLDER } = require("./render/exporters/placeholder");

/* ------------------------------------------------------------------ *
 * 10. 文档 / 整站导出
 * ------------------------------------------------------------------ */

function parseSiyuanDate(value, fallback) {
  if (!value) return fallback;
  const raw = String(value);
  if (/^\d{14}$/.test(raw)) {
    return new Date(
      Number(raw.slice(0, 4)),
      Number(raw.slice(4, 6)) - 1,
      Number(raw.slice(6, 8)),
      Number(raw.slice(8, 10)),
      Number(raw.slice(10, 12)),
      Number(raw.slice(12, 14))
    );
  }
  const parsed = new Date(raw);
  return isNaN(parsed.getTime()) ? fallback : parsed;
}

async function buildDocInfo(docId, notebookName) {
  const row = await getDocRow(docId);
  const now = new Date();
  const title =
    (row && ((row.name || "").trim() || (row.content || "").trim())) ||
    (row && (row.hpath || "").split("/").pop()) ||
    "untitled";
  const tags = (row && row.tag ? row.tag : "")
    .split(/\s+/)
    .map((t) => t.replace(/^#|#$/g, "").trim())
    .filter(Boolean);
  return {
    id: docId,
    title,
    hpath: (row && row.hpath) || "",
    slug: slugify(title),
    box: (row && row.box) || "",
    created: parseSiyuanDate(row && row.created, now),
    updated: parseSiyuanDate(row && row.updated, now),
    tags,
    notebook: notebookName
  };
}

function buildFrontMatter(doc, opts) {
  const lines = ["---", `title: ${yamlString(doc.title)}`];
  lines.push(`date: ${opts.site === "hugo" ? formatDate(doc.created) : formatDate(doc.created, true)}`);
  lines.push("toc: true");
  if (doc.tags.length) lines.push(`tags: ${yamlList(doc.tags)}`);
  if (doc.notebook && opts.site === "hugo") lines.push(`categories: ${yamlList([doc.notebook])}`);
  if (opts.frontmatter === "full") {
    lines.push(`updated: ${opts.site === "hugo" ? formatDate(doc.updated) : formatDate(doc.updated, true)}`);
    if (opts.site === "hugo") {
      lines.push(`slug: ${yamlString(doc.slug)}`);
      lines.push("draft: false");
    } else {
      lines.push("comments: false");
    }
  }
  lines.push("---", "");
  return lines.join("\n");
}

function renderToc(headings) {
  if (!headings.length) return "";
  const top = Math.min(...headings.map((h) => h.level));
  return headings
    .map((h) => `${"  ".repeat(Math.max(0, h.level - top))}- ${h.text}`)
    .join("\n");
}

function finalizeBody(body, ctx) {
  let out = body.replace(/\r\n?/g, "\n");
  out = stripZeroWidth(out);
  out = applyMathFormat(out, ctx.opts.mathFormat);
  if (out.includes(TOC_PLACEHOLDER)) {
    out = out.split(TOC_PLACEHOLDER).join(renderToc(ctx.headings));
  }
  out = normalizeMarkdownWhitespace(out);
  return out.trim();
}

async function exportDocument(docId, opts, assets, notebookName) {
  const doc = await buildDocInfo(docId, notebookName);
  const ctx = {
    opts,
    doc,
    htmlOnly: false,
    inHtml: false,
    assets,
    headings: [],
    warnings: []
  };

  const children = await getChildBlocks(docId);
  let body = "";
  for (const meta of children) {
    if (!meta || normalizeType(meta.type) === "d") continue;
    body += await renderBlockSafe(meta, ctx);
  }

  body = await rewriteAssetRefs(body, ctx);
  const main = finalizeBody(body, ctx);
  const paths = docPaths(doc, opts);
  const content = `${buildFrontMatter(doc, opts)}${main ? "\n" + main + "\n" : ""}`;
  return { path: paths.mdPath, content, warnings: ctx.warnings, doc };
}

async function docsOfNotebook(box) {
  const rows = await listDocsOfNotebook(box);
  return rows.map((r) => r.id);
}

module.exports = {
  parseSiyuanDate,
  buildDocInfo,
  buildFrontMatter,
  renderToc,
  finalizeBody,
  exportDocument,
  docsOfNotebook,
};
