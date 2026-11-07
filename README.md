# 导出 Hexo/Hugo Markdown（siyuan-export-md）

把思源文档导出成**能直接被 Hugo / Hexo 构建**的 Markdown 包。导出契约对齐 `tools/siyuan2hugo.py`（思源 → Hugo 的命令行转换器）验证过的那一套，也就是 Hugo 站点 `themes/mytheme` 已经在消费的格式：

- **公式** → `<div class="math-block" data-latex="…">` / `<span class="math-inline" data-latex="…">`，由主题的 `katex-render.js` 按 `data-latex` 渲染；行内公式的可见文本做 Markdown 转义（`_`、`*`、`\标点`），避免 `x_i` 被当斜体。
- **表格** → 原始 HTML `<table>`（保留 `rowspan` / `colspan` / `colgroup`），外面包 `<div class="table-wrapper">`，不丢合并单元格。
- **标注块（callout）** → `<div class="callout callout-note|tip|important|warning|danger">` + `callout-title` + `callout-body`。
- **附件** → 拷贝进站点静态目录，文件名 ASCII 化（去掉中文与空格），引用路径重写；拷不动的写进报告，不会静默丢图。
- **标题降一级**，让 Front Matter 的 `title` 独占 h1，页面内标题从 h2 起。

另外保留 Markdown 该有的样子：列表、引用、代码块、任务列表走内核 kramdown 并清洗思源私有属性（`{: id=…}`、`((id "文字"))`）。

---

## 一、安装

源码在 `src/`（按功能拆分：`api.js`、`assets.js`、`kramdown.js`、`math.js`、`dom.js`、`document.js`、`site.js`、`zip.js`、`render/`、`ui/dialog.js`）。根目录的 `index.js` 是一个**运行时加载器**：思源只把 `plugins/<name>/index.js` 交给 `window.eval` 执行，注入的 `require` 只认 `"siyuan"`，所以它用同步 XHR 从 `/plugins/<name>/src/…` 把模块源码取回来，再用一个极小的 CJS 注册表按 `require` 图逐个求值。

因此：**不需要构建**，`src/` 必须跟 `index.js` 一起发布（少一个文件插件就起不来，控制台会给出具体是哪个 URL 读不到）。

1. 把整个目录拷到 `{工作空间}/data/plugins/siyuan-export-md/`；
2. 「设置 → 集市 → 已下载」里启用「导出 Hexo/Hugo Markdown」；
3. 顶栏右侧出现导出按钮；也可用命令面板「导出为 Markdown（Hexo/Hugo）」。

改了 `src/` 里的代码后，在「设置 → 集市」把插件关掉再打开（或重启思源）即可生效。

## 二、使用

点击顶栏按钮打开导出面板：

| 选项 | 默认 | 说明 |
| --- | --- | --- |
| 站点类型 | Hugo | `Hugo` 或 `Hexo` |
| Hugo 布局 | 单文件 | 单文件 = `content/<目录>/<slug>.md` + `static/siyuan/<slug>/`；page bundle = `content/posts/<slug>/index.md` + 同目录资源 |
| 导出范围 | 当前文档 | 当前文档 / 整个笔记本 |
| 文档 ID | 自动填入 | 留空则取当前打开的文档 |
| 公式 | `data-latex` | 选 `raw` 则输出裸 `$$…$$`（给自带 MathJax 的主题用） |
| 表格 | HTML | 选 `GFM` 则输出管道表（合并单元格会丢，报告中会告警） |
| 打包附件 | 开 | 图片等资源一起进 zip，并重写引用路径 |
| 标题降一级 | 开 | 关掉则按思源原级别输出 |
| rawhtml 短代码 | 关 | Hugo 兜底 HTML 是否包 `{{< rawhtml >}}`；站点已开 `goldmark unsafe` 时不要勾 |
| 来源注释 | 关 | HTML 片段前加 `<!-- siyuan:类型 -->`，排查用 |

导出完成后浏览器下载一个 zip。

### Hugo 单文件（默认，和 siyuan2hugo.py 一致）

```
content/notes/<slug>.md
static/siyuan/<slug>/<ascii-文件名>.png
SIYUAN-EXPORT-REPORT.md
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

| 思源元素 | 类型 | 导出形式 | 说明 |
| --- | --- | --- | --- |
| 标题 | `h` | `##` ~ `######` | 默认整体降一级（最高压到 h2） |
| 段落 | `p` | Markdown 段落 | 内核 kramdown，行内公式改写为 `math-inline` |
| 无序/有序列表 | `l` / `i` | GFM 列表 | 首行 marker + 续行对齐缩进 |
| 任务列表 | `l`(t) | `- [ ]` / `- [x]` | |
| 引用 | `b` | `>` 逐行前缀 | 缺前缀自动补 |
| 代码块 | `c` | 围栏代码块 | 语言取 `subType`，内部 `$` 不转公式 |
| 公式块 | `m` | `math-block` + `data-latex` | LaTeX 归一化（去 `&nbsp;`、空白折叠成单行） |
| 表格 | `t` | HTML + `table-wrapper` | 保 `rowspan`/`colspan`/`colgroup`；可切 GFM |
| 图片 | `img` | `![](路径)` | 路径按桌面端/移动端多候选探测后拷贝并重写 |
| 标注块 | `callout` | `div.callout.callout-*` | 标题与图标取块内实际值，缺省用类型默认 |
| 超级块 | `s` | `div.sy-superblock` | 子块一律渲染成 HTML，**不再嵌套 rawhtml 短代码** |
| 数据库/属性视图 | `av` | GFM 表格或 HTML 表格 | 只导出当前视图的可见列 |
| 挂件 | `widget` | `<iframe>` 或占位说明 | 依赖思源运行时 |
| 音视频 / iframe | `video`/`audio`/`iframe` | 原生标签 | 媒体文件需自行部署 |
| 图表（mermaid） | `diagram` | mermaid 围栏 | echarts 等退回 HTML |
| 上标/下标/下划线/高亮/键盘键 | 行内 | `<sup> <sub> <u> <mark> <kbd>` | Markdown 无对应语法 |
| HTML 块 | `html` | 清洗后原样输出 | 剥掉 `data-node-id`、`protyle-*` 类名 |
| 其它/未知 | `*` | 清洗后的 HTML | 万能兜底 |

