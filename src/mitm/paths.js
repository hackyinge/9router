const fs = require("fs");
const path = require("path");
const os = require("os");

const APP_DATA_DIR_NAME = "openrouterx";

function getDataDir() {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  if (process.platform === "win32") {
    return path.join(
      process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"),
      APP_DATA_DIR_NAME
    );
  }
  return path.join(os.homedir(), `.${APP_DATA_DIR_NAME}`);
}

const DATA_DIR = getDataDir();
const MITM_DIR = path.join(DATA_DIR, "mitm");

module.exports = { DATA_DIR, MITM_DIR };
