/*
 * siyuan-export-md — 插件入口：思源 Plugin 生命周期，界面逻辑委托给 ui/dialog
 *
 * 正文以 HTML 为主，标题默认输出 Markdown（## 标题），面板可切回 HTML；
 * 因此这里不再暴露 kramdown / Markdown 空白整理 / 公式转义这类中间层符号。
 */
"use strict";

const { DEFAULT_OPTIONS, LOG_PREFIX } = require("./config");
const { currentDocId, idFromProtyle, isDocId, openDialog, doExport, exportDocs, downloadBytes } = require("./ui/dialog");
const { openManager, injectStyles, removeStyles } = require("./ui/panel");
const { ExportLog, normalizeStore, pathOf } = require("./export-log");
const { PathOverrides } = require("./path-store");
const { buildDocTree, countTreeDocs } = require("./doc-tree");
const { slugify, asciiFileName, docPaths } = require("./naming");
const { buildPathPlan, sanitizeSegment, normalizeOverride } = require("./path-plan");
const { buildSectionFrontMatter, buildTomlFrontMatter, frontmatterSyntax } = require("./document");
const { normalizeType } = require("./api");
const { AssetStore } = require("./assets");
const { exportDocument } = require("./document");
const { exportSite } = require("./site");
const { renderBlock, renderBlockSafe, renderBlockHtml, renderChildrenHtml } = require("./render/dispatch");
const { renderElement } = require("./render/block");
const { normalizeLatex, mathInline, mathBlock } = require("./math");
const { compactHtml } = require("./utils");
const { writeFilesToFolder } = require("./output");
const { TOPBAR_ICON } = require("./ui/topbar-icon");
const { Plugin } = require("siyuan");

class SiYuanHtmlExporter extends Plugin {
  /** 思源以 new PluginClass(options) 构造，options 里带 app 等运行时上下文，必须原样转发给基类 */
  constructor(options) {
    super(options);
    this.opts = { ...DEFAULT_OPTIONS };
    this.dialog = null;
    /** 最后激活的编辑器；每次打开面板时用它取「当前文档」 */
    this.activeProtyle = null;
    /** 导出记录（控制页的数据源），onload 里加载 */
    this.exportLog = new ExportLog(this);
    /** 面板里逐页改过的相对目录（导出时优先使用） */
    this.pathOverrides = new PathOverrides(this);
    this.managerPanel = null;
    this.managerTabRegistered = false;
  }

  async onload() {
    console.log(LOG_PREFIX, "loaded");
    this.trackActiveProtyle();
    try {
      const saved = await this.loadData("options");
      if (saved) this.opts = { ...DEFAULT_OPTIONS, ...saved };
      /* 旧版本存过 debugComment（来源注释开关，已删除），清掉免得残留 */
      if (this.opts.debugComment !== undefined) delete this.opts.debugComment;
    } catch (e) {
      /* 首次加载没有配置 */
    }
    try {
      await this.exportLog.load();
    } catch (e) {
      console.warn(LOG_PREFIX, "读取导出记录失败", e);
    }
    try {
      await this.pathOverrides.load();
    } catch (e) {
      console.warn(LOG_PREFIX, "读取页面目录覆盖失败", e);
    }
    injectStyles();

    this.addTopBar({
      icon: TOPBAR_ICON,
      title: String((this.i18n && this.i18n.topbarTitle) || "导出 Html"),
      position: "right",
      callback: () => this.openDialog(),
      contextMenu: (menu) => {
        menu.addItem({
          icon: "iconSettings",
          label: String((this.i18n && this.i18n.menuExport) || "导出为 HTML"),
          click: () => this.openDialog()
        });
        menu.addItem({
          icon: "iconList",
          label: String((this.i18n && this.i18n.menuManager) || "导出管理"),
          click: () => this.openManager()
        });
      }
    });

    this.addCommand({
      langKey: "exportMarkdown",
      langText: String((this.i18n && this.i18n.commandTitle) || "导出为 HTML（Hexo/Hugo）"),
      hotkey: "⌥⇧E",
      execute: (context) => this.openDialog(context && context.protyle)
    });

    this.addCommand({
      langKey: "openManager",
      langText: String((this.i18n && this.i18n.managerCommandTitle) || "打开导出管理页"),
      execute: () => this.openManager()
    });
  }

  onunload() {
    if (this.dialog) this.dialog.destroy();
    this.dialog = null;
    this.activeProtyle = null;
    if (this.managerPanel) {
      this.managerPanel.destroy();
      this.managerPanel = null;
    }
    removeStyles();
    this.managerTabRegistered = false;
  }

  /**
   * 顶栏按钮不经过命令上下文，拿不到 protyle，所以订阅事件总线记录最后激活的编辑器：
   * loaded-protyle-static（打开/切到某篇文档时加载）、loaded-protyle-dynamic（同篇文档懒加载）、
   * switch-protyle（编辑器内切换文档）、click-editorcontent（在哪个编辑区里点过）。
   * destroy-protyle 关掉当前那篇时清空，避免拿着已经销毁的 protyle 取 id。
   */
  trackActiveProtyle() {
    const bus = this.eventBus;
    if (!bus || typeof bus.on !== "function") return;
    const remember = (event) => {
      const protyle = event && event.detail && event.detail.protyle;
      if (protyle) this.activeProtyle = protyle;
    };
    const forget = (event) => {
      const protyle = event && event.detail && event.detail.protyle;
      if (protyle && protyle === this.activeProtyle) this.activeProtyle = null;
    };
    ["loaded-protyle-static", "loaded-protyle-dynamic", "switch-protyle", "click-editorcontent"].forEach((name) => {
      try {
        bus.on(name, remember);
      } catch (e) {
        console.warn(LOG_PREFIX, "订阅事件失败", name, e);
      }
    });
    try {
      bus.on("destroy-protyle", forget);
    } catch (e) {
      console.warn(LOG_PREFIX, "订阅事件失败", "destroy-protyle", e);
    }
  }

  currentDocId(protyle) {
    return currentDocId(protyle, this.activeProtyle);
  }

  openDialog(protyle) {
    return openDialog(this, protyle);
  }

  doExport(opts, docIdInput, notebookEl, setStatus) {
    return doExport(this, opts, docIdInput, notebookEl, setStatus);
  }

  exportDocs(opts, docIds, notebookName, setStatus) {
    return exportDocs(this, opts, docIds, notebookName, setStatus);
  }

  openManager() {
    return openManager(this);
  }

  download(bytes, filename) {
    return downloadBytes(bytes, filename);
  }
}

module.exports = SiYuanHtmlExporter;
module.exports.default = SiYuanHtmlExporter;
/** 自测用：暴露纯函数，生产环境无副作用（只列 test/ 里实际用到的符号）。 */
module.exports.__internals = {
  DEFAULT_OPTIONS,
  slugify,
  asciiFileName,
  docPaths,
  normalizeType,
  AssetStore,
  exportSite,
  exportDocument,
  buildPathPlan,
  normalizeOverride,
  sanitizeSegment,
  buildSectionFrontMatter,
  buildTomlFrontMatter,
  frontmatterSyntax,
  renderBlock,
  renderBlockSafe,
  renderBlockHtml,
  renderChildrenHtml,
  renderElement,
  normalizeLatex,
  mathInline,
  mathBlock,
  compactHtml,
  writeFilesToFolder,
  currentDocId,
  idFromProtyle,
  isDocId,
  ExportLog,
  PathOverrides,
  normalizeStore,
  pathOf,
  buildDocTree,
  countTreeDocs,
  createPanel: require("./ui/panel").createPanel,
};
