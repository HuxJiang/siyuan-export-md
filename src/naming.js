/*
 * siyuan-export-md — 路径与命名：slug、ASCII 资源名、站点文件路径
 * 由单文件 index.js 按功能拆分而来，业务代码保持原样。
 */
"use strict";

/* ------------------------------------------------------------------ *
 * 6. 路径与命名
 * ------------------------------------------------------------------ */

function slugify(title) {
  const cleaned = String(title || "untitled")
    .trim()
    .replace(/[\\/:*?"<>|#%&{}$!'@+`=]+/g, "-")
    .replace(/[ \t]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || "untitled";
}

function hash6(text) {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) & 0xffffffff;
  }
  return (hash >>> 0).toString(36).slice(0, 6);
}

/** 附件名 ASCII 化：Hugo/Hexo 的图片 URL 不该出现中文与空格。 */
function asciiFileName(filename) {
  const name = String(filename || "asset");
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot).toLowerCase() : "";
  let safe = stem
    .replace(/[^\x00-\x7F]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!safe) safe = `asset-${hash6(stem)}`;
  return `${safe}${ext}`;
}

/**
 * 站点文件路径。
 * plan 是 path-plan 算出的页面目录：Hugo 的 page bundle 布局下按文档树生成
 *   - 无子页面：<页面目录>/index.md（叶子 bundle）
 *   - 有子页面：<页面目录>/_index.md 做栏目页，正文在同名子目录的 index.md
 * 没有 plan 时（直接调用 / 旧数据）退回原来的固定布局。
 */
function docPaths(doc, opts, plan) {
  if (opts.site === "hugo" && opts.hugoLayout === "bundle" && plan && plan.dir) {
    const pageDir = plan.dir;
    if (plan.hasChildren) {
      const bodyDir = plan.bodyDir || `${pageDir}/${plan.seg}`;
      return {
        pageDir,
        mdPath: `${pageDir}/_index.md`,
        bodyPath: `${bodyDir}/index.md`,
        assetDir: bodyDir,
        assetPrefix: "./"
      };
    }
    return {
      pageDir,
      mdPath: `${pageDir}/index.md`,
      bodyPath: `${pageDir}/index.md`,
      assetDir: pageDir,
      assetPrefix: "./"
    };
  }
  if (opts.site === "hugo") {
    if (opts.hugoLayout === "bundle") {
      /* 没有规划时的兜底：直接用页面标题做目录，不再套 content/posts */
      const name = String(doc.title || doc.slug || "untitled").replace(/[\\/:*?"<>|]+/g, "-").trim() || "untitled";
      const dir = name;
      return { pageDir: dir, mdPath: `${dir}/index.md`, bodyPath: `${dir}/index.md`, assetDir: dir, assetPrefix: "./" };
    }
    const dir = String(opts.hugoContentDir || "notes").replace(/^\/+|\/+$/g, "") || "notes";
    return {
      pageDir: `content/${dir}/${doc.slug}`,
      mdPath: `content/${dir}/${doc.slug}.md`,
      bodyPath: `content/${dir}/${doc.slug}.md`,
      assetDir: `static/siyuan/${doc.slug}`,
      assetPrefix: `/siyuan/${doc.slug}/`
    };
  }
  return {
    pageDir: `source/_posts/${doc.slug}`,
    mdPath: `source/_posts/${doc.slug}.md`,
    bodyPath: `source/_posts/${doc.slug}.md`,
    assetDir: `source/_posts/${doc.slug}`,
    assetPrefix: `${doc.slug}/`
  };
}

module.exports = {
  slugify,
  hash6,
  asciiFileName,
  docPaths,
};
