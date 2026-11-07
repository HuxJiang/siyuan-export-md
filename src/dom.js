/*
 * siyuan-export-md — DOM 工具：块类型识别、编辑器装饰节点过滤、属性清洗、超级块样式
 *
 * 导出全程不再依赖 kramdown，所有语义都从思源渲染态 DOM 里读：
 *   - data-type="NodeHeading" / class="h2" 之类决定块类型；
 *   - .protyle-action / .protyle-attr / .protyle-icons 是编辑器装饰，必须剥掉；
 *   - span[data-href] 要换成 <a href>，行内公式要换成 data-latex 容器。
 */
"use strict";

const { mathInlineEl } = require("./math");
const { normalizeType } = require("./api");
const { stripZeroWidth } = require("./utils");

/* ------------------------------------------------------------------ *
 * 1. 常量
 * ------------------------------------------------------------------ */

const DROP_ATTRS = [
  "data-node-id",
  "data-node-index",
  "data-render",
  "data-refcount",
  "data-eof",
  "data-subtype",
  "data-sb-layout",
  "data-layout",
  "data-marker",
  "data-fold",
  "data-type",
  "data-content",
  "data-href",
  "data-title",
  "data-id",
  "data-inline",
  "updated",
  "contenteditable",
  "spellcheck",
  "id"
];

/** 编辑器私有类名前缀：导出后没有任何意义，还会把站点样式带偏 */
const DROP_CLASS_PREFIX = ["protyle-", "b3-", "fn__", "hljs", "katex", "sb__"];

/** 装饰节点（整棵子树都要丢掉） */
const CHROME_CLASSES = [
  "protyle-action",
  "protyle-attr",
  "protyle-icons",
  "protyle-gutters",
  "protyle-breadcrumb",
  "protyle-linenumber",
  "protyle-space",
  "protyle-resize",
  // 思源表格里被 rowspan 合并掉的位置会留一个 td.fn__none 占位；
  // 类名剥掉后它就成了真单元格，整行会多一列，必须按装饰节点删掉
  "fn__none"
];

/** 思源超级块的排布：col 左右并排，row 上下堆叠（与 protyle 的 data-sb-layout 一致）。 */
const SUPERBLOCK_STYLE = {
  col: {
    container: "display:flex;flex-direction:row;flex-wrap:wrap;gap:1rem;align-items:flex-start",
    cell: "flex:1 1 0;min-width:0;max-width:100%"
  },
  row: {
    container: "display:flex;flex-direction:column;gap:1rem;align-items:stretch"
  }
};

/* ------------------------------------------------------------------ *
 * 2. 基础判断
 * ------------------------------------------------------------------ */

function classTokens(node) {
  if (!node || node.nodeType !== 1 || !node.getAttribute) return [];
  return String(node.getAttribute("class") || "")
    .split(/\s+/)
    .filter(Boolean);
}

function isChrome(node) {
  if (!node || node.nodeType !== 1) return false;
  const tokens = classTokens(node);
  return tokens.some((token) => CHROME_CLASSES.includes(token));
}

/** 有 data-node-id + data-type 的节点才是「块」，其余是块内的行内容器。 */
function isBlockNode(node) {
  return !!node && node.nodeType === 1 && node.hasAttribute("data-node-id") && node.hasAttribute("data-type");
}

/**
 * 空的 render-node：思源给公式/引用等预留的渲染占位空壳。
 * 注意 render-node 也可能是公式节点本身（带 data-type），这里只认真正的空壳。
 */
function isEmptyRenderNode(node) {
  if (!node || node.nodeType !== 1) return false;
  if (!classTokens(node).includes("render-node")) return false;
  if (node.getAttribute("data-type")) return false;
  if (node.children.length) return false;
  return !stripZeroWidth(node.textContent || "").trim();
}

function blockTypeOf(el, fallback) {
  const fromDom = el && el.getAttribute ? normalizeType(el.getAttribute("data-type")) : "";
  return fromDom || normalizeType(fallback) || "";
}

function parseBlockDom(html) {
  if (!html) return null;
  const doc = new DOMParser().parseFromString(html, "text/html");
  return doc.body.firstElementChild;
}

