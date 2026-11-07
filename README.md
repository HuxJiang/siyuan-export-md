# 导出 Hexo/Hugo（HTML 正文，标题可选 Markdown）

把思源文档导出成**能直接被 Hugo / Hexo 构建**的压缩包。产物仍是 `.md` 内容文件（Front Matter 保持不变），正文是 HTML，**标题默认用 Markdown 语法**：

```markdown
<div class="sy-doc">

<nav class="sy-toc">…</nav>

### <a id="小节标题"></a>小节标题

<p>正文 <strong>粗体</strong> 与 <span class="math-inline" data-latex="x_i">x_i</span></p>
…
</div>
```

标题行是 `## 标题` 形式的 Markdown，前面挂一个空 `<a id>` 供目录锚点使用；除标题外，段落、列表、表格、代码、公式、标注块、超级块全部是语义 HTML，不用 Markdown 语法（没有 `![图片]()`、GFM 管道表、代码围栏、rawhtml 短代码）。导出面板里的「标题语法」可在 Markdown 与 HTML 之间切换。

`<div class="sy-doc">` 开标签后固定留一个空行：正文第一个块如果是标题，紧跟开标签会被 goldmark 当成 HTML 块的一部分原样输出，空行才能结束 HTML 块、让 `## 标题` 被解析。

主要契约：

- **标题** → `## 标题`（Markdown，可切回 `<h1>`…`<h6>`；默认降一级，锚点 `id` 由标题文字生成）
- **段落** → `<p>`，行内 `strong / em / u / s / mark / kbd / code / a / img` 保留语义
- **列表** → 真正的 `<ul>` / `<ol>` / `<li>`，任务列表带 `<input type="checkbox" disabled>`，嵌套列表就是嵌套 `<ul>`
- **引用** → `<blockquote>`，内部子块同样是 HTML
- **代码块** → `<pre class="code-block" data-lang="js"><code class="language-js">…</code></pre>`
- **公式** → `<div class="math-block" data-latex="…">` / `<span class="math-inline" data-latex="…">`，由站点侧 KaTeX 脚本渲染
- **表格** → 原始 `<table>`（保留 `rowspan` / `colspan` / `colgroup`），外面包 `<div class="table-wrapper">`
- **图片** → `<figure class="sy-image"><img src alt></figure>`
- **标注块** → `<div class="callout callout-note|tip|important|warning|danger"><div class="callout-title">…</div><div class="callout-body">…</div></div>`
- **超级块（分栏）** → `<div class="sy-superblock sy-superblock-col|row" style="display:flex;…">`，子块根节点带内联 flex 与 `sy-superblock-child`；横向分栏按思源里拖出的**宽度百分比**折算成 `flex` 比例（如 `flex:70 1 0` / `flex:30 1 0`），站点容器宽度与间距变了也不会走样
- **附件** → 拷贝进站点静态目录，文件名 ASCII 化，`src` / `href` 路径整体重写

---

## 一、安装

源码在 `src/`（按功能拆分：`api.js`、`assets.js`、`dom.js`、`math.js`、`document.js`、`site.js`、`zip.js`、`render/`、`ui/dialog.js`）。根目录的 `index.js` 是一个**运行时加载器**：思源只把 `plugins/<name>/index.js` 交给 `window.eval` 执行，注入的 `require` 只认 `"siyuan"`，所以它用同步 XHR 从 `/plugins/<name>/src/…` 把模块源码取回来，再用一个极小的 CJS 注册表按 `require` 图逐个求值。

因此：**不需要构建**，`src/` 必须跟 `index.js` 一起发布（少一个文件插件就起不来，控制台会给出具体是哪个 URL 读不到）。

1. 把整个目录拷到 `{工作空间}/data/plugins/siyuan-export-md/`；
2. 「设置 → 集市 → 已下载」里启用插件；
3. 顶栏右侧出现导出按钮；也可用命令面板「导出为 HTML（Hexo/Hugo）」。

改了 `src/` 里的代码后，在「设置 → 集市」把插件关掉再打开（或重启思源）即可生效。

## 二、使用

点击顶栏按钮打开导出面板：

| 选项 | 默认 | 说明 |
| --- | --- | --- |
| 站点类型 | Hugo | `Hugo` 或 `Hexo`（只影响 Front Matter 与目录结构） |
| Hugo 布局 | 单文件 | 单文件 = `content/<目录>/<slug>.md` + `static/siyuan/<slug>/`；page bundle = `content/posts/<slug>/index.md` + 同目录资源 |
| 导出范围 | 当前文档 | 当前文档 / 整个笔记本 |
| 文档 ID | 自动填入 | 留空则取当前打开的文档 |
| 打包附件 | 开 | 图片等资源一起进 zip，并重写引用路径 |
| 标题语法 | Markdown | `Markdown（## 标题）` / `HTML（<h2>标题</h2>）`；只影响标题行，其余正文始终是 HTML |
| 标题降一级 | 开 | 关掉则按思源原级别输出（原 h1 仍是 h1） |
| 保留超级块栏宽 | 开 | 横向分栏按思源里拖出的宽度百分比折算成 `flex` 比例；关掉则等宽均分 |
| 来源注释 | 脱 | 每个块前加 `<!-- siyuan:类型 -->`，排查用 |

