/*
 * siyuan-export-md — 路径规划：把整个笔记本的文档按 hpath 排成一棵目录树，
 * 给每篇文档算出「页面目录」（相对项目根目录，不再附加 content / posts 层）。
 *
 * 规则：
 *   1. 页面目录名默认用页面标题（去掉路径非法字符）；
 *   2. 面板里手工改过相对目录（getOverride）→ 以它为准，子页面也挂在它下面；
 *   3. 父页面已经导出过（记录里有 pageDir）→ 本页面挂到父页面目录下；
 *   4. 父页面没导出 → 按父页面标题逐级建目录；treeMissingParent = "flat" 时
 *      不建父级目录，所有页面直接放在顶层；
 *   5. 有子页面的页面额外有一个「正文目录」= 页面目录/同名文件夹，
 *      正文 index.md 放这里，_index.md 留在页面目录（栏目页）。
 */
"use strict";

const { hpathSegments, docTitleOf } = require("./doc-tree");

const ILLEGAL_RE = /[\\/:*?"<>|#%\u0000-\u001f]+/g;

/** 目录名清洗：保留中文与空格，去掉路径分隔符、控制字符和结尾的点 */
function sanitizeSegment(value, fallback) {
  let text = String(value == null ? "" : value)
    .replace(ILLEGAL_RE, "-")
    .replace(/[. ]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text || text === "." || text === "..") {
    text = String(fallback == null ? "" : fallback).replace(ILLEGAL_RE, "-").trim();
  }
  if (!text || text === "." || text === "..") text = "untitled";
  return text;
}

function normalizeHpath(hpath) {
  const segments = hpathSegments(hpath);
  return segments.length ? "/" + segments.join("/") : "";
}

function parentHpathOf(hpath) {
  const segments = hpathSegments(hpath);
  if (segments.length <= 1) return "";
  return "/" + segments.slice(0, -1).join("/");
}

function depthOf(hpath) {
  return hpathSegments(hpath).length;
}

function joinPath(...parts) {
  return parts
    .filter((part) => part !== undefined && part !== null && part !== "")
    .map((part) => String(part).replace(/^[\\/]+|[\\/]+$/g, ""))
    .filter(Boolean)
    .join("/");
}

/** 用户填的相对目录：反斜杠转正斜杠、去掉空段与 . / ..，逐段清洗 */
function normalizeOverride(value) {
  return String(value == null ? "" : value)
    .replace(/\\+/g, "/")
    .split("/")
    .filter((seg) => seg && seg !== "." && seg !== "..")
    .map((seg) => sanitizeSegment(seg))
    .join("/");
}

function prefixPath(opts) {
  const segments = String((opts && opts.treePrefix) || "")
    .split(/[\\/]+/)
    .filter(Boolean)
    .map((seg) => sanitizeSegment(seg));
  return segments.join("/");
}

/**
 * rows: 某个笔记本下的全部文档行（至少含 id / content / hpath）
 * getRecord: docId → 导出记录（可为 null）
 * getOverride: docId → 用户手工改过的相对目录（可为 null）
 * 返回 Map<docId, { id, title, seg, dir, bodyDir, hasChildren, hpath }>
 *
 * 目录直接相对「项目根目录」，不再附加 content / posts 层。
 */
function buildPathPlan(rows, getRecord, opts, getOverride) {
  const options = opts || {};
  const rootDir = options.treeRoot || "";
  const prefix = prefixPath(options);
  const baseDir = joinPath(rootDir, prefix);
  const plans = new Map();
  const usedDirs = new Set();
  const list = (rows || []).filter((row) => row && row.id);

  const byHpath = new Map();
  list.forEach((row) => {
    const key = normalizeHpath(row.hpath);
    if (key && !byHpath.has(key)) byHpath.set(key, row);
  });

  /* 每个路径下有几个直接子文档，用来判断是否需要 _index.md */
  const childCount = new Map();
  list.forEach((row) => {
    const parent = parentHpathOf(row.hpath);
    if (!parent) return;
    childCount.set(parent, (childCount.get(parent) || 0) + 1);
  });

  const sorted = list.slice().sort((a, b) => {
    const byDepth = depthOf(a.hpath) - depthOf(b.hpath);
    if (byDepth) return byDepth;
    return String(a.hpath).localeCompare(String(b.hpath), "zh-Hans-CN");
  });

  sorted.forEach((row) => {
    const segments = hpathSegments(row.hpath);
    if (!segments.length) return;
    const ownHpath = normalizeHpath(row.hpath);
    const parentHpath = parentHpathOf(row.hpath);
    const parentRow = parentHpath ? byHpath.get(parentHpath) : null;
    const parentPlan = parentRow ? plans.get(String(parentRow.id)) : null;
    const parentRecord = parentRow && typeof getRecord === "function" ? getRecord(parentRow.id) : null;

    let parentDir = parentPlan ? parentPlan.dir : baseDir;
    /* 父页面导出过并且记录了组别目录：直接挂到它下面（页面被手工挪过也能接上） */
    if (parentRecord && parentRecord.pageDir) {
      parentDir = String(parentRecord.pageDir).replace(/[\\/]+/g, "/").replace(/^[\\/]+|[\\/]+$/g, "");
    }
    if (options.treeMissingParent === "flat" && !(parentRecord && parentRecord.pageDir)) {
      /* 父页面没导出过：用户选择不建父级目录，直接落在 content（或前缀）下 */
      parentDir = baseDir;
    }

    const title = docTitleOf(row);
    const rawSeg = segments[segments.length - 1] || title;
    const seg = sanitizeSegment(title || rawSeg, rawSeg);

    /* 面板里手工改过相对目录：以用户填的为准，子页面继续挂在这下面 */
    const override =
      typeof getOverride === "function" ? getOverride(row.id) : "";
    const overrideDir = override ? normalizeOverride(override) : "";
    let dir = overrideDir || joinPath(parentDir, seg);
    let index = 2;
    while (usedDirs.has(dir)) {
      dir = joinPath(parentDir, `${seg}-${index}`);
      index += 1;
    }
    usedDirs.add(dir);

    const hasChildren = (childCount.get(ownHpath) || 0) > 0;
    /* 正文目录和子页面目录同级，先占位，避免同名子页面把正文 index.md 撞掉 */
    let bodySeg = seg;
    let bodyDir = joinPath(dir, bodySeg);    let bodyIndex = 2;
    while (usedDirs.has(bodyDir)) {
      bodySeg = `${seg}-${bodyIndex}`;
      bodyDir = joinPath(dir, bodySeg);
      bodyIndex += 1;
    }
    if (hasChildren) usedDirs.add(bodyDir);

    plans.set(String(row.id), {
      id: String(row.id),
      title,
      seg,
      dir,
      bodySeg,
      bodyDir,
      hasChildren,
      hpath: ownHpath
    });
  });

  return plans;
}

module.exports = {
  sanitizeSegment,
  normalizeOverride,
  normalizeHpath,
  parentHpathOf,
  depthOf,
  joinPath,
  prefixPath,
  buildPathPlan
};
