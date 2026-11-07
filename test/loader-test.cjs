"use strict";

/**
 * 加载器静态自检（不需要 jsdom、不需要思源）：
 *   1. src/ 里每个相对 require 都能解析到真实文件（少文件插件会在运行时崩）；
 *   2. 模块图无环（这些模块在文件顶部做 const {…} = require(…)，成环会拿到 undefined）；
 *   3. 根 index.js 指向的入口存在。
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");

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

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}

function rel(file) {
  return path.relative(ROOT, file).split(path.sep).join("/");
}

/** 与根 index.js 里的 resolveRelative 保持同一套规则 */
function resolveRelative(fromRel, spec) {
  const dir = fromRel.includes("/") ? fromRel.slice(0, fromRel.lastIndexOf("/")) : "";
  const parts = (dir ? dir + "/" : "").split("/").filter(Boolean);
  for (const seg of spec.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg !== "." && seg !== "") parts.push(seg);
  }
  let p = parts.join("/");
  if (!/\.js$/.test(p)) p += ".js";
  return p;
}

const files = walk(SRC);
const graph = new Map();
let edges = 0;

for (const file of files) {
  const key = rel(file);
  const code = fs.readFileSync(file, "utf8");
  const deps = [];
  for (const m of code.matchAll(/require\(\s*["']([^"']+)["']\s*\)/g)) {
    const spec = m[1];
    if (!spec.startsWith(".")) continue; // "siyuan" 由思源提供
    const target = resolveRelative(key, spec);
    deps.push(target);
    edges += 1;
    check(`${key} → ${spec}`, fs.existsSync(path.join(ROOT, target)), target);
  }
  graph.set(key, deps);
}

check("模块数量", files.length > 0, `${files.length} 个`);

const visiting = new Set();
const done = new Set();
const cycles = [];
function dfs(node, trail) {
  if (done.has(node)) return;
  if (visiting.has(node)) {
    cycles.push(trail.concat(node).join(" → "));
    return;
  }
  visiting.add(node);
  for (const next of graph.get(node) || []) {
    if (graph.has(next)) dfs(next, trail.concat(node));
  }
  visiting.delete(node);
  done.add(node);
}
for (const node of graph.keys()) dfs(node, []);

check("模块图无环", cycles.length === 0, cycles.join("; "));

const loader = fs.readFileSync(path.join(ROOT, "index.js"), "utf8");
const entry = (loader.match(/var ENTRY\s*=\s*["']([^"']+)["']/) || [])[1];
check("index.js 声明入口", !!entry, entry);
check("入口文件存在", !!entry && fs.existsSync(path.join(ROOT, entry)), entry);

console.log(`\n${files.length} 个模块，${edges} 条相对依赖；通过 ${passed}，失败 ${failed}`);
process.exit(failed ? 1 : 0);