导出完成后浏览器下载一个 zip。

### Hugo 单文件（默认）

```
content/notes/<slug>.md
static/siyuan/<slug>/<ascii-文件名>.png
SIYUAN-EXPORT-REPORT.html
```

### Hugo page bundle

```
content/posts/<slug>/index.md
content/posts/<slug>/<ascii-文件名>.png
```

### Hexo

```
source/_posts/<slug>.md
source/_posts/<slug>/<ascii-文件名>.png
```

## 三、元素映射表

| 思源元素 | 类型 | 导出的 HTML | 说明 |
| --- | --- | --- | --- |
| 标题 | `h` | `## 标题`（Markdown，默认）/ `<h1>`–`<h6 id="…">` | 默认整体降一级；Markdown 模式在标题前挂 `<a id="…">` 供目录锚点，重名自动加 `-2` |
| 段落 | `p` | `<p>` | 行内节点映射为语义标签，属性有白名单 |
| 无序/有序列表 | `l` | `<ul>` / `<ol>` + `<li>` | 嵌套列表直接嵌套；列表项的段落压平，避免多余间距 |
| 任务列表 | `l`(t) | `<li class="task-item"><input type="checkbox" disabled checked>` | 勾选状态保留 |
| 引用 | `b` | `<blockquote>` | 内部子块递归渲染 |
| 代码块 | `c` | `<pre class="code-block" data-lang><code class="language-x">` | 语言取 `subType`，行号栏不进正文 |
| 公式块 | `m` | `<div class="math-block" data-latex>` | LaTeX 归一化（零宽字符、空白折叠） |
| 行内公式 | 行内 | `<span class="math-inline" data-latex>` | 直接从 `data-content` 取源码 |
| 表格 | `t` | `<table>` + `<div class="table-wrapper">` | 保 `rowspan` / `colspan` / `colgroup` |
| 图片 | `img` | `<figure class="sy-image"><img></figure>` | 有 title 时输出 `<figcaption>` |
| 标注块 | `callout` | `<div class="callout callout-*">` + title + body | 标题与图标取块内实际值 |
| 超级块 | `s` | `<div class="sy-superblock sy-superblock-col|row">` | 按 `data-sb-layout` 还原并排 / 堆叠；横向分栏按思源里的 `width: calc(66.6% - 12px)` **只取宽度百分比**，归一化成子块的 `flex` 比例，不搬 `calc` 的 px 项 |
| 数据库/属性视图 | `av` | 表格视图 → `<table>` + `table-wrapper`；其它视图 → `<div class="sy-database">` | 只导出当前视图 |
| 挂件 | `widget` | `<iframe>` 或占位 `<div class="sy-placeholder">` | 依赖思源运行时 |
| 音视频 / iframe | `video`/`audio`/`iframe` | 原生标签 | 媒体文件需自行部署 |
| 图表（mermaid） | `diagram` | `<pre class="mermaid">` | 其余图表退化为 HTML |
| 上标/下标/下划线/高亮/键盘键 | 行内 | `<sup> <sub> <u> <mark> <kbd>` | |
| 标签 / 块引用 | 行内 | `<span class="tag">` / `<span class="block-ref">` | 块引用输出锚文字纯文本 |
| 查询嵌入 | `query_embed` | 占位 `<div class="sy-placeholder">` | 依赖动态查询 |
| 目录 | `toc` | `<nav class="sy-toc">` + 嵌套 `<ul>` 锚点 | 文档末尾统一替换占位 |
| 其它/未知 | `*` | 清洗后的 HTML（`<div class="sy-block">`） | 万能兜底 |

每次导出都会在 zip 根目录写 `SIYUAN-EXPORT-REPORT.html`：文档数、资源数、每条「退化为 HTML / 资源拷贝失败 / DOM 缺失」的告警，以及站点侧配置清单。

## 四、站点侧需要配的

正文以 HTML 为主（标题默认是 Markdown 行），站点必须**允许内联 HTML**，否则内容会被渲染器丢掉。

### Hugo

```toml
[markup.goldmark.renderer]
unsafe = true          # 必须：不加的话整篇正文都会被 goldmark 丢掉
```

数学公式：模板里引入 KaTeX 与按 `data-latex` 渲染的脚本：

```js
katex.render(el.getAttribute('data-latex'), el, {
  displayMode: el.classList.contains('math-block'),
  throwOnError: false
});
```

**模板侧注意**：如果 `baseof.html` 用 `{{ if in .Content "math-block" }}` 判断是否加载 KaTeX，要同时判断 `math-inline`，否则只有行内公式的文档不会加载 KaTeX。

### Hexo

```yml
markdown:
  gfm: true
  breaks: false
```

Hexo 默认的 marked 渲染器会把裸 HTML 原样透传；不要额外装会把 HTML 再解析一遍的插件。

### 样式（建议加一份）

