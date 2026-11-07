/*
 * siyuan-export-md — 思源内核 API：fetch 封装、SQL、子块/文档/DOM/kramdown 读取
 * 由单文件 index.js 按功能拆分而来，业务代码保持原样。
 */
"use strict";

const { logWarn, escapeSql } = require("./utils");

/* ------------------------------------------------------------------ *
 * 1. 内核 API
 * ------------------------------------------------------------------ */

function authHeaders(json) {
  const headers = {};
  try {
    const token = window && window.siyuan && window.siyuan.config && window.siyuan.config.api
      ? window.siyuan.config.api.token
      : "";
    if (token) headers.Authorization = "Token " + token;
  } catch (e) {
    /* 非思源环境（自测）忽略 */
  }
  if (json) headers["Content-Type"] = "application/json";
  return headers;
}

async function api(url, data = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: authHeaders(true),
    body: JSON.stringify(data),
    credentials: "include"
  });
  if (!res.ok) throw new Error(`[${url}] HTTP ${res.status}`);
  const body = await res.json();
  if (body.code !== 0) throw new Error(`[${url}] ${body.msg || "kernel api error"}`);
  return body.data;
}

async function apiBinary(url, data = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: authHeaders(true),
    body: JSON.stringify(data),
    credentials: "include"
  });
  if (!res.ok) throw new Error(`[${url}] HTTP ${res.status}`);
  const type = res.headers.get("Content-Type") || "";
  if (type.includes("application/json")) {
    const body = await res.json();
    throw new Error(`[${url}] ${body.msg || "kernel api error"}`);
  }
  return await res.arrayBuffer();
}

async function sql(stmt) {
  try {
    const data = await api("/api/query/sql", { stmt });
    return Array.isArray(data) ? data : [];
  } catch (e) {
    logWarn("sql 失败", stmt, e);
    return [];
  }
}

async function getDocRow(docId) {
  const rows = await sql(`SELECT * FROM blocks WHERE id = '${escapeSql(docId)}' LIMIT 1`);
  return rows[0] || null;
}

const TYPE_ALIAS = {
  nodeparagraph: "p",
  nodeheading: "h",
  nodeheading1: "h",
  nodeheading2: "h",
  nodeheading3: "h",
  nodeheading4: "h",
  nodeheading5: "h",
  nodeheading6: "h",
  nodeheading7: "h",
  nodeheading8: "h",
  nodeheading9: "h",
  nodeheading10: "h",
  nodelist: "l",
  nodelistitem: "i",
  nodeblockquote: "b",
  nodecodeblock: "c",
  nodemathblock: "m",
  nodetable: "t",
  nodesuperblock: "s",
  nodecallout: "callout",
  nodeimage: "img",
  nodehtmlblock: "html",
  nodewidget: "widget",
  nodeiframe: "iframe",
  nodevideo: "video",
  nodeaudio: "audio",
  nodeattributeview: "av",
  nodetoc: "toc",
  nodequeryembed: "query_embed",
  nodediagram: "diagram",
  nodespan: "span",
  nodeembedblock: "embed",
  nodebookmark: "bookmark"
};

/** 内核 API 有时返回 "NodeParagraph"，SQL 返回 "p"，这里统一成单字母类型。 */
function normalizeType(type) {
  const raw = String(type || "").trim();
  if (!raw) return "";
  const lower = raw.toLowerCase();
  return TYPE_ALIAS[lower] || lower;
}

async function getChildBlocks(parentId) {
  try {
    const data = await api("/api/block/getChildBlocks", { id: parentId });
    const list = Array.isArray(data) ? data : data && Array.isArray(data.blocks) ? data.blocks : [];
    if (list.length) {
      return list
        .filter((it) => it && it.id)
        .map((it) => ({
          id: it.id,
          type: normalizeType(it.type || it.dataType || ""),
          subType: String(it.subType || it.subtype || "")
        }));
    }
  } catch (e) {
    logWarn("getChildBlocks 不可用，改用 SQL 兜底", e);
  }
  const rows = await sql(
    `SELECT id, type, subtype FROM blocks WHERE parent_id = '${escapeSql(parentId)}' ORDER BY sort ASC, id ASC`
  );
  return rows.map((r) => ({ id: r.id, type: normalizeType(r.type), subType: String(r.subtype || "") }));
}

async function getBlockDom(id) {
  const data = await api("/api/block/getBlockDOM", { id });
  if (typeof data === "string") return data;
  return (data && (data.dom || data.html)) || "";
}

async function getBlockKramdown(id) {
  const data = await api("/api/block/getBlockKramdown", { id });
  if (typeof data === "string") return data;
  return (data && data.kramdown) || "";
}

async function readWorkspaceFile(path) {
  return await apiBinary("/api/file/getFile", { path });
}

async function listNotebooks() {
  try {
    const data = await api("/api/notebook/lsNotebooks");
    const list = (data && data.notebooks) || [];
    return list.map((nb) => ({ id: nb.id, name: nb.name, closed: !!nb.closed }));
  } catch (e) {
    return [];
  }
}

async function listDocsOfNotebook(box) {
  const rows = await sql(
    `SELECT id, content, hpath, path, box, created, updated, tag FROM blocks` +
      ` WHERE type = 'd' AND box = '${escapeSql(box)}' ORDER BY created ASC, id ASC`
  );
  return rows;
}

module.exports = {
  authHeaders,
  api,
  apiBinary,
  sql,
  getDocRow,
  TYPE_ALIAS,
  normalizeType,
  getChildBlocks,
  getBlockDom,
  getBlockKramdown,
  readWorkspaceFile,
  listNotebooks,
  listDocsOfNotebook,
};
