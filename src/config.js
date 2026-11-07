/*
 * siyuan-export-md — 全局常量：日志前缀与默认导出选项
 * 由单文件 index.js 按功能拆分而来，业务代码保持原样。
 */
"use strict";

const LOG_PREFIX = "[siyuan-export-md]";
const DEFAULT_OPTIONS = {
  site: "hugo",
  scope: "doc",
  copyAssets: true,
  mathFormat: "data-latex", // data-latex | raw
  tableFormat: "html", // html | gfm
  headingDemote: true,
  hugoLayout: "file", // file | bundle
  hugoContentDir: "notes",
  frontmatter: "script", // script | full
  hugoRawHtmlShortcode: false,
  debugComment: false
};

module.exports = {
  LOG_PREFIX,
  DEFAULT_OPTIONS,
};
