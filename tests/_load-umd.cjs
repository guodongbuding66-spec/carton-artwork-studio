const fs = require("node:fs");
const vm = require("node:vm");

function loadBrowserModules(paths) {
  const context = {
    console,
    TextEncoder,
    TextDecoder,
    Blob,
    Response,
    Headers,
    DecompressionStream,
    Uint8Array,
    ArrayBuffer,
    DataView,
    URL,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    atob: (s) => Buffer.from(String(s), "base64").toString("binary"),
    btoa: (s) => Buffer.from(String(s), "binary").toString("base64")
  };
  vm.createContext(context);
  for (const path of paths) {
    const code = fs.readFileSync(path, "utf8");
    vm.runInContext(code, context, { filename: path });
  }
  return context;
}

module.exports = { loadBrowserModules };