/** 标题级别：data-subtype="h2" 优先，其次 class="h2"，最后看 meta.subType。 */
function headingLevelOf(el, meta) {
  const sub = String((meta && meta.subType) || (el && el.getAttribute("data-subtype")) || "").toLowerCase();
  const fromSub = /^h?([1-6])$/.exec(sub);
  if (fromSub) return Number(fromSub[1]);
  const cls = String((el && el.getAttribute("class")) || "");
  const fromCls = /\b(h[1-6])\b/.exec(cls);
  return fromCls ? Number(fromCls[1][1]) : 1;
}

/** 超级块布局：data-sb-layout / data-layout / class，兜底 row（思源默认纵向）。 */
function layoutOf(el) {
  if (!el || !el.getAttribute) return "row";
  const attr = String(el.getAttribute("data-sb-layout") || el.getAttribute("data-layout") || "")
    .trim()
    .toLowerCase();
  if (attr === "col" || attr === "row") return attr;
  if (attr === "flex") return "col";
  const cls = String(el.getAttribute("class") || "").toLowerCase();
  if (cls.includes("layout-col") || cls.includes("sb--col")) return "col";
  if (cls.includes("layout-row")) return "row";
  return "row";
}

/** 尺寸相关声明：思源把超级块拖拽后的栏宽存在子块的 style 属性上（width: calc(66.6% - 12px)）。 */
function hasOwnSizing(style) {
  return /(?:^|;)\s*(?:flex|flex-grow|flex-basis|width|max-width|min-width)\s*:/.test(String(style || ""));
}

/**
 * 从块自己的 style 里只取宽度百分比，例如
 *   width: calc(66.6% - 12px)  →  66.6
 *   width: 40%                  →  40
 * 取不到百分比（纯 px、flex 比例）返回 null：这类宽度没法在站点里按比例还原。
 */
function widthPercentOf(style) {
  const text = String(style || "");
  if (!text.trim()) return null;
  let percent = null;
  text.split(";").forEach((decl) => {
    const idx = decl.indexOf(":");
    if (idx < 0) return;
    const name = decl.slice(0, idx).trim().toLowerCase();
    if (name !== "width" && name !== "flex-basis") return;
    const m = /(-?\d+(?:\.\d+)?)\s*%/.exec(decl.slice(idx + 1));
    if (m) percent = Number(m[1]);
  });
  return Number.isFinite(percent) ? percent : null;
}

/**
 * 同一行里各子块的宽度比例：只取 width 的百分比，按合计归一化到 100。
 * 没写宽度的子块按「剩余比例」均分；一个百分比都取不到时返回 null。
 */
function widthRatios(children) {
  const list = Array.from(children || []);
  if (!list.length) return null;
  const percents = list.map((child) => widthPercentOf(child.getAttribute("style")));
  if (!percents.some((p) => p !== null)) return null;

  const sizedSum = percents.reduce((sum, p) => sum + (p === null ? 0 : p), 0);
  const unsizedCount = percents.filter((p) => p === null).length;
  const weights = percents.map((p) => (p !== null ? p : Math.max(100 - sizedSum, 1) / unsizedCount));
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (!(total > 0)) return null;
  // 归一化到合计 100，保留两位小数，避免 calc 的 px 尾巴跟着导出
  return weights.map((w) => Math.round((w * 10000) / total) / 100);
}

function findTable(el) {
  if (!el) return null;
  if (el.tagName === "TABLE") return el;
  if (el.querySelector) return el.querySelector("table");
  return null;
}

/* ------------------------------------------------------------------ *
 * 3. 样式合并 / 超级块
 * ------------------------------------------------------------------ */

function mergeStyle(existing, extra) {
  const base = String(existing || "").trim().replace(/;+$/, "");
  return base ? `${base};${extra}` : extra;
}

