#!/usr/bin/env node

const Module = require("module");
const originalLoad = Module._load;

Module._load = function patchedNextBuildLoad(request, parent, isMain) {
  const loaded = originalLoad.apply(this, arguments);
  if (request === "./generate-build-id" || request.endsWith("/generate-build-id")) {
    return {
      ...loaded,
      generateBuildId: async (generate, fallback) => {
        const safeGenerate = typeof generate === "function" ? generate : () => null;
        return loaded.generateBuildId(safeGenerate, fallback);
      },
    };
  }
  return loaded;
};

process.argv = [
  process.argv[0],
  require.resolve("next/dist/bin/next"),
  "build",
  ...process.argv.slice(2),
];

require("next/dist/bin/next");
