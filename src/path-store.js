/*
 * siyuan-export-md — 页面相对目录覆盖
 *
 * 面板里可以逐页修改「相对目录」，覆盖值按 docId 持久化；导出时 path-plan
 * 会优先用它，子页面也跟着它的目录走。
 */
"use strict";

const { normalizeOverride } = require("./path-plan");

const OVERRIDES_KEY = "pathOverrides";
const OVERRIDES_EVENT = "siyuan-export-md:paths-changed";

function normalizeStore(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  Object.keys(raw).forEach((id) => {
    const dir = normalizeOverride(raw[id]);
    if (id && dir) out[id] = dir;
  });
  return out;
}

function notifyChanged() {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return;
  try {
    window.dispatchEvent(new CustomEvent(OVERRIDES_EVENT));
  } catch (e) {
    /* 老内核没有 CustomEvent，忽略 */
  }
}

class PathOverrides {
  constructor(plugin) {
    this.plugin = plugin;
    this.map = {};
    this.queue = Promise.resolve();
  }

  async load() {
    try {
      const data = await this.plugin.loadData(OVERRIDES_KEY);
      this.map = normalizeStore(data);
    } catch (e) {
      this.map = {};
    }
    return this.map;
  }

  get(docId) {
    return this.map[docId] || "";
  }

  size() {
    return Object.keys(this.map).length;
  }

  async set(docId, dir) {
    if (!docId) return;
    const clean = normalizeOverride(dir);
    if (clean) this.map[docId] = clean;
    else delete this.map[docId];
    await this.persist();
    notifyChanged();
  }

  async clear(docId) {
    if (!docId || !this.map[docId]) return;
    delete this.map[docId];
    await this.persist();
    notifyChanged();
  }

  async clearAll() {
    this.map = {};
    await this.persist();
    notifyChanged();
  }

  persist() {
    this.queue = this.queue.then(async () => {
      try {
        await this.plugin.saveData(OVERRIDES_KEY, this.map);
      } catch (e) {
        /* 写盘失败下一次再试 */
      }
    });
    return this.queue;
  }
}

module.exports = {
  OVERRIDES_KEY,
  OVERRIDES_EVENT,
  normalizeStore,
  PathOverrides
};
