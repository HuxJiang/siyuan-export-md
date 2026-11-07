"use strict";

/**
 * 输出通道自检：直接写入文件夹（桌面版 fs 通道）
 *
 *   node test/output-test.cjs
 *
 * 用 global.window.require = require 模拟 Electron 渲染进程，
 * 在临时目录里真实落盘，验证相对路径、覆盖、越界拦截与默认目录。
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT = path.join(ROOT, "src", "output.js");

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

/* 非 Electron 环境：没有 window.require */
check("无 window.require 时不可写盘", !require(OUTPUT).isDesktopWritable());

/* 模拟 Electron 渲染进程 */
global.window = { require };

const O = require(OUTPUT);

check("有 window.require 时可写盘", O.isDesktopWritable());
check("展开 ~", O.expandHome("~/siyuan-export") === path.join(os.homedir(), "siyuan-export"), O.expandHome("~/siyuan-export"));
check("普通路径不展开", O.expandHome("C:\\tmp\\x") === "C:\\tmp\\x");
check("默认目录可用", !!O.defaultOutputDir(), O.defaultOutputDir());

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sy-export-"));
try {
  const files = [
    { path: "content/notes/a.md", data: new TextEncoder().encode("# hello") },
    { path: "static/siyuan/a/pic.png", data: new Uint8Array([137, 80, 78, 71]) },
    { path: "SIYUAN-EXPORT-REPORT.html", data: new TextEncoder().encode("<html></html>") },
    { path: "../escape.txt", data: new TextEncoder().encode("nope") }
  ];
  const merged = path.join(tmp, "site");
  const wrote = O.writeFilesToFolder(merged, files, null);

  check("返回目标目录", wrote.dir === path.resolve(merged), wrote.dir);
  check("写入 3 个文件", wrote.written === 3, String(wrote.written));
  check("越界路径被跳过", wrote.skipped.length === 1 && wrote.skipped[0] === "../escape.txt", wrote.skipped.join(","));
  check("嵌套目录自动创建", fs.existsSync(path.join(merged, "content", "notes", "a.md")));
  check("文档内容正确", fs.readFileSync(path.join(merged, "content", "notes", "a.md"), "utf8") === "# hello");
  check("二进制原样落盘", Buffer.from(fs.readFileSync(path.join(merged, "static", "siyuan", "a", "pic.png"))).equals(Buffer.from([137, 80, 78, 71])));
  check("报告落在根目录", fs.existsSync(path.join(merged, "SIYUAN-EXPORT-REPORT.html")));
  check("越界文件没有写出", !fs.existsSync(path.join(tmp, "escape.txt")));

  /* 二次导出覆盖同名文件 */
  const again = O.writeFilesToFolder(merged, [
    { path: "content/notes/a.md", data: new TextEncoder().encode("# v2") }
  ]);
  check("同名文件被覆盖", fs.readFileSync(path.join(merged, "content", "notes", "a.md"), "utf8") === "# v2");
  check("覆盖也计数", again.written === 1);

  /* 相对路径应被拒绝 */
  let threw = "";
  try {
    O.writeFilesToFolder("relative/dir", []);
  } catch (e) {
    threw = e.message;
  }
  check("拒绝相对路径", /绝对路径/.test(threw), threw);

  /* 目标路径是文件时应报错 */
  const asFile = path.join(tmp, "plain.txt");
  fs.writeFileSync(asFile, "x");
  threw = "";
  try {
    O.writeFilesToFolder(asFile, []);
  } catch (e) {
    threw = e.message;
  }
  check("目标不是文件夹时报错", /不是文件夹/.test(threw), threw);

  /* 进度回调按文件递增 */
  const progress = [];
  O.writeFilesToFolder(path.join(tmp, "prog"), files.slice(0, 2), (done, total, rel) => progress.push(`${done}/${total}:${rel}`));
  check("进度回调可用", progress.length === 2 && progress[1].startsWith("2/2"), progress.join(" | "));
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(`\n通过 ${passed}，失败 ${failed}`);
process.exit(failed ? 1 : 0);
