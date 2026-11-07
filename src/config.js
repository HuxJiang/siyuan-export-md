/*
 * siyuan-export-md — 全局常量：日志前缀与默认导出选项
 *
 * 正文一律输出 HTML，因此不再有「公式格式」「表格格式」这类 Markdown 开关；
 * 也不再有 rawhtml 短代码开关（整篇正文就是 HTML，站点只需允许内联 HTML）。
 */
"use strict";

const LOG_PREFIX = "[siyuan-export-md]";

const DEFAULT_OPTIONS = {
  site: "hugo",
  scope: "doc",
  copyAssets: true,
  headingDemote: true,
  headingStyle: "markdown", // markdown（## 标题）| html（<h2>标题</h2>）
  superblockWidth: true, // 保留思源里拖拽出来的超级块栏宽（关掉则等宽均分）
  hugoLayout: "file", // file | bundle
  hugoContentDir: "notes",
  frontmatter: "script", // script | full
  outputMode: "zip", // zip（浏览器下载压缩包）| folder（直接写入下面这个目录）
  outputDir: "" // folder 模式的目标目录，绝对路径；空则用 ~/siyuan-export
};

module.exports = {
  LOG_PREFIX,
  DEFAULT_OPTIONS,
};
