/*
 * siyuan-export-md — 导出对话框：表单、进度、下载（由插件实例调用）
 *
 * 正文一律是 HTML，面板上不再有公式格式 / 表格格式 / rawhtml 短代码这些
 * Markdown 相关开关。
 */
"use strict";

const { LOG_PREFIX } = require("../config");
const { listNotebooks } = require("../api");
const { escapeHtml } = require("../utils");
const { docsOfNotebook } = require("../document");
const { exportSite } = require("../site");
const { Dialog, showMessage } = require("siyuan");

function currentDocId(protyle) {
  if (protyle && protyle.block && protyle.block.rootID) return protyle.block.rootID;
  if (protyle && protyle.background && protyle.background.id) return protyle.background.id;
  const titleEl = document.querySelector(".protyle-title[data-node-id]");
  if (titleEl) {
    const id = titleEl.getAttribute("data-node-id") || "";
    if (id) return id;
  }
  return "";
}

function openDialog(plugin, protyle) {
  const self = plugin;
  if (self.dialog) {
    self.dialog.destroy();
    self.dialog = null;
  }
  const docId = self.currentDocId(protyle);
  const content = `
<div class="b3-dialog__content" style="padding: 8px 24px 0;">
  <div style="display:flex;flex-direction:column;gap:12px;font-size:13px;">
    <div style="display:flex;align-items:center;gap:8px;">
      <label style="width:82px;color:var(--b3-theme-on-surface-variant);">站点类型</label>
      <select id="sySite" class="b3-select" style="width:170px;">
        <option value="hugo">Hugo</option>
        <option value="hexo">Hexo</option>
      </select>
      <select id="syHugoLayout" class="b3-select" style="width:230px;">
        <option value="file">单文件 + static/siyuan/&lt;slug&gt;</option>
        <option value="bundle">page bundle（content/posts/&lt;slug&gt;/）</option>
      </select>
    </div>
    <div style="display:flex;align-items:center;gap:8px;">
      <label style="width:82px;color:var(--b3-theme-on-surface-variant);">导出范围</label>
      <select id="syScope" class="b3-select" style="width:170px;">
        <option value="doc">当前文档</option>
        <option value="notebook">整个笔记本</option>
      </select>
      <select id="syNotebook" class="b3-select" style="width:230px;display:none;"></select>
    </div>
    <div id="syDocRow" style="display:flex;align-items:center;gap:8px;">
      <label style="width:82px;color:var(--b3-theme-on-surface-variant);">文档 ID</label>
      <input id="syDocId" class="b3-text-field fn__flex-1" placeholder="留空则自动取当前打开的文档" value="${escapeHtml(docId)}" />
    </div>
    <div style="display:flex;flex-direction:column;gap:8px;padding-left:90px;">
      <label style="display:flex;align-items:center;gap:6px;">
        <input type="checkbox" id="syAssets" class="b3-switch fn__flex-center" />
        <span>把图片等附件一起打包，并重写引用路径</span>
      </label>
      <label style="display:flex;align-items:center;gap:6px;">
        <input type="checkbox" id="syDemote" class="b3-switch fn__flex-center" />
        <span>标题自动降一级（页面标题占 h1）</span>
      </label>
      <label style="display:flex;align-items:center;gap:6px;">
        <input type="checkbox" id="syDebug" class="b3-switch fn__flex-center" />
        <span>在每个块前加来源注释（便于排查）</span>
      </label>
    </div>
    <div style="color:var(--b3-theme-on-surface-variant);font-size:12px;line-height:1.7;">
      正文输出为纯 HTML（h1–h6 / p / ul / ol / li / table / pre / blockquote / figure 等），
      站点需允许内联 HTML（Hugo：<code>markup.goldmark.renderer.unsafe = true</code>）。
    </div>
    <div id="syStatus" style="color:var(--b3-theme-on-surface-variant);min-height:20px;line-height:1.6;">准备就绪</div>
  </div>
</div>
<div class="b3-dialog__action" style="padding: 12px 24px 20px;display:flex;justify-content:flex-end;gap:8px;">
  <button class="b3-button b3-button--cancel" id="syCancel">取消</button>
  <button class="b3-button b3-button--text" id="syRun">开始导出</button>
</div>`;

  const dialog = new Dialog({
    title: String((self.i18n && self.i18n.dialogTitle) || "导出为 Hexo / Hugo（纯 HTML）"),
    content,
    width: "720px",
    destroyCallback: () => {
      self.dialog = null;
    }
  });
  self.dialog = dialog;

  const body = dialog.element;
  const siteEl = body.querySelector("#sySite");
  const hugoLayoutEl = body.querySelector("#syHugoLayout");
  const scopeEl = body.querySelector("#syScope");
  const notebookEl = body.querySelector("#syNotebook");
  const docRowEl = body.querySelector("#syDocRow");
  const docIdEl = body.querySelector("#syDocId");
  const assetsEl = body.querySelector("#syAssets");
  const demoteEl = body.querySelector("#syDemote");
  const debugEl = body.querySelector("#syDebug");
  const statusEl = body.querySelector("#syStatus");
  const runEl = body.querySelector("#syRun");
  const cancelEl = body.querySelector("#syCancel");

  siteEl.value = self.opts.site;
  scopeEl.value = self.opts.scope;
  assetsEl.checked = !!self.opts.copyAssets;
  demoteEl.checked = !!self.opts.headingDemote;
  debugEl.checked = !!self.opts.debugComment;
  hugoLayoutEl.value = self.opts.hugoLayout;

  const syncSite = () => {
    hugoLayoutEl.style.display = siteEl.value === "hugo" ? "" : "none";
  };
  const syncScope = () => {
    const isNotebook = scopeEl.value === "notebook";
    notebookEl.style.display = isNotebook ? "" : "none";
    docRowEl.style.display = isNotebook ? "none" : "flex";
  };
  syncSite();
  syncScope();
  siteEl.addEventListener("change", syncSite);
  scopeEl.addEventListener("change", syncScope);

  listNotebooks().then((notebooks) => {
    notebookEl.innerHTML = notebooks
      .map((nb) => `<option value="${escapeHtml(nb.id)}">${escapeHtml(nb.name)}</option>`)
      .join("");
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
      headingDemote: demoteEl.checked,
      hugoLayout: hugoLayoutEl.value,
      hugoContentDir: self.opts.hugoContentDir,
      frontmatter: self.opts.frontmatter,
      debugComment: debugEl.checked
    };
    self.opts = { ...self.opts, ...opts };
    void self.saveData("options", self.opts);
    runEl.disabled = true;
    try {
      await self.doExport(opts, docIdEl.value.trim(), notebookEl, setStatus);
      dialog.destroy();
    } catch (e) {
      console.error(LOG_PREFIX, e);
      setStatus("导出失败：" + ((e && e.message) || e));
      showMessage("导出失败：" + ((e && e.message) || e), 5000, "error");
    } finally {
      runEl.disabled = false;
    }
  });
}

