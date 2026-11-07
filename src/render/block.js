/*
 * siyuan-export-md — 核心渲染：思源块 DOM → 语义 HTML
 *
 * 一个块 DOM 进来，按 data-type 走各自的渲染器，输出的是真正的 HTML 元素：
 *   p / h1–h6 / ul / ol / li / blockquote / pre + code / table / figure /
 *   div.math-block / div.callout / div.sy-superblock / pre.mermaid …
 * 行内节点（strong / em / u / mark / kbd / code / a / img / 行内公式）在
 * appendInline 里统一映射，不再经过任何 Markdown 语法。
 *
 * 这里所有函数都是同步的：容器块的子块就在它自己的 DOM 里；只有 DOM 缺失时
 * 才由 dispatch.js 去拉子块列表兜底。
 */
"use strict";

const { escapeHtml, textOf, stripZeroWidth, TOC_PLACEHOLDER } = require("../utils");
const { slugify } = require("../naming");
const { extractLatex, mathInlineEl, looksLikeMermaid } = require("../math");
const {
  SUPERBLOCK_STYLE,
  classTokens,
  isChrome,
  isEmptyRenderNode,
  isBlockNode,
  blockTypeOf,
  headingLevelOf,
  layoutOf,
  hasOwnSizing,
  findTable,
  cleanElement,
  cleanTableHtml,
  mergeStyle
} = require("../dom");

/* ------------------------------------------------------------------ *
 * 1. 内联节点映射
 * ------------------------------------------------------------------ */

/** 直接保留的语义行内标签（属性按白名单复制，类名一律不复制） */
const INLINE_KEEP_TAGS = {
  STRONG: "strong",
  B: "strong",
  EM: "em",
  I: "em",
  S: "s",
  STRIKE: "s",
  DEL: "s",
  U: "u",
  MARK: "mark",
  SUP: "sup",
  SUB: "sub",
  KBD: "kbd",
  CODE: "code",
  A: "a",
  SMALL: "small",
  Q: "q",
  ABBR: "abbr",
  TIME: "time"
};

const ATTR_WHITELIST = {
  a: ["href", "title"],
  abbr: ["title"],
  q: ["cite"],
  time: ["datetime"],
  img: ["src", "alt", "title", "width", "height", "loading"]
};

function makeEl(doc, tag, className) {
  const el = doc.createElement(tag);
  if (className) el.className = className;
  return el;
}

/** 把一段 HTML 片段挂到元素上（用于把子块渲染结果塞进容器）。 */
function appendHtml(parent, html) {
  const src = String(html == null ? "" : html).trim();
  if (!src) return;
  const holder = parent.ownerDocument.createElement("div");
  holder.innerHTML = src;
  while (holder.firstChild) parent.appendChild(holder.firstChild);
}

function copyPermittedAttrs(source, target, tag) {
  const allowed = ATTR_WHITELIST[tag] || [];
  allowed.forEach((name) => {
    const value = source.getAttribute(name);
    if (value != null && value !== "") target.setAttribute(name, value);
  });
}

function appendImageInline(el, parent) {
  const src = el.getAttribute("src") || "";
  if (!src) return;
  const img = parent.ownerDocument.createElement("img");
  copyPermittedAttrs(el, img, "img");
  parent.appendChild(img);
}

function appendAnchor(el, parent, ctx) {
  const doc = parent.ownerDocument;
  const anchor = doc.createElement("a");
  const href = el.getAttribute("data-href") || el.getAttribute("href") || "";
  const title = el.getAttribute("title") || el.getAttribute("data-title") || "";
  if (href) anchor.setAttribute("href", href);
  if (title) anchor.setAttribute("title", title);
  appendInlineChildren(el, anchor, ctx);
  if (!anchor.textContent.trim() && title) anchor.textContent = title;
  if (!anchor.textContent.trim()) return;
  parent.appendChild(anchor);
}

function appendInlineChildren(container, target, ctx) {
  Array.from(container.childNodes).forEach((child) => appendInline(child, target, ctx));
}

/**
 * 行内节点 → 目标元素。
 * 认得的标签保留语义，其余容器（span/div/font…）一律展开，避免把编辑器结构带出去。
 */
