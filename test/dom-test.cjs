/**
 * DOM 分支自测（jsdom 提供 DOMParser，模拟思源渲染态 DOM）
 *
 *   node test/dom-test.cjs
 *
 * 验证「DOM → 语义 HTML」这条主线：表格、callout、超级块、引用、列表、
 * 图片、链接、公式、代码块。
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
    '<div data-node-id="c1" data-type="NodeCallout" class="callout" data-subtype="tip">' +
    '<div class="callout-info"><div class="callout-icon">💡</div>' +
    '<div class="callout-title">自定义标题</div></div>' +
    '<div class="protyle-attr" contenteditable="false">\u200b</div></div>',
  s1: '<div data-node-id="s1" data-type="NodeSuperBlock" data-sb-layout="col" class="sb"></div>',
  s2: '<div data-node-id="s2" data-type="NodeSuperBlock" class="sb"></div>',
  b1: '<div data-node-id="b1" data-type="NodeBlockquote" class="bq"></div>',
  p1: '<div data-node-id="p1" data-type="NodeParagraph"><div contenteditable="true">正文内容</div></div>',
  p2: '<div data-node-id="p2" data-type="NodeParagraph"><div contenteditable="true">左栏</div></div>',
  p3: '<div data-node-id="p3" data-type="NodeParagraph"><div contenteditable="true">右栏</div></div>',
  i1: '<div data-node-id="i1" data-type="NodeImage"><img src="assets/cat.png" alt="猫"></div>',
  p4:
    '<div data-node-id="p4" data-type="NodeParagraph"><div contenteditable="true">' +
    '<span data-type="a" data-href="assets/报告.pdf" title="报告.pdf">报告.pdf</span></div></div>',
  m1: '<div data-node-id="m1" data-type="NodeMathBlock" data-content="E = mc^2"></div>',
  m2: '<div data-node-id="m2" data-type="NodeMathBlock" data-content="\\frac{dy}{dx}"></div>',
  l1:
    '<div data-node-id="l1" data-type="NodeList" data-subtype="o" class="list">' +
    '<div data-node-id="l1a" data-type="NodeListItem" data-marker="1." class="li">' +
    '<div class="protyle-action protyle-action--order" contenteditable="false">1.</div>' +
    '<div data-node-id="l1ap" data-type="NodeParagraph" class="p"><div>第一条</div></div>' +
    '<div data-node-id="l1an" data-type="NodeList" data-subtype="u" class="list">' +
    '<div data-node-id="l1an1" data-type="NodeListItem" data-marker="*" class="li">' +
    '<div class="protyle-action" contenteditable="false">•</div>' +
    '<div class="p"><div>嵌套项</div></div></div></div>' +
    '<div class="protyle-attr" contenteditable="false">\u200b</div></div>' +
    '<div data-node-id="l1b" data-type="NodeListItem" data-marker="2." class="li">' +
    '<div class="protyle-action protyle-action--order" contenteditable="false">2.</div>' +
    '<div class="p"><div>第二条</div></div></div></div>',
  c2:
    '<div data-node-id="c2" data-type="NodeCodeBlock" data-subtype="python" class="code-block">' +
    '<div class="protyle-action" contenteditable="false">python</div>' +
    '<pre class="hljs language-python"><code>def f():\n\n    return 1</code></pre></div>',
  c3:
    '<div data-node-id="c3" data-type="NodeCodeBlock" data-subtype="md" class="code-block">' +
    '<div class="protyle-action" contenteditable="false">md</div>' +
    '<div class="protyle-linenumber" contenteditable="false">1\n2</div>' +
    "示例：```js\nconst a = 1;\n```</div>",
  h1:
    '<div data-node-id="h1" data-type="NodeHeading" class="h2" data-subtype="h2">' +
    '<div contenteditable="true">小节 <em>标题</em></div><div class="protyle-attr">\u200b</div></div>',
  r1:
    '<div data-node-id="r1" data-type="NodeParagraph"><div contenteditable="true">' +
    '含 <code class="code">inline</code> 与 <mark>高亮</mark>、<span data-type="block-ref">锚文字</span></div></div>'
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
  if (url === "/api/block/getChildBlocks") {
    if (req.id === "c1") return respond([{ id: "p1", type: "p" }]);
    if (req.id === "b1") return respond([{ id: "p2", type: "p" }, { id: "p3", type: "p" }]);
    if (req.id === "s1") return respond([{ id: "p2", type: "p" }, { id: "s2", type: "s" }]);
    if (req.id === "s2") return respond([{ id: "m1", type: "m" }, { id: "m2", type: "m" }]);
    return respond([]);
  }
  if (url === "/api/query/sql") return respond([]);
  throw new Error("unexpected url " + url);
};
global.fetch = fakeFetch;

function newCtx(opts) {
  return {
    opts: { ...I.DEFAULT_OPTIONS, ...(opts || {}) },
    warnings: [],
    headings: [],
    headingIds: new Map(),
    inHtml: true,
    assets: new I.AssetStore()
  };
}

(async () => {
  console.log("## 表格");
  const tableCtx = newCtx();
  const tableHtml = await I.renderBlockHtml({ id: "t1", type: "t", subtype: "" }, tableCtx);
  console.log(tableHtml);
  check("包进 table-wrapper", tableHtml.includes('<div class="table-wrapper">'));
  check("保留 colspan", /colspan="2"/.test(tableHtml));
  check("保留 rowspan", /rowspan="2"/.test(tableHtml));
  check("保留 colgroup", tableHtml.includes("<colgroup>"));
  check("剥掉 data-node-id", !tableHtml.includes("data-node-id"));
  check("剥掉 protyle- 类名", !tableHtml.includes("protyle-"));
  check("表内行内公式转 data-latex", tableHtml.includes('<span class="math-inline" data-latex="x_i">x_i</span>'), tableHtml);

  console.log("\n## callout");
  const calloutCtx = newCtx();
  const calloutHtml = await I.renderBlockHtml({ id: "c1", type: "callout", subType: "tip" }, calloutCtx);
  console.log(calloutHtml);
  check("callout 容器带 subtype", calloutHtml.includes('<div class="callout callout-tip"'), calloutHtml);
  check("使用块内自定义标题与图标", calloutHtml.includes("💡 自定义标题"), calloutHtml);
  check("body 包在 callout-body 内", calloutHtml.includes('<div class="callout-body">'));
  check("子块内容进入 body", calloutHtml.includes("<p>正文内容</p>"), calloutHtml);
  check("没有把 callout 头部重复塞进 body", (calloutHtml.match(/自定义标题/g) || []).length === 1, calloutHtml);

  console.log("\n## 超级块（col 里套 row）");
  const superCtx = newCtx();
  const sbHtml = await I.renderBlockHtml({ id: "s1", type: "s" }, superCtx);
  console.log(sbHtml);
  check("外层 col 横向并排", sbHtml.includes("sy-superblock-col") && sbHtml.includes("flex-direction:row"), sbHtml);
  check("内层 row 纵向堆叠", sbHtml.includes("sy-superblock-row") && sbHtml.includes("flex-direction:column"), sbHtml);
  check("子块根节点带 sy-superblock-child", (sbHtml.match(/sy-superblock-child/g) || []).length >= 2, sbHtml);
  check("嵌套超级块里的公式仍走 math-block", (sbHtml.match(/class="[^"]*\bmath-block\b/g) || []).length === 2, sbHtml);
  check("不残留编辑器私有属性", !/data-node-id|data-node-index|updated=/.test(sbHtml), sbHtml);
  check("没有连续空行", !/\n[ \t]*\n/.test(sbHtml.trim()), sbHtml);

  console.log("\n## 引用（子块兜底）");
  const quoteHtml = await I.renderBlockHtml({ id: "b1", type: "b" }, newCtx());
  console.log(quoteHtml);
  check("输出 blockquote 包住子块", quoteHtml.startsWith("<blockquote>") && quoteHtml.includes("</blockquote>"), quoteHtml);
  check("两个子段落都在里面", quoteHtml.includes("<p>左栏</p>") && quoteHtml.includes("<p>右栏</p>"), quoteHtml);

  console.log("\n## 列表");
  const listHtml = await I.renderBlockHtml({ id: "l1", type: "l", subType: "o" }, newCtx());
  console.log(listHtml);
  check("有序列表输出 <ol>", listHtml.includes("<ol>") && listHtml.includes("</ol>"), listHtml);
  check("列表项输出 <li>", (listHtml.match(/<li>/g) || []).length === 3, listHtml);
  check("嵌套无序列表输出 <ul>", listHtml.includes("<ul>") && listHtml.includes("</ul>"), listHtml);
  check("不残留 data-marker / li、list 类名", !/data-marker|class="li"|class="list"/.test(listHtml), listHtml);
  check("有序列表序号不被重复写进正文", !listHtml.includes("1."), listHtml);

  console.log("\n## 图片 / 链接");
  const imgHtml = await I.renderBlockHtml({ id: "i1", type: "img" }, newCtx());
  console.log(imgHtml);
  check("图片块输出 figure", imgHtml.startsWith('<figure class="sy-image"><img'), imgHtml);
  check("图片 src/alt 保留", imgHtml.includes('src="assets/cat.png"') && imgHtml.includes('alt="猫"'), imgHtml);

  const linkHtml = await I.renderBlockHtml({ id: "p4", type: "p" }, newCtx());
  console.log(linkHtml);
  check("data-href 转成普通 a 标签", linkHtml.includes('<a href="assets/报告.pdf"'), linkHtml);
  check("不再残留 data-href", !linkHtml.includes("data-href"), linkHtml);
  check("附件显示名保留", linkHtml.includes(">报告.pdf</a>"), linkHtml);

  console.log("\n## 代码块");
  const codeHtml = await I.renderBlockHtml({ id: "c2", type: "c", subType: "python" }, newCtx());
  console.log(codeHtml);
  check("输出 pre + code", codeHtml.includes('<pre class="code-block" data-lang="python"><code class="language-python">'), codeHtml);
  check("代码内容保留换行", codeHtml.includes("def f():"), codeHtml);
  check("行号栏没有进正文", !codeHtml.includes("protyle-linenumber"), codeHtml);

  const codeNoPre = await I.renderBlockHtml({ id: "c3", type: "c", subType: "md" }, newCtx());
  console.log(codeNoPre);
  check("没有 code/pre 时退回整块文本", codeNoPre.includes("const a = 1;"), codeNoPre);
  check("行号栏文字没有混进代码", !codeNoPre.includes("protyle-linenumber"), codeNoPre);
  check("反引号转义为 &#96;", !codeNoPre.includes("`") && codeNoPre.includes("&#96;"), codeNoPre);

  console.log("\n## 标题 / 行内节点");
  const headCtx = newCtx({ headingDemote: true });
  const headHtml = await I.renderBlockHtml({ id: "h1", type: "h" }, headCtx);
  console.log(headHtml);
  check("标题降一级并保留行内 em", headHtml === '<h3 id="小节-标题">小节 <em>标题</em></h3>', headHtml);
  check("目录收集到标题", headCtx.headings.length === 1 && headCtx.headings[0].id === "小节-标题", JSON.stringify(headCtx.headings));

  const headNoDemote = await I.renderBlockHtml({ id: "h1", type: "h" }, newCtx({ headingDemote: false }));
  check("关闭降级时输出 h2", headNoDemote.startsWith("<h2 "), headNoDemote);

  const inlineHtml = await I.renderBlockHtml({ id: "r1", type: "p" }, newCtx());
  console.log(inlineHtml);
  check("行内 code / mark / block-ref 都是 HTML", 
    inlineHtml.includes("<code>inline</code>") &&
      inlineHtml.includes("<mark>高亮</mark>") &&
      inlineHtml.includes('<span class="block-ref">锚文字</span>'),
    inlineHtml
  );

  console.log(`\n通过 ${passed}，失败 ${failed}`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
