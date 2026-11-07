/*
 * siyuan-export-md — 导出记录：按文档 id 记住「导出过没有 / 导出到了哪里」
 *
 * 记录存在插件数据里（plugin.saveData("exportRecords")），不依赖导出目录是否还在；
 * 控制页只读这份记录，所以插件重启、换机器后仍能看到上次导出的路径。
 */
"use strict";

const { LOG_PREFIX } = require("./config");

const STORE_KEY = "exportRecords";
const RECORDS_EVENT = "siyuan-export-md:records-changed";
/** 配置变更事件：对话框和控制页共用一份 plugin.opts，谁改了都要通知另一个 */
const CONFIG_EVENT = "siyuan-export-md:options-changed";
const VERSION = 1;

function text(value) {
  return String(value == null ? "" : value);
}

function emptyStore() {
  return { version: VERSION, docs: {} };
}

function normalizeRecord(raw) {
  if (!raw || typeof raw !== "object") return null;
  const docId = text(raw.docId).trim();
  if (!docId) return null;
  return {
    docId,
    title: text(raw.title),
    hpath: text(raw.hpath),
    box: text(raw.box),
    notebook: text(raw.notebook),
    site: raw.site === "hexo" ? "hexo" : "hugo",
    mode: raw.mode === "folder" ? "folder" : "zip",
    relPath: text(raw.relPath),
    targetDir: text(raw.targetDir),
    fullPath: text(raw.fullPath),
    zipName: text(raw.zipName),
    exportedAt: Number(raw.exportedAt) || 0
  };
}

/** 旧数据 / 手工改坏的数据都不能让控制页崩掉，读进来先洗一遍 */
function normalizeStore(raw) {
  if (!raw || typeof raw !== "object") return emptyStore();
  const source = raw.docs && typeof raw.docs === "object" ? raw.docs : {};
  const docs = {};
  Object.keys(source).forEach((key) => {
    const record = normalizeRecord(source[key]);
    if (record) docs[record.docId] = record;
  });
  return { version: VERSION, docs };
}

/**
 * 相对路径：优先用导出时记下的 relPath；老记录只有绝对路径时，
 * 从 targetDir 前缀里剥出相对部分（剥不掉才退回原值）。
 */
function relativePathOf(record) {
  if (!record) return "";
  if (record.relPath) return record.relPath;
  const full = record.fullPath || "";
  const base = (record.targetDir || "").replace(/[\\/]+$/, "");
  if (full && base && full.indexOf(base) === 0) {
    return full.slice(base.length).replace(/^[\\/]+/, "").split(/[\\/]+/).join("/");
  }
  return full;
}

/**
 * 控制页展示用的路径：统一显示相对路径（相对导出目录 / 压缩包根）。
 * 绝对路径放在 detailOf 的悬停提示里，只用于「打开目录」。
 */
function pathOf(record) {
  if (!record) return "";
  return relativePathOf(record);
}

/** 悬停提示：补上绝对路径 / 压缩包名与导出时间 */
function detailOf(record) {
  if (!record) return "";
  const parts = [];
  if (record.mode === "folder" && record.fullPath) parts.push("绝对路径：" + record.fullPath);
  if (record.mode === "zip" && record.zipName) parts.push("压缩包：" + record.zipName);
  const when = timeOf(record);
  if (when) parts.push("导出时间：" + when);
  return parts.join("；");
}

function timeOf(record) {
  if (!record || !record.exportedAt) return "";
  try {
    return new Date(record.exportedAt).toLocaleString();
  } catch (e) {
    return "";
  }
}

/** 记录变化后通知控制页重绘（不直接 require 面板模块，避免循环依赖） */
function notifyChanged() {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return;
  try {
    window.dispatchEvent(new CustomEvent(RECORDS_EVENT));
  } catch (e) {
    /* 老环境没有 CustomEvent 就等用户手动刷新 */
  }
}

class ExportLog {
  constructor(plugin) {
    this.plugin = plugin;
    this.data = emptyStore();
    this.loaded = null;
    this.saving = Promise.resolve();
  }

  load() {
    if (!this.loaded) {
      this.loaded = (async () => {
        try {
          const raw = await this.plugin.loadData(STORE_KEY);
          this.data = normalizeStore(raw);
        } catch (e) {
          this.data = emptyStore();
        }
        return this.data;
      })();
    }
    return this.loaded;
  }

  all() {
    return Object.keys(this.data.docs).map((key) => this.data.docs[key]);
  }

  get(docId) {
    const key = text(docId).trim();
    return key ? this.data.docs[key] || null : null;
  }

  size() {
    return Object.keys(this.data.docs).length;
  }

  /** entries 里每项都是导出流程拼好的完整记录；同 id 以最新一次为准 */
  async recordMany(entries) {
    await this.load();
    let changed = 0;
    (entries || []).forEach((entry) => {
      const record = normalizeRecord(entry);
      if (!record) return;
      this.data.docs[record.docId] = record;
      changed += 1;
    });
    if (!changed) return 0;
    this.persist();
    notifyChanged();
    return changed;
  }

  /** 串行化写盘：连续多次导出时后一次不会覆盖前一次的写入结果 */
  persist() {
    const snapshot = { version: VERSION, docs: JSON.parse(JSON.stringify(this.data.docs)) };
    this.saving = this.saving
      .then(() => this.plugin.saveData(STORE_KEY, snapshot))
      .catch((e) => {
        console.warn(LOG_PREFIX, "导出记录写入失败", e);
      });
    return this.saving;
  }

  async clear() {
    await this.load();
    this.data = emptyStore();
    this.persist();
    notifyChanged();
  }
}

module.exports = {
  STORE_KEY,
  RECORDS_EVENT,
  CONFIG_EVENT,
  ExportLog,
  emptyStore,
  normalizeRecord,
  normalizeStore,
  pathOf,
  detailOf,
  timeOf,
  notifyChanged,
};
