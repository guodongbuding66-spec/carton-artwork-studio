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
    clearTimeout
  };
  vm.createContext(context);
  for (const path of paths) {
    const code = fs.readFileSync(path, "utf8");
    vm.runInContext(code, context, { filename: path });
  }
  return context;
}

module.exports = { loadBrowserModules };
