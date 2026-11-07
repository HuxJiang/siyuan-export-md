var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/api.ts
function authHeaders(json) {
  const headers = {};
  const token = window?.siyuan?.config?.api?.token;
  if (token) {
    headers["Authorization"] = "Token " + token;
  }
  if (json) {
    headers["Content-Type"] = "application/json";
  }
  return headers;
}
async function api(url, data = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: authHeaders(true),
    body: JSON.stringify(data),
    credentials: "include"
  });
  if (!res.ok) {
    throw new Error(`[${url}] HTTP ${res.status}`);
  }
  const body = await res.json();
  if (body.code !== 0) {
    throw new Error(`[${url}] ${body.msg || "kernel api error"}`);
  }
  return body.data;
}
async function apiBinary(url, data) {
  const res = await fetch(url, {
    method: "POST",
    headers: authHeaders(true),
    body: JSON.stringify(data),
    credentials: "include"
  });
  if (!res.ok) {
    throw new Error(`[${url}] HTTP ${res.status}`);
  }
  const type = res.headers.get("Content-Type") || "";
  if (type.includes("application/json")) {
    const body = await res.json();
    throw new Error(`[${url}] ${body.msg || "kernel api error"}`);
  }
  return await res.arrayBuffer();
}
async function sql(stmt) {
  try {
    const data = await api("/api/query/sql", { stmt });
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.warn("[export] sql \u5931\u8D25", stmt, e);
    return [];
  }
}
async function getDocRow(docId) {
  const rows = await sql(`SELECT * FROM blocks WHERE id = '${docId}' LIMIT 1`);
  return rows[0] || null;
}
async function getChildBlocks(parentId) {
  try {
    const data = await api("/api/block/getChildBlocks", { id: parentId });
    const list2 = Array.isArray(data) ? data : data?.blocks || [];
    if (list2.length) {
      return list2.map((it) => ({
        id: it.id,
        type: it.type || it.dataType || "",
        subType: it.subType || it.subtype || ""
      }));
    }
  } catch (e) {
    console.warn("[export] getChildBlocks \u4E0D\u53EF\u7528\uFF0C\u4F7F\u7528 SQL \u515C\u5E95", e);
  }
  let rows = await sql(
    `SELECT id, type, subtype FROM blocks WHERE parent_id = '${parentId}' ORDER BY sort ASC, id ASC`
  );
  if (!rows.length) {
    rows = await sql(
      `SELECT id, type, subtype FROM blocks WHERE parent_id = '${parentId}' ORDER BY created ASC, id ASC`
    );
  }
  return rows.map((r) => ({ id: r.id, type: r.type, subType: r.subtype || "" }));
}
async function getBlockDom(id) {
  const data = await api("/api/block/getBlockDOM", { id });
  if (typeof data === "string") return data;
  return data?.dom || data?.html || "";
}
async function getBlockKramdown(id) {
  const data = await api("/api/block/getBlockKramdown", { id });
  if (typeof data === "string") return data;
  return data?.kramdown || "";
}
async function readWorkspaceFile(path) {
  return await apiBinary("/api/file/getFile", { path });
}
async function listNotebooks() {
  try {
    const data = await api("/api/notebook/lsNotebooks");
    const list2 = data?.notebooks || [];
    return list2.map((nb) => ({ id: nb.id, name: nb.name }));
  } catch (e) {
    return [];
  }
}
async function listDocs(box) {
  const rows = await sql(
    `SELECT id, content, hpath, path, box, created, updated, tag FROM blocks WHERE type = 'd' AND box = '${box}' ORDER BY created ASC, id ASC`
  );
  return rows;
}
var init_api = __esm({
  "src/api.ts"() {
  }
});

// src/core/paths.ts
function docPaths(doc, opts) {
  if (opts.site === "hugo") {
    const dir = `content/posts/${doc.slug}`;
    return { mdPath: `${dir}/index.md`, assetDir: dir, assetPrefix: "./" };
  }
  return {
    mdPath: `source/_posts/${doc.slug}.md`,
    assetDir: `source/_posts/${doc.slug}`,
    assetPrefix: `${doc.slug}/`
  };
}
function slugify(title) {
  const cleaned = (title || "untitled").trim().replace(/[\\/:*?"<>|#%&{}$!'@+`=\s]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return cleaned || "untitled";
}
var init_paths = __esm({
  "src/core/paths.ts"() {
  }
});

// src/core/assets.ts
var RE_REMOTE, AssetStore;
var init_assets = __esm({
  "src/core/assets.ts"() {
    init_api();
    init_paths();
    RE_REMOTE = /^(https?:)?\/\//i;
    AssetStore = class {
      constructor() {
        /** 压缩包内路径 → 二进制 */
        this.files = /* @__PURE__ */ new Map();
        /** 原始 src → 重写后的引用 */
        this.cache = /* @__PURE__ */ new Map();
        /** 已占用的文件名，避免同名覆盖 */
        this.used = /* @__PURE__ */ new Map();
      }
      getFiles() {
        return this.files;
      }
      /** 注册一个资源引用，返回 markdown/html 中应使用的路径 */
      async register(src, ctx) {
        const raw = (src || "").trim();
        if (!raw || RE_REMOTE.test(raw) || raw.startsWith("data:") || raw.startsWith("siyuan://")) {
          return raw;
        }
        if (/^\/(widgets|plugins|api|assets\/.*\/)\//.test(raw) || raw.endsWith("/")) {
          return raw;
        }
        const cached = this.cache.get(raw);
        if (cached) return cached;
        const clean = raw.split("#")[0].split("?")[0];
        const baseName = clean.split("/").pop() || "asset";
        if (!ctx.opts.copyAssets) {
          this.cache.set(raw, clean);
          return clean;
        }
        let wsPath;
        if (clean.startsWith("/data/")) wsPath = clean;
        else if (clean.startsWith("data/")) wsPath = "/" + clean;
        else if (clean.startsWith("/")) wsPath = "/data" + clean;
        else wsPath = "/data/" + clean.replace(/^\.\//, "");
        const paths = docPaths(ctx.doc, ctx.opts);
        const targetName = this.uniqueName(ctx.doc.slug, baseName);
        const zipPath = `${paths.assetDir}/${targetName}`;
        try {
          const buf = await readWorkspaceFile(wsPath);
          this.files.set(zipPath, new Uint8Array(buf));
          const newRef = paths.assetPrefix + encodeURI(targetName);
          this.cache.set(raw, newRef);
          return newRef;
        } catch (e) {
          ctx.warnings.push(`\u8D44\u6E90\u8BFB\u53D6\u5931\u8D25\uFF1A${wsPath}`);
          this.cache.set(raw, clean);
          return clean;
        }
      }
      uniqueName(slug, baseName) {
        const key = `${slug}/${baseName}`;
        const used = this.used.get(key);
        if (!used) {
          this.used.set(key, baseName);
          return baseName;
        }
        const dot = baseName.lastIndexOf(".");
        const stem = dot > 0 ? baseName.slice(0, dot) : baseName;
        const ext = dot > 0 ? baseName.slice(dot) : "";
        let index = 1;
        let name = `${stem}-${index}${ext}`;
        while (this.used.has(`${slug}/${name}`)) {
          index += 1;
          name = `${stem}-${index}${ext}`;
        }
        this.used.set(`${slug}/${name}`, name);
        return name;
      }
      /** 把一段 markdown 里的图片引用重写掉 */
      async rewriteMarkdown(md, ctx) {
        const re = /(!\[[^\]]*\]\()([^)\s]+)(\s+"[^"]*")?(\))/g;
        const matches = [];
        let m;
        while ((m = re.exec(md)) !== null) {
          matches.push({ full: m[0], prefix: m[1], src: m[2], title: m[3] || "", suffix: m[4] });
        }
        let out = md;
        for (const item of matches) {
          const newSrc = await this.register(item.src, ctx);
          if (newSrc !== item.src) {
            out = out.replace(item.full, `${item.prefix}${newSrc}${item.title}${item.suffix}`);
          }
        }
        const imgRe = /(<img[^>]*?src=")([^"]+)(")/g;
        const imgs = [];
        while ((m = imgRe.exec(out)) !== null) {
          imgs.push({ full: m[0], pre: m[1], src: m[2], post: m[3] });
        }
        for (const item of imgs) {
          const newSrc = await this.register(item.src, ctx);
          if (newSrc !== item.src) out = out.replace(item.full, `${item.pre}${newSrc}${item.post}`);
        }
        return out;
      }
      /** 把一段 HTML 里的 src/href 重写掉 */
      async rewriteHtml(html, ctx) {
        const re = /(src|href)="([^"]+)"/g;
        const items = [];
        let m;
        while ((m = re.exec(html)) !== null) {
          items.push({ full: m[0], attr: m[1], src: m[2] });
        }
        let out = html;
        for (const item of items) {
          const newSrc = await this.register(item.src, ctx);
          if (newSrc !== item.src) out = out.replace(item.full, `${item.attr}="${newSrc}"`);
        }
        return out;
      }
    };
  }
});

