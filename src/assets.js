/*
 * siyuan-export-md — 资源仓库：解析路径 → 读取文件 → ASCII 命名 → 重写引用
 * 由单文件 index.js 按功能拆分而来，业务代码保持原样。
 */
"use strict";

const { sql, readWorkspaceFile } = require("./api");
const { stripZeroWidth, replaceAllLiteral, escapeSql } = require("./utils");
const { asciiFileName, docPaths } = require("./naming");

/* ------------------------------------------------------------------ *
 * 7. 资源仓库：解析 → 读取 → ASCII 命名 → 路径重写
 * ------------------------------------------------------------------ */

class AssetStore {
  constructor() {
    this.files = new Map(); // 压缩包内路径 → Uint8Array
    this.cache = new Map(); // 原始引用 → 新引用
    this.used = new Set(); // 已占用的「目录/文件名」
    this.rows = new Map(); // 附件 SQL 查询缓存
    this.failures = [];
  }

  getFiles() {
    return this.files;
  }

  async lookupAssetPath(name, box) {
    const key = `${box}/${name}`;
    if (this.rows.has(key)) return this.rows.get(key);
    // sql() 内部已把内核错误降级成 []，这里不需要再包一层 try/catch
    const rows = await sql(
      `SELECT path FROM assets WHERE name = '${escapeSql(name)}'` +
        (box ? ` AND box = '${escapeSql(box)}'` : "") +
        ` LIMIT 1`
    );
    const path = (rows[0] && rows[0].path) || "";
    this.rows.set(key, path);
    return path;
  }

  /**
   * 把正文里的资源引用解析成「工作空间内可读的绝对路径」，并顺便把文件读出来。
   *
   * 注意思源 3.8.x 的 assets 表存的是相对路径 assets/xxx.png，文件实际落在
   * 工作空间的 data/assets/ 下；旧版/其它后端才可能是 /data/<box>/assets/。
   * 所以所有候选都要真的读一次，读成功才算命中，不能直接相信表里的 path。
   */
  async resolveWorkspacePath(clean, name, ctx) {
    const box = ctx.doc.box || "";
    const candidates = [];
    const add = (candidate) => {
      if (candidate && !candidates.includes(candidate)) candidates.push(candidate);
    };

    const bySql = await this.lookupAssetPath(name, box);
    if (bySql) {
      if (/^\/data\//.test(bySql)) {
        add(bySql);
      } else {
        const rel = bySql.replace(/^\/+/, "");
        add(`/data/${rel}`);
        if (box) add(`/data/${box}/${rel}`);
      }
    }

    if (/^\/data\//.test(clean)) {
      add(clean);
    } else {
      const bare = clean.replace(/^\/+/, "");
      add(`/data/${bare}`);
      if (box) add(`/data/${box}/${bare}`);
      if (box && !bare.startsWith("assets/")) add(`/data/${box}/assets/${bare}`);
    }

    // 兜底：按文件名直接去 assets 目录找
    if (name) {
      add(`/data/assets/${name}`);
      if (box) add(`/data/${box}/assets/${name}`);
    }

    for (const candidate of candidates) {
      try {
        const buffer = await readWorkspaceFile(candidate);
        return { path: candidate, buffer };
      } catch (e) {
        /* 继续尝试下一个候选路径 */
      }
    }
    return null;
  }

  uniqueName(assetDir, baseName) {
    const key = `${assetDir}/${baseName}`;
    if (!this.used.has(key)) {
      this.used.add(key);
      return baseName;
    }
    const dot = baseName.lastIndexOf(".");
    const stem = dot > 0 ? baseName.slice(0, dot) : baseName;
    const ext = dot > 0 ? baseName.slice(dot) : "";
    let index = 2;
    let name = `${stem}-${index}${ext}`;
    while (this.used.has(`${assetDir}/${name}`)) {
      index += 1;
      name = `${stem}-${index}${ext}`;
    }
    this.used.add(`${assetDir}/${name}`);
    return name;
  }

  /** 注册一个资源引用，返回正文里应使用的路径。 */
  async register(src, ctx) {
    const raw = stripZeroWidth(String(src == null ? "" : src)).trim();
    if (!raw) return "";
    if (/^(data:|mailto:|tel:|javascript:|#)/i.test(raw)) return raw;
    if (raw.startsWith("siyuan://")) return raw;

    // 运行态路径（挂件/插件/内核接口）不参与资源拷贝
    if (/^\/?(widgets|plugins|api|appearance|stage)\//.test(raw)) return raw;

    let clean = raw.replace(/#.*$/, "").replace(/\?.*$/, "");
    const sameOrigin = /^(?:https?:)?\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\/(.*)$/i.exec(clean);
    if (sameOrigin) {
      clean = "/" + sameOrigin[1];
    } else if (/^(https?:)?\/\//i.test(clean)) {
      return raw; // 外链保留
    }

    // 同一张图在不同文档里要各自拷到本文件的资源目录，缓存必须按目录隔离，
    // 否则整本导出时后一篇会引用到前一篇目录里的文件（page bundle / Hexo 直接断链）。
    const paths = ctx.paths || docPaths(ctx.doc, ctx.opts);
    const cacheKey = `${paths.assetDir}\u0000${raw}`;
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);

    if (!ctx.opts.copyAssets) {
      this.cache.set(cacheKey, clean);
      return clean;
    }

    const baseName = (clean.split("/").pop() || "asset").split(/[?#]/)[0];
    const wsPath = await this.resolveWorkspacePath(clean, baseName, ctx);
    if (!wsPath) {
      this.failures.push(`资源未找到：${clean}`);
      this.cache.set(cacheKey, clean);
      return clean;
    }
    try {
      const name = this.uniqueName(paths.assetDir, asciiFileName(baseName));
      this.files.set(`${paths.assetDir}/${name}`, new Uint8Array(wsPath.buffer));
      const newRef = paths.assetPrefix + encodeURI(name);      this.cache.set(cacheKey, newRef);
      return newRef;
    } catch (e) {
      this.failures.push(`资源读取失败：${wsPath.path}`);
      this.cache.set(cacheKey, clean);
      return clean;
    }
  }
}

/**
 * 重写正文里的资源引用。
 *
 * 纯 HTML 正文只有属性形态的引用（src / href / poster / data-src），代码块里的
 * 示例代码已经被 escape 成 &quot; 文本，不会再命中这个正则，所以不需要再按围栏
 * 代码切片跳过。
 */
const ATTR_REF_RE = /\b(src|href|poster|data-src)="([^"]*)"/g;

async function rewriteAssetRefs(body, ctx) {
  let out = String(body || "");
  const matches = [];
  let m;
  ATTR_REF_RE.lastIndex = 0;
  while ((m = ATTR_REF_RE.exec(out)) !== null) {
    matches.push({ full: m[0], attr: m[1], src: m[2] });
  }
  for (const item of matches) {
    if (!item.src) continue;
    let next = item.src;
    try {
      next = await ctx.assets.register(item.src, ctx);
    } catch (e) {
      ctx.warnings.push(`资源处理失败：${item.src}`);
    }
    if (next !== item.src) out = replaceAllLiteral(out, item.full, `${item.attr}="${next}"`);
  }
  return out;
}

module.exports = {
  AssetStore,
  rewriteAssetRefs,
};
