/**
 * 本地自测（无需思源实例）
 *
 *   node test/self-test.cjs
 *
 * 1) 按 SiYuan 真实加载方式（window.eval + module.exports.default）验证插件契约；
 * 2) 用假内核 API 跑一遍端到端导出，检查公式/表格/资源/zip 产物；
 * 3) 校验若干纯函数（kramdown 清洗、标题降级、ASCII 资源名、Front Matter）。
 */

"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
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

  /* ---------------------------------------------------------------- *
   * 2. 纯函数
   * ---------------------------------------------------------------- */
  const I = exportsObj.__internals;

  section("kramdown 清洗");
  const raw =
    "- 一级 {: id=\"20240101120000-abc1234\"}\n  - 二级 ((20240101120000-def5678 \"锚文字\"))\n\n" +
    "公式引用 ((20240101120000-hij9012)) 结束\n\n" +
    "```ts\nconst a = 1;\n```";
  const cleaned = I.cleanKramdown(raw);
  check("去掉 IAL 私有属性", !cleaned.includes("{:"), cleaned);
  check("块引用保留锚文字", cleaned.includes("锚文字"));
  check("无锚文字块引用被清掉", !cleaned.includes("hij9012"));
  check("代码围栏保持完整", cleaned.includes("```ts") && cleaned.includes("const a = 1;"));

  section("公式转换（data-latex 契约）");
  const md = [
    "行内：$x_i$ 与价格 $5 和 $10 元，还有 $a_b$。",
    "",
    "$$",
    "\\begin{aligned}",
    "V(s) &= \\sum_a \\pi(a|s) Q(s,a) \\\\",
    "\\end{aligned}",
    "$$",
    "",
    "代码里的 $x$ 不应转换：",
    "",
    "```js",
    "const p = `$x$`;",
    "const q = '$y$';",
    "```",
    ""
  ].join("\n");
  const out = I.applyMathFormat(md, "data-latex");
  check(
    "行内公式转 math-inline",
    out.includes('<span class="math-inline" data-latex="x_i">x\\_i</span>'),
    out
  );
  check("行内公式下划线已转义", out.includes("x\\_i"));
  check("金额不被当成公式", out.includes("$5 和 $10"));
  check(
    "块级公式转 math-block",
    out.includes(
      '<div class="math-block" data-latex="\\begin{aligned} V(s) &amp;= \\sum_a \\pi(a|s) Q(s,a) \\\\ \\end{aligned}">'
    ),
    out
  );
  check("代码围栏内公式不转换", out.includes("`$x$`") && out.includes("'$y$'"));

  section("空行整理");
  const messy = "a\n\n\n\nb\n\n```\nc\n\n\nd\n```\n";
  const tidy = I.normalizeMarkdownWhitespace(messy);
  check("正文连续空行折叠", tidy.includes("a\n\nb"));
  check("代码块内空行保留", tidy.includes("c\n\n\nd"));

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

  const KRAMDOWN = {
    b1: "# 标题 A",
    b2: "行内公式 $x_i$ 与 **粗体**",
    b3: "$$\na_b = c\n$$",
    b4: "![图](assets/pic.png)",
    b5: "| a | b |\n| --- | --- |\n| 1 | 2 |",
    b6: "[报告.pdf](assets/报告.pdf \"报告.pdf\")"
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
        { id: "b1", type: "h", subtype: "h2", sort: 1 },
        { id: "b2", type: "p", subtype: "", sort: 2 },
        { id: "b3", type: "m", subtype: "", sort: 3 },
        { id: "b4", type: "img", subtype: "", sort: 4 },
        { id: "b5", type: "t", subtype: "", sort: 5 },
        { id: "b6", type: "p", subtype: "", sort: 6 }
      ];
    }
    // 思源 3.8.x 的 assets.path 是相对路径，文件在 data/assets/ 下
    if (/FROM assets WHERE name = 'pic.png'/.test(stmt)) {
      return [{ path: "assets/pic.png", box: "box1" }];
    }
    if (/FROM assets WHERE name = '报告.pdf'/.test(stmt)) {
      return [{ path: "assets/报告.pdf", box: "box1" }];
    }
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
    if (url === "/api/block/getBlockKramdown") return respond({ kramdown: KRAMDOWN[req.id] || "" });
    if (url === "/api/block/getBlockDOM") return respond({ dom: `<div data-node-id="${req.id}"><p>x</p></div>` });
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

  const opts = {
    ...I.DEFAULT_OPTIONS,
    site: "hugo",
    hugoLayout: "file",
    tableFormat: "gfm",
    mathFormat: "data-latex",
    headingDemote: true
  };

  const result = await I.exportSite(["doc1"], opts, "笔记本", null);
  const mdEntry = result.zip ? null : null;
  const mdPath = "content/notes/测试文档.md";

  // 从 zip 里取回 markdown：直接扫描字节，验证路径与内容都已写入
  const zipText = Buffer.from(result.zip).toString("utf8");
  check("zip 内含 markdown", zipText.includes(mdPath), mdPath);
  check("zip 内含资源", zipText.includes("static/siyuan/测试文档/pic.png"));
  check("zip 内含报告", zipText.includes("SIYUAN-EXPORT-REPORT.md"));
  check("资源二进制已进包", Buffer.from(result.zip).includes(Buffer.from([137, 80, 78, 71])));

  // 重新导出单篇文档，直接检查 markdown 文本
  const single = await I.exportDocument("doc1", opts, new I.AssetStore(), "笔记本");
  const content = single.content;
  console.log("\n--- 生成的 markdown ---\n" + content + "\n--- end ---\n");

  check("Front Matter 标题", content.startsWith('---\ntitle: 测试文档\ndate: 2024-01-01'));
  check("Front Matter toc", content.includes("toc: true"));
  check("标签导出", content.includes("tags: [标签一, 标签二]"));
  check("分类取笔记本", content.includes("categories: [笔记本]"));
  check("标题降一级（h2 → h3）", content.includes("### 标题 A"), content.split("\n").find((l) => l.startsWith("#")));
  check("行内公式输出 data-latex", content.includes('<span class="math-inline" data-latex="x_i">x\\_i</span>'));
  check("块级公式输出 math-block", content.includes('<div class="math-block" data-latex="a_b = c">a_b = c</div>'));
  check("图片路径重写到 static", content.includes("![图](/siyuan/测试文档/pic.png)"), content);
  check("资源文件名 ASCII", content.includes("pic.png"));
  check("GFM 表格保留", content.includes("| a | b |"));
  check("附件链接被重写", /\[报告\.pdf\]\(\/siyuan\/测试文档\/asset-[a-z0-9]+\.pdf "报告\.pdf"\)/.test(content), content);
  check("资源相对路径已解析（图片可读）", result.assetCount === 2, String(result.assetCount));
  check("附件二进制已进包", Buffer.from(result.zip).includes(Buffer.from([37, 80, 68, 70])));

  /* ---------------------------------------------------------------- *
   * 4. 表格 HTML / callout 分支（需要 DOMParser，缺失时跳过）
   * ---------------------------------------------------------------- */
  section("DOM 分支");
  if (typeof DOMParser === "undefined") {
    console.log("  skip 当前 Node 无 DOMParser，表格 HTML 与 callout 分支未在此验证（需在思源内实测）");
  } else {
    check("DOMParser 可用", true);
  }

  console.log(`\n通过 ${passed}，失败 ${failed}`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
