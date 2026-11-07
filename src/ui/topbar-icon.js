/*
 * 顶栏图标：思源内置 symbol 里没有 "iconExport"（3.8.x 的图标精灵确实没有这个 id，
 * addTopBar 会照常建出按钮，但 <use> 指向空 symbol，看起来就是"没有图标"）。
 * 思源 addTopBar 的 icon 除内置 id 外也接受以 "<svg" 开头的整段 SVG 字符串
 * （desktop 分支直接 innerHTML 进 .toolbar__item，CSS 统一缩放到 15.5px），
 * 所以这里给一个自绘的"文档 + 导出箭头"图标，不依赖任何内置 symbol。
 */
"use strict";

/** 描边用 currentColor，跟随顶栏 color（深/浅主题、hover 变色都正常） */
const TOPBAR_ICON =
  '<svg viewBox="0 0 32 32" aria-hidden="true">' +
  '<rect x="4" y="4" width="15" height="24" rx="3" fill="none" stroke="currentColor" stroke-width="2.4"/>' +
  '<path d="M8.5 12h6.5M8.5 18h4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>' +
  '<path d="M19 16h9.5M23.5 11l5 5-5 5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>' +
  "</svg>";

module.exports = { TOPBAR_ICON };
