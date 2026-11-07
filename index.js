/*
 * siyuan-export-md — 运行时模块加载器（根 index.js）
 *
 * 思源只会把 plugins/<name>/index.js 的内容交给 window.eval 执行，注入的 require
 * 只认识 "siyuan"，所以 src/ 里的模块无法用原生 require 加载。这个文件做两件事：
 *   1. 通过同步 XHR 从 /plugins/<name>/ 把每个模块的源码取回来（内核把插件目录当静态目录提供）；
 *   2. 用一个极小的 CJS 注册表按 require 图逐个求值，支持 "./x"、"../x" 这类相对路径。
 *
 * 因此：改完 src/ 里的代码不用构建，刷新插件即生效；src/ 必须跟 index.js 一起发布。
 * 业务逻辑全部在 src/ 中，本文件不含任何导出逻辑。
 */
"use strict";

(function () {
  var DEFAULT_NAME = "siyuan-export-md";
  var ENTRY = "src/index.js";
  var hostRequire = require;
  var cache = Object.create(null);

  /** 思源用 //# sourceURL=plugin:<name> 执行插件，可据此反查自己的目录名 */
  function detectNames() {
    var names = [];
    try {
      var stack = String(new Error().stack || "");
      var hit = stack.match(/plugin:([A-Za-z0-9._%~-]+)/);
      if (hit) {
        var decoded = hit[1];
        try {
          decoded = decodeURIComponent(decoded);
        } catch (e) {
          /* 保持原样 */
        }
        names.push(decoded);
      }
    } catch (e) {
      /* 拿不到栈就退回默认名 */
    }
    if (names.indexOf(DEFAULT_NAME) === -1) names.push(DEFAULT_NAME);
    return names;
  }

  /* ---------------------------- 取源码 ---------------------------- */

  function readViaXHR(url) {
    if (typeof XMLHttpRequest !== "function") throw new Error("XMLHttpRequest 不可用");
    var xhr = new XMLHttpRequest();
    xhr.open("GET", url, false);
    xhr.send(null);
    var status = xhr.status;
    if (status && status !== 200) throw new Error("HTTP " + status + " " + url);
    if (typeof xhr.responseText !== "string" || !xhr.responseText) throw new Error("空响应 " + url);
    return xhr.responseText;
  }

  /** 兜底：Electron 渲染进程里直接用 fs 读盘（XHR 被拦时还能工作） */
  function readViaDisk(name, relPath) {
    var win = typeof window !== "undefined" ? window : null;
    var req = win && win.require;
    if (typeof req !== "function") throw new Error("没有可用的文件读取通道");
    var fs = req("fs");
    var pathMod = req("path");
    var ws =
      win.siyuan && win.siyuan.config && win.siyuan.config.system
        ? win.siyuan.config.system.workspaceDir
        : "";
    if (!ws) throw new Error("取不到 workspaceDir");
    var file = pathMod.join(ws, "data", "plugins", name, relPath);
    return fs.readFileSync(file, "utf8");
  }

  function readText(base, name, relPath) {
    var err;
    try {
      return readViaXHR(base + relPath);
    } catch (e) {
      err = e;
    }
    try {
      return readViaDisk(name, relPath);
    } catch (e) {
      err = new Error((err ? err.message + "；" : "") + "读不到 " + base + relPath + "（" + e.message + "）");
    }
    throw err;
  }

  /* --------------------------- 路径解析 --------------------------- */

  function normalizePath(dir, spec) {
    var segs = (dir ? dir + "/" : "") + spec;
    var parts = [];
    segs.split("/").forEach(function (s) {
      if (s === "..") parts.pop();
      else if (s !== "." && s !== "") parts.push(s);
    });
    return parts.join("/");
  }

  function resolveRelative(fromPath, spec) {
    var dir = fromPath.lastIndexOf("/") >= 0 ? fromPath.slice(0, fromPath.lastIndexOf("/")) : "";
    var p = normalizePath(dir, spec);
    if (!/\.js$/.test(p)) p += ".js";
    return p;
  }

  /* --------------------------- 模块求值 --------------------------- */

  function makeRequire(base, name, fromPath) {
    return function requireLocal(spec) {
      if (!spec || spec.charAt(0) !== ".") return hostRequire(spec);
      return loadModule(base, name, resolveRelative(fromPath, spec));
    };
  }

  function loadModule(base, name, relPath) {
    var key = base + "|" + relPath;
    if (cache[key]) return cache[key].exports;
    var mod = { exports: {} };
    cache[key] = mod; // 先登记再求值，允许模块间存在偶发环
    var code = readText(base, name, relPath);
    var factory = (0, eval)("(function (require, module, exports) {\n" + code + "\n})");
    factory(makeRequire(base, name, relPath), mod, mod.exports);
    return mod.exports;
  }

  /* ----------------------------- 启动 ----------------------------- */

  var names = detectNames();
  var lastError = null;
  for (var i = 0; i < names.length; i++) {
    var name = names[i];
    var base = "/plugins/" + name + "/";
    try {
      var entry = loadModule(base, name, ENTRY);
      module.exports = entry;
      return;
    } catch (e) {
      lastError = e;
    }
  }
  throw new Error(
    "[siyuan-export-md] 模块加载失败：" +
      (lastError ? lastError.message : "未知错误") +
      "（已尝试：" +
      names.join("、") +
      "；请确认 src/ 目录与 index.js 一起发布）"
  );
})();