// src/core/kramdown.ts
function cleanKramdown(raw) {
  if (!raw) return "";
  let md = raw.replace(/\r\n/g, "\n");
  md = md.replace(RE_BLOCK_REF_WITH_TEXT, "$1");
  md = md.replace(RE_BLOCK_REF, "");
  md = md.replace(RE_IAL, "");
  md = md.replace(RE_SIYUAN_URL, "");
  md = md.split("\n").map((line) => line.replace(/[ \t]+$/, "")).join("\n");
  return md.trim();
}
async function blockMarkdown(fetchFn, id) {
  try {
    return cleanKramdown(await fetchFn(id));
  } catch (e) {
    console.warn("[export] \u83B7\u53D6 kramdown \u5931\u8D25", id, e);
    return "";
  }
}
var RE_BLOCK_REF_WITH_TEXT, RE_BLOCK_REF, RE_IAL, RE_SIYUAN_URL;
var init_kramdown = __esm({
  "src/core/kramdown.ts"() {
    RE_BLOCK_REF_WITH_TEXT = /\(\(\s*\d{14}-[0-9a-z]{7}\s+"([^"]*)"\s*\)\)/g;
    RE_BLOCK_REF = /\(\(\s*\d{14}-[0-9a-z]{7}\s*\)\)/g;
    RE_IAL = /\{:[^{}]*\}/g;
    RE_SIYUAN_URL = /siyuan:\/\/[^\s)"']+/g;
  }
});

// src/core/frontmatter.ts
function pad(n) {
  return n < 10 ? "0" + n : String(n);
}
function formatHexoDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function formatHugoDate(d) {
  const offsetMinutes = -d.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}
