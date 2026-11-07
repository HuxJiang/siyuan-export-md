/*
 * siyuan-export-md — 整站导出：多文档打包、资源收集、导出报告
 * 由单文件 index.js 按功能拆分而来，业务代码保持原样。
 */
"use strict";

const { exportDocument } = require("./document");
const { AssetStore } = require("./assets");
const { buildZip } = require("./zip");

const HUGO_RAWHTML_SHORTCODE = `{{- /* 由「思源 Markdown 导出」插件生成：用于在 Hugo 中渲染 HTML 片段 */ -}}
{{- .Inner | safeHTML -}}
`;

const SITE_CONFIG_HINT = `## 站点侧配置

### Hugo

\`\`\`toml
[markup.goldmark.renderer]
unsafe = true          # 必须：否则正文里的 HTML（公式容器、表格、callout）会被丢弃
\`\`\`

公式：模板里引入 KaTeX 与 \`katex-render.js\`（按 \`data-latex\` 渲染 \`.math-block/.math-inline\`）。
若模板用 \`{{ if in .Content "math-block" }}\` 判断是否加载 KaTeX，还要把 \`math-inline\` 一起判断，
否则只有行内公式的文档不会加载 KaTeX。

### Hexo

\`\`\`yml
post_asset_folder: true
markdown:
  gfm: true
  breaks: false
\`\`\`
`;

async function exportSite(docIds, opts, notebookName, onProgress) {
  const assets = new AssetStore();
  const files = [];
  const warnings = [];
  let docCount = 0;

  for (let i = 0; i < docIds.length; i++) {
    const id = docIds[i];
    try {
      const result = await exportDocument(id, opts, assets, notebookName);
      files.push({ path: result.path, data: new TextEncoder().encode(result.content) });
      result.warnings.forEach((w) => warnings.push(`[${result.doc.title}] ${w}`));
      docCount += 1;
      if (onProgress) onProgress(i + 1, docIds.length, result.doc.title);
    } catch (e) {
      warnings.push(`文档导出失败：${id} ${(e && e.message) || e}`);
    }
  }

  const assetFiles = assets.getFiles();
  assetFiles.forEach((data, path) => files.push({ path, data }));
  assets.failures.forEach((f) => warnings.push(f));

  if (opts.site === "hugo" && opts.hugoRawHtmlShortcode) {
    files.push({
      path: "layouts/shortcodes/rawhtml.html",
      data: new TextEncoder().encode(HUGO_RAWHTML_SHORTCODE)
    });
  }

  const report = [
    "# 导出报告",
    "",
    `- 站点类型：${opts.site}`,
    `- 公式格式：${opts.mathFormat}`,
    `- 表格格式：${opts.tableFormat}`,
    `- 导出文档：${docCount} 篇`,
    `- 导出文件：${files.length} 个（含资源 ${assetFiles.size} 个）`,
    `- 时间：${new Date().toLocaleString()}`,
    "",
    "## 告警",
    "",
    warnings.length ? warnings.map((w) => `- ${w}`).join("\n") : "无",
    "",
    SITE_CONFIG_HINT,
    ""
  ].join("\n");

  files.push({ path: "SIYUAN-EXPORT-REPORT.md", data: new TextEncoder().encode(report) });

  return {
    zip: buildZip(files),
    fileCount: files.length,
    docCount,
    assetCount: assetFiles.size,
    warnings
  };
}

module.exports = {
  HUGO_RAWHTML_SHORTCODE,
  SITE_CONFIG_HINT,
  exportSite,
};
