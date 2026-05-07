import fs from "fs";
import path from "path";
import os from "os";

const APP_NAME = "openrouterx";

function resolveHomeDataDir(appName) {
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), appName);
  }
  return path.join(os.homedir(), `.${appName}`);
}

export function getDataDir() {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  return resolveHomeDataDir(APP_NAME);
}

export const DATA_DIR = getDataDir();
