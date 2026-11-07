# 导出 Hexo/Hugo Markdown（siyuan-export-md）

把思源笔记文档导出为**可直接被 Hexo / Hugo 构建**的 Markdown 包：

- **Markdown 支持的语法 → 用 Markdown 导出**（标题、段落、列表、任务列表、引用、代码块、公式、GFM 表格、图片、链接、行内强调/删除线/行内公式）。
- **Markdown 不支持的语法 → 用可移植 HTML 保留原本显示形式**（下划线、高亮、上/下标、挂件、iframe、音视频、数据库视图、分栏超级块、查询嵌入、未知块）。
- 代码按元素类型拆分成独立模块（`src/exporters/*.ts`），一个元素一个文件、一个函数。

---

## 一、安装

1. 把 `package.zip` 解压到 `{工作空间}/data/plugins/siyuan-export-md/`
   （或者直接把本仓库 `dist/` 目录改名放进 `data/plugins/siyuan-export-md/`）。
2. 「设置 → 集市 → 已下载」里启用「导出 Hexo/Hugo Markdown」。
3. 顶栏右侧出现导出按钮；也可用命令面板「导出为 Markdown（Hexo/Hugo）」或快捷键 `⌥⇧E`。

## 二、使用

点击顶栏按钮 → 面板里选：

| 选项 | 说明 |
| --- | --- |
| 站点类型 | `Hugo`（page bundle）或 `Hexo`（post + 同名资源目录） |
| 导出范围 | 当前文档 / 整个笔记本 |
| 文档 ID | 留空则自动取当前打开的文档；也可手动粘贴文档 ID |
| 打包附件 | 勾选后图片等资源一起打进 zip，并改写引用路径 |
| rawhtml 短代码 | Hugo 专用：把兜底 HTML 包进 `{{< rawhtml >}}` |
| 来源注释 | 在 HTML 片段前加 `<!-- siyuan:类型 -->`，方便排查 |

导出完成后浏览器会下载一个 zip，结构如下。

### Hugo（page bundle）

```
content/posts/<slug>/index.md
content/posts/<slug>/<图片>.png
layouts/shortcodes/rawhtml.html      # 勾选 rawhtml 时自动生成
SIYUAN-EXPORT-REPORT.md             # 告警清单
```

### Hexo

```
source/_posts/<slug>.md
source/_posts/<slug>/<图片>.png
SIYUAN-EXPORT-REPORT.md
```

## 三、元素映射表（Markdown 优先，HTML 兜底）

| 思源元素 | 类型 | 导出形式 | 说明 |
| --- | --- | --- | --- |
| 标题 | `h` | Markdown `#` ~ `######` | 级别取 `subType`，缺失时读 DOM class |
| 段落 | `p` | Markdown 段落 | 行内强调/链接/图片由内核转 md |
| 无序/有序列表 | `l` / `i` | GFM 列表 | `*` 统一成 `-` |
| 任务列表 | `l`（subType `t`） | `- [ ]` / `- [x]` | |
| 引用 | `b` | `>` 引用块 | 缺前缀自动补 |
| 代码块 | `c` | 围栏代码块 | 语言取 `subType`，mermaid 亦同 |
| 公式块 | `m` | `$$ … $$` | 站点需开 KaTeX/MathJax |
| 表格 | `t` | GFM 管道表格 | 缺分隔行自动补；无法构成合法 GFM 时退回 HTML 表格 |
| 图片 | `img` | `![](资源)` | 资源路径由 AssetStore 重写 |
| 上标/下标/下划线/高亮/键盘键 | 行内 | **HTML** `<sup> <sub> <u> <mark> <kbd>` | Markdown 无对应语法 |
| HTML 块 | `html` | 原样 HTML | 不再二次加工 |
| 挂件 | `widget` | `<iframe>` 或占位块 | 依赖思源运行时，静态站点无法渲染 |
| 音视频 / iframe | `video` / `audio` / `iframe` | 原生 `<video> <audio> <iframe>` | 媒体文件需自行部署 |
| 图表 | `diagram` | mermaid 围栏 / HTML | echarts 等退回 HTML |
| 数据库 / 属性视图 | `av` | GFM 表格（当前视图）或 HTML 表格 | 只导出可见字段 |
| 超级块（分栏） | `s` | HTML flex 容器 + 子块 HTML | 避免「HTML 内 md 不解析」 |
| 目录 | `toc` | 渲染完成后按标题生成 md 列表 | 占位符后替换 |
| 查询嵌入 | `query_embed` | HTML 提示块 | 依赖动态查询，静态站不生效 |
| 其它/未知 | `*` | 清洗后的 HTML | 万能兜底 |

## 四、站点侧还需要配的几项

### Hugo（`config.toml` / `hugo.toml`）

```toml
[markup.goldmark.renderer]
unsafe = true          # 必须：否则正文里的兜底 HTML（含行内 <u>/<mark> 等）会被丢弃

[markup.goldmark.extensions]
typographer = false    # 建议关闭，避免把代码里的引号智能替换
```