每次导出都会在 zip 根目录写 `SIYUAN-EXPORT-REPORT.md`：文档数、资源数、每条「退化为 HTML / 资源拷贝失败 / 表格丢失合并」的告警，以及站点侧配置清单。

## 四、站点侧需要配的

### Hugo

```toml
[markup.goldmark.renderer]
unsafe = true          # 必须：否则公式容器、HTML 表格、callout 都会被 goldmark 丢掉
```

数学公式：模板里引入 KaTeX 与按 `data-latex` 渲染的脚本：

```js
katex.render(el.getAttribute('data-latex'), el, {
  displayMode: el.classList.contains('math-block'),
  throwOnError: false
});
```

**模板侧注意**：如果 `baseof.html` 用 `{{ if in .Content "math-block" }}` 判断是否加载 KaTeX，要同时判断 `math-inline`，否则只有行内公式的文档不会加载 KaTeX，公式会以源码显示。

### Hexo

```yml
post_asset_folder: true
markdown:
  gfm: true
  breaks: false
```

## 五、和 `siyuan2hugo.py` 的差别

| 能力 | 脚本 | 插件 |
| --- | --- | --- |
| 输入 | 思源「导出 HTML」目录 + 命令行参数 | 内核 API 直读文档树 |
| drawio | `docker jgraph/drawio` 转 SVG，失败降级为占位 callout | 无 docker 能力，按媒体/HTML 兜底并告警 |
| 附件拷贝 | 文件名 ASCII 化 | 同（另加多候选路径探测 + 失败告警） |
| Front Matter | `title / date / toc: true` | script 模式同（另出 `tags`、Hugo 的 `categories`）；full 模式追加 `updated / slug / draft` |
| 站点 | 仅 Hugo | Hugo（单文件/page bundle）+ Hexo |

## 六、开发与自测

不用构建：改 `src/` 里的文件，然后在「设置 → 集市」把插件关掉再打开（或重启思源）即可。

```bash
node --check index.js      # 加载器语法
node test/loader-test.cjs  # 每个相对 require 都能解析到文件 + 模块图无环
node test/self-test.cjs    # 契约 + 纯函数 + 假内核端到端（无需依赖）
npm i jsdom                # 只有跑 dom-test 才需要
node test/dom-test.cjs     # 表格/callout/超级块的 DOM 分支
```

`self-test.cjs` 与 `dom-test.cjs` 都从根 `index.js` 进入，把 `XMLHttpRequest` 桩成读本地文件（`test/xhr-stub.cjs`），所以它们验证的正是“加载器 → src 模块”这条真实链路。`self-test.cjs` 按思源真实加载方式执行：`window.eval` 后取 `module.exports.default` 当 `Plugin` 类；再用假 `fetch` 桩模拟 `/api/query/sql`、`/api/block/getChildBlocks`、`/api/block/getBlockKramdown`、`/api/block/getBlockDOM`、`/api/file/getFile`，跑完整导出并回读 zip 校验产物形状。

加载器的实现要点：`/plugins/<name>/` 是内核对外提供的静态目录（`Content-Type: text/javascript`），所以 `src/` 里的文件能被同步 XHR 读到；插件名优先从 `//# sourceURL=plugin:<name>` 的栈帧里反查，取不到再退回目录名常量。XHR 不可用时（例如极端环境下被拦）会退回 Electron 的 `fs + workspaceDir` 直接读盘。

调试：开发者工具（右下角 `?` → 开发者工具）看 Console，日志前缀 `[siyuan-export-md]`。

## 七、已知限制

- 挂件 / 查询嵌入 / 数据库的动态行为无法静态化，只能导出当时的静态外观或占位；
- 挂件引用的 `/widgets/…`、`/plugins/…`、`/api/…` 属运行态路径，不拷进包（拷了在静态站也跑不起来）；
- 块引用 `((id "文字"))` 导出为锚文字纯文本，不生成跨文档锚点；
- 超级块内部是纯 HTML，因此内部不再解析 Markdown（CommonMark 规则，不是 bug）；
- 同一文档导出两次会覆盖同名文件（zip 是整体产物，不做增量）。