function yamlString(value) {
  const text = (value || "").replace(/\r?\n/g, " ");
  if (/[:#\[\]{}&*!|>'"%@`]/.test(text) || text.trim() !== text) {
    return `"${text.replace(/"/g, '\\"')}"`;
  }
  return text;
}
function yamlList(items) {
  const list2 = items.filter(Boolean).map((it) => yamlString(it));
  if (!list2.length) return "[]";
  return `[${list2.join(", ")}]`;
}
function buildFrontMatter(doc, opts) {
  const date = opts.site === "hugo" ? formatHugoDate(doc.created) : formatHexoDate(doc.created);
  const updated = opts.site === "hugo" ? formatHugoDate(doc.updated) : formatHexoDate(doc.updated);
  const lines = [
    "---",
    `title: ${yamlString(doc.title)}`,
    `date: ${date}`,
    `updated: ${updated}`
  ];
  if (doc.tags.length) {
    lines.push(`tags: ${yamlList(doc.tags)}`);
  } else {
    lines.push("tags: []");
  }
  if (doc.notebook) {
    lines.push(`categories: ${yamlList([doc.notebook])}`);
  }
  if (opts.site === "hugo") {
    lines.push("draft: false");
    lines.push(`slug: ${yamlString(doc.slug)}`);
  } else {
    lines.push("comments: false");
  }
  lines.push("---", "");
  return lines.join("\n");
}
var init_frontmatter = __esm({
  "src/core/frontmatter.ts"() {
  }
});

// src/core/dom.ts
function parseBlockDom(html) {
  if (!html) return null;
  const doc = new DOMParser().parseFromString(html, "text/html");
  return doc.body.firstElementChild;
}
function isEditorChrome(el) {
  const cls = el.getAttribute("class") || "";
  const tokens = cls.split(/\s+/).filter(Boolean);
  return DROP_CLASS_EXACT.some((name) => tokens.includes(name));
}
function sanitizeElement(root) {
  DROP_ATTRS.forEach((name) => root.removeAttribute(name));
  const cls = root.getAttribute("class");
  if (cls !== null) {
    const keep = cls.split(/\s+/).filter(Boolean).filter((token) => !DROP_CLASS_PREFIX.some((p) => token.startsWith(p)));
    if (keep.length) {
      root.setAttribute("class", keep.join(" "));
    } else {
      root.removeAttribute("class");
    }
  }
  if (root.tagName === "SPAN" && root.attributes.length === 0) {
    root.replaceWith(...Array.from(root.childNodes));
    return;
  }
  const children = Array.from(root.children);
  for (const child of children) {
    if (isEditorChrome(child)) {
      child.remove();
      continue;
    }
    sanitizeElement(child);
  }
}
function toCleanHtml(el) {
  const clone = el.cloneNode(true);
  DROP_ATTRS.forEach((name) => clone.removeAttribute(name));
  sanitizeElement(clone);
  return clone.outerHTML;
}
function textOf(el) {
  if (!el) return "";
  return el.innerText ?? el.textContent ?? "";
}
var DROP_ATTRS, DROP_CLASS_PREFIX, DROP_CLASS_EXACT;
var init_dom = __esm({
  "src/core/dom.ts"() {
    DROP_ATTRS = [
      "data-node-id",
      "data-render",
      "data-refcount",
      "data-eof",
      "data-subtype",
      "data-fold",
      "contenteditable",
      "spellcheck",
      "id"
    ];
    DROP_CLASS_PREFIX = ["protyle", "b3-", "fn__", "hljs", "siyuan"];
    DROP_CLASS_EXACT = ["protyle-action", "protyle-attr", "protyle-icons", "protyle-gutters", "protyle-breadcrumb"];
  }
});

// src/exporters/code.ts
function fence(code2, lang) {
  const body = code2.replace(/\n$/, "");
  const runs = body.match(/`+/g) || [];
  const maxRun = runs.reduce((max, run) => Math.max(max, run.length), 0);
  const marker = "`".repeat(Math.max(3, maxRun + 1));
  return `${marker}${lang || ""}
${body}
${marker}

`;
}
function ensureInfo(md, lang) {
  if (!lang) return md;
  const first = md.split("\n")[0];
  const m = /^(`{3,}|~{3,})(.*)$/.exec(first);
  if (!m) return md;
  if (m[2].trim()) return md;
  return md.replace(first, `${m[1]}${lang}`);
}
async function code(meta, ctx) {
  const lang = (meta.subType || "").trim();
  const md = await blockMarkdown(getBlockKramdown, meta.id);
  if (md && /^(`{3,}|~{3,})/.test(md)) {
    return `${ensureInfo(md, lang)}

`;
  }
  if (md) {
    return fence(md, lang);
  }
  try {
    const html = await getBlockDom(meta.id);
    const el = parseBlockDom(html);
    if (!el) return "";
    const codeEl = el.querySelector(".hljs") || el.querySelector("pre") || el.querySelector("code");
    return fence(textOf(codeEl || el), lang);
  } catch {
    return "";
  }
}
var init_code = __esm({
  "src/exporters/code.ts"() {
    init_api();
    init_kramdown();
    init_dom();
  }
});

// src/core/html.ts
function htmlFragment(raw, ctx, kind) {
  const body = (raw || "").trim();
  if (!body) return "";
  let out = body;
  if (!ctx.inHtml && ctx.opts.site === "hugo" && ctx.opts.hugoRawHtmlShortcode) {
    out = `{{< rawhtml >}}
${out}
{{< /rawhtml >}}`;
  }
  if (!ctx.inHtml && ctx.opts.debugComment) {
    out = `<!-- siyuan:${kind} -->
${out}`;
  }
  return `${out}

`;
}
var init_html = __esm({
  "src/core/html.ts"() {
  }
});

// src/exporters/database.ts
function domTableToGfm(tableEl) {
  const rows = Array.from(tableEl.querySelectorAll("tr"));
  if (!rows.length) return null;
  const matrix = [];
  for (const row of rows) {
    const cells = Array.from(row.querySelectorAll("td, th"));
    if (!cells.length) continue;
    if (cells.some((cell) => cell.hasAttribute("colspan") || cell.hasAttribute("rowspan"))) return null;
    matrix.push(cells.map((cell) => (cell.textContent || "").replace(/\s+/g, " ").replace(/\|/g, "\\|").trim()));
  }
  if (!matrix.length) return null;
  const cols = Math.max(...matrix.map((row) => row.length));
  const pad2 = (row) => {
    const filled = row.slice();
    while (filled.length < cols) filled.push("");
    return `| ${filled.join(" | ")} |`;
  };
  const head = pad2(matrix[0]);
  const sep = `| ${new Array(cols).fill("---").join(" | ")} |`;
  const body = matrix.slice(1).map(pad2).join("\n");
  return body ? `${head}
${sep}
${body}` : `${head}
${sep}`;
}
async function database(meta, ctx) {
  try {
    const dom = await getBlockDom(meta.id);
    const el = parseBlockDom(dom);
    if (!el) return "";
    const tableEl = el.querySelector("table");
    if (tableEl) {
      const gfm = domTableToGfm(tableEl);
      if (gfm) {
        ctx.warnings.push(`\u6570\u636E\u5E93\u5757\u8F6C\u4E3A\u8868\u683C\uFF1A${meta.id}\uFF08\u4EC5\u5BFC\u51FA\u5F53\u524D\u89C6\u56FE\u53EF\u89C1\u5B57\u6BB5\uFF09`);
        return `${gfm}

`;
      }
    }
    ctx.warnings.push(`\u6570\u636E\u5E93\u5757\u9000\u5316\u4E3A HTML\uFF1A${meta.id}`);
    const html = tableEl ? toCleanHtml(tableEl) : toCleanHtml(el);
    return htmlFragment(html, ctx, "database");
  } catch {
    return "";
  }
}
var init_database = __esm({
  "src/exporters/database.ts"() {
    init_api();
    init_dom();
    init_html();
  }
});

// src/exporters/diagram.ts
async function diagram(meta, ctx) {
  const sub = (meta.subType || "").toLowerCase();
  try {
    const dom = await getBlockDom(meta.id);
    const el = parseBlockDom(dom);
    const text = (el?.textContent || "").trim();
    if (sub.includes("mermaid") || /^(graph|flowchart|sequenceDiagram|classDiagram|gantt|pie)\b/.test(text)) {
      return fence(text, "mermaid");
    }
    if (el) {
      ctx.warnings.push(`\u56FE\u8868\u5757\u9000\u5316\u4E3A HTML\uFF1A${meta.id}`);
      return htmlFragment(toCleanHtml(el), ctx, "diagram");
    }
    return "";
  } catch {
    return "";
  }
}
var init_diagram = __esm({
  "src/exporters/diagram.ts"() {
    init_api();
    init_dom();
    init_html();
    init_code();
  }
});

// src/exporters/heading.ts
function resolveLevel(meta) {
  const sub = (meta.subType || "").toLowerCase();
  if (/^h[1-6]$/.test(sub)) return Number(sub[1]);
  if (/^[1-6]$/.test(sub)) return Number(sub);
  return 0;
}
async function heading(meta, ctx) {
  let level = resolveLevel(meta);
  let md = await blockMarkdown(getBlockKramdown, meta.id);
  if (!level) {
    try {
      const dom = await getBlockDom(meta.id);
      const matched = /class="[^"]*\b(h[1-6])\b/.exec(dom);
      level = matched ? Number(matched[1][1]) : 1;
    } catch {
      level = 1;
    }
  }
  if (!md) {
    return "";
  }
  md = md.replace(/^\s*#{1,6}\s*/, "").replace(/\n+/g, " ").trim();
  if (!md) return "";
  ctx.headings.push({ level, text: md });
  return `${"#".repeat(Math.max(1, Math.min(6, level)))} ${md}

`;
}
var init_heading = __esm({
  "src/exporters/heading.ts"() {
    init_api();
    init_kramdown();
  }
});

// src/exporters/htmlblock.ts
async function htmlBlock(meta, ctx) {
  try {
    const dom = await getBlockDom(meta.id);
    const el = parseBlockDom(dom);
    const raw = el ? el.innerHTML || el.outerHTML : dom;
    return htmlFragment(raw, ctx, "html-block");
  } catch {
    return "";
  }
}
var init_htmlblock = __esm({
  "src/exporters/htmlblock.ts"() {
    init_api();
    init_dom();
    init_html();
  }
});

// src/exporters/image.ts
async function image(meta, ctx) {
  const md = await blockMarkdown(getBlockKramdown, meta.id);
  if (md) return `${md}

`;
  try {
    const html = await getBlockDom(meta.id);
    const el = parseBlockDom(html);
    const img = el?.querySelector("img");
    if (!img) return "";
    const src = img.getAttribute("src") || "";
    const alt = img.getAttribute("alt") || img.getAttribute("title") || "";
    return src ? `![${alt}](${src})

` : "";
  } catch {
    return "";
  }
}
var init_image = __esm({
  "src/exporters/image.ts"() {
    init_api();
    init_kramdown();
    init_dom();
  }
});

// src/exporters/unknown.ts
async function unknownBlock(meta, ctx) {
  try {
    const dom = await getBlockDom(meta.id);
    const el = parseBlockDom(dom);
    if (!el) return "";
    let html = toCleanHtml(el);
    if (!el.querySelector("[data-node-id]")) {
      const children = await getChildBlocks(meta.id);
      if (children.length) {
        const inner = await renderChildren(children, { ...ctx, htmlOnly: true });
        html += inner;
      }
    }
    return htmlFragment(html, ctx, `unknown:${meta.type || "?"}`);
  } catch (e) {
    console.warn("[export] \u515C\u5E95 HTML \u5931\u8D25", meta, e);
    return "";
  }
}
var init_unknown = __esm({
  "src/exporters/unknown.ts"() {
    init_api();
    init_dom();
    init_html();
    init_render();
  }
});

// src/exporters/list.ts
function normalizeListMarkdown(md) {
  return md.split("\n").map((line) => {
    let out = line.replace(/^(\s*)[*+]\s+/, "$1- ");
    out = out.replace(/^(\s*)(-|\*)\s*\[([ xX])\]\s*/, (_all, indent, _marker, checked) => {
      return `${indent}- [${checked.toLowerCase() === "x" ? "x" : " "}] `;
    });
    return out;
  }).join("\n");
}
async function list(meta, ctx) {
  const md = await blockMarkdown(getBlockKramdown, meta.id);
  if (!md) return await unknownBlock(meta, ctx);
  return `${normalizeListMarkdown(md)}

`;
}
var init_list = __esm({
  "src/exporters/list.ts"() {
    init_api();
    init_kramdown();
    init_unknown();
  }
});

// src/exporters/math.ts
async function math(meta, ctx) {
  const md = await blockMarkdown(getBlockKramdown, meta.id);
  if (md) {
    if (md.includes("$$")) return `${md}

`;
    return `$$
${md}
$$

`;
  }
  try {
    const html = await getBlockDom(meta.id);
    const el = parseBlockDom(html);
    const tex = textOf(el).trim();
    return tex ? `$$
${tex}
$$

` : "";
  } catch {
    return "";
  }
}
var init_math = __esm({
  "src/exporters/math.ts"() {
    init_api();
    init_kramdown();
    init_dom();
  }
});

// src/exporters/media.ts
async function media(meta, ctx) {
  try {
    const dom = await getBlockDom(meta.id);
    const el = parseBlockDom(dom);
    if (!el) return "";
    const target = el.querySelector("video, audio, iframe");
    if (!target) return "";
    ctx.warnings.push(`\u5A92\u4F53\u6587\u4EF6\u9700\u81EA\u884C\u90E8\u7F72\uFF1A${meta.id}`);
    return htmlFragment(toCleanHtml(target), ctx, `media:${meta.type}`);
  } catch {
    return "";
  }
}
var init_media = __esm({
  "src/exporters/media.ts"() {
    init_api();
    init_dom();
    init_html();
  }
});

// src/exporters/paragraph.ts
async function paragraph(meta, ctx) {
  let md = await blockMarkdown(getBlockKramdown, meta.id);
  if (md) return `${md}

`;
  try {
    const dom = await getBlockDom(meta.id);
    const doc = new DOMParser().parseFromString(dom, "text/html");
    const el = doc.body.firstElementChild;
    if (!el) return "";
    const html = toCleanHtml(el);
    return html ? `${html}

` : "";
  } catch {
    return "";
  }
}
var init_paragraph = __esm({
  "src/exporters/paragraph.ts"() {
    init_api();
    init_kramdown();
    init_dom();
  }
});

// src/exporters/queryembed.ts
async function queryEmbed(meta, ctx) {
  ctx.warnings.push(`\u67E5\u8BE2\u5D4C\u5165\u5757\u672A\u5C55\u5F00\uFF1A${meta.id}`);
  return htmlFragment(
    `<div class="siyuan-query-embed" style="padding:12px;border:1px dashed #bbb;color:#888;font-size:13px">\u601D\u6E90\u67E5\u8BE2\u5D4C\u5165\u5757\uFF1A\u4F9D\u8D56\u52A8\u6001\u67E5\u8BE2\uFF0C\u9759\u6001\u7AD9\u70B9\u4E2D\u4E0D\u751F\u6548\u3002</div>`,
    ctx,
    "query-embed"
  );
}
var init_queryembed = __esm({
  "src/exporters/queryembed.ts"() {
    init_html();
  }
});

// src/exporters/quote.ts
async function quote(meta, ctx) {
  const md = await blockMarkdown(getBlockKramdown, meta.id);
  if (!md) return await unknownBlock(meta, ctx);
  const lines = md.split("\n").map((line) => line.startsWith(">") ? line : `> ${line}`.trimEnd());
  return `${lines.join("\n")}

`;
}
var init_quote = __esm({
  "src/exporters/quote.ts"() {
    init_api();
    init_kramdown();
    init_unknown();
  }
});

// src/exporters/superblock.ts
async function superblock(meta, ctx) {
  try {
    const children = await getChildBlocks(meta.id);
    const inner = await renderChildren(children, { ...ctx, htmlOnly: true, inHtml: true, depth: ctx.depth + 1 });
    if (!inner.trim()) return "";
    let layout = "block";
    try {
      const el = parseBlockDom(await getBlockDom(meta.id));
      const hint = el?.getAttribute("data-layout") || "";
      if (hint.includes("flex") || (el?.className || "").includes("flex")) layout = "flex";
    } catch {
    }
    const style = layout === "flex" ? "display:flex;gap:1rem;align-items:flex-start;flex-wrap:wrap" : "display:block";
    return htmlFragment(`<div class="sy-superblock" style="${style}">
${inner}</div>`, ctx, "superblock");
  } catch {
    return "";
  }
}
var init_superblock = __esm({
  "src/exporters/superblock.ts"() {
    init_api();
    init_api();
    init_dom();
    init_html();
    init_render();
  }
});

// src/exporters/table.ts
function hasSeparator(md) {
  const lines = md.split("\n").filter((line) => line.includes("|"));
  return lines.length >= 2 && SEPARATOR.test(lines[1]);
}
function ensureSeparator(md) {
  if (hasSeparator(md)) return md;
  const lines = md.split("\n");
  const headIndex = lines.findIndex((line) => line.includes("|"));
  if (headIndex < 0) return md;
  const cols = lines[headIndex].split("|").filter((cell, index, arr) => {
    if (index === 0 && cell.trim() === "") return false;
    if (index === arr.length - 1 && cell.trim() === "") return false;
    return true;
  }).length;
  const separator = `| ${new Array(Math.max(1, cols)).fill("---").join(" | ")} |`;
  lines.splice(headIndex + 1, 0, separator);
  return lines.join("\n");
}
async function table(meta, ctx) {
  const md = await blockMarkdown(getBlockKramdown, meta.id);
  if (md && md.includes("|")) {
    return `${ensureSeparator(md)}

`;
  }
  try {
    const html = await getBlockDom(meta.id);
    const el = parseBlockDom(html);
    if (!el) return "";
    const tableEl = el.querySelector("table") || el;
    ctx.warnings.push("\u8868\u683C\u65E0\u6CD5\u8F6C\u4E3A GFM\uFF0C\u6539\u7528 HTML \u8F93\u51FA");
    return `${toCleanHtml(tableEl)}

`;
  } catch {
    return "";
  }
}
var SEPARATOR;
var init_table = __esm({
  "src/exporters/table.ts"() {
    init_api();
    init_kramdown();
    init_dom();
    SEPARATOR = /^\s*\|?\s*:?-{2,}.*\|/;
  }
});

// src/exporters/toc.ts
async function toc(_meta, _ctx) {
  return `${TOC_PLACEHOLDER}

`;
}
function renderToc(headings) {
  if (!headings.length) return "";
  const top = Math.min(...headings.map((h) => h.level));
  return headings.map((h) => {
    const indent = "  ".repeat(Math.max(0, h.level - top));
    return `${indent}- ${h.text}`;
  }).join("\n");
}
var TOC_PLACEHOLDER;
var init_toc = __esm({
  "src/exporters/toc.ts"() {
    TOC_PLACEHOLDER = "<!--SY-TOC-PLACEHOLDER-->";
  }
});

// src/exporters/widget.ts
async function widget(meta, ctx) {
  try {
    const dom = await getBlockDom(meta.id);
    const el = parseBlockDom(dom);
    const iframe = el?.querySelector("iframe");
    if (iframe) {
      return htmlFragment(toCleanHtml(iframe), ctx, "widget-iframe");
    }
    const label = el?.getAttribute("data-widget") || el?.getAttribute("data-type") || "widget";
    ctx.warnings.push(`\u6302\u4EF6\u65E0\u6CD5\u9759\u6001\u5BFC\u51FA\uFF1A${meta.id}`);
    return htmlFragment(
      `<div class="siyuan-widget" data-block="${meta.id}" style="padding:12px;border:1px dashed #bbb;color:#888;font-size:13px">\u601D\u6E90\u6302\u4EF6\uFF08${label}\uFF09\uFF1A\u4F9D\u8D56\u601D\u6E90\u8FD0\u884C\u65F6\uFF0C\u9759\u6001\u7AD9\u70B9\u4E2D\u65E0\u6CD5\u6E32\u67D3\uFF0C\u6B64\u5904\u4E3A\u5360\u4F4D\u3002</div>`,
      ctx,
      "widget"
    );
  } catch {
    return "";
  }
}
var init_widget = __esm({
  "src/exporters/widget.ts"() {
    init_api();
    init_dom();
    init_html();
  }
});

// src/exporters/index.ts
function getExporter(type) {
  return REGISTRY[type] || unknownBlock;
}
var REGISTRY, fallbackExporter;
var init_exporters = __esm({
  "src/exporters/index.ts"() {
    init_code();
    init_database();
    init_diagram();
    init_heading();
    init_htmlblock();
    init_image();
    init_list();
    init_math();
    init_media();
    init_paragraph();
    init_queryembed();
    init_quote();
    init_superblock();
    init_table();
    init_toc();
    init_unknown();
    init_widget();
    REGISTRY = {
      p: paragraph,
      h: heading,
      l: list,
      i: list,
      b: quote,
      c: code,
      m: math,
      t: table,
      s: superblock,
      img: image,
      html: htmlBlock,
      widget,
      iframe: media,
      video: media,
      audio: media,
      av: database,
      toc,
      query_embed: queryEmbed,
      diagram
    };
    fallbackExporter = unknownBlock;
  }
});

// src/core/render.ts
async function renderChildren(metas, ctx) {
  let out = "";
  for (const meta of metas) {
    if (!meta || meta.type === "d") continue;
    out += await renderBlock(meta, ctx);
  }
  return out;
}
async function renderBlock(meta, ctx) {
  const type = (meta.type || "").toLowerCase();
  if (ctx.htmlOnly) {
    return await fallbackExporter(meta, ctx);
  }
  const exporter = getExporter(type);
  try {
    const chunk = await exporter(meta, ctx);
    return chunk || "";
  } catch (e) {
    ctx.warnings.push(`\u5757\u5BFC\u51FA\u5931\u8D25\uFF1A${type} ${meta.id}`);
    console.warn("[export] \u5757\u5BFC\u51FA\u5931\u8D25", meta, e);
    try {
      return await fallbackExporter(meta, ctx);
    } catch {
      return "";
    }
  }
}
var init_render = __esm({
  "src/core/render.ts"() {
    init_exporters();
  }
});

// src/core/document.ts
function parseSiyuanDate(value, fallback) {
  if (!value) return fallback;
  if (/^\d{14}$/.test(value)) {
    const y = Number(value.slice(0, 4));
    const m = Number(value.slice(4, 6));
    const d = Number(value.slice(6, 8));
    const hh = Number(value.slice(8, 10));
    const mm = Number(value.slice(10, 12));
    const ss = Number(value.slice(12, 14));
    return new Date(y, m - 1, d, hh, mm, ss);
  }
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? fallback : parsed;
}
async function buildDocInfo(docId, notebookName) {
  const row = await getDocRow(docId);
  const now = /* @__PURE__ */ new Date();
  const title = (row?.name || row?.content || "").trim() || (row?.hpath || "").split("/").pop() || "untitled";
  const tags = (row?.tag || "").split(/\s+/).map((t) => t.replace(/^#|#$/g, "").trim()).filter(Boolean);
  return {
    id: docId,
    title,
    hpath: row?.hpath || "",
    slug: slugify(title),
    box: row?.box || "",
    created: parseSiyuanDate(row?.created || "", now),
    updated: parseSiyuanDate(row?.updated || "", now),
    tags,
    notebook: notebookName
  };
}
function postProcess(body, headings) {
  let out = body.replace(/\r\n/g, "\n");
  if (out.includes(TOC_PLACEHOLDER)) {
    out = out.split(TOC_PLACEHOLDER).join(renderToc(headings));
  }
  out = out.split("\n").map((line) => line.replace(/[ \t]+$/, "")).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return out ? `${out}
` : "";
}
async function exportDocument(docId, opts, assets, notebookName) {
  const doc = await buildDocInfo(docId, notebookName);
  const ctx = {
    opts,
    doc,
    depth: 0,
    htmlOnly: false,
    assets,
    headings: [],
    warnings: []
  };
  const children = await getChildBlocks(docId);
  let body = "";
  for (const meta of children) {
    if (!meta || meta.type === "d") continue;
    const chunk = await renderBlockSafe(meta, ctx);
    body += chunk;
  }
  body = await assets.rewriteMarkdown(body, ctx);
  body = await assets.rewriteHtml(body, ctx);
  const main = postProcess(body, ctx.headings);
  const paths = docPaths(doc, opts);
  const content = `${buildFrontMatter(doc, opts)}${main ? "\n" + main : ""}`;
  return { path: paths.mdPath, content, warnings: ctx.warnings, doc };
}
async function renderBlockSafe(meta, ctx) {
  try {
    return await renderBlock(meta, ctx);
  } catch (e) {
    ctx.warnings.push(`\u5757\u6E32\u67D3\u5931\u8D25\uFF1A${meta.id}`);
    return "";
  }
}
var init_document = __esm({
  "src/core/document.ts"() {
    init_api();
    init_kramdown();
    init_frontmatter();
    init_paths();
    init_render();
    init_toc();
  }
});

// src/core/zip.ts
function crc32(bytes) {
  let crc = 4294967295;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 255] ^ crc >>> 8;
  }
  return (crc ^ 4294967295) >>> 0;
}
function dosTime(date) {
  const time = (date.getHours() & 31) << 11 | (date.getMinutes() & 63) << 5 | Math.floor(date.getSeconds() / 2) & 31;
  const d = (date.getFullYear() - 1980 & 127) << 9 | (date.getMonth() + 1 & 15) << 5 | date.getDate() & 31;
  return { time, date: d };
}
function u16(value) {
  return new Uint8Array([value & 255, value >>> 8 & 255]);
}
function u32(value) {
  return new Uint8Array([value & 255, value >>> 8 & 255, value >>> 16 & 255, value >>> 24 & 255]);
}
function concat(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}
function buildZip(entries) {
  const encoder = new TextEncoder();
  const stamp = dosTime(/* @__PURE__ */ new Date());
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.path);
    const crc = crc32(entry.data);
    const size = entry.data.length;
    const localHeader = concat([
      u32(67324752),
      u16(20),
      u16(2048),
      // UTF-8 文件名
      u16(0),
      // store
      u16(stamp.time),
      u16(stamp.date),
      u32(crc),
      u32(size),
      u32(size),
      u16(nameBytes.length),
      u16(0)
    ]);
    chunks.push(localHeader, nameBytes, entry.data);
    central.push(concat([
      u32(33639248),
      u16(20),
      u16(20),
      u16(2048),
      u16(0),
      u16(stamp.time),
      u16(stamp.date),
      u32(crc),
      u32(size),
      u32(size),
      u16(nameBytes.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      nameBytes
    ]));
    offset += localHeader.length + nameBytes.length + size;
  }
  const centralSize = central.reduce((sum, chunk) => sum + chunk.length, 0);
  const eocd = concat([
    u32(101010256),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(centralSize),
    u32(offset),
    u16(0)
  ]);
  return concat([...chunks, ...central, eocd]);
}
var CRC_TABLE;
var init_zip = __esm({
  "src/core/zip.ts"() {
    CRC_TABLE = (() => {
      const table2 = new Uint32Array(256);
      for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++) {
          c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
        }
        table2[i] = c >>> 0;
      }
      return table2;
    })();
  }
});

