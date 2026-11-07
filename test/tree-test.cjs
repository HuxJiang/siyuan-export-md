/**
 * 文档树 page bundle 自测（假内核，无需思源实例）
 *
 *   node test/tree-test.cjs
 *
 * 覆盖：
 *   - hpath → 组别目录（content + 可变部分）
 *   - 父页面导出过 → 子页面挂到父目录下；父未导出 → 按父路径建目录 / flat 不建
 *   - 有子页面 → _index.md（TOML 只有 title）+ 同名子目录 index.md（正文）
 *   - 没正文就不建同名子目录
 */

"use strict";

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
const dom = new JSDOM("<!doctype html><html><body></body></html>");
global.DOMParser = dom.window.DOMParser;
global.document = dom.window.document;

const { installXhrStub } = require("./xhr-stub.cjs");
installXhrStub(ROOT, "siyuan-export-md");
const CODE = fs.readFileSync(path.join(ROOT, "index.js"), "utf8");

let failed = 0;
let passed = 0;

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${name}${detail ? " → " + detail : ""}`);
  }
}

function section(title) {
  console.log(`\n## ${title}`);
}

class FakePlugin {
  constructor(options) {
    this.app = options && options.app;
  }
  async loadData() {
    return null;
  }
  async saveData() {}
  addTopBar() {}
  addCommand() {}
}

const fakeSiyuan = { Plugin: FakePlugin, Dialog: class {}, showMessage: () => {} };

function loadPlugin() {
  const moduleObj = { exports: {} };
  const wrapped = `(function anonymous(require, module, exports) {\n${CODE}\n})`;
  const fn = vm.runInThisContext(wrapped, { filename: "plugin:siyuan-export-md" });
  const requireFn = (name) => (name === "siyuan" ? fakeSiyuan : require(name));
  fn(requireFn, moduleObj, moduleObj.exports);
  return moduleObj.exports;
}

const I = loadPlugin().__internals;

/* ------------------------------------------------------------------ *
 * 1. 纯函数：组别目录规划
 * ------------------------------------------------------------------ */
section("组别目录规划");

const ROWS = [
  { id: "docA", content: "父页", box: "box1", hpath: "/笔记本/父页" },
  { id: "docB", content: "子页", box: "box1", hpath: "/笔记本/父页/子页" },
  { id: "docC", content: "独立页", box: "box1", hpath: "/笔记本/独立页" },
  { id: "docD", content: "空栏目", box: "box1", hpath: "/笔记本/空栏目" },
  { id: "docE", content: "栏目下的页", box: "box1", hpath: "/笔记本/空栏目/栏目下的页" }
];

const baseOpts = { site: "hugo", hugoLayout: "bundle", treePrefix: "", treeMissingParent: "mirror" };
const plan = I.buildPathPlan(ROWS, null, baseOpts);
check("顶层页面 = 页面标题", plan.get("docA").dir === "父页", plan.get("docA").dir);
check("子页面挂在父页面目录下", plan.get("docB").dir === "父页/子页", plan.get("docB").dir);
check("顶层页面识别出有子页面", plan.get("docA").hasChildren === true, String(plan.get("docA").hasChildren));
check("叶子页面没有子页面", plan.get("docC").hasChildren === false, String(plan.get("docC").hasChildren));
check(
  "正文目录 = 页面目录/同名文件夹",
  plan.get("docA").bodyDir === "父页/父页",
  plan.get("docA").bodyDir
);

const prefixPlan = I.buildPathPlan(ROWS, null, { ...baseOpts, treePrefix: "docs/笔记" });
check("树前缀直接拼在项目根目录下", prefixPlan.get("docA").dir === "docs/笔记/父页", prefixPlan.get("docA").dir);

const flatPlan = I.buildPathPlan(ROWS, null, { ...baseOpts, treeMissingParent: "flat" });
check("父未导出时 flat 不建父目录", flatPlan.get("docB").dir === "子页", flatPlan.get("docB").dir);

const exported = (id) => (id === "docA" ? { pageDir: "content/旧位置/父页" } : null);
const recordPlan = I.buildPathPlan(ROWS, exported, baseOpts);
check(
  "父页面已导出时子页面跟到父目录",
  recordPlan.get("docB").dir === "content/旧位置/父页/子页",
  recordPlan.get("docB").dir
);
check("本页面自身仍用自己算出的目录", recordPlan.get("docA").dir === "父页", recordPlan.get("docA").dir);

