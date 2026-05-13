import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const ANTIGRAVITY_NO_PROXY_HOSTS = [
  "localhost",
  "127.0.0.1",
  "::1",
  "cloudcode-pa.googleapis.com",
  "daily-cloudcode-pa.googleapis.com",
  "daily-cloudcode-pa.sandbox.googleapis.com",
];

const APP_MANAGED_PROXY_ENV_KEYS = [
  "NINE_ROUTER_PROXY_URL",
  "NINE_ROUTER_PROXY_MANAGED",
];

export function getDefaultAntigravityUserDataDir(homeDir, platform = process.platform) {
  if (platform === "win32") {
    return path.join(homeDir, "AppData", "Roaming", "Antigravity");
  }
  if (platform === "linux") {
    return path.join(homeDir, ".config", "Antigravity");
  }
  return path.join(homeDir, "Library", "Application Support", "Antigravity");
}

export function getNewAntigravityUserDataDir(homeDir, instanceId) {
  return path.join(homeDir, ".openrouterx", "antigravity-instances", instanceId);
}

export function getAntigravityStateDbPath(userDataDir) {
  return path.join(userDataDir, "User", "globalStorage", "state.vscdb");
}

export function buildAntigravityLaunchArgs({ mode, userDataDir }) {
  if (mode !== "new" || !userDataDir) return [];
  return ["--user-data-dir", userDataDir];
}

export function mergeAntigravityNoProxy(existing) {
  const seen = new Set();
  return [
    ...String(existing || "").split(","),
    ...ANTIGRAVITY_NO_PROXY_HOSTS,
  ]
    .map((entry) => entry.trim())
    .filter((entry) => {
      if (!entry || seen.has(entry)) return false;
      seen.add(entry);
      return true;
    })
    .join(",");
}

export function mergeAntigravityGoDebug(existing) {
  const entries = String(existing || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry && !entry.startsWith("netdns="));
  entries.push("netdns=cgo");
  return entries.join(",");
}

export function buildAntigravityLaunchEnv({
  baseEnv = process.env,
  homeDir = os.homedir(),
  rootCaExists = fs.existsSync,
} = {}) {
  const env = { ...baseEnv };
  for (const key of APP_MANAGED_PROXY_ENV_KEYS) delete env[key];

  const noProxy = mergeAntigravityNoProxy(baseEnv.NO_PROXY || baseEnv.no_proxy);
  env.NO_PROXY = noProxy;
  env.no_proxy = noProxy;
  env.GODEBUG = mergeAntigravityGoDebug(baseEnv.GODEBUG);

  const rootCaPath = path.join(homeDir, ".openrouterx", "mitm", "rootCA.crt");
  if (rootCaExists(rootCaPath)) {
    env.NODE_EXTRA_CA_CERTS = rootCaPath;
  }

  return env;
}

export function createAntigravityInstanceId(now = new Date(), randomValue = Math.random()) {
  const timestamp = now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const suffix = Math.floor(randomValue * 0xffffff).toString(16).padStart(6, "0");
  return `${timestamp}-${suffix}`;
}