// src/core/site.ts
var site_exports = {};
__export(site_exports, {
  __keptDocPaths: () => __keptDocPaths,
  docsOfNotebook: () => docsOfNotebook,
  exportSite: () => exportSite
});
async function exportSite(docIds, opts, notebookName, onProgress) {
  const assets = new AssetStore();
  const files = [];
  const warnings = [];
  let docCount = 0;
  for (let i = 0; i < docIds.length; i++) {
    const id = docIds[i];
    try {
      const result = await exportDocument(id, opts, assets, notebookName);
      files.push({ path: result.path, data: new TextEncoder().encode(result.content) });
      result.warnings.forEach((w) => warnings.push(`[${result.doc.title}] ${w}`));
      docCount += 1;
      onProgress?.(i + 1, docIds.length, result.doc.title);
    } catch (e) {
      warnings.push(`\u6587\u6863\u5BFC\u51FA\u5931\u8D25\uFF1A${id} ${e?.message || e}`);
    }
  }
  assets.getFiles().forEach((data, path) => {
    files.push({ path, data });
  });
  if (opts.site === "hugo" && opts.hugoRawHtmlShortcode) {
    files.push({
      path: "layouts/shortcodes/rawhtml.html",
      data: new TextEncoder().encode(HUGO_RAWHTML_SHORTCODE)
    });
  }
  const report = [
    "# \u5BFC\u51FA\u62A5\u544A",
    "",
    `- \u7AD9\u70B9\u7C7B\u578B\uFF1A${opts.site}`,
    `- \u5BFC\u51FA\u6587\u6863\uFF1A${docCount} \u7BC7`,
    `- \u5BFC\u51FA\u6587\u4EF6\uFF1A${files.length} \u4E2A`,
    `- \u65F6\u95F4\uFF1A${(/* @__PURE__ */ new Date()).toLocaleString()}`,
    "",
    "## \u544A\u8B66",
    "",
    warnings.length ? warnings.map((w) => `- ${w}`).join("\n") : "\u65E0",
    ""
  ].join("\n");
  files.push({ path: "SIYUAN-EXPORT-REPORT.md", data: new TextEncoder().encode(report) });
  return {
    zip: buildZip(files),
    fileCount: files.length,
    docCount,
    warnings
  };
}
async function docsOfNotebook(box) {
  const rows = await listDocs(box);
  return rows.map((r) => r.id);
}
var HUGO_RAWHTML_SHORTCODE, __keptDocPaths;
var init_site = __esm({
  "src/core/site.ts"() {
    init_assets();
    init_document();
    init_paths();
    init_zip();
    init_api();
    HUGO_RAWHTML_SHORTCODE = `{{- /* \u7531\u300C\u601D\u6E90 Markdown \u5BFC\u51FA\u300D\u63D2\u4EF6\u751F\u6210\uFF1A\u7528\u4E8E\u5728 Hugo \u4E2D\u6E32\u67D3\u601D\u6E90\u65E0\u6CD5\u8F6C\u6210 Markdown \u7684 HTML \u7247\u6BB5 */ -}}
{{- .Inner | safeHTML -}}
`;
    __keptDocPaths = docPaths;
  }
});