/** 兜底：残留的超级块（表格单元格、未知类型里）也补上 class + 内联样式。 */
function applySuperblockStyle(el) {
  if (!el || !el.getAttribute) return;
  const layout = String(el.getAttribute("data-sb-layout") || "").trim().toLowerCase();
  if (layout !== "col" && layout !== "row") return;
  const style = SUPERBLOCK_STYLE[layout];
  const cls = classTokens(el);
  cls.push("sy-superblock", `sy-superblock-${layout}`);
  el.setAttribute("class", Array.from(new Set(cls)).join(" "));
  el.setAttribute("style", mergeStyle(el.getAttribute("style"), style.container));
  if (layout === "col") {
    const kids = Array.from(el.children).filter((child) => child && child.tagName !== "SPAN"); // 跳过 sb__resize 装饰
    const ratios = widthRatios(kids);
    kids.forEach((child, index) => {
      const childStyle = String(child.getAttribute("style") || "");
      if (ratios) {
        child.setAttribute("style", mergeStyle(childStyle, `flex:${ratios[index]} 1 0;min-width:0;max-width:100%`));
        return;
      }
      if (hasOwnSizing(childStyle)) return; // 非百分比的栏宽（px 等）没法按比例还原，别覆盖
      child.setAttribute("style", mergeStyle(childStyle, style.cell));
    });
  }
}

/* ------------------------------------------------------------------ *
 * 4. 链接 / 行内公式 / 属性清洗
 * ------------------------------------------------------------------ */

/** span[data-href] → <a href>：思源编辑器内不渲染成链接，静态站要真正的 <a>。 */
function toAnchor(node) {
  const href = node.getAttribute("data-href") || node.getAttribute("href") || "";
  if (!href) return node;
  const doc = node.ownerDocument;
  const anchor = doc.createElement("a");
  anchor.setAttribute("href", href);
  const title = node.getAttribute("title") || node.getAttribute("data-title") || "";
  if (title) anchor.setAttribute("title", title);
  while (node.firstChild) anchor.appendChild(node.firstChild);
  if (!anchor.textContent.trim() && title) anchor.textContent = title;
  return anchor;
}

function convertDataHrefAnchors(root) {
  if (!root || !root.querySelectorAll) return root;
  if (root.tagName !== "A" && root.hasAttribute && root.hasAttribute("data-href")) return toAnchor(root);
  root.querySelectorAll("[data-href]").forEach((node) => {
    if (node.tagName === "A") return;
    const anchor = toAnchor(node);
    if (anchor !== node) node.replaceWith(anchor);
  });
  return root;
}

/** 行内公式 → span.math-inline[data-latex]（必须在属性清洗之前调用）。 */
function convertInlineMathNodes(root) {
  if (!root || !root.querySelectorAll) return root;
  const nodes = Array.from(root.querySelectorAll('[data-type~="inline-math"]'));
  // 第一遍先删重复节点：思源给「高亮的行内公式」在 DOM 里留了两份（一份带 mark），
  // 两份都导出会让公式显示两遍。必须在任何节点被替换前判断相邻关系。
  nodes.forEach((node) => {
    if (!node.parentNode) return;
    if (!mathHasMark(node) && findMarkedMathTwin(node)) node.remove();
  });
  // 第二遍：data-type 可能是多值（"inline-math mark"），用 ~= 做分词匹配
  nodes.forEach((node) => {
    if (!node.parentNode) return;
    const el = mathInlineEl(node.ownerDocument, mathSource(node));
    if (!el) {
      node.remove();
      return;
    }
    if (mathHasMark(node)) {
      const mark = node.ownerDocument.createElement("mark");
      mark.appendChild(el);
      node.replaceWith(mark);
      return;
    }
    node.replaceWith(el);
  });
  return root;
}

function mathTypeTokens(node) {
  return String(node.getAttribute("data-type") || "")
    .split(/\s+/)
    .filter(Boolean);
}

function isInlineMathNode(node) {
  return !!node && node.nodeType === 1 && node.getAttribute && mathTypeTokens(node).includes("inline-math");
}

function mathHasMark(node) {
  return mathTypeTokens(node).includes("mark");
}

function mathSource(node) {
  return node.getAttribute("data-content") || node.textContent || "";
}

