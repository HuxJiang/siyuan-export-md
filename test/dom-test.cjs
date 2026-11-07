/**
 * DOM 分支自测（jsdom 提供 DOMParser，模拟思源渲染态）
 *
 *   node test/dom-test.cjs
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");

/** jsdom 装在 test/node_modules 或项目根 node_modules 都能用 */
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
installXhrStub(ROOT, "siyuan-export-md"); // 加载器会同步 XHR 读 src/ 模块
const CODE = fs.readFileSync(path.join(ROOT, "index.js"), "utf8");

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

const moduleObj = { exports: {} };
const fn = vm.runInThisContext(`(function anonymous(require, module, exports) {\n${CODE}\n})`, {
  filename: "plugin:siyuan-export-md"
});
fn(
  (n) => (n === "siyuan" ? { Plugin: class {}, Dialog: class {}, showMessage: () => {} } : require(n)),
  moduleObj,
  moduleObj.exports
);
const I = moduleObj.exports.__internals;

const DOMS = {
  t1:
    '<div data-node-id="t1" data-type="NodeTable" class="protyle-wysiwyg__table table">' +
    '<div class="table"><table><colgroup><col style="width:60px"><col></colgroup>' +
    '<thead><tr><th colspan="2">合并表头</th></tr></thead>' +
    '<tbody><tr><td rowspan="2">A</td><td>B</td></tr>' +
    '<tr><td><span data-type="inline-math" data-content="x_i">x_i</span></td></tr></tbody>' +
    "</table></div></div>",
  c1:
    '<div data-node-id="c1" data-type="NodeCallout" class="callout">' +
    '<div class="callout-info"><div class="callout-icon">💡</div>' +
    '<div class="callout-title">自定义标题</div></div></div>',
  s1: '<div data-node-id="s1" data-type="NodeSuperBlock" data-layout="flex" class="sb"></div>',
  p1: '<div data-node-id="p1" data-type="NodeParagraph"><p>正文内容</p></div>',
  p2: '<div data-node-id="p2" data-type="NodeParagraph"><p>左栏</p></div>',
  p3: '<div data-node-id="p3" data-type="NodeParagraph"><p>右栏</p></div>',
  i1:
    '<div data-node-id="i1" data-type="NodeImage"><img src="assets/cat.png" alt="猫"></div>',
  p4:
    '<div data-node-id="p4" data-type="NodeParagraph"><p>' +
    '<span data-type="a" data-href="assets/报告.pdf" title="报告.pdf">报告.pdf</span></p></div>',
  m1: '<div data-node-id="m1" data-type="NodeMathBlock"></div>'
};

const KRAMDOWN = {
  p1: "正文内容",
  p2: "左栏",
  p3: "右栏",
  m1: "$$\nE = mc^2\n$$"
};

const fakeFetch = async (url, init) => {
  const req = init && init.body ? JSON.parse(init.body) : {};
  const respond = (data) => ({
    ok: true,
    status: 200,
    headers: { get: () => "application/json" },
    json: async () => ({ code: 0, msg: "", data })
  });
  if (url === "/api/block/getBlockDOM") return respond({ dom: DOMS[req.id] || "" });
  if (url === "/api/block/getBlockKramdown") return respond({ kramdown: KRAMDOWN[req.id] || "" });
  if (url === "/api/block/getChildBlocks") {
    if (req.id === "c1") return respond([{ id: "p1", type: "p" }]);
    return respond([]);
  }
  if (url === "/api/query/sql") return respond([]);
  throw new Error("unexpected url " + url);
};
global.fetch = fakeFetch;

