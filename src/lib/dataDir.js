import fs from "fs";
import path from "path";
import os from "os";

const APP_NAME = "openrouterx";
const LEGACY_APP_NAME = "9router";

function resolveHomeDataDir(appName) {
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), appName);
  }
  return path.join(os.homedir(), `.${appName}`);
}

export function getDataDir() {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;

  const preferredDir = resolveHomeDataDir(APP_NAME);
  const legacyDir = resolveHomeDataDir(LEGACY_APP_NAME);

  if (!fs.existsSync(preferredDir) && fs.existsSync(legacyDir)) {
    return legacyDir;
  }

  return preferredDir;
}

export const DATA_DIR = getDataDir();
