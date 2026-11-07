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
  hugoLayout: "file", // file | bundle（bundle = 按文档树的 page bundle）
  hugoContentDir: "notes",
  frontmatter: "script", // script | full
  frontmatterSyntax: "", // "" 按布局取默认（文档树 bundle → toml，其余 yaml）| toml | yaml
  treePrefix: "", // 页面目录在「项目根目录」下的额外前缀，可空（不再附加 content / posts 层）
  treeMissingParent: "mirror", // 父页面未导出时：mirror 逐级建父目录 | flat 不建父目录
  outputMode: "zip", // zip（浏览器下载压缩包）| folder（直接写入下面这个目录）
  outputDir: "" // folder 模式的项目根目录，绝对路径；bundle 布局下填 Hugo 的 content 目录
};

module.exports = {
  LOG_PREFIX,
  DEFAULT_OPTIONS,
};
