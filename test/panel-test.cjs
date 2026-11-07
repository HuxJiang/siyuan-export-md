"use strict";

/**
 * 控制页数据层自检（纯 Node，不需要 jsdom / 思源）：
 *   - doc-tree：hpath → 层级、父文档同时是页面、统计与搜索
 *   - export-log：记录清洗、路径展示、持久化读写
 */

const path = require("path");
const ROOT = path.resolve(__dirname, "..");

let failed = 0;
let passed = 0;
function check(name, cond, detail) {
  if (cond) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${name}${detail ? " → " + detail : ""}`);
  }
}

const tree = require(path.join(ROOT, "src", "doc-tree.js"));
const logMod = require(path.join(ROOT, "src", "export-log.js"));

/* ---------------------------- doc-tree ---------------------------- */

const notebooks = [
  { id: "box1", name: "笔记", closed: false },
  { id: "box2", name: "空本", closed: true }
];
const docsByBox = {
  box1: [
    { id: "d1", content: "编程", hpath: "/编程" },
    { id: "d2", content: "Python", hpath: "/编程/Python" },
    { id: "d3", content: "并发", hpath: "/编程/Go/并发" }
  ],
  box2: []
};

const built = tree.buildDocTree(notebooks, docsByBox);
check("两个笔记本都建了根节点", built.length === 2, String(built.length));

const programming = built[0].children[0];
check("顶级目录名来自 hpath 首段", programming && programming.name === "编程", programming && programming.name);
check("父文档节点自身也是页面", programming && programming.doc && programming.doc.id === "d1");
check("父文档下有两个子节点", programming && programming.children.length === 2, programming && String(programming.children.length));

const goNode = programming.children.find((node) => node.name === "Go");
check("中间目录没有文档时 doc 为空", goNode && !goNode.doc);
check("更深一层的文档挂到了正确父节点", goNode && goNode.children[0].doc.id === "d3");

check("页面总数含父文档", tree.countTreeDocs(built[0]) === 3, String(tree.countTreeDocs(built[0])));
check("空笔记本页面数为 0", tree.countTreeDocs(built[1]) === 0);

check("搜索命中子文档路径", tree.matchesNode(built[0], "python") === true);
check("搜索命中中文标题", tree.matchesNode(built[0], "并发") === true);
check("搜索不命中时整支隐藏", tree.matchesNode(built[0], "不存在的关键词") === false);
check("空搜索保留整棵树", tree.matchesNode(built[0], "") === true);

check("能反查文档所属笔记本", tree.notebookNameOfDoc(built, "d3") === "笔记", tree.notebookNameOfDoc(built, "d3"));
check("未知名文档返回空笔记本名", tree.notebookNameOfDoc(built, "nope") === "");

const collected = [];
tree.walkDocs(built[0], (doc) => collected.push(doc.id));
check(
  "walkDocs 收集全部页面",
  collected.length === 3 && ["d1", "d2", "d3"].every((id) => collected.indexOf(id) !== -1),
  collected.join(",")
);

/* --------------------------- export-log --------------------------- */

const normalized = logMod.normalizeStore({
  version: 1,
  docs: {
    "20240101000000-abcdefg": {
      docId: "20240101000000-abcdefg",
      title: "编程",
      mode: "folder",
      targetDir: "C:\\out",
      fullPath: "C:\\out\\content\\notes\\编程.md",
      exportedAt: 1735689600000
    },
    bad: { title: "没有 docId 的记录应被丢掉" },
    "20240101000000-hijklmn": {
      docId: "20240101000000-hijklmn",
      mode: "unknown",
      site: "unknown",
      zipName: "siyuan-hugo-1.zip",
      relPath: "content/notes/Go.md"
    }
  }
});
check("清洗后只保留合法记录", Object.keys(normalized.docs).length === 2, String(Object.keys(normalized.docs).length));
check("未知 mode 归一为 zip", normalized.docs["20240101000000-hijklmn"].mode === "zip");
check("未知 site 归一为 hugo", normalized.docs["20240101000000-hijklmn"].site === "hugo");
check("空数据返回空表", Object.keys(logMod.normalizeStore(null).docs).length === 0);

check(
  "文件夹模式展示绝对路径",
  logMod.pathOf(normalized.docs["20240101000000-abcdefg"]) === "C:\\out\\content\\notes\\编程.md",
  logMod.pathOf(normalized.docs["20240101000000-abcdefg"])
);
check(
  "压缩包模式展示包名 + 包内路径",
  logMod.pathOf(normalized.docs["20240101000000-hijklmn"]) === "siyuan-hugo-1.zip › content/notes/Go.md",
  logMod.pathOf(normalized.docs["20240101000000-hijklmn"])
);

/* ExportLog 持久化 */

function fakePlugin(initial) {
  const store = { exportRecords: initial };
  return {
    async loadData(key) {
      return store[key] === undefined ? null : store[key];
    },
    async saveData(key, value) {
      store[key] = value;
    },
    snapshot(key) {
      return store[key];
    }
  };
}

(async () => {
  const plugin = fakePlugin(null);
  const log = new logMod.ExportLog(plugin);
  await log.load();
  check("首次加载没有记录", log.size() === 0);

  await log.recordMany([
    {
      docId: "d1",
      title: "编程",
      hpath: "/编程",
      site: "hugo",
      mode: "folder",
      relPath: "content/notes/编程.md",
      targetDir: "/tmp/out",
      fullPath: "/tmp/out/content/notes/编程.md",
      exportedAt: 1735689600000
    },
    { docId: "", title: "无效记录" }
  ]);
  await log.saving;
  check("只写入有效记录", log.size() === 1, String(log.size()));
  check("按文档 id 能取回记录", log.get("d1") && log.get("d1").fullPath.indexOf("编程.md") !== -1);
  check("记录写进了插件数据", plugin.snapshot("exportRecords").docs.d1.title === "编程");

  await log.recordMany([
    {
      docId: "d1",
      title: "编程（改名）",
      mode: "zip",
      zipName: "siyuan-hugo-2.zip",
      relPath: "content/notes/编程.md",
      exportedAt: 1735689700000
    }
  ]);
  await log.saving;
  check("重复导出覆盖为最新一次", log.get("d1").title === "编程（改名）" && log.get("d1").mode === "zip");

  const reloaded = new logMod.ExportLog(plugin);
  await reloaded.load();
  check("重新加载能读回已存记录", reloaded.size() === 1 && reloaded.get("d1").zipName === "siyuan-hugo-2.zip");

  await reloaded.clear();
  await reloaded.saving;
  check("清空后没有记录", reloaded.size() === 0);

  console.log(`\n通过 ${passed}，失败 ${failed}`);
  process.exit(failed ? 1 : 0);
})();
