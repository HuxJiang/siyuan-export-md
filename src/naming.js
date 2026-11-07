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

function docPaths(doc, opts) {
  if (opts.site === "hugo") {
    if (opts.hugoLayout === "bundle") {
      const dir = `content/posts/${doc.slug}`;
      return { mdPath: `${dir}/index.md`, assetDir: dir, assetPrefix: "./" };
    }
    const dir = String(opts.hugoContentDir || "notes").replace(/^\/+|\/+$/g, "") || "notes";
    return {
      mdPath: `content/${dir}/${doc.slug}.md`,
      assetDir: `static/siyuan/${doc.slug}`,
      assetPrefix: `/siyuan/${doc.slug}/`
    };
  }
  return {
    mdPath: `source/_posts/${doc.slug}.md`,
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
