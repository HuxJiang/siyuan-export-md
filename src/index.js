/*
 * siyuan-export-md — 插件入口：思源 Plugin 生命周期，界面逻辑委托给 ui/dialog
 * 由单文件 index.js 按功能拆分而来，业务代码保持原样。
 */
"use strict";

const { DEFAULT_OPTIONS, LOG_PREFIX } = require("./config");
const { currentDocId, openDialog, doExport, downloadBytes } = require("./ui/dialog");
const { cleanKramdown } = require("./kramdown");
const { applyMathFormat } = require("./math");
const { normalizeMarkdownWhitespace } = require("./markdown-text");
const { slugify, asciiFileName, docPaths } = require("./naming");
const { exportDocument } = require("./document");
const { normalizeType } = require("./api");
const { AssetStore } = require("./assets");
const { exportSite } = require("./site");
const { exportTable } = require("./render/exporters/table");
const { exportCallout } = require("./render/exporters/callout");
const { exportImage } = require("./render/exporters/image");
const { renderBlockHtml, renderChildrenHtml, wrapHtmlFragment } = require("./render/html");
const { TOPBAR_ICON } = require("./ui/topbar-icon");
const { Plugin } = require("siyuan");

class SiYuanMarkdownExporter extends Plugin {
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
      title: String((this.i18n && this.i18n.topbarTitle) || "导出 Markdown"),
      position: "right",
      callback: () => this.openDialog(),
      contextMenu: (menu) => {
        menu.addItem({
          icon: "iconSettings",
          label: String((this.i18n && this.i18n.menuExport) || "导出为 Markdown"),
          click: () => this.openDialog()
        });
      }
    });

    this.addCommand({
      langKey: "exportMarkdown",
      langText: String((this.i18n && this.i18n.commandTitle) || "导出为 Markdown（Hexo/Hugo）"),
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

module.exports = SiYuanMarkdownExporter;
module.exports.default = SiYuanMarkdownExporter;
/** 自测用：暴露纯函数，生产环境无副作用（只列 test/ 里实际用到的符号）。 */
module.exports.__internals = {
  DEFAULT_OPTIONS,
  cleanKramdown,
  applyMathFormat,
  normalizeMarkdownWhitespace,
  slugify,
  asciiFileName,
  docPaths,
  normalizeType,
  AssetStore,
  exportSite,
  exportDocument,
  exportTable,
  exportCallout,
  exportImage,
  renderBlockHtml,
  renderChildrenHtml,
  wrapHtmlFragment,
};