function appendInline(node, parent, ctx) {
  if (!node) return;
  if (node.nodeType === 3) {
    const text = stripZeroWidth(node.nodeValue || "");
    if (text) parent.appendChild(parent.ownerDocument.createTextNode(text));
    return;
  }
  if (node.nodeType !== 1) return;

  const el = node;
  if (isChrome(el)) return;
  // 空的 render-node 是思源渲染占位空壳（公式/引用的内容在别处取），别把空壳带出去
  if (isEmptyRenderNode(el)) return;
  if (isBlockNode(el)) {
    // 行内流里嵌了块（少数容器块会这样）：按块渲染后插入
    appendHtml(parent, renderElement(el, ctx));
    return;
  }

  const doc = parent.ownerDocument;
  const type = String(el.getAttribute("data-type") || "").toLowerCase();
  const types = type.split(/\s+/);

  if (types.includes("inline-math")) {
    const span = mathInlineEl(doc, el.getAttribute("data-content") || el.textContent || "");
    if (span) parent.appendChild(span);
    return;
  }
  if (types.includes("tag")) {
    const span = makeEl(doc, "span", "tag");
    span.textContent = textOf(el).trim();
    if (span.textContent) parent.appendChild(span);
    return;
  }
  if (types.includes("block-ref")) {
    const span = makeEl(doc, "span", "block-ref");
    appendInlineChildren(el, span, ctx);
    if (!span.textContent.trim()) span.textContent = textOf(el).trim();
    if (span.textContent.trim()) parent.appendChild(span);
    return;
  }
  if (types.includes("kbd")) {
    const kbd = makeEl(doc, "kbd");
    appendInlineChildren(el, kbd, ctx);
    if (!kbd.textContent) kbd.textContent = textOf(el).trim();
    if (kbd.textContent) parent.appendChild(kbd);
    return;
  }
  if (types.includes("code") || types.includes("inline-code")) {
    const code = makeEl(doc, "code");
    code.textContent = stripZeroWidth(textOf(el));
    parent.appendChild(code);
    return;
  }
  if (el.hasAttribute("data-href")) {
    appendAnchor(el, parent, ctx);
    return;
  }

  const tag = el.tagName;
  if (tag === "IMG") {
    appendImageInline(el, parent);
    return;
  }
  if (tag === "BR") {
    parent.appendChild(doc.createElement("br"));
    return;
  }
  if (tag === "CODE") {
    const code = makeEl(doc, "code");
    code.textContent = stripZeroWidth(textOf(el));
    parent.appendChild(code);
    return;
  }

  const keep = INLINE_KEEP_TAGS[tag];
  if (keep) {
    const out = makeEl(doc, keep);
    copyPermittedAttrs(el, out, keep);
    appendInlineChildren(el, out, ctx);
    parent.appendChild(out);
    return;
  }

  // 未知行内容器：展开
  appendInlineChildren(el, parent, ctx);
}

/* ------------------------------------------------------------------ *
 * 2. 块级渲染
 * ------------------------------------------------------------------ */

const CALLOUT_META = {
  note: { icon: "📝", title: "Note", cls: "note" },
  tip: { icon: "💡", title: "Tip", cls: "tip" },
  important: { icon: "❗", title: "Important", cls: "important" },
  warning: { icon: "⚠️", title: "Warning", cls: "warning" },
  caution: { icon: "🔥", title: "Caution", cls: "danger" },
  danger: { icon: "🔥", title: "Danger", cls: "danger" }
};

function uniqueHeadingId(text, ctx) {
  if (!ctx.headingIds) ctx.headingIds = new Map();
  const base = slugify(text) || "section";
  const count = (ctx.headingIds.get(base) || 0) + 1;
  ctx.headingIds.set(base, count);
  return count === 1 ? base : `${base}-${count}`;
}