/** 相邻节点里只有空白/零宽字符时，才算紧挨着的同一处公式。 */
function isBlankInlineNode(node) {
  if (!node) return false;
  if (node.nodeType === 3) return !stripZeroWidth(node.nodeValue || "").trim();
  return false;
}

/** 紧邻的、内容相同且带 mark 的公式节点（跳过零宽文本节点）。 */
function findMarkedMathTwin(node) {
  const dirs = ["nextSibling", "previousSibling"];
  for (const dir of dirs) {
    let sib = node[dir];
    while (sib && isBlankInlineNode(sib)) sib = sib[dir];
    if (!isInlineMathNode(sib) || !mathHasMark(sib)) continue;
    if (mathSource(sib) === mathSource(node)) return sib;
  }
  return null;
}

/** 高亮标记 → <mark>：思源用 <span data-type="mark">，导出的语义标签应是 mark。 */
function convertMarkNodes(root) {
  if (!root || !root.querySelectorAll) return root;
  root.querySelectorAll('[data-type~="mark"]').forEach((node) => {
    if (mathTypeTokens(node).includes("inline-math")) return; // 行内公式的 mark 已由公式转换处理
    const doc = node.ownerDocument;
    const mark = doc.createElement("mark");
    while (node.firstChild) mark.appendChild(node.firstChild);
    node.replaceWith(mark);
  });
  return root;
}

/** 递归清洗：丢装饰节点、私有属性、私有类名。返回传入的根节点（结构不变）。 */
function sanitizeTree(root) {
  if (!root || root.nodeType !== 1) return root;
  const stack = [root];
  while (stack.length) {
    const node = stack.pop();
    Array.from(node.children || []).forEach((child) => {
      if (isChrome(child) || isEmptyRenderNode(child)) {
        child.remove();
        return;
      }
      stack.push(child);
    });
    DROP_ATTRS.forEach((name) => {
      if (node.hasAttribute && node.hasAttribute(name)) node.removeAttribute(name);
    });
    if (node.hasAttribute && node.hasAttribute("class")) {
      const keep = classTokens(node).filter((token) => !DROP_CLASS_PREFIX.some((p) => token.startsWith(p)));
      if (keep.length) node.setAttribute("class", keep.join(" "));
      else node.removeAttribute("class");
    }
  }

  // 属性剥完之后再清一遍空 render-node（清洗前它可能还带着 data-type，认不出来）
  const prune = [root];
  while (prune.length) {
    const node = prune.pop();
    Array.from(node.children || []).forEach((child) => {
      if (isEmptyRenderNode(child)) child.remove();
      else prune.push(child);
    });
  }
  return root;
}

/**
 * 任意块的 DOM 清洗：先转行内公式和链接，再剥编辑器属性。
 * 返回（可能被替换掉的）根节点，调用方必须使用返回值。
 */
function cleanElement(el) {
  if (!el) return null;
  const clone = el.cloneNode(true);
  convertInlineMathNodes(clone);
  convertMarkNodes(clone);
  const root = convertDataHrefAnchors(clone);
  applySuperblockStyle(root);
  return sanitizeTree(root);
}

/** 表格：清洗后只保留 <table> 本身（去掉编辑器包在表外的 .table 之类）。 */
function cleanTableHtml(tableEl) {
  const clone = tableEl.cloneNode(true);
  convertInlineMathNodes(clone);
  convertMarkNodes(clone);
  convertDataHrefAnchors(clone);
  sanitizeTree(clone);
  return clone.outerHTML;
}

module.exports = {
  DROP_ATTRS,
  DROP_CLASS_PREFIX,
  CHROME_CLASSES,
  SUPERBLOCK_STYLE,
  mergeStyle,
  classTokens,
  isChrome,
  isEmptyRenderNode,
  isBlockNode,
  blockTypeOf,
  parseBlockDom,
  headingLevelOf,
  layoutOf,
  hasOwnSizing,
  widthPercentOf,
  widthRatios,
  findTable,
  applySuperblockStyle,
  toAnchor,
  convertDataHrefAnchors,
  convertInlineMathNodes,
  sanitizeTree,
  cleanElement,
  cleanTableHtml,
};
