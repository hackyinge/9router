import fs from "fs";
import path from "path";
import os from "os";

export const APP_NAME = "openrouterx";
export const LEGACY_APP_NAME = "9router";

const LEGACY_DATA_FILES = [
  "db.json",
  "usage.json",
  "log.txt",
  "disabledModels.json",
  "request-details.json",
];

function resolveHomeDataDir(appName) {
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), appName);
  }
  return path.join(os.homedir(), `.${appName}`);
}

export function getLegacyDataDir() {
  return resolveHomeDataDir(LEGACY_APP_NAME);
}

export function getDataDir() {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  return resolveHomeDataDir(APP_NAME);
}

export function getDataDir() {
  const configured = process.env.DATA_DIR;
  if (!configured) return defaultDir();
  try {
    fs.mkdirSync(configured, { recursive: true });
    return configured;
  } catch (e) {
    if (e?.code === "EACCES" || e?.code === "EPERM") {
      console.warn(`[DATA_DIR] '${configured}' not writable → fallback ~/.${APP_NAME}`);
      return defaultDir();
    }
    throw e;
  }
}

export const DATA_DIR = getDataDir();
export const DB_FILE = path.join(DATA_DIR, "db.json");

export function migrateLegacyDataFilesIfNeeded() {
  if (process.env.DATA_DIR) return false;

  const legacyDataDir = getLegacyDataDir();
  if (legacyDataDir === DATA_DIR || !fs.existsSync(legacyDataDir)) return false;

  let migrated = false;
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  for (const fileName of LEGACY_DATA_FILES) {
    const from = path.join(legacyDataDir, fileName);
    const to = path.join(DATA_DIR, fileName);
    if (fs.existsSync(from) && !fs.existsSync(to)) {
      fs.copyFileSync(from, to);
      migrated = true;
    }
  }

  return migrated;
}

migrateLegacyDataFilesIfNeeded();