导出的 HTML 只带语义类名，不带样式。把下面这段放进主题的 CSS（或站点 `custom.css`），表格、标注块、公式、分栏就有基本观感；不想要默认样式也可以完全换掉：

```css
.sy-doc { line-height: 1.75; }
.sy-doc .table-wrapper { overflow-x: auto; margin: 1em 0; }
.sy-doc table { border-collapse: collapse; width: 100%; }
.sy-doc th, .sy-doc td { border: 1px solid #ddd; padding: 6px 10px; vertical-align: top; }
.sy-doc blockquote { margin: 1em 0; padding: .2em 0 .2em 1em; border-left: 4px solid #ddd; color: #555; }
.sy-doc pre.code-block { background: #f6f6f6; padding: 12px; border-radius: 6px; overflow-x: auto; }
.sy-doc .callout { margin: 1em 0; padding: 10px 14px; border-left: 4px solid #4a90d9; background: #f3f8fd; border-radius: 4px; }
.sy-doc .callout-title { font-weight: 600; margin-bottom: 4px; }
.sy-doc .callout-warning, .sy-doc .callout-danger { border-color: #d9822b; background: #fdf6ef; }
.sy-doc .math-block { margin: 1em 0; text-align: center; overflow-x: auto; }
.sy-doc .sy-image { margin: 1em 0; text-align: center; }
.sy-doc .sy-image img { max-width: 100%; height: auto; }
.sy-doc .sy-image figcaption { font-size: .85em; color: #777; }
.sy-doc .sy-superblock { margin: 1em 0; }
.sy-doc li > p { margin: .35em 0; }
.sy-doc ul.task-list { list-style: none; padding-left: 1.2em; }
.sy-doc .tag { background: #eee; border-radius: 3px; padding: 0 4px; }
.sy-doc .sy-toc { margin: 1em 0 1.5em; padding: 10px 16px; background: #fafafa; border: 1px solid #eee; }
```



### 关于空行

CommonMark / goldmark 的 HTML 块**遇到空行就结束**，之后的正文会被重新按 Markdown 解析。

- **标题语法 = Markdown**（默认）：标题行前后各保留一个空行，`## 标题` 才会被当成标题解析；其余位置仍只保留单个空行，`<pre>` 里的空行换成 `&#32;`。
- **标题语法 = HTML**：整篇正文压掉连续空行，正文是一个完整 HTML 块，不会被 Markdown 再解析一遍。

两种模式都不需要手工调整导出的内容。

## 五、和 `siyuan2hugo.py` 的差别

| 能力 | 脚本 | 插件 |
| --- | --- | --- |
| 输入 | 思源「导出 HTML」目录 + 命令行参数 | 内核 API 直读文档树 |
| 正文形态 | Markdown + 局部 HTML | HTML + Markdown 标题（可切全 HTML） |
| drawio | `docker jgraph/drawio` 转 SVG，失败降级为占位 callout | 无 docker 能力，按图表/媒体/HTML 兜底并告警 |
| 附件拷贝 | 文件名 ASCII 化 | 同（另加多候选路径探测 + 失败告警） |
| Front Matter | `title / date / toc: true` | script 模式同（另出 `tags`、Hugo 的 `categories`）；full 模式追加 `updated / slug / draft` |
| 站点 | 仅 Hugo | Hugo（单文件/page bundle）+ Hexo |

## 六、开发与自测

不用构建：改 `src/` 里的文件，然后在「设置 → 集市」把插件关掉再打开（或重启思源）即可。

```bash
node --check index.js       # 加载器语法
node test/loader-test.cjs   # 每个相对 require 都能解析到文件 + 模块图无环
node test/self-test.cjs     # 契约 + 纯函数 + 假内核端到端（jsdom 提供 DOMParser）
node test/dom-test.cjs      # 表格 / callout / 超级块 / 列表 / 引用 / 代码块等 DOM 分支
npm i jsdom                 # 两个自测都依赖它（package.json 已声明）
```

两个自测都从根 `index.js` 进入，把 `XMLHttpRequest` 桩成读本地文件（`test/xhr-stub.cjs`），所以验证的正是“加载器 → src 模块”这条真实链路；再用假 `fetch` 桩模拟 `/api/query/sql`、`/api/block/getChildBlocks`、`/api/block/getBlockDOM`、`/api/file/getFile`。

调试：开发者工具（右下角 `?` → 开发者工具）看 Console，日志前缀 `[siyuan-export-md]`。

## 七、已知限制

- 挂件 / 查询嵌入 / 数据库的动态行为无法静态化，只能导出当时的静态外观或占位；
- 挂件引用的 `/widgets/…`、`/plugins/…`、`/api/…` 属运行态路径，不拷进包（拷了在静态站也跑不起来）；
- 块引用 `((id "文字"))` 导出为锚文字纯文本，不生成跨文档锚点；
- 正文是 HTML（标题默认用 Markdown），站点的 Markdown 渲染必须允许内联 HTML（Hugo 需 `goldmark unsafe`）；
- 同一文档导出两次会覆盖同名文件（zip 是整体产物，不做增量）。