const dupPlan = I.buildPathPlan(
  [
    { id: "d1", content: "同名", box: "b", hpath: "/笔记本/同名" },
    { id: "d2", content: "同名", box: "b", hpath: "/笔记本/同名/同名" }
  ],
  null,
  baseOpts
);
check(
  "同名页面目录不会互相覆盖",
  dupPlan.get("d1").dir === "同名" &&
    dupPlan.get("d1").bodyDir === "同名/同名" &&
    dupPlan.get("d2").dir === "同名/同名-2",
  `${dupPlan.get("d1").bodyDir} / ${dupPlan.get("d2").dir}`
);
check("路径非法字符被替换", I.sanitizeSegment("a/b:c") === "a-b-c", I.sanitizeSegment("a/b:c"));

/* 手工覆盖的相对目录优先，子页面跟着挂过去 */
const customPlan = I.buildPathPlan(ROWS, null, baseOpts, (id) => (id === "docA" ? "自定义/父页" : ""));
check("手工覆盖的页面用自定义目录", customPlan.get("docA").dir === "自定义/父页", customPlan.get("docA").dir);
check("手工覆盖后子页面仍挂在它下面", customPlan.get("docB").dir === "自定义/父页/子页", customPlan.get("docB").dir);
check(
  "覆盖目录会去掉反斜杠与首尾斜杠",
  I.normalizeOverride("\\自定义\\父页/") === "自定义/父页",
  I.normalizeOverride("\\自定义\\父页/")
);

/* ------------------------------------------------------------------ *
 * 2. 文件路径与 Front Matter
 * ------------------------------------------------------------------ */
section("文件路径与 Front Matter");

const leafPaths = I.docPaths({ slug: "x" }, baseOpts, plan.get("docC"));
check("叶子 bundle 用 index.md", leafPaths.mdPath === "独立页/index.md", leafPaths.mdPath);
check("叶子 bundle 资源在同目录", leafPaths.assetDir === "独立页" && leafPaths.assetPrefix === "./");

const sectionPaths = I.docPaths({ slug: "x" }, baseOpts, plan.get("docA"));
check("有子页面用 _index.md", sectionPaths.mdPath === "父页/_index.md", sectionPaths.mdPath);
check("正文落到同名子目录 index.md", sectionPaths.bodyPath === "父页/父页/index.md", sectionPaths.bodyPath);
check("正文资源跟正文目录", sectionPaths.assetDir === "父页/父页");

const doc = {
  title: "LLM大模型",
  slug: "llm",
  created: new Date(2024, 0, 1),
  updated: new Date(2024, 0, 1),
  tags: [],
  notebook: "笔记本"
};
const tomlSection = I.buildSectionFrontMatter(doc, { site: "hugo", hugoLayout: "bundle", frontmatterSyntax: "toml" });
check("栏目页是 TOML 且只有 title", tomlSection === "+++\ntitle = 'LLM大模型'\n+++\n", JSON.stringify(tomlSection));
const yamlSection = I.buildSectionFrontMatter(doc, { site: "hugo", hugoLayout: "bundle", frontmatterSyntax: "yaml" });
check("YAML 栏目页只有 title", yamlSection === "---\ntitle: LLM大模型\n---\n", JSON.stringify(yamlSection));
const tomlBody = I.buildTomlFrontMatter({ ...doc, tags: ["AI"] }, { site: "hugo", frontmatterSyntax: "toml" });
check("TOML 正文 Front Matter 带 +++", tomlBody.startsWith("+++\ntitle = 'LLM大模型'\ndate = 2024-01-01"), tomlBody);
check("TOML 标签用数组", tomlBody.includes("tags = ['AI']"), tomlBody);
check(
  "默认语法：bundle → TOML，file → YAML",
  I.frontmatterSyntax({ site: "hugo", hugoLayout: "bundle" }) === "toml" &&
    I.frontmatterSyntax({ site: "hugo", hugoLayout: "file" }) === "yaml"
);

/* ------------------------------------------------------------------ *
 * 3. 端到端：假内核导出整棵树
 * ------------------------------------------------------------------ */
section("端到端导出");