function renderHeading(el, ctx, meta) {
  const doc = el.ownerDocument;
  let level = headingLevelOf(el, meta);
  if (ctx.opts && ctx.opts.headingDemote) level = Math.min(level + 1, 6);
  level = Math.max(1, Math.min(6, level));

  const holder = doc.createElement("span");
  appendInlineChildren(el, holder, ctx);
  const inner = holder.innerHTML.trim();
  if (!inner) return "";

  const text = textOf(holder).replace(/\s+/g, " ").trim();
  const id = uniqueHeadingId(text || "section", ctx);
  ctx.headings.push({ level, text, id });
  return `<h${level} id="${escapeHtml(id)}">${inner}</h${level}>`;
}

function renderParagraph(el, ctx) {
  // 思源里从 Markdown 导入的图片常落在段落里：只有一张图、没有文字时按图片块输出 figure
  const imgs = el.querySelectorAll("img");
  if (imgs.length === 1 && !el.querySelector("a") && !stripZeroWidth(textOf(el)).trim()) {
    const figure = renderImageBlock(el);
    if (figure) return figure;
  }

  const doc = el.ownerDocument;
  const p = doc.createElement("p");
  appendInlineChildren(el, p, ctx);
  if (!p.innerHTML.trim()) return "";
  return p.outerHTML;
}

function isListItem(node) {
  if (!node || node.nodeType !== 1) return false;
  return blockTypeOf(node, "") === "i" || classTokens(node).includes("li");
}

/** 列表项自己的勾选框（不能命中嵌套子列表里的 checkbox）。 */
function ownCheckbox(li) {
  for (const child of Array.from(li.children)) {
    if (classTokens(child).includes("protyle-action")) {
      const box = child.querySelector('input[type="checkbox"]');
      if (box) return box;
    }
  }
  return null;
}

function checkboxChecked(box) {
  if (!box) return false;
  if (box.hasAttribute("checked")) return true;
  return box.checked === true;
}

function renderListItem(li, list, ctx) {
  const doc = li.ownerDocument;
  const item = doc.createElement("li");

  const box = ownCheckbox(li);
  if (box) {
    const checked = checkboxChecked(box);
    item.className = checked ? "task-item task-checked" : "task-item";
    const input = doc.createElement("input");
    input.setAttribute("type", "checkbox");
    input.setAttribute("disabled", "");
    if (checked) input.setAttribute("checked", "");
    item.appendChild(input);
    item.appendChild(doc.createTextNode(" "));
  }

  Array.from(li.childNodes).forEach((child) => {
    if (child.nodeType === 1) {
      if (isChrome(child)) return;
      if (isBlockNode(child)) {
        const type = blockTypeOf(child, "");
        if (type === "p") {
          // 列表项里的段落压平成行内内容，避免 <li><p> 的额外间距
          appendInlineChildren(child, item, ctx);
          return;
        }
        appendHtml(item, renderElement(child, ctx));
        return;
      }
    }
    appendInline(child, item, ctx);
  });

  if (!item.textContent.replace(/\s+/g, "")) return;
  list.appendChild(item);
}

function renderList(el, ctx) {
  const doc = el.ownerDocument;
  const subtype = String(el.getAttribute("data-subtype") || "").toLowerCase();
  const list = doc.createElement(subtype === "o" ? "ol" : "ul");
  if (subtype === "t") list.className = "task-list";

  Array.from(el.children).forEach((child) => {
    if (isListItem(child)) renderListItem(child, list, ctx);
  });
  if (!list.children.length) return "";
  return list.outerHTML;
}

/** 单个列表项（DOM 缺失、按子块列表兜底时用）：返回 <li>。 */
function renderSingleListItem(el, ctx) {
  const holder = el.ownerDocument.createElement("ul");
  renderListItem(el, holder, ctx);
  return holder.firstElementChild ? holder.firstElementChild.outerHTML : "";
}

/**
 * 块级容器（引用、callout body、未知块）通用渲染：
 * 子块按块渲染，裸文本（没有块标识的包装层里的文字）收成 <p>。
 */