async function doExport(plugin, opts, docIdInput, notebookEl, setStatus) {
  const self = plugin;
  let docIds = [];
  let notebookName = "";

  if (opts.scope === "notebook") {
    const box = notebookEl.value;
    if (!box) {
      setStatus("请先选择笔记本");
      return;
    }
    notebookName = (notebookEl.selectedOptions[0] && notebookEl.selectedOptions[0].textContent) || "";
    setStatus("正在读取文档列表…");
    docIds = await docsOfNotebook(box);
    if (!docIds.length) {
      setStatus("该笔记本下没有文档");
      return;
    }
  } else {
    if (!docIdInput) {
      setStatus("没有取到文档 ID：请先打开一篇文档，或手动粘贴文档 ID");
      return;
    }
    docIds = [docIdInput];
  }

  setStatus(`开始导出，共 ${docIds.length} 篇…`);
  const result = await exportSite(docIds, opts, notebookName, (done, total, title) => {
    setStatus(`(${done}/${total}) ${title}`);
  });

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const filename = `siyuan-${opts.site}-${stamp}.zip`;
  self.download(result.zip, filename);

  const warnText = result.warnings.length
    ? `；${result.warnings.length} 条告警见压缩包内 SIYUAN-EXPORT-REPORT.html`
    : "";
  setStatus(`完成：${result.docCount} 篇文档、${result.assetCount} 个资源、共 ${result.fileCount} 个文件${warnText}`);
  showMessage(`导出完成：${result.docCount} 篇文档${warnText}`, 6000);
}

function downloadBytes(bytes, filename) {
  const blob = new Blob([bytes], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

module.exports = {
  currentDocId,
  openDialog,
  doExport,
  downloadBytes,
};
