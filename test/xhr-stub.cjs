"use strict";

/**
 * 测试用：把加载器发出的同步 XHR 映射到本地插件目录，模拟内核 /plugins/<name>/ 静态目录。
 */

const fs = require("fs");
const path = require("path");

function installXhrStub(root, name) {
  const prefix = "/plugins/" + (name || "siyuan-export-md") + "/";

  global.XMLHttpRequest = function () {
    this.status = 0;
    this.responseText = "";
    this._url = "";
    this.open = (method, url) => {
      this._url = String(url);
    };
    this.send = () => {
      const at = this._url.indexOf(prefix);
      // 加载器会追加 ?v=... 防止浏览器缓存，映射文件时要去掉查询串
      const rel = at >= 0 ? this._url.slice(at + prefix.length).split("?")[0] : "";
      const file = path.resolve(root, rel);
      if (!rel || !file.startsWith(path.resolve(root)) || !fs.existsSync(file)) {
        this.status = 404;
        this.responseText = "";
        return;
      }
      this.status = 200;
      this.responseText = fs.readFileSync(file, "utf8");
    };
  };
}

module.exports = { installXhrStub };
