/*
 * siyuan-export-md — 文档树：把 SQL 里的文档行按 hpath 还原成笔记本内的层级
 *
 * 只做纯数据变换，不碰 DOM、不碰 siyuan，方便单测。控制页用这棵树列出所有页面。
 * 注意 hpath 的形如 "/父文档/子文档/本文档"，最后一段就是文档自己的标题；
 * 中间的每一段通常也是文档（父文档），所以同一个节点既可能是目录又可能是页面。
 */
"use strict";

/** "/父/子/文档" → ["父", "子", "文档"] */
function hpathSegments(hpath) {
  return String(hpath == null ? "" : hpath)
    .split("/")
    .map((seg) => seg.trim())
    .filter(Boolean);
}

/** 文档标题：blocks.content 最准，退到 hpath 末段 */
function docTitleOf(row) {
  const content = String((row && row.content) || "").trim();
  if (content) return content;
  const segments = hpathSegments(row && row.hpath);
  return segments.length ? segments[segments.length - 1] : "untitled";
}

function normalizeQuery(query) {
  return String(query == null ? "" : query).trim().toLowerCase();
}

function sortTree(node) {
  if (!node.children || !node.children.length) return;
  node.children.sort((a, b) => {
    const byName = String(a.name || "").localeCompare(String(b.name || ""), "zh-Hans-CN", { numeric: true });
    if (byName) return byName;
    return String(a.id || "") < String(b.id || "") ? -1 : 1;
  });
  node.children.forEach(sortTree);
}

/**
 * notebooks: [{id, name, closed}]；docsByBox: { boxId: [{id, content, hpath, updated}] }
 * 返回的节点结构：{ kind, id?, name, doc, children, parent }
 *   - doc 非空表示这个节点本身是一篇文档；
 *   - children 非空表示它下面还有子文档。
 */
function buildDocTree(notebooks, docsByBox) {
  const list = Array.isArray(notebooks) ? notebooks : [];
  return list.map((notebook) => {
    const root = {
      kind: "notebook",
      id: notebook && notebook.id,
      name: (notebook && notebook.name) || (notebook && notebook.id) || "",
      closed: !!(notebook && notebook.closed),
      doc: null,
      children: [],
      parent: null
    };
    const byPath = new Map();
    const rows = (docsByBox && notebook && docsByBox[notebook.id]) || [];

    rows.forEach((row) => {
      if (!row || !row.id) return;
      const title = docTitleOf(row);
      const segments = hpathSegments(row.hpath);
      if (!segments.length) segments.push(title);

      let parent = root;
      let key = "";
      segments.forEach((seg) => {
        key = key ? key + "/" + seg : seg;
        let node = byPath.get(key);
        if (!node) {
          node = { kind: "folder", id: "", name: seg, doc: null, children: [], parent };
          byPath.set(key, node);
          parent.children.push(node);
        }
        parent = node;
      });

      const docId = String(row.id);
      parent.doc = {
        id: docId,
        title,
        hpath: String(row.hpath || "/" + segments.join("/")),
        updated: String(row.updated || ""),
        box: String((notebook && notebook.id) || "")
      };
      parent.name = title;
      parent.id = docId;
    });

    sortTree(root);
    return root;
  });
}

/** 子树里的页面总数（含节点自身） */
function countTreeDocs(node) {
  if (!node) return 0;
  let total = node.doc ? 1 : 0;
  (node.children || []).forEach((child) => {
    total += countTreeDocs(child);
  });
  return total;
}

function walkDocs(node, fn) {
  if (!node) return;
  if (node.doc) fn(node.doc, node);
  (node.children || []).forEach((child) => walkDocs(child, fn));
}

function walkNodes(node, fn) {
  if (!node) return;
  fn(node);
  (node.children || []).forEach((child) => walkNodes(child, fn));
}

/** 搜索时只要自己或子树命中就保留 */
function matchesNode(node, query) {
  const needle = typeof query === "string" ? query : normalizeQuery(query);
  if (!needle) return true;
  if (node.doc) {
    const haystack = (node.doc.title + " " + node.doc.hpath).toLowerCase();
    if (haystack.indexOf(needle) !== -1) return true;
  } else if (String(node.name || "").toLowerCase().indexOf(needle) !== -1) {
    return true;
  }
  return (node.children || []).some((child) => matchesNode(child, needle));
}

/** 文档所属的笔记本名，用于导出时的 categories */
function notebookNameOfDoc(trees, docId) {
  const target = String(docId == null ? "" : docId);
  for (const tree of trees || []) {
    let hit = false;
    walkDocs(tree, (doc) => {
      if (doc.id === target) hit = true;
    });
    if (hit) return tree.name || "";
  }
  return "";
}

module.exports = {
  hpathSegments,
  docTitleOf,
  normalizeQuery,
  buildDocTree,
  countTreeDocs,
  walkDocs,
  walkNodes,
  matchesNode,
  notebookNameOfDoc
};