function appendBlockLevel(container, target, ctx, shouldSkip) {
  const doc = target.ownerDocument;
  let buffer = doc.createElement("span");

  const flush = () => {
    const html = buffer.innerHTML.trim();
    if (html) {
      const p = doc.createElement("p");
      p.innerHTML = html;
      target.appendChild(p);
    }
    buffer = doc.createElement("span");
  };

  Array.from(container.childNodes).forEach((child) => {
    if (child.nodeType === 1) {
      if (shouldSkip && shouldSkip(child)) return;
      if (isChrome(child)) return;
      if (isBlockNode(child)) {
        flush();
        appendHtml(target, renderElement(child, ctx));
        return;
      }
      // 没有块标识的包装层：里面可能还挂着块，递归下去
      if (child.querySelector && child.querySelector("[data-node-id][data-type]")) {
        flush();
        appendBlockLevel(child, target, ctx, shouldSkip);
        return;
      }
    }
    appendInline(child, buffer, ctx);
  });
  flush();
}

function renderBlockquote(el, ctx) {
  const doc = el.ownerDocument;
  const bq = doc.createElement("blockquote");
  appendBlockLevel(el, bq, ctx);
  if (!bq.innerHTML.trim()) return "";
  return bq.outerHTML;
}

/** 从整块文本里取代码：拷一份 DOM、剥掉行号栏/操作按钮等装饰，避免把编辑器 UI 当代码。 */
function codeTextFrom(el) {
  const clone = el.cloneNode(true);
  Array.from(clone.querySelectorAll("*")).forEach((node) => {
    if (isChrome(node)) node.remove();
  });
  Array.from(clone.children).forEach((child) => {
    if (isChrome(child)) child.remove();
  });
  return clone.textContent || "";
}