const DOC_ROWS = {
  docA: { id: "docA", content: "父页", box: "box1", hpath: "/笔记本/父页", created: "20240101120000", updated: "20240101120000", tag: "" },
  docB: { id: "docB", content: "子页", box: "box1", hpath: "/笔记本/父页/子页", created: "20240101120000", updated: "20240101120000", tag: "" },
  docC: { id: "docC", content: "独立页", box: "box1", hpath: "/笔记本/独立页", created: "20240101120000", updated: "20240101120000", tag: "" },
  docD: { id: "docD", content: "空栏目", box: "box1", hpath: "/笔记本/空栏目", created: "20240101120000", updated: "20240101120000", tag: "" },
  docE: { id: "docE", content: "栏目下的页", box: "box1", hpath: "/笔记本/空栏目/栏目下的页", created: "20240101120000", updated: "20240101120000", tag: "" }
};

/* 只有 docD 没有正文（返回空块列表），其余都有一段正文 */
function sqlRows(stmt) {
  const byId = /FROM blocks WHERE id = '([^']+)'/.exec(stmt);
  if (byId && DOC_ROWS[byId[1]]) return [DOC_ROWS[byId[1]]];
  if (/type = 'd' AND box = 'box1'/.test(stmt)) return Object.values(DOC_ROWS);
  return [];
}

global.fetch = async (url, init) => {
  const req = init && init.body ? JSON.parse(init.body) : {};
  const respond = (data) => ({
    ok: true,
    status: 200,
    headers: { get: () => "application/json" },
    json: async () => ({ code: 0, msg: "", data })
  });
  if (url === "/api/query/sql") return respond(sqlRows(req.stmt));
  if (url === "/api/block/getChildBlocks") {
    if (req.id === "docD") return respond([]);
    return respond([{ id: `${req.id}-p1`, type: "p", subtype: "", sort: 1 }]);
  }
  if (url === "/api/block/getBlockDOM") {
    const id = req.id;
    return respond({
      dom: `<div data-node-id="${id}" data-type="NodeParagraph" class="p"><div contenteditable="true">正文 ${id}</div></div>`
    });
  }
  throw new Error("unexpected url " + url);
};

(async () => {
  const opts = {
    ...I.DEFAULT_OPTIONS,
    site: "hugo",
    hugoLayout: "bundle",
    copyAssets: false,
    frontmatterSyntax: "toml",
    outputMode: "zip"
  };
  const ids = ["docA", "docB", "docC", "docD", "docE"];
  const result = await I.exportSite(ids, opts, "笔记本", null);

  const byPath = new Map(result.files.map((file) => [file.path, Buffer.from(file.data).toString("utf8")]));
  check("父页面生成栏目页", byPath.has("父页/_index.md"));
  check("父页面正文在同名子目录", byPath.has("父页/父页/index.md"));
  check("子页面生成 index.md", byPath.has("父页/子页/index.md"));
  check("顶层叶子页面生成 index.md", byPath.has("独立页/index.md"));
  check("空栏目也生成栏目页", byPath.has("空栏目/_index.md"));
  check("空栏目下的页面挂在栏目目录下", byPath.has("空栏目/栏目下的页/index.md"));
  check("空栏目没有正文就不建同名子目录", !byPath.has("空栏目/空栏目/index.md"));
  check("不再附加 content / posts 层", !result.files.some((file) => /^(content|posts)\//.test(file.path)));

  const section = byPath.get("父页/_index.md") || "";
  check("栏目页只有 title，没有正文", section === "+++\ntitle = '父页'\n+++\n", JSON.stringify(section));
  const body = byPath.get("父页/父页/index.md") || "";
  check("正文文件带 TOML Front Matter", body.startsWith("+++\ntitle = '父页'"), body.slice(0, 40));
  check("正文文件里有实际内容", body.includes("正文 docA-p1"), body);
  check("子页面正文是自己的", (byPath.get("父页/子页/index.md") || "").includes("正文 docB-p1"));
  check("导出文档计数", result.docCount === 5, String(result.docCount));
  check("报告在包根", result.files.some((file) => file.path === "SIYUAN-EXPORT-REPORT.html"));

  /* 面板里改过的相对目录要真的用在导出上 */
  const custom = await I.exportSite(["docB"], opts, "笔记本", null, {
    pathOverrides: { get: (id) => (id === "docB" ? "自定义/子页" : "") }
  });
  check(
    "导出使用面板里保存的相对目录",
    custom.files.some((file) => file.path === "自定义/子页/index.md"),
    custom.files.map((file) => file.path).join(", ")
  );

  console.log(`\n通过 ${passed}，失败 ${failed}`);
  if (failed) process.exitCode = 1;
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
