"use strict";

/**
 * 控制页渲染自检（jsdom + 假内核 fetch）：
 *   - 文档树按笔记本 → 目录 → 页面铺开
 *   - 已导出 / 未导出徽标与导出路径
 *   - 统计数字、搜索过滤、记录更新后自动重绘
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");

function loadJsdom() {
  for (const dir of [path.join(__dirname, "node_modules", "jsdom"), path.join(ROOT, "node_modules", "jsdom")]) {
    try {
      return require(dir);
    } catch (e) {
      /* 换下一个位置 */
    }
  }
  throw new Error("缺少 jsdom：在项目根执行 npm i jsdom");
}

const { JSDOM } = loadJsdom();
const dom = new JSDOM('<!doctype html><html><body><div id="host"></div></body></html>');

global.window = dom.window;
global.document = dom.window.document;
global.CustomEvent = dom.window.CustomEvent;
global.Event = dom.window.Event;
global.DOMParser = dom.window.DOMParser;
dom.window.require = undefined;

let failed = 0;
let passed = 0;
function check(name, cond, detail) {
  if (cond) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${name}${detail ? "\n       " + detail : ""}`);
  }
}

/* ------------------------- 假内核（fetch） ------------------------- */

const DOC_ROWS = [
  { id: "d1", content: "编程", hpath: "/编程", updated: "20240101000000" },
  { id: "d2", content: "Python", hpath: "/编程/Python", updated: "20240101000000" },
  { id: "d3", content: "Go", hpath: "/编程/Go", updated: "20240101000000" }
];

global.fetch = async (url) => {
  let data = null;
  if (String(url).indexOf("/api/notebook/lsNotebooks") !== -1) {
    data = { notebooks: [{ id: "box1", name: "笔记", closed: false }] };
  } else if (String(url).indexOf("/api/query/sql") !== -1) {
    data = DOC_ROWS;
  } else {
    data = [];
  }
  return {
    ok: true,
    status: 200,
    headers: { get: () => "application/json" },
    json: async () => ({ code: 0, data })
  };
};

/* --------------------------- 加载插件 --------------------------- */

const { installXhrStub } = require("./xhr-stub.cjs");
installXhrStub(ROOT, "siyuan-export-md");
const CODE = fs.readFileSync(path.join(ROOT, "index.js"), "utf8");

const moduleObj = { exports: {} };
const fn = vm.runInThisContext(`(function anonymous(require, module, exports) {\n${CODE}\n})`, {
  filename: "plugin:siyuan-export-md"
});
fn(
  (n) =>
    n === "siyuan"
      ? {
          Plugin: class {},
          Dialog: class {
            constructor(options) {
              this.element = document.createElement("div");
              this.options = options;
            }
            destroy() {}
          },
          showMessage: () => {},
          confirm: (title, text, cb) => cb && cb(),
          openTab: () => {},
          getFrontend: () => "desktop"
        }
      : require(n),
  moduleObj,
  moduleObj.exports
);
const I = moduleObj.exports.__internals;

/* ---------------------------- 假插件 ---------------------------- */

const store = { exportRecords: { version: 1, docs: {} } };
const plugin = {
  name: "siyuan-export-md",
  app: {},
  opts: { site: "hugo", outputMode: "folder", outputDir: "C:\\out", hugoLayout: "file" },
  async loadData(key) {
    return store[key] === undefined ? null : store[key];
  },
  async saveData(key, value) {
    store[key] = value;
  }
};
plugin.exportLog = new I.ExportLog(plugin);

(async () => {
  await plugin.exportLog.load();
  await plugin.exportLog.recordMany([
    {
      docId: "d2",
      title: "Python",
      hpath: "/编程/Python",
      site: "hugo",
      mode: "folder",
      relPath: "content/notes/Python.md",
      targetDir: "C:\\out",
      fullPath: "C:\\out\\content\\notes\\Python.md",
      exportedAt: 1735689600000
    }
  ]);
  await plugin.exportLog.saving;

  const panel = I.createPanel(plugin, { container: "tab" });
  document.getElementById("host").appendChild(panel.element);

  /* 等待异步 reload 完成 */
  for (let i = 0; i < 20; i++) {
    await new Promise((resolve) => setTimeout(resolve, 15));
    if (panel.element.querySelectorAll(".syxm-row").length) break;
  }
  await new Promise((resolve) => setTimeout(resolve, 30));

  const rows = Array.from(panel.element.querySelectorAll(".syxm-row"));
  check("文档树渲染出了行", rows.length === 4, `行数 ${rows.length}`);
  const texts = rows.map((row) => row.textContent);
  check("笔记本行存在", texts.some((text) => text.indexOf("笔记") !== -1));
  check("父文档行存在", texts.some((text) => text.indexOf("编程") !== -1));
  check("子文档 Python 行存在", texts.some((text) => text.indexOf("Python") !== -1));
  check("子文档 Go 行存在", texts.some((text) => text.indexOf("Go") !== -1));

  const badges = Array.from(panel.element.querySelectorAll(".syxm-badge"));
  check("已经导出过的页面显示已导出", badges.some((badge) => badge.textContent === "已导出"));
  check("未导出页面显示未导出", badges.some((badge) => badge.textContent === "未导出"));
  check(
    "导出过的页面展示导出路径",
    panel.element.textContent.indexOf("C:\\out\\content\\notes\\Python.md") !== -1
  );
  check("未导出页面的路径是占位符", Array.from(panel.element.querySelectorAll(".syxm-path")).some((el) => el.textContent === "—"));

  check("页面统计 = 3", panel.element.querySelector('[data-el="total"]').textContent === "3");
  check("已导出统计 = 1", panel.element.querySelector('[data-el="done"]').textContent === "1");
  check("未导出统计 = 2", panel.element.querySelector('[data-el="todo"]').textContent === "2");
  check("输出方式显示为文件夹", panel.element.querySelector('[data-el="mode"]').textContent === "文件夹");

  /* 搜索过滤 */
  const search = panel.element.querySelector('[data-el="search"]');
  search.value = "python";
  search.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  const filtered = Array.from(panel.element.querySelectorAll(".syxm-row")).map((row) => row.textContent);
  check("搜索 python 时隐藏不相关页面", filtered.every((text) => text.indexOf("Go") === -1), filtered.join(" | "));
  check("搜索结果保留命中页面", filtered.some((text) => text.indexOf("Python") !== -1));
  search.value = "";
  search.dispatchEvent(new dom.window.Event("input", { bubbles: true }));

  /* 记录变化自动重绘 */
  await plugin.exportLog.recordMany([
    {
      docId: "d3",
      title: "Go",
      mode: "zip",
      zipName: "siyuan-hugo-2026.zip",
      relPath: "content/notes/Go.md",
      exportedAt: 1735689800000
    }
  ]);
  await plugin.exportLog.saving;
  await new Promise((resolve) => setTimeout(resolve, 30));
  check("记录变化后自动刷新徽标", panel.element.querySelector('[data-el="done"]').textContent === "2", panel.element.querySelector('[data-el="done"]').textContent);
  check(
    "压缩包模式的路径按「包名 › 包内路径」展示",
    panel.element.textContent.indexOf("siyuan-hugo-2026.zip › content/notes/Go.md") !== -1
  );

  panel.destroy();
  check("销毁后元素被移除", !document.getElementById("host").contains(panel.element));

  console.log(`\n通过 ${passed}，失败 ${failed}`);
  process.exit(failed ? 1 : 0);
})();
