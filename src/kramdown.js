/*
 * siyuan-export-md — kramdown 清洗：去掉 IAL、块引用与思源私有链接
 * 由单文件 index.js 按功能拆分而来，业务代码保持原样。
 */
"use strict";

const { stripZeroWidth, logWarn } = require("./utils");
const { getBlockKramdown } = require("./api");

/* ------------------------------------------------------------------ *
 * 2. kramdown 清洗
 * ------------------------------------------------------------------ */

const RE_BLOCK_REF_WITH_TEXT = /\(\(\s*\d{14}-[0-9a-z]{7}\s+"([^"]*)"\s*\)\)/g;
const RE_BLOCK_REF = /\(\(\s*\d{14}-[0-9a-z]{7}\s*\)\)/g;
const RE_IAL = /\{:[^{}]*\}/g;
const RE_SIYUAN_URL = /siyuan:\/\/[^\s)"']+/g;

function cleanKramdown(raw) {
  if (!raw) return "";
  let md = String(raw).replace(/\r\n?/g, "\n");
  md = stripZeroWidth(md);
  md = md.replace(RE_BLOCK_REF_WITH_TEXT, "$1");
  md = md.replace(RE_BLOCK_REF, "");
  md = md.replace(RE_IAL, "");
  md = md.replace(RE_SIYUAN_URL, "");
  md = md
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""))
    .join("\n");
  return md.trim();
}

async function blockMarkdown(id) {
  try {
    return cleanKramdown(await getBlockKramdown(id));
  } catch (e) {
    logWarn("获取 kramdown 失败", id, e);
    return "";
  }
}

module.exports = {
  RE_BLOCK_REF_WITH_TEXT,
  RE_BLOCK_REF,
  RE_IAL,
  RE_SIYUAN_URL,
  cleanKramdown,
  blockMarkdown,
};
