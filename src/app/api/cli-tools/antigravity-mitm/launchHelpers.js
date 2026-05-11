import path from "node:path";

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

export function createAntigravityInstanceId(now = new Date(), randomValue = Math.random()) {
  const timestamp = now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const suffix = Math.floor(randomValue * 0xffffff).toString(16).padStart(6, "0");
  return `${timestamp}-${suffix}`;
}
