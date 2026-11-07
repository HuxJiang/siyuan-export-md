/*
 * siyuan-export-md — 文档级导出：元信息、Front Matter、目录、正文 HTML 组装
 *
 * 产物仍是 .md 文件（Hugo / Hexo 的 content 文件），正文默认是「Markdown 标题 + HTML 块」：
 *    <div class="sy-doc"> … </div>
 * 标题行（## 标题）前后留空行交给站点解析；其余是语义 HTML。标题语法切到 HTML 时
 * 整段正文压掉空行，保持一个完整 HTML 块。
 */
"use strict";

const { getDocRow, getChildBlocks, listDocsOfNotebook, normalizeType } = require("./api");
const {
  stripZeroWidth,
  compactHtml,
  spacedBody,
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

/** TOML 字符串：能安全用字面量单引号就用单引号，否则退回双引号转义 */
function tomlString(value) {
  const text = String(value == null ? "" : value).replace(/\r?\n/g, " ").trim();
  if (!text) return '""';
  if (text.indexOf("'") === -1 && !/[\u0000-\u001f]/.test(text)) return `'${text}'`;
  return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function tomlArray(items) {
  const list = (items || []).filter(Boolean).map((item) => tomlString(item));
  return list.length ? `[${list.join(", ")}]` : "[]";
}

/** TOML 版正文 Front Matter（给用 +++ 的站点） */
function buildTomlFrontMatter(doc, opts) {
  const lines = ["+++", `title = ${tomlString(doc.title)}`];
  lines.push(`date = ${formatDate(doc.created)}`);
  lines.push("toc = true");
  if (doc.tags.length) lines.push(`tags = ${tomlArray(doc.tags)}`);
  if (doc.notebook && opts.site === "hugo") lines.push(`categories = ${tomlArray([doc.notebook])}`);
  if (opts.frontmatter === "full") {
    lines.push(`updated = ${formatDate(doc.updated)}`);
    if (opts.site === "hugo") {
      lines.push(`slug = ${tomlString(doc.slug)}`);
      lines.push("draft = false");
    }
  }
  lines.push("+++", "");
  return lines.join("\n");
}

/** Front Matter 语法：显式设置优先；Hugo 的文档树 bundle 默认 TOML，其余保持 YAML */
function frontmatterSyntax(opts) {
  const options = opts || {};
  if (options.frontmatterSyntax === "toml" || options.frontmatterSyntax === "yaml") {
    return options.frontmatterSyntax;
  }
  return options.site === "hugo" && options.hugoLayout === "bundle" ? "toml" : "yaml";
}

function docFrontMatter(doc, opts) {
  return frontmatterSyntax(opts) === "toml" ? buildTomlFrontMatter(doc, opts) : buildFrontMatter(doc, opts);
}

/** 栏目页 _index.md 只放标题（正文在同名子目录的 index.md 里） */
function buildSectionFrontMatter(doc, opts) {
  if (frontmatterSyntax(opts) === "toml") {
    return ["+++", `title = ${tomlString(doc.title)}`, "+++", ""].join("\n");
  }
  return ["---", `title: ${yamlString(doc.title)}`, "---", ""].join("\n");
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

function wrapDocument(body, opts) {
  // Markdown 标题模式下，开标签后面必须留一个空行：正文第一个块如果是 `## 标题`，
  // 紧跟 <div> 会被 goldmark 当成 HTML 块的一部分原样输出；空行才能结束 HTML 块。
  // 纯 HTML 模式没有 Markdown 块，保持压缩，不插空行。
  const inner = String(body == null ? "" : body).replace(/^[ \t]*\n+/, "");
  const gap = opts && opts.headingStyle === "markdown" ? "\n\n" : "\n";
  return `<div class="sy-doc">${gap}${inner}\n</div>`;
}

function finalizeBody(body, ctx) {
  let out = String(body || "");
  if (out.includes(TOC_PLACEHOLDER)) out = out.split(TOC_PLACEHOLDER).join(renderToc(ctx.headings));
  out = stripZeroWidth(out);
  // 标题用 Markdown 时必须保留空行，让 `## 标题` 成为独立的 Markdown 块；
  // 纯 HTML 模式则压掉空行，保证整篇是一个 HTML 块。
  if (ctx.opts && ctx.opts.headingStyle === "markdown") return spacedBody(out);
  return compactHtml(out);
}

/** 正文是否有实际内容：空段落 / 只有零宽字符的块不算 */
function hasMeaningfulHtml(html) {
  const stripped = String(html || "")
    .replace(/<p[^>]*>(?:\s|&nbsp;|&#32;|<br\s*\/?>)*<\/p>/gi, "")
    .replace(/<div[^>]*>(?:\s|&nbsp;|&#32;|<br\s*\/?>)*<\/div>/gi, "")
    .trim();
  return stripped.length > 0;
}

async function exportDocument(docId, opts, assets, notebookName, planEntry) {
  const doc = await buildDocInfo(docId, notebookName);
  const paths = docPaths(doc, opts, planEntry);
  const ctx = {
    opts,
    doc,
    assets,
    paths,
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

  const treeBundle = opts.site === "hugo" && opts.hugoLayout === "bundle" && planEntry && planEntry.dir;
  const hasBody = hasMeaningfulHtml(main);
  const files = [];
  if (treeBundle && planEntry.hasChildren) {
    /* 有子页面：本页面目录放 _index.md（栏目页，只有标题），正文进同名子目录的 index.md */
    files.push({ path: paths.mdPath, content: buildSectionFrontMatter(doc, opts) });
    if (hasBody) {
      files.push({
        path: paths.bodyPath,
        content: `${docFrontMatter(doc, opts)}${wrapDocument(main, opts)}\n`
      });
    }
  } else {
    files.push({
      path: paths.mdPath,
      content: `${docFrontMatter(doc, opts)}${hasBody ? wrapDocument(main, opts) + "\n" : ""}`
    });
  }

  const displayPath = treeBundle ? paths.pageDir : paths.mdPath;
  return {
    files,
    path: displayPath,
    pageDir: paths.pageDir || "",
    hasBody,
    warnings: ctx.warnings,
    doc
  };
}

async function docsOfNotebook(box) {
  const rows = await listDocsOfNotebook(box);
  return rows.map((r) => r.id);
}

module.exports = {
  parseSiyuanDate,
  buildDocInfo,
  buildFrontMatter,
  buildTomlFrontMatter,
  buildSectionFrontMatter,
  frontmatterSyntax,
  buildTocTree,
  renderToc,
  wrapDocument,
  finalizeBody,
  hasMeaningfulHtml,
  exportDocument,
  docsOfNotebook,
};