以及短代码 `layouts/shortcodes/rawhtml.html`（勾选 rawhtml 选项时会自动打包）：

```go-html-template
{{- .Inner | safeHTML -}}
```

数学公式：引入 KaTeX（`[markup.goldmark.extensions.passthrough] enable = true` 或主题自带 math 支持）。
Mermaid：主题若支持 mermaid 代码块可直出；否则加 `layouts/_default/_markup/render-codeblock-mermaid.html`。

### Hexo（`_config.yml`）

```yml
post_asset_folder: true      # 与导出结构一致：source/_posts/<slug>/<图片>
markdown:
  gfm: true
  breaks: false
```

数学公式用 `hexo-renderer-kramed` + `hexo-math` 或主题自带 KaTeX；裸 HTML 默认允许，无需额外配置。

## 五、代码结构（按元素分文件）

```
src/
├── index.ts                  插件入口：顶栏按钮 / 命令 / 导出面板 / zip 下载
├── api.ts                    内核 API 封装（getChildBlocks、getBlockDOM、getBlockKramdown、file/getFile…）
├── types.ts                  公共类型
├── core/
│   ├── render.ts             按块类型分发渲染
│   ├── kramdown.ts           清洗思源的 kramdown（IAL 属性、块引用等）
│   ├── dom.ts                解析 DOM、剥离 protyle/b3 私有属性、序列化可移植 HTML
│   ├── html.ts               HTML 兜底片段包装（Hugo rawhtml 短代码）
│   ├── assets.ts             资源收集 & 路径重写
│   ├── paths.ts              Hugo/Hexo 输出路径规则
│   ├── frontmatter.ts        YAML Front Matter（Hexo/Hugo 通用字段）
│   ├── document.ts           单篇文档导出编排
│   ├── site.ts               整站导出 + 打包 zip
│   └── zip.ts                零依赖 ZIP（store 模式）
└── exporters/                 ← 一个元素一个文件
    ├── index.ts              类型 → 导出函数 注册表
    ├── heading.ts            标题
    ├── paragraph.ts          段落
    ├── list.ts               列表 / 任务列表
    ├── quote.ts              引用
    ├── code.ts               代码块（含 mermaid）
    ├── math.ts               公式块
    ├── table.ts              表格
    ├── image.ts              图片
    ├── htmlblock.ts          HTML 块
    ├── widget.ts             挂件
    ├── media.ts              音视频 / iframe
    ├── diagram.ts            图表
    ├── database.ts           数据库 / 属性视图
    ├── superblock.ts         超级块（分栏）
    ├── toc.ts                目录
    ├── queryembed.ts         查询嵌入
    └── unknown.ts            未知块兜底
```

### 新增一种元素的导出逻辑

1. 在 `src/exporters/` 新建 `xxx.ts`，导出 `async function xxx(meta, ctx): Promise<string>`；
2. 在 `src/exporters/index.ts` 的 `REGISTRY` 里登记块类型字母；
3. `pnpm build` 后重新加载插件。

## 六、导出策略说明（为什么不是「一键导出成 md」）

思源自己也能导出 Markdown，但对静态站点有两个硬伤：

1. 它会丢掉/降级 Markdown 表达不了的内容（分栏、挂件、数据库视图、下划线高亮等）；
2. 它会在 markdown 里塞满 `{: id="20210101-xxxx"}` 这类思源私有属性，Hugo/Hexo 会把它们当正文渲染出来。

所以本插件按块类型分流：能 md 的走内核 kramdown（保证保真）+ 清洗私有属性；不能 md 的用清洗后的 HTML 保留视觉结构。每篇文档导出后在 zip 根目录生成 `SIYUAN-EXPORT-REPORT.md`，列出所有「退化为 HTML」的位置。

## 七、已知限制

- 挂件 / 查询嵌入 / 数据库的动态行为无法静态化，只能导出当时的静态外观或占位块；
- 挂件引用的 `/widgets/...` 资源不会自动拷贝（需要手动放到站点 `static/` 下）；
- 媒体文件（视频/音频）如果是本地 `assets/` 路径，同样需要手动部署；
- 块引用（`((id "文字"))`）导出为纯文本，不生成跨文档锚点；
- 超级块内是纯 HTML，因此内部不再解析 Markdown（这是 CommonMark 的规则，不是 bug）。

## 八、开发

```bash
pnpm i          # 或 npm i
pnpm build      # esbuild 打包 → dist/（可直接放进 data/plugins/）
pnpm typecheck  # tsc --noEmit
```

自测：`node test/loader.mjs` 校验插件导出契约；`node test/run.mjs` 用假内核 API 跑一遍端到端导出（需要先 `npx esbuild test/entry.ts --bundle --format=cjs --platform=node --outfile=test/bundle.cjs`）。

调试：把 `dist/` 软链到 `{工作空间}/data/plugins/siyuan-export-md/`，改完重载插件；
开发者工具（右下角 `?` → 开发者工具）看 Console 日志，前缀 `[siyuan-export-md]`。
