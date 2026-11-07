/*
 * siyuan-export-md — 整站导出：多文档打包、资源收集、导出报告
 *
 * 报告也输出 HTML（SIYUAN-EXPORT-REPORT.html），和正文契约保持一致：
 * 包里不再有任何 Markdown 片段。
 */
"use strict";

const { exportDocument } = require("./document");
const { AssetStore } = require("./assets");
const { buildZip } = require("./zip");
const { escapeHtml } = require("./utils");

const REPORT_STYLE = [
  "body{font:14px/1.7 -apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;",
  "max-width:920px;margin:0 auto;padding:32px 20px;color:#222;background:#fff}",
  "h1{font-size:22px;margin:0 0 16px}h2{font-size:16px;margin:28px 0 10px;border-bottom:1px solid #eee;padding-bottom:6px}",
  "ul{margin:0;padding-left:20px}li{margin:4px 0}code{background:#f6f6f6;padding:1px 4px;border-radius:3px}",
  ".meta{color:#666}.warn{color:#b26b00}"
].join("");

const SITE_CONFIG_HINT = [
  "<h2>站点侧配置</h2>",
  "<h3>Hugo</h3>",
  "<p>正文是 HTML（Markdown 标题模式下标题行是 <code>##</code>），必须允许内联 HTML，否则 goldmark 会把公式容器、表格、callout 丢掉：</p>",
  "<pre><code>[markup.goldmark.renderer]\nunsafe = true</code></pre>",
  "<p>公式由站点侧脚本按 <code>data-latex</code> 渲染 <code>.math-block</code> / <code>.math-inline</code>；",
  "如果模板用 <code>{{ if in .Content \"math-block\" }}</code> 判断是否加载 KaTeX，要同时判断 <code>math-inline</code>。</p>",
  "<h3>Hexo</h3>",
  "<p>默认的 marked 渲染器会把裸 HTML 原样透传；只需保证不在站点层再做一次 markdown 渲染：</p>",
  "<pre><code>markdown:\n  gfm: true\n  breaks: false</code></pre>"
].join("\n");

function listItems(items, className) {
  if (!items.length) return "<p>无</p>";
  return `<ul${className ? ` class="${className}"` : ""}>\n${items
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("\n")}\n</ul>`;
}

function buildReport({ opts, docCount, fileCount, assetCount, warnings }) {
  return [
    "<!doctype html>",
    '<html lang="zh-CN">',
    "<head>",
    '<meta charset="utf-8">',
    "<title>思源导出报告</title>",
    `<style>${REPORT_STYLE}</style>`,
    "</head>",
    "<body>",
    "<h1>思源导出报告</h1>",
    '<ul class="meta">',
    `<li>站点类型：${escapeHtml(opts.site)}</li>`,
    `<li>正文格式：${
      opts.headingStyle === "html" ? "纯 HTML（无 Markdown 语法）" : "Markdown 标题（##）+ HTML 正文"
    }</li>`,
    `<li>导出文档：${docCount} 篇</li>`,
    `<li>导出文件：${fileCount} 个（含资源 ${assetCount} 个）</li>`,
    `<li>导出时间：${escapeHtml(new Date().toLocaleString())}</li>`,
    "</ul>",
    "<h2>告警</h2>",
    listItems(warnings, "warn"),
    SITE_CONFIG_HINT,
    "</body>",
    "</html>",
    ""
  ].join("\n");
}

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

  const report = buildReport({
    opts,
    docCount,
    fileCount: files.length + 1,
    assetCount: assetFiles.size,
    warnings
  });
  files.push({ path: "SIYUAN-EXPORT-REPORT.html", data: new TextEncoder().encode(report) });

  // zip 改成惰性构建：直接写入文件夹时完全不需要打 zip，省一次整包内存拷贝
  let zipBytes = null;
  const result = {
    fileCount: files.length,
    docCount,
    assetCount: assetFiles.size,
    warnings,
    files
  };
  Object.defineProperty(result, "zip", {
    enumerable: true,
    get() {
      if (!zipBytes) zipBytes = buildZip(files);
      return zipBytes;
    }
  });
  return result;
}

module.exports = {
  REPORT_STYLE,
  SITE_CONFIG_HINT,
  buildReport,
  exportSite,
};