(async () => {
  console.log("## 表格 HTML 分支");
  const tableOpts = { ...I.DEFAULT_OPTIONS, tableFormat: "html" };
  const tableMd = await I.exportTable({ id: "t1", type: "t", subtype: "" }, {
    opts: tableOpts,
    warnings: [],
    assets: new I.AssetStore(),
    depth: 0
  });
  console.log(tableMd);
  check("包进 table-wrapper", tableMd.includes('<div class="table-wrapper">'));
  check("保留 colspan", /<th[^>]*colspan="2"/.test(tableMd) || /colspan="2"/.test(tableMd));
  check("保留 rowspan", /rowspan="2"/.test(tableMd));
  check("保留 colgroup", tableMd.includes("<colgroup>"));
  check("剥掉 data-node-id", !tableMd.includes("data-node-id"));
  check("剥掉 protyle- 类名", !tableMd.includes("protyle-"));
  check(
    "表内行内公式转 data-latex",
    tableMd.includes('<span class="math-inline" data-latex="x_i">x\\_i</span>'),
    tableMd
  );

  console.log("\n## callout 分支");
  const calloutCtx = { opts: { ...I.DEFAULT_OPTIONS }, warnings: [], assets: new I.AssetStore(), depth: 0 };
  const calloutMd = await I.exportCallout(
    { id: "c1", type: "callout", subType: "tip" },
    calloutCtx
  );
  console.log(calloutMd);
  check("callout 容器带 subtype", calloutMd.includes('<div class="callout callout-tip">'));
  check("使用块内自定义标题与图标", calloutMd.includes("<div class=\"callout-title\">💡 自定义标题</div>"), calloutMd);
  check("body 包在 callout-body 内", calloutMd.includes('<div class="callout-body">'));
  check("子块内容进入 body", calloutMd.includes("正文内容"));
  check("callout 内不再套 rawhtml 短代码", !calloutMd.includes("rawhtml"));

  console.log("\n## 超级块 / HTML 容器");
  const superCtx = { opts: { ...I.DEFAULT_OPTIONS }, warnings: [], assets: new I.AssetStore(), depth: 0 };
  // 用 renderChildrenHtml 直接验证：子块走 HTML 渲染且不嵌套短代码
  const children = [
    { id: "p2", type: "p" },
    { id: "m1", type: "m" },
    { id: "p3", type: "p" }
  ];
  const inner = await I.renderChildrenHtml(children, superCtx);
  console.log(inner);
  check("子块按顺序渲染", inner.indexOf("左栏") < inner.indexOf("右栏"));
  check("子块不嵌套 rawhtml", !inner.includes("rawhtml"));
  check("子块公式走 math-block", inner.includes('<div class="math-block" data-latex="E = mc^2">'), inner);

  console.log("\n## rawhtml 短代码（开关开启时只包一层）");
  const withShort = await I.renderBlockHtml(
    { id: "p1", type: "p" },
    { opts: { ...I.DEFAULT_OPTIONS, hugoRawHtmlShortcode: true }, warnings: [], assets: new I.AssetStore(), depth: 0, inHtml: false, htmlOnly: false }
  );
  check("renderBlockHtml 不负责短代码包裹（由上层统一处理）", !withShort.includes("rawhtml"));

  console.log("\n## 图片块");
  const imgCtx = { opts: { ...I.DEFAULT_OPTIONS }, warnings: [], assets: new I.AssetStore(), depth: 0 };
  const imgMd = await I.exportImage({ id: "i1", type: "img" }, imgCtx);
  console.log(imgMd);
  check("无 kramdown 时从 DOM 兜底取图", imgMd.includes("![猫](assets/cat.png)"));

  console.log("\n## 附件链接（span[data-href] → a[href]）");
  const linkMd = await I.renderBlockHtml(
    { id: "p4", type: "p" },
    { opts: { ...I.DEFAULT_OPTIONS }, warnings: [], assets: new I.AssetStore(), depth: 0, inHtml: true, htmlOnly: true }
  );
  console.log(linkMd);
  check("data-href 转成普通 a 标签", linkMd.includes('<a href="assets/报告.pdf"'), linkMd);
  check("不再残留 data-href", !linkMd.includes("data-href"), linkMd);
  check("附件显示名保留", linkMd.includes(">报告.pdf</a>"), linkMd);

  console.log(`\n通过 ${passed}，失败 ${failed}`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
