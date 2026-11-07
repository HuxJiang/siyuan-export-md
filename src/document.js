/*
 * siyuan-export-md — 文档级导出：元信息、Front Matter、目录、正文 HTML 组装
 *
 * 产物仍是 .md 文件（Hugo / Hexo 的 content 文件），但正文是一整段纯 HTML：
 *    <div class="sy-doc"> … </div>
 * 没有任何 Markdown 语法。CommonMark 的 HTML 块遇空行即结束，所以整段正文
 * 由 compactHtml 压掉连续空行；<pre> 内的空行换成 &#32; 保留代码排版。
 */
"use strict";

const { getDocRow, getChildBlocks, listDocsOfNotebook, normalizeType } = require("./api");
const {
  stripZeroWidth,
  compactHtml,
  escapeHtml,
  formatDate,
  yamlString,
  yamlList,
  TOC_PLACEHOLDER
} = require("./utils");
const { slugify, docPaths } = require("./naming");
const { renderBlockSafe } = require("./render/dispatch");
const { rewriteAssetRefs } = require("./assets");

/* ------------------------------------------------------------------ *
 * 1. 文档信息 / Front Matter
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

/* ------------------------------------------------------------------ *
 * 2. 目录（HTML）
 * ------------------------------------------------------------------ */

function buildTocTree(headings) {
  const minLevel = Math.min(...headings.map((h) => h.level));
  const root = { level: minLevel - 1, children: [] };
  const stack = [root];
  for (const heading of headings) {
    while (stack.length > 1 && stack[stack.length - 1].level >= heading.level) stack.pop();
    const node = { id: heading.id, text: heading.text, level: heading.level, children: [] };
    stack[stack.length - 1].children.push(node);
    stack.push(node);
  }
  return root.children;
}

function tocList(items) {
  if (!items.length) return "";
  const rows = items.map(
    (item) => `<li><a href="#${escapeHtml(item.id)}">${escapeHtml(item.text)}</a>${tocList(item.children)}</li>`
  );
  return `<ul>\n${rows.join("\n")}\n</ul>`;
}

function renderToc(headings) {
  if (!headings || !headings.length) return "";
  return `<nav class="sy-toc">\n${tocList(buildTocTree(headings))}\n</nav>`;
}

/* ------------------------------------------------------------------ *
 * 3. 正文组装
 * ------------------------------------------------------------------ */

function wrapDocument(body) {
  return `<div class="sy-doc">\n${body}\n</div>`;
}

function finalizeBody(body, ctx) {
  let out = String(body || "");
  if (out.includes(TOC_PLACEHOLDER)) out = out.split(TOC_PLACEHOLDER).join(renderToc(ctx.headings));
  out = stripZeroWidth(out);
  return compactHtml(out);
}

async function exportDocument(docId, opts, assets, notebookName) {
  const doc = await buildDocInfo(docId, notebookName);
  const ctx = {
    opts,
    doc,
    assets,
    headings: [],
    headingIds: new Map(),
    warnings: [],
    inHtml: false
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
  const content = `${buildFrontMatter(doc, opts)}${main ? wrapDocument(main) + "\n" : ""}`;
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
  buildTocTree,
  renderToc,
  wrapDocument,
  finalizeBody,
  exportDocument,
  docsOfNotebook,
};
