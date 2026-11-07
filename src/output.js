/*
 * siyuan-export-md — 输出目标：下载 zip（浏览器方式）或直接写入本地文件夹
 *
 * 思源桌面版是 Electron，插件可以直接 window.require("fs") 落盘；
 * 移动端 / 纯网页端没有这个通道，此时只能走 zip 下载。
 */
"use strict";

/** 取 Electron 注入的 Node 模块；拿不到就说明当前环境不能直接写盘 */
function nodeModules() {
  const win = typeof window !== "undefined" ? window : null;
  const req = win && win.require;
  if (typeof req !== "function") return null;
  try {
    const fs = req("fs");
    const path = req("path");
    const os = req("os");
    if (fs && path) return { fs, path, os };
  } catch (e) {
    return null;
  }
  return null;
}

function isDesktopWritable() {
  return !!nodeModules();
}

/** 展开开头的 ~ / ~\，其余原样返回 */
function expandHome(dir) {
  const text = String(dir == null ? "" : dir).trim();
  if (!text) return "";
  if (text !== "~" && text.indexOf("~/") !== 0 && text.indexOf("~\\") !== 0) return text;
  const mods = nodeModules();
  let home = "";
  try {
    home = mods && mods.os ? mods.os.homedir() : "";
  } catch (e) {
    home = "";
  }
  if (!home) return text;
  return text === "~" ? home : mods.path.join(home, text.slice(2));
}

function defaultOutputDir() {
  const mods = nodeModules();
  try {
    const home = mods && mods.os ? mods.os.homedir() : "";
    if (home) return mods.path.join(home, "siyuan-export");
  } catch (e) {
    /* 取不到家目录就让用户自己填 */
  }
  return "";
}

/**
 * 弹出系统文件夹选择框。
 * Electron 新版把 dialog 放在 @electron/remote，老版本挂在 electron.remote，
 * 两个都试一遍，都不可用就返回空串由用户手填路径。
 */
async function pickDirectory(current) {
  const win = typeof window !== "undefined" ? window : null;
  const req = win && win.require;
  if (typeof req !== "function") return "";
  const dialog = (() => {
    for (const name of ["@electron/remote", "electron"]) {
      try {
        const mod = req(name);
        const dlg = (mod && mod.dialog) || (mod && mod.remote && mod.remote.dialog);
        if (dlg && typeof dlg.showOpenDialog === "function") return dlg;
      } catch (e) {
        /* 换下一个入口 */
      }
    }
    return null;
  })();
  if (!dialog) return "";
  const result = await dialog.showOpenDialog({
    title: "选择导出目录",
    defaultPath: expandHome(current) || undefined,
    properties: ["openDirectory", "createDirectory", "promptToCreate"]
  });
  if (!result || result.canceled) return "";
  const picked = (result.filePaths && result.filePaths[0]) || "";
  return picked;
}

/**
 * 把导出结果按相对路径写进 rootDir。
 * files 里每项是 { path: "content/notes/x.md", data: Uint8Array }。
 * 返回 { dir, written, skipped }；skipped 是越出目标目录的路径（理论上不会出现）。
 */
function writeFilesToFolder(rootDir, files, onProgress) {
  const mods = nodeModules();
  if (!mods) {
    throw new Error("当前环境无法直接写入文件夹：需要思源桌面版，或改用「下载压缩包」");
  }
  const raw = String(rootDir == null ? "" : rootDir).trim();
  if (!raw) throw new Error("请先填写导出目录（绝对路径）");
  const expanded = expandHome(raw);
  if (!mods.path.isAbsolute(expanded)) {
    throw new Error("导出目录必须是绝对路径：" + raw);
  }
  const root = mods.path.resolve(expanded);

  let stats = null;
  try {
    stats = mods.fs.statSync(root);
  } catch (e) {
    stats = null;
  }
  if (stats && !stats.isDirectory()) throw new Error("目标路径已存在且不是文件夹：" + root);
  mods.fs.mkdirSync(root, { recursive: true });

  const rootPrefix = root.endsWith(mods.path.sep) ? root : root + mods.path.sep;
  let written = 0;
  const skipped = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const rel = String((file && file.path) || "").split("/").filter(Boolean);
    const full = mods.path.resolve.apply(mods.path, [root].concat(rel));
    if (full !== root && full.indexOf(rootPrefix) !== 0) {
      skipped.push(String(file.path));
      continue;
    }
    mods.fs.mkdirSync(mods.path.dirname(full), { recursive: true });
    mods.fs.writeFileSync(full, file.data);
    written += 1;
    if (onProgress) onProgress(written, files.length, String(file.path));
  }

  return { dir: root, written, skipped };
}

/**
 * 把 "content/notes/x.md" 这样的相对路径拼到目标目录上，得到用于记录的绝对路径。
 * 没有 Electron 时（纯网页端）退回 "/" 拼接，只用于展示。
 */
function joinRelative(dir, rel) {
  const base = String(dir == null ? "" : dir).trim();
  const segments = String(rel == null ? "" : rel).split("/").filter(Boolean);
  const mods = nodeModules();
  if (mods) return mods.path.join.apply(mods.path, [base].concat(segments));
  const head = base.replace(/[\\/]+$/, "");
  return segments.length ? head + "/" + segments.join("/") : head;
}

module.exports = {
  nodeModules,
  isDesktopWritable,
  expandHome,
  defaultOutputDir,
  pickDirectory,
  writeFilesToFolder,
  joinRelative,
};
