/**
 * 本地自测（无需思源实例）
 *
 *   node test/self-test.cjs
 *
 * 1) 按 SiYuan 真实加载方式（window.eval + module.exports.default）验证插件契约；
 * 2) 用假内核 API 跑一遍端到端导出，检查正文是否全部是 HTML、资源是否重写、zip 产物；
 * 3) 校验纯函数（公式容器、HTML 压缩、命名、Front Matter）。
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

/* ------------------------------------------------------------------ *
 * 1. 插件契约
 * ------------------------------------------------------------------ */

class FakePlugin {
  constructor(options) {
    /* 真实思源以 new PluginClass(options) 构造，选项里带 app；基类会读 options.app */
    this.__options = options;
    this.app = options && options.app;
    this.calls = [];
    /* 事件总线桩：记录订阅，测试里手动 emit */
    const handlers = Object.create(null);
    this.eventBus = {
      handlers,
      on(name, fn) {
        (handlers[name] = handlers[name] || []).push(fn);
      },
      emit(name, detail) {
        (handlers[name] || []).forEach((fn) => fn({ detail }));
      }
    };
  }
  async loadData() {
    return null;
  }
  async saveData() {}
  addTopBar(arg) {
    this.calls.push(["addTopBar", arg]);
  }
  addCommand(arg) {
    this.calls.push(["addCommand", arg]);
  }
}

const fakeSiyuan = {
  Plugin: FakePlugin,
  Dialog: class FakeDialog {},
  showMessage: () => {}
};

function loadPlugin() {
  const moduleObj = { exports: {} };
  const wrapped = `(function anonymous(require, module, exports) {\n${CODE}\n})`;
  const fn = vm.runInThisContext(wrapped, { filename: "plugin:siyuan-export-md" });
  const requireFn = (name) => {
    if (name === "siyuan") return fakeSiyuan;
    return require(name);
  };
  fn(requireFn, moduleObj, moduleObj.exports);
  return moduleObj.exports;
}

const exportsObj = loadPlugin();

section("插件契约");
check("module.exports.default 是构造函数", typeof exportsObj.default === "function", typeof exportsObj.default);
const P = exportsObj.default;
check("原型继承 Plugin", Object.create(P.prototype) instanceof FakePlugin);
check("暴露自测内部函数", !!exportsObj.__internals);