// src/index.ts
var index_exports = {};
__export(index_exports, {
  default: () => SiYuanMarkdownExporter
});
module.exports = __toCommonJS(index_exports);
var import_siyuan = require("siyuan");
init_api();
init_site();
var DEFAULT_OPTIONS = {
  site: "hugo",
  scope: "doc",
  copyAssets: true,
  hugoRawHtmlShortcode: true,
  debugComment: false
};
var SiYuanMarkdownExporter = class extends import_siyuan.Plugin {
  constructor() {
    super(...arguments);
    this.opts = { ...DEFAULT_OPTIONS };
    this.dialog = null;
  }
  async onload() {
    console.log("[siyuan-export-md] loaded");
    try {
      const saved = await this.loadData("options");
      if (saved) this.opts = { ...DEFAULT_OPTIONS, ...saved };
    } catch (e) {
    }
    this.addTopBar({
      icon: "iconExport",
      title: String(this.i18n?.topbarTitle || "\u5BFC\u51FA Markdown"),
      position: "right",
      callback: () => this.openDialog(),
      contextMenu: (menu) => {
        menu.addItem({
          icon: "iconSettings",
          label: String(this.i18n?.menuExport || "\u5BFC\u51FA\u4E3A Markdown"),
          click: () => this.openDialog()
        });
      }
    });
    this.addCommand({
      langKey: "exportMarkdown",
      langText: String(this.i18n?.commandTitle || "\u5BFC\u51FA\u4E3A Markdown\uFF08Hexo/Hugo\uFF09"),
      hotkey: "\u2325\u21E7E",
      execute: (context) => {
        this.openDialog(context?.protyle);
      }
    });
  }
  onunload() {
    this.dialog?.destroy();
    this.dialog = null;
  }
  /** 从命令上下文 / 当前编辑器推断当前文档 ID */
  currentDocId(protyle) {
    if (protyle?.block?.rootID) return protyle.block.rootID;
    if (protyle?.background?.id) return protyle.background.id;
    const titleEl = document.querySelector(".protyle-title[data-node-id], .protyle-wysiwyg[data-node-id]");
    if (titleEl) {
      const id = titleEl.getAttribute("data-node-id") || "";
      if (id) return id;
    }
    return "";
  }
  openDialog(protyle) {
    if (this.dialog) {
      this.dialog.destroy();
      this.dialog = null;
    }
    const docId = this.currentDocId(protyle);
    const content = `
<div class="b3-dialog__content" style="padding: 8px 24px 0;">
  <div style="display:flex;flex-direction:column;gap:14px;font-size:13px;">
    <div style="display:flex;align-items:center;gap:8px;">
      <label style="width:86px;color:var(--b3-theme-on-surface-variant);">\u7AD9\u70B9\u7C7B\u578B</label>
      <select id="sySite" class="b3-select fn__size200" style="width:180px;">
        <option value="hugo">Hugo\uFF08page bundle\uFF09</option>
        <option value="hexo">Hexo\uFF08post + \u8D44\u6E90\u76EE\u5F55\uFF09</option>
      </select>
    </div>
    <div style="display:flex;align-items:center;gap:8px;">
      <label style="width:86px;color:var(--b3-theme-on-surface-variant);">\u5BFC\u51FA\u8303\u56F4</label>
      <select id="syScope" class="b3-select" style="width:180px;">
        <option value="doc">\u5F53\u524D\u6587\u6863</option>
        <option value="notebook">\u6574\u4E2A\u7B14\u8BB0\u672C</option>
      </select>
      <select id="syNotebook" class="b3-select" style="width:180px;display:none;"></select>
    </div>
    <div style="display:flex;align-items:center;gap:8px;">
      <label style="width:86px;color:var(--b3-theme-on-surface-variant);">\u6587\u6863 ID</label>
      <input id="syDocId" class="b3-text-field fn__flex-1" placeholder="\u7559\u7A7A\u5219\u81EA\u52A8\u53D6\u5F53\u524D\u6253\u5F00\u7684\u6587\u6863" value="${docId}" />
    </div>
    <div style="display:flex;flex-direction:column;gap:8px;padding-left:94px;">
      <label style="display:flex;align-items:center;gap:6px;">
        <input type="checkbox" id="syAssets" class="b3-switch fn__flex-center" />
        <span>\u628A\u56FE\u7247\u7B49\u9644\u4EF6\u4E00\u8D77\u6253\u5305\u5230\u8D44\u6E90\u76EE\u5F55</span>
      </label>
      <label id="syRawWrap" style="display:flex;align-items:center;gap:6px;">
        <input type="checkbox" id="syHugoRaw" class="b3-switch fn__flex-center" />
        <span>Hugo\uFF1A\u7528 {{&lt; rawhtml &gt;}} \u77ED\u4EE3\u7801\u5305\u88F9\u515C\u5E95 HTML\uFF08goldmark \u9700 unsafe \u624D\u8BA4\u88F8 HTML\uFF09</span>
      </label>
      <label style="display:flex;align-items:center;gap:6px;">
        <input type="checkbox" id="syDebug" class="b3-switch fn__flex-center" />
        <span>\u5728 HTML \u7247\u6BB5\u524D\u52A0\u6765\u6E90\u6CE8\u91CA\uFF08\u4FBF\u4E8E\u6392\u67E5\uFF09</span>
      </label>
    </div>
    <div id="syStatus" style="color:var(--b3-theme-on-surface-variant);min-height:20px;line-height:1.6;">\u51C6\u5907\u5C31\u7EEA</div>
  </div>
</div>
<div class="b3-dialog__action" style="padding: 12px 24px 20px;display:flex;justify-content:flex-end;gap:8px;">
  <button class="b3-button b3-button--cancel" id="syCancel">\u53D6\u6D88</button>
  <button class="b3-button b3-button--text" id="syRun">\u5F00\u59CB\u5BFC\u51FA</button>
</div>`;
    const dialog = new import_siyuan.Dialog({
      title: String(this.i18n?.dialogTitle || "\u5BFC\u51FA\u4E3A Hexo / Hugo Markdown"),
      content,
      width: "620px",
      destroyCallback: () => {
        this.dialog = null;
      }
    });
    this.dialog = dialog;
    const body = dialog.element;
    const siteEl = body.querySelector("#sySite");
    const scopeEl = body.querySelector("#syScope");
    const notebookEl = body.querySelector("#syNotebook");
    const docIdEl = body.querySelector("#syDocId");
    const assetsEl = body.querySelector("#syAssets");
    const hugoRawEl = body.querySelector("#syHugoRaw");
    const rawWrapEl = body.querySelector("#syRawWrap");
    const debugEl = body.querySelector("#syDebug");
    const statusEl = body.querySelector("#syStatus");
    const runEl = body.querySelector("#syRun");
    const cancelEl = body.querySelector("#syCancel");
    siteEl.value = this.opts.site;
    scopeEl.value = this.opts.scope;
    assetsEl.checked = this.opts.copyAssets;
    hugoRawEl.checked = this.opts.hugoRawHtmlShortcode;
    debugEl.checked = this.opts.debugComment;
    const syncRawWrap = () => {
      rawWrapEl.style.display = siteEl.value === "hugo" ? "flex" : "none";
    };
    syncRawWrap();
    const syncScope = () => {
      const isNotebook = scopeEl.value === "notebook";
      notebookEl.style.display = isNotebook ? "" : "none";
      docIdEl.parentElement.style.display = isNotebook ? "none" : "flex";
    };
    syncScope();
    siteEl.addEventListener("change", syncRawWrap);
    scopeEl.addEventListener("change", syncScope);
    listNotebooks().then((notebooks) => {
      notebookEl.innerHTML = notebooks.map((nb) => `<option value="${nb.id}">${nb.name}</option>`).join("");
    });
    const setStatus = (text) => {
      statusEl.textContent = text;
    };
    cancelEl.addEventListener("click", () => dialog.destroy());
    runEl.addEventListener("click", async () => {
      const opts = {
        site: siteEl.value,
        scope: scopeEl.value,
        copyAssets: assetsEl.checked,
        hugoRawHtmlShortcode: hugoRawEl.checked,
        debugComment: debugEl.checked
      };
      this.opts = opts;
      void this.saveData("options", opts);
      runEl.disabled = true;
      try {
        await this.doExport(opts, docIdEl.value.trim(), notebookEl, setStatus);
      } catch (e) {
        console.error("[siyuan-export-md]", e);
        setStatus("\u5BFC\u51FA\u5931\u8D25\uFF1A" + (e?.message || e));
        (0, import_siyuan.showMessage)("\u5BFC\u51FA\u5931\u8D25\uFF1A" + (e?.message || e), 5e3, "error");
      } finally {
        runEl.disabled = false;
      }
    });
  }
  async doExport(opts, docIdInput, notebookEl, setStatus) {
    const { docsOfNotebook: docsOfNotebook2 } = await Promise.resolve().then(() => (init_site(), site_exports));
    let docIds = [];
    let notebookName = "";
    if (opts.scope === "notebook") {
      const box = notebookEl.value;
      if (!box) {
        setStatus("\u8BF7\u5148\u9009\u62E9\u7B14\u8BB0\u672C");
        return;
      }
      notebookName = notebookEl.selectedOptions[0]?.textContent || "";
      setStatus("\u6B63\u5728\u8BFB\u53D6\u6587\u6863\u5217\u8868\u2026");
      docIds = await docsOfNotebook2(box);
      if (!docIds.length) {
        setStatus("\u8BE5\u7B14\u8BB0\u672C\u4E0B\u6CA1\u6709\u6587\u6863");
        return;
      }
    } else {
      const docId = docIdInput;
      if (!docId) {
        setStatus("\u6CA1\u6709\u53D6\u5230\u6587\u6863 ID\uFF1A\u8BF7\u5148\u6253\u5F00\u4E00\u7BC7\u6587\u6863\uFF0C\u6216\u624B\u52A8\u7C98\u8D34\u6587\u6863 ID");
        return;
      }
      docIds = [docId];
    }
    setStatus(`\u5F00\u59CB\u5BFC\u51FA\uFF0C\u5171 ${docIds.length} \u7BC7\u2026`);
    const result = await exportSite(docIds, opts, notebookName, (done, total, title) => {
      setStatus(`(${done}/${total}) ${title}`);
    });
    const stamp = (/* @__PURE__ */ new Date()).toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const filename = `siyuan-${opts.site}-${stamp}.zip`;
    this.download(result.zip, filename);
    const warnText = result.warnings.length ? `\uFF1B${result.warnings.length} \u6761\u544A\u8B66\u89C1\u538B\u7F29\u5305\u5185 SIYUAN-EXPORT-REPORT.md` : "";
    setStatus(`\u5B8C\u6210\uFF1A${result.docCount} \u7BC7\u6587\u6863\u3001${result.fileCount} \u4E2A\u6587\u4EF6${warnText}`);
    (0, import_siyuan.showMessage)(`\u5BFC\u51FA\u5B8C\u6210\uFF1A${result.docCount} \u7BC7\u6587\u6863${warnText}`, 6e3);
  }
  download(bytes, filename) {
    const blob = new Blob([bytes], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1e4);
  }
};
