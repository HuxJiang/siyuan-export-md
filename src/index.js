/*
 * siyuan-export-md — 插件入口：思源 Plugin 生命周期，界面逻辑委托给 ui/dialog
 *
 * 正文以 HTML 为主，标题默认输出 Markdown（## 标题），面板可切回 HTML；
 * 因此这里不再暴露 kramdown / Markdown 空白整理 / 公式转义这类中间层符号。
 */
"use strict";

const { DEFAULT_OPTIONS, LOG_PREFIX } = require("./config");
const { currentDocId, openDialog, doExport, downloadBytes } = require("./ui/dialog");
const { slugify, asciiFileName, docPaths } = require("./naming");
const { normalizeType } = require("./api");
const { AssetStore } = require("./assets");
const { exportDocument } = require("./document");
const { exportSite } = require("./site");
const { renderBlock, renderBlockSafe, renderBlockHtml, renderChildrenHtml } = require("./render/dispatch");
const { renderElement } = require("./render/block");
const { normalizeLatex, mathInline, mathBlock } = require("./math");
const { compactHtml } = require("./utils");
const { TOPBAR_ICON } = require("./ui/topbar-icon");
const { Plugin } = require("siyuan");

class SiYuanHtmlExporter extends Plugin {
  /** 思源以 new PluginClass(options) 构造，options 里带 app 等运行时上下文，必须原样转发给基类 */
  constructor(options) {
    super(options);
    this.opts = { ...DEFAULT_OPTIONS };
    this.dialog = null;
  }

  async onload() {
    console.log(LOG_PREFIX, "loaded");
    try {
      const saved = await this.loadData("options");
      if (saved) this.opts = { ...DEFAULT_OPTIONS, ...saved };
    } catch (e) {
      /* 首次加载没有配置 */
    }

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
      }
    });

    this.addCommand({
      langKey: "exportMarkdown",
      langText: String((this.i18n && this.i18n.commandTitle) || "导出为 HTML（Hexo/Hugo）"),
      hotkey: "⌥⇧E",
      execute: (context) => this.openDialog(context && context.protyle)
    });
  }

  onunload() {
    if (this.dialog) this.dialog.destroy();
    this.dialog = null;
  }

  currentDocId(protyle) {
    return currentDocId(protyle);
  }

  openDialog(protyle) {
    return openDialog(this, protyle);
  }

  doExport(opts, docIdInput, notebookEl, setStatus) {
    return doExport(this, opts, docIdInput, notebookEl, setStatus);
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
  renderBlock,
  renderBlockSafe,
  renderBlockHtml,
  renderChildrenHtml,
  renderElement,
  normalizeLatex,
  mathInline,
  mathBlock,
  compactHtml,
};