(async () => {
  const fakeApp = { id: "app-stub" };
  const plugin = new P({ app: fakeApp });
  check("构造函数把 options 转发给基类", plugin.app === fakeApp, String(plugin.app));
  await plugin.onload();
  const names = plugin.calls.map((c) => c[0]);
  check("onload 注册顶栏", names.includes("addTopBar"));
  check("onload 注册命令", names.includes("addCommand"));
  check(
    "默认选项里没有 Markdown 专属开关",
    !("mathFormat" in exportsObj.__internals.DEFAULT_OPTIONS) &&
      !("tableFormat" in exportsObj.__internals.DEFAULT_OPTIONS) &&
      !("hugoRawHtmlShortcode" in exportsObj.__internals.DEFAULT_OPTIONS),
    JSON.stringify(exportsObj.__internals.DEFAULT_OPTIONS)
  );

  /* ---------------------------------------------------------------- *
   * 2. 纯函数
   * ---------------------------------------------------------------- */
  const I = exportsObj.__internals;

  section("公式容器（纯 HTML）");
  check("LaTeX 空白折叠", I.normalizeLatex("  a_b =\n c  ") === "a_b = c", I.normalizeLatex("  a_b =\n c  "));
  check(
    "行内公式输出 data-latex",
    I.mathInline("x_i") === '<span class="math-inline" data-latex="x_i">x_i</span>',
    I.mathInline("x_i")
  );
  check(
    "块级公式输出 math-block",
    I.mathBlock("a & b") === '<div class="math-block" data-latex="a &amp; b">a &amp; b</div>',
    I.mathBlock("a & b")
  );

  section("HTML 压缩（CommonMark 里 HTML 块遇空行即结束）");
  check(
    "正文连续空行折叠",
    I.compactHtml("<div>a</div>\n\n\n<div>b</div>") === "<div>a</div>\n<div>b</div>",
    JSON.stringify(I.compactHtml("<div>a</div>\n\n\n<div>b</div>"))
  );
  const preHtml = I.compactHtml("<pre><code>a\n\nb</code></pre>");
  check("代码块内空行不被删", !/\n[ \t]*\n/.test(preHtml), JSON.stringify(preHtml));
  check("代码块空行换成 &#32;", preHtml.includes("&#32;"), JSON.stringify(preHtml));

  section("命名与路径");
  check("slug 去掉非法字符", I.slugify("A/B: c?") === "A-B-c", I.slugify("A/B: c?"));
  const ascii = I.asciiFileName("截图 2024-01.png");
  check("资源名只留 ASCII 与扩展名", /^[A-Za-z0-9-]+\.png$/.test(ascii), ascii);
  check("纯中文资源名退化为 hash 名", /^asset-[a-z0-9]+\.png$/.test(I.asciiFileName("架构图.png")), I.asciiFileName("架构图.png"));

  const hugoFile = I.docPaths({ slug: "demo" }, { site: "hugo", hugoLayout: "file", hugoContentDir: "notes" });
  check("Hugo 单文件路径", hugoFile.mdPath === "content/notes/demo.md");
  check("Hugo 资源目录", hugoFile.assetDir === "static/siyuan/demo");
  check("Hugo 资源引用前缀", hugoFile.assetPrefix === "/siyuan/demo/");

  const bundle = I.docPaths({ slug: "demo" }, { site: "hugo", hugoLayout: "bundle" });
  check("Hugo page bundle 路径", bundle.mdPath === "content/posts/demo/index.md" && bundle.assetPrefix === "./");
  const hexo = I.docPaths({ slug: "demo" }, { site: "hexo" });
  check("Hexo 路径", hexo.mdPath === "source/_posts/demo.md" && hexo.assetPrefix === "demo/");

  section("类型归一");
  check("NodeParagraph → p", I.normalizeType("NodeParagraph") === "p");
  check("SQL 单字母保持不变", I.normalizeType("av") === "av");
  check("NodeCallout → callout", I.normalizeType("NodeCallout") === "callout");

  /* ---------------------------------------------------------------- *
   * 3. 端到端（假内核）
   * ---------------------------------------------------------------- */
  section("端到端导出");

  const DOMS = {
    b0: '<div data-node-id="b0" data-type="NodeToc"></div>',
    b1:
      '<div data-node-id="b1" data-type="NodeHeading" class="h2" data-subtype="h2">' +
      '<div contenteditable="true">标题 A</div><div class="protyle-attr" contenteditable="false">\u200b</div></div>',
    b2:
      '<div data-node-id="b2" data-type="NodeParagraph" class="p">' +
      '<div contenteditable="true">行内公式 <span data-type="inline-math" data-content="x_i">x_i</span> 与 <strong>粗体</strong></div>' +
      '<div class="protyle-attr" contenteditable="false">\u200b</div></div>',
    b3: '<div data-node-id="b3" data-type="NodeMathBlock" data-content="a_b = c"><div class="katex">a_b = c</div></div>',
    b4:
      '<div data-node-id="b4" data-type="NodeImage" class="img">' +
      '<img src="assets/pic.png" alt="图"><div class="protyle-attr" contenteditable="false">\u200b</div></div>',
    b5:
      '<div data-node-id="b5" data-type="NodeTable"><div class="table"><table>' +
      '<colgroup><col style="width:60px"><col></colgroup>' +
      '<thead><tr><th colspan="2">合并表头</th></tr></thead>' +
      '<tbody><tr><td rowspan="2">A</td><td>B</td></tr>' +
      '<tr><td><span data-type="inline-math" data-content="x_i">x_i</span></td></tr></tbody>' +
      "</table></div></div>",
    b6:
      '<div data-node-id="b6" data-type="NodeParagraph" class="p"><div contenteditable="true">' +
      '<span data-type="a" data-href="assets/报告.pdf" title="报告.pdf">报告.pdf</span></div></div>',
    b7:
      '<div data-node-id="b7" data-type="NodeList" data-subtype="o" class="list">' +
      '<div data-node-id="b7a" data-type="NodeListItem" class="li">' +
      '<div class="protyle-action protyle-action--order" contenteditable="false">1.</div>' +
      '<div data-node-id="b7ap" data-type="NodeParagraph" class="p"><div>第一条</div></div>' +
      '<div data-node-id="b7an" data-type="NodeList" data-subtype="u" class="list">' +
      '<div data-node-id="b7an1" data-type="NodeListItem" class="li">' +
      '<div class="protyle-action" contenteditable="false">•</div>' +
      '<div class="p"><div>嵌套项</div></div></div></div>' +
      '<div class="protyle-attr" contenteditable="false">\u200b</div></div>' +
      '<div data-node-id="b7b" data-type="NodeListItem" class="li">' +
      '<div class="protyle-action protyle-action--order" contenteditable="false">2.</div>' +
      '<div class="p"><div>第二条</div></div></div></div>',
    b8:
      '<div data-node-id="b8" data-type="NodeCodeBlock" data-subtype="js" class="code-block">' +
      '<div class="protyle-action" contenteditable="false"><span>js</span></div>' +
      '<div class="protyle-linenumber" contenteditable="false">1\n2\n3</div>' +
      '<pre class="hljs language-js"><code>const a = 1;\n\nconst b = 2;</code></pre></div>',
    q1:
      '<div data-node-id="q1" data-type="NodeQueryEmbed">' +
      '<div class="protyle-attr" contenteditable="false">\u200b</div></div>',
    b9:
      '<div data-node-id="b9" data-type="NodeParagraph" class="p"><div contenteditable="true">' +
      '<img src="assets/broken.png" alt="坏图"></div></div>'
  };

  const sqlRows = (stmt) => {
    if (/FROM blocks WHERE id = 'doc1'/.test(stmt)) {
      return [
        {
          id: "doc1",
          content: "测试文档",
          name: "",
          box: "box1",
          created: "20240101120000",
          updated: "20240102120000",
          tag: "#标签一 #标签二#",
          hpath: "/笔记本/测试文档"
        }
      ];
    }
    if (/parent_id = 'doc1'/.test(stmt)) {
      return [
        { id: "b0", type: "toc", subtype: "", sort: 1 },
        { id: "b1", type: "h", subtype: "h2", sort: 2 },
        { id: "b2", type: "p", subtype: "", sort: 3 },
        { id: "b3", type: "m", subtype: "", sort: 4 },
        { id: "b4", type: "img", subtype: "", sort: 5 },
        { id: "b5", type: "t", subtype: "", sort: 6 },
        { id: "b6", type: "p", subtype: "", sort: 7 },
        { id: "b7", type: "l", subtype: "o", sort: 8 },
        { id: "b8", type: "c", subtype: "js", sort: 9 }
      ];
    }
    // 思源 3.8.x 的 assets.path 是相对路径，文件在 data/assets/ 下
    if (/FROM assets WHERE name = 'pic.png'/.test(stmt)) return [{ path: "assets/pic.png", box: "box1" }];
    if (/FROM assets WHERE name = '报告.pdf'/.test(stmt)) return [{ path: "assets/报告.pdf", box: "box1" }];
    if (/FROM blocks WHERE id = 'doc2'/.test(stmt)) {
      return [
        {
          id: "doc2",
          content: "短代码文档",
          name: "",
          box: "box1",
          created: "20240101120000",
          updated: "20240101120000",
          tag: "",
          hpath: "/笔记本/短代码文档"
        }
      ];
    }
    if (/parent_id = 'doc2'/.test(stmt)) return [{ id: "q1", type: "query_embed", subtype: "", sort: 1 }];
    if (/FROM blocks WHERE id = 'doc3'/.test(stmt)) {
      return [
        {
          id: "doc3",
          content: "缺图文档",
          name: "",
          box: "box1",
          created: "20240101120000",
          updated: "20240101120000",
          tag: "",
          hpath: "/笔记本/缺图文档"
        }
      ];
    }
    if (/parent_id = 'doc3'/.test(stmt)) return [{ id: "b9", type: "p", subtype: "", sort: 1 }];
    return [];
  };

  const fakeFetch = async (url, init) => {
    const req = init && init.body ? JSON.parse(init.body) : {};
    const respond = (data) => ({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => ({ code: 0, msg: "", data })
    });

    if (url === "/api/query/sql") return respond(sqlRows(req.stmt));
    if (url === "/api/block/getChildBlocks") return respond([]);
    if (url === "/api/block/getBlockDOM") return respond({ dom: DOMS[req.id] || "" });
    if (url === "/api/file/getFile") {
      const binary = (bytes) => ({
        ok: true,
        status: 200,
        headers: { get: () => "application/octet-stream" },
        json: async () => ({ code: 1 }),
        arrayBuffer: async () => new Uint8Array(bytes).buffer
      });
      if (req.path === "/data/assets/pic.png") return binary([137, 80, 78, 71]);
      if (req.path === "/data/assets/报告.pdf") return binary([37, 80, 68, 70]); // %PDF
      return {
        ok: true,
        status: 200,
        headers: { get: () => "application/json" },
        json: async () => ({ code: 1, msg: "not found" })
      };
    }
    throw new Error("unexpected url " + url);
  };

  global.fetch = fakeFetch;

  const opts = { ...I.DEFAULT_OPTIONS, site: "hugo", hugoLayout: "file", headingDemote: true, headingStyle: "html" };

  const single = await I.exportDocument("doc1", opts, new I.AssetStore(), "笔记本");
  const content = single.content;
  console.log("\n--- 生成的内容（纯 HTML 正文） ---\n" + content + "\n--- end ---\n");

  check("Front Matter 标题", content.startsWith("---\ntitle: 测试文档\ndate: 2024-01-01"), content.slice(0, 60));
  check("Front Matter toc", content.includes("toc: true"));
  check("标签导出", content.includes("tags: [标签一, 标签二]"));
  check("分类取笔记本", content.includes("categories: [笔记本]"));
  check("正文包在 sy-doc 里", content.includes('<div class="sy-doc">'));

  check("标题输出 h3（h2 降一级），id 用块 id", content.includes('<h3 id="b1">标题 A</h3>'), content);
  check(
    "id 挂在块元素上（段落 / 表格）",
    content.includes('<p id="b2">') && content.includes('<div class="table-wrapper" id="b5">'),
    content
  );
  check(
    "段落是 <p>，行内公式与粗体为 HTML",
    content.includes('<p id="b2">行内公式 <span class="math-inline" data-latex="x_i">x_i</span> 与 <strong>粗体</strong></p>'),
    content
  );
  check("块级公式输出 math-block", content.includes('<div class="math-block" data-latex="a_b = c" id="b3">a_b = c</div>'));
  check("图片块输出 figure + 重写后的 src", content.includes('<figure class="sy-image" id="b4"><img src="/siyuan/测试文档/pic.png" alt="图"></figure>'), content);
  check("表格包进 table-wrapper", content.includes('<div class="table-wrapper" id="b5">'));
  check("表格保留 colspan", /colspan="2"/.test(content));
  check("表格保留 rowspan", /rowspan="2"/.test(content));
  check("表格保留 colgroup", content.includes("<colgroup>"));
  check("单元格行内公式转 data-latex", content.includes('<span class="math-inline" data-latex="x_i">x_i</span>'));
  check(
    "附件链接换成 <a> 且路径重写",
    /<a href="\/siyuan\/测试文档\/asset-[a-z0-9]+\.pdf" title="报告\.pdf">报告\.pdf<\/a>/.test(content),
    content
  );
  check("有序列表输出 <ol> + <li>，列表项带块 id", content.includes('<ol id="b7"><li id="b7a">第一条<ul id="b7an"><li id="b7an1">嵌套项</li></ul></li><li id="b7b">第二条</li></ol>'), content);
  check("代码块输出 pre/code", content.includes('<pre class="code-block" data-lang="js" id="b8"><code class="language-js">'), content);
  check("代码块语言取自 subType", content.includes('data-lang="js"'));
  check("目录输出 nav + 锚点", content.includes('<nav class="sy-toc">') && content.includes('<a href="#b1">标题 A</a>'), content);

  check("正文不再出现 Markdown 标题语法", !/^#{1,6} /m.test(content.split("---\n").pop()), content);
  check("正文不再出现 Markdown 图片语法", !content.includes("!["));
  check("正文不再出现 GFM 表格分隔行", !content.includes("| --- |"));
  check("正文不再出现 rawhtml 短代码", !content.includes("{{< rawhtml"));
  check("整篇没有连续空行（HTML 块才不会被截断）", !/\n[ \t]*\n/.test(content), content);
  check("HTML 模式开标签后不插空行", !content.includes('<div class="sy-doc">\n\n'), content);
  check("不残留编辑器私有属性", !/data-node-id|data-node-index|protyle-|contenteditable/.test(content), content);

  /* ---------------------------------------------------------------- *
   * 2.1 Markdown 标题模式
   * ---------------------------------------------------------------- */
  section("Markdown 标题模式");
  const md = await I.exportDocument("doc1", { ...opts, headingStyle: "markdown" }, new I.AssetStore(), "笔记本");
  const mdContent = md.content;
  console.log("\n--- 生成的内容（Markdown 标题 + HTML 正文） ---\n" + mdContent + "\n--- end ---\n");

  check(
    "标题输出 ###（h2 降一级），标题行内用 <a> 挂块 id",
    mdContent.includes('### <a id="b1"></a>标题 A'),
    mdContent
  );
  check("Markdown 标题前后有空行", /\n\n### <a id="b1"><\/a>标题 A\n\n/.test(mdContent), mdContent);
  check("目录锚点指向标题 id", mdContent.includes('<a href="#b1">标题 A</a>'), mdContent);
  check("其余块仍是 HTML", mdContent.includes('<p id="b2">行内公式 <span class="math-inline"'), mdContent);
  check("Markdown 模式不再输出 <h3> 标题", !mdContent.includes("<h3"), mdContent);
  check("开标签后有空行（首个块是标题时不会被 HTML 块吞掉）", mdContent.includes('<div class="sy-doc">\n\n'), mdContent);

  const result = await I.exportSite(["doc1"], opts, "笔记本", null);
  const zipText = Buffer.from(result.zip).toString("utf8");
  check("zip 内含内容文件（仍是 .md）", zipText.includes("content/notes/测试文档.md"));
  check("zip 内含资源", zipText.includes("static/siyuan/测试文档/pic.png"));
  check("zip 内含 HTML 报告", zipText.includes("SIYUAN-EXPORT-REPORT.html"));
  check("资源二进制已进包", Buffer.from(result.zip).includes(Buffer.from([137, 80, 78, 71])));
  check("资源计数", result.assetCount === 2, String(result.assetCount));
  /* 直接写入文件夹走的是 files 列表，不经 zip */
  check("导出结果暴露 files 列表", Array.isArray(result.files) && result.files.length === result.fileCount, String(result.fileCount));
  check(
    "files 每项带相对路径与字节",
    result.files.every((f) => typeof f.path === "string" && f.data && typeof f.data.length === "number")
  );
  check(
    "files 路径与 zip 内容一致",
    result.files.some((f) => f.path === "content/notes/测试文档.md") &&
      result.files.some((f) => f.path === "static/siyuan/测试文档/pic.png")
  );

  /* ---------------------------------------------------------------- *
   * 3.1 失败降级
   * ---------------------------------------------------------------- */
  section("失败降级");
  const plainDoc = await I.exportDocument("doc2", opts, new I.AssetStore(), "笔记本");
  check("查询嵌入占位是 HTML", plainDoc.content.includes('<div class="sy-placeholder"'));
  check("正文不带来源注释（块 id 已挂在元素上）", !plainDoc.content.includes("<!-- siyuan:"), plainDoc.content);
  check("不再有隐藏的调试开关", !("debugComment" in I.DEFAULT_OPTIONS), JSON.stringify(I.DEFAULT_OPTIONS));

  const brokenStore = new I.AssetStore();
  const broken = await I.exportDocument("doc3", opts, brokenStore, "笔记本");
  check("资源读不到时保留原相对路径", broken.content.includes('src="assets/broken.png"'), broken.content);
  check(
    "资源读不到时记录到失败清单",
    brokenStore.failures.some((w) => w.includes("资源未找到")),
    JSON.stringify(brokenStore.failures)
  );

  section("renderElement 单元");
  const el = new DOMParser().parseFromString(
    '<div data-type="NodeParagraph"><div contenteditable="true">A<em>B</em><span data-type="tag">#C#</span></div></div>',
    "text/html"
  ).body.firstElementChild;
  const ctx = { opts: { ...I.DEFAULT_OPTIONS }, warnings: [], headings: [], headingIds: new Map(), inHtml: true };
  const html = I.renderElement(el, ctx);
  check("行内 em 保留语义", html === "<p>A<em>B</em><span class=\"tag\">#C#</span></p>", html);

  section("当前文档 id");
  check(
    "订阅了编辑器事件",
    ["loaded-protyle-static", "switch-protyle", "click-editorcontent", "destroy-protyle"].every(
      (name) => (plugin.eventBus.handlers[name] || []).length === 1
    ),
    Object.keys(plugin.eventBus.handlers).join(",")
  );
  plugin.eventBus.emit("switch-protyle", { protyle: { block: { rootID: "20240101120000-aaaaaaa" } } });
  check("切换到新文档后取新 id", plugin.currentDocId() === "20240101120000-aaaaaaa", plugin.currentDocId());
  plugin.eventBus.emit("loaded-protyle-static", { protyle: { block: { rootID: "20240101120100-bbbbbbb" } } });
  check("加载事件也更新", plugin.currentDocId() === "20240101120100-bbbbbbb", plugin.currentDocId());
  check(
    "命令上下文传入的 protyle 优先",
    plugin.currentDocId({ block: { rootID: "20240101120200-ccccccc" } }) === "20240101120200-ccccccc"
  );
  check(
    "缩进到子块时仍取文档 rootID",
    I.idFromProtyle({ block: { id: "20240101120300-ddddddd", rootID: "20240101120400-eeeeeee" } }) ===
      "20240101120400-eeeeeee"
  );
  plugin.eventBus.emit("destroy-protyle", { protyle: plugin.activeProtyle });
  check("关闭当前文档后清空跟踪", plugin.activeProtyle === null);
  check("没有 protyle 时不让非法 id 通过", !I.currentDocId({ block: { rootID: "not-a-doc" } }, null));
  plugin.eventBus.emit("switch-protyle", { protyle: { block: { rootID: "20240101120500-fffffff" } } });

  /* 多个标签页：DOM 里有两个标题，隐藏的那个不是当前文档 */
  const savedBody = document.body.innerHTML;
  document.body.innerHTML = [
    '<div class="protyle" style="display:none"><div class="protyle-title" data-node-id="20240101120600-ggggggg"></div></div>',
    '<div class="protyle"><div class="protyle-title" data-node-id="20240101120700-hhhhhhh"></div></div>'
  ].join("");
  check("DOM 兜底取可见的那篇", I.currentDocId(null, null) === "20240101120700-hhhhhhh", I.currentDocId(null, null));
  const hiddenProtyleEl = document.createElement("div");
  hiddenProtyleEl.style.display = "none";
  check(
    "跟踪到后台标签页时按可见文档兜底",
    I.currentDocId(null, { block: { rootID: "20240101120800-iiiiiii" }, element: hiddenProtyleEl }) ===
      "20240101120700-hhhhhhh",
    I.currentDocId(null, { block: { rootID: "20240101120800-iiiiiii" }, element: hiddenProtyleEl })
  );
  document.body.innerHTML = savedBody;

  console.log(`\n通过 ${passed}，失败 ${failed}`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