function renderCodeBlock(el, ctx, meta) {
  const doc = el.ownerDocument;
  const node = el.querySelector("code") || el.querySelector("pre") || el.querySelector(".hljs");
  // 结构异常（没有 code/pre）时退回整块文本，不能直接丢内容
  const text = stripZeroWidth(node ? node.textContent || "" : codeTextFrom(el));
  const body = text.replace(/\n$/, "");
  if (!body.trim()) return "";

  let lang = String((meta && meta.subType) || el.getAttribute("data-subtype") || "").trim();
  if (!lang && node) {
    const m = /language-([A-Za-z0-9+#._-]+)/.exec(String(node.getAttribute("class") || ""));
    if (m) lang = m[1];
  }
  if (!lang) {
    const action = el.querySelector(".protyle-action");
    if (action) lang = textOf(action).trim();
  }
  if (/^code$/i.test(lang)) lang = "";
  lang = lang.replace(/[^A-Za-z0-9+#._-]/g, "");

  const pre = makeEl(doc, "pre", "code-block");
  if (lang) pre.setAttribute("data-lang", lang);
  const code = doc.createElement("code");
  if (lang) code.className = "language-" + lang;
  code.textContent = body;
  pre.appendChild(code);
  // 反引号转义成 &#96;：即使站点把正文再过一遍 Markdown，也不会被当成围栏开头
  return pre.outerHTML.replace(/`/g, "&#96;");
}

function renderMathBlock(el) {
  const tex = extractLatex(el);
  if (!tex) return "";
  const doc = el.ownerDocument;
  const div = makeEl(doc, "div", "math-block");
  div.setAttribute("data-latex", tex);
  div.textContent = tex;
  return div.outerHTML;
}

function renderTableBlock(el) {
  const table = findTable(el);
  if (!table) return "";
  const html = cleanTableHtml(table);
  if (!html) return "";
  return `<div class="table-wrapper">\n${html}\n</div>`;
}

function renderImageBlock(el) {
  const img = el.tagName === "IMG" ? el : el.querySelector("img");
  if (!img) return "";
  const src = img.getAttribute("src") || "";
  if (!src) return "";

  const doc = el.ownerDocument;
  const figure = makeEl(doc, "figure", "sy-image");
  const out = doc.createElement("img");
  copyPermittedAttrs(img, out, "img");
  if (!out.getAttribute("src")) out.setAttribute("src", src);
  if (!out.getAttribute("alt") && out.getAttribute("title")) out.setAttribute("alt", out.getAttribute("title"));
  figure.appendChild(out);

  const caption = String(img.getAttribute("title") || "").trim();
  if (caption) {
    const figcaption = doc.createElement("figcaption");
    figcaption.textContent = caption;
    figure.appendChild(figcaption);
  }
  return figure.outerHTML;
}

function calloutInfo(el, meta) {
  const sub = String((meta && meta.subType) || el.getAttribute("data-subtype") || "note").toLowerCase();
  const info = CALLOUT_META[sub] || CALLOUT_META.note;
  const titleEl = el.querySelector(".callout-title");
  const iconEl = el.querySelector(".callout-icon");
  return {
    cls: info.cls,
    icon: (iconEl && textOf(iconEl).trim()) || info.icon,
    title: (titleEl && textOf(titleEl).trim()) || info.title
  };
}

function renderCallout(el, ctx, meta) {
  const doc = el.ownerDocument;
  const info = calloutInfo(el, meta);
  const body = makeEl(doc, "div", "callout-body");

  const isHeader = (child) =>
    classTokens(child).some((token) => token === "callout-info" || token === "callout-title" || token === "callout-icon");
  appendBlockLevel(el, body, ctx, isHeader);
  if (!body.innerHTML.trim()) return "";

  const wrap = makeEl(doc, "div", `callout callout-${info.cls}`);
  wrap.setAttribute("data-callout", info.cls);
  const title = makeEl(doc, "div", "callout-title");
  title.textContent = `${info.icon} ${info.title}`.trim();
  wrap.appendChild(title);
  wrap.appendChild(body);
  return wrap.outerHTML;
}

/** 给分栏子块的根节点补默认 flex 与标记类（解析不出单根节点时原样返回）。 */
function styleChildRoot(html, layout) {
  const src = String(html || "").trim();
  if (!src) return "";
  if (typeof DOMParser === "undefined") return src;
  try {
    const doc = new DOMParser().parseFromString(src, "text/html");
    const root = doc.body.firstElementChild;
    if (!root || doc.body.children.length !== 1) return src;

    const style = String(root.getAttribute("style") || "");
    if (layout === "col" && !hasOwnSizing(style)) {
      root.setAttribute("style", mergeStyle(style, SUPERBLOCK_STYLE.col.cell));
    }
    const cls = classTokens(root);
    cls.push("sy-superblock-child");
    root.setAttribute("class", Array.from(new Set(cls)).join(" "));
    return root.outerHTML;
  } catch (e) {
    return src;
  }
}

function renderSuperblock(el, ctx) {
  const doc = el.ownerDocument;
  const layout = layoutOf(el);
  const parts = [];

  Array.from(el.childNodes).forEach((child) => {
    if (child.nodeType !== 1) return;
    if (isChrome(child)) return;
    if (!isBlockNode(child)) return; // 装饰/调整手柄
    const html = renderElement(child, ctx);
    const root = styleChildRoot(html, layout);
    if (root) parts.push(root);
  });
  if (!parts.length) return "";

  const container = makeEl(doc, "div", `sy-superblock sy-superblock-${layout}`);
  container.setAttribute("data-sb-layout", layout);
  container.setAttribute("style", SUPERBLOCK_STYLE[layout].container);
  parts.forEach((part) => appendHtml(container, part));
  return container.outerHTML;
}

function renderDatabase(el, ctx) {
  const table = findTable(el);
  if (table) {
    ctx.warnings.push(`数据库块导出为当前视图表格：${el.getAttribute("data-node-id") || ""}`);
    return `<div class="table-wrapper">\n${cleanTableHtml(table)}\n</div>`;
  }
  const cleaned = cleanElement(el);
  if (!cleaned) return "";
  ctx.warnings.push(`数据库块退化为 HTML（非表格视图）：${el.getAttribute("data-node-id") || ""}`);
  return `<div class="sy-database">\n${cleaned.outerHTML}\n</div>`;
}

function renderDiagram(el, ctx, meta) {
  const doc = el.ownerDocument;
  const sub = String((meta && meta.subType) || "").toLowerCase();
  const text = (el.textContent || "").trim();
  if (sub.includes("mermaid") || looksLikeMermaid(text)) {
    const pre = makeEl(doc, "pre", "mermaid");
    pre.textContent = text;
    return pre.outerHTML;
  }
  ctx.warnings.push(`图表块退化为 HTML：${el.getAttribute("data-node-id") || ""}`);
  const cleaned = cleanElement(el);
  return cleaned ? cleaned.outerHTML : "";
}

function renderWidget(el, ctx) {
  const iframe = el.querySelector("iframe");
  if (iframe) {
    const cleaned = cleanElement(iframe);
    return cleaned ? cleaned.outerHTML : "";
  }
  ctx.warnings.push(`挂件无法静态导出，已输出占位：${el.getAttribute("data-node-id") || ""}`);
  return (
    '<div class="sy-placeholder" style="padding:12px;border:1px dashed #bbb;color:#888;font-size:13px">' +
    "思源挂件依赖运行时，静态站点中无法渲染，此处为占位。</div>"
  );
}

function renderMedia(el, ctx) {
  const target = /^(VIDEO|AUDIO|IFRAME)$/.test(el.tagName) ? el : el.querySelector("video, audio, iframe");
  if (!target) return "";
  ctx.warnings.push(`媒体文件需自行部署：${el.getAttribute("data-node-id") || ""}`);
  const cleaned = cleanElement(target);
  return cleaned ? cleaned.outerHTML : "";
}

function renderHtmlBlock(el) {
  const cleaned = cleanElement(el);
  return cleaned ? cleaned.outerHTML : "";
}

function renderUnknown(el, ctx) {
  const doc = el.ownerDocument;
  const wrap = makeEl(doc, "div", "sy-block");
  appendBlockLevel(el, wrap, ctx);
  const inner = wrap.innerHTML.trim();
  if (inner) return wrap.outerHTML;
  const cleaned = cleanElement(el);
  return cleaned ? cleaned.outerHTML : "";
}

/* ------------------------------------------------------------------ *
 * 3. 类型分发
 * ------------------------------------------------------------------ */

function renderElement(el, ctx, meta) {
  if (!el || el.nodeType !== 1) return "";
  const type = blockTypeOf(el, meta && meta.type);
  switch (type) {
    case "h":
      return renderHeading(el, ctx, meta);
    case "p":
      return renderParagraph(el, ctx);
    case "l":
      return renderList(el, ctx);
    case "i":
      return renderSingleListItem(el, ctx);
    case "b":
      return renderBlockquote(el, ctx);
    case "c":
      return renderCodeBlock(el, ctx, meta);
    case "m":
      return renderMathBlock(el);
    case "t":
      return renderTableBlock(el);
    case "img":
      return renderImageBlock(el);
    case "callout":
      return renderCallout(el, ctx, meta);
    case "s":
      return renderSuperblock(el, ctx);
    case "av":
      return renderDatabase(el, ctx);
    case "diagram":
      return renderDiagram(el, ctx, meta);
    case "widget":
      return renderWidget(el, ctx);
    case "iframe":
    case "video":
    case "audio":
      return renderMedia(el, ctx);
    case "html":
      return renderHtmlBlock(el);
    case "toc":
      return TOC_PLACEHOLDER;
    case "query_embed":
      ctx.warnings.push(`查询嵌入未展开：${el.getAttribute("data-node-id") || ""}`);
      return (
        '<div class="sy-placeholder" style="padding:12px;border:1px dashed #bbb;color:#888;font-size:13px">' +
        "思源查询嵌入块：依赖动态查询，静态站点中不生效。</div>"
      );
    default:
      return renderUnknown(el, ctx);
  }
}

module.exports = {
  CALLOUT_META,
  calloutInfo,
  renderElement,
  renderHeading,
  renderParagraph,
  renderList,
  renderSingleListItem,
  renderBlockquote,
  renderCodeBlock,
  renderMathBlock,
  renderTableBlock,
  renderImageBlock,
  renderCallout,
  renderSuperblock,
  renderDatabase,
  renderDiagram,
  renderWidget,
  renderMedia,
  renderHtmlBlock,
  renderUnknown,
  appendInline,
  appendBlockLevel,
  styleChildRoot,
  uniqueHeadingId,
  makeEl,
  appendHtml,
};
