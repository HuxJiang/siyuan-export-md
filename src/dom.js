/*
 * siyuan-export-md — DOM 清洗：只保留可移植属性，链接转 <a>，行内公式转 data-latex
 * 由单文件 index.js 按功能拆分而来，业务代码保持原样。
 */
"use strict";

const { mathInline } = require("./math");

/* ------------------------------------------------------------------ *
 * 5. DOM 清洗（只保留可移植属性）
 * ------------------------------------------------------------------ */

const DROP_ATTRS = [
  "data-node-id",
  "data-render",
  "data-refcount",
  "data-eof",
  "data-subtype",
  "data-fold",
  "data-type",
  "data-content",
  "contenteditable",
  "spellcheck",
  "id"
];
const DROP_CLASS_PREFIX = ["protyle", "b3-", "fn__", "hljs"];
const DROP_CLASS_EXACT = ["protyle-action", "protyle-attr", "protyle-icons", "protyle-gutters", "protyle-breadcrumb"];

function parseBlockDom(html) {
  if (!html) return null;
  const doc = new DOMParser().parseFromString(html, "text/html");
  return doc.body.firstElementChild;
}

function isChrome(el) {
  const cls = (el.getAttribute("class") || "").split(/\s+/).filter(Boolean);
  return DROP_CLASS_EXACT.some((name) => cls.includes(name));
}

function sanitizeElement(root) {
  DROP_ATTRS.forEach((name) => root.removeAttribute(name));
  if (root.hasAttribute("class")) {
    const keep = (root.getAttribute("class") || "")
      .split(/\s+/)
      .filter(Boolean)
      .filter((token) => !DROP_CLASS_PREFIX.some((p) => token.startsWith(p)));
    if (keep.length) root.setAttribute("class", keep.join(" "));
    else root.removeAttribute("class");
  }
  if (root.tagName === "SPAN" && root.attributes.length === 0) {
    root.replaceWith(...Array.from(root.childNodes));
    return;
  }
  Array.from(root.children).forEach((child) => {
    if (isChrome(child)) {
      child.remove();
      return;
    }
    sanitizeElement(child);
  });
}

/**
 * 思源里的链接/附件是 span[data-href]（编辑器内不渲染成 <a>），
 * 静态站点要的是普通 <a href>，这里统一换掉，正文里再重写资源路径。
 * 返回（可能被替换过的）根节点。
 */
function toAnchor(node) {
  const href = node.getAttribute("data-href") || "";
  if (!href) return node;
  const a = node.ownerDocument.createElement("a");
  a.setAttribute("href", href);
  const title = node.getAttribute("title") || node.getAttribute("data-title") || "";
  if (title) a.setAttribute("title", title);
  const keep = (node.getAttribute("class") || "")
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !DROP_CLASS_PREFIX.some((p) => token.startsWith(p)));
  if (keep.length) a.setAttribute("class", keep.join(" "));
  while (node.firstChild) a.appendChild(node.firstChild);
  if (!a.textContent.trim() && title) a.textContent = title;
  return a;
}

function convertDataHrefAnchors(root) {
  if (!root || !root.querySelectorAll) return root;
  if (root.tagName !== "A" && root.hasAttribute("data-href")) return toAnchor(root);
  root.querySelectorAll("[data-href]").forEach((node) => {
    if (node.tagName === "A") return;
    const anchor = toAnchor(node);
    if (anchor !== node) node.replaceWith(anchor);
  });
  return root;
}

function toCleanHtml(el) {
  if (!el) return "";
  let clone = el.cloneNode(true);
  DROP_ATTRS.forEach((name) => clone.removeAttribute(name));
  clone = convertDataHrefAnchors(clone);
  sanitizeElement(clone);
  return clone.outerHTML;
}

/** 把 DOM 里的行内公式换成 data-latex 契约（必须在 sanitize 之前调用）。 */
function convertInlineMathNodes(root) {
  const nodes = root.querySelectorAll('[data-type="inline-math"]');
  nodes.forEach((node) => {
    const tex = node.getAttribute("data-content") || node.textContent || "";
    const html = mathInline(tex);
    if (!html) {
      node.remove();
      return;
    }
    const holder = node.ownerDocument.createElement("span");
    holder.innerHTML = html;
    const child = holder.firstElementChild;
    if (child) node.replaceWith(child);
    else node.remove();
  });
}

module.exports = {
  DROP_ATTRS,
  DROP_CLASS_PREFIX,
  DROP_CLASS_EXACT,
  parseBlockDom,
  isChrome,
  sanitizeElement,
  toAnchor,
  convertDataHrefAnchors,
  toCleanHtml,
  convertInlineMathNodes,
};
