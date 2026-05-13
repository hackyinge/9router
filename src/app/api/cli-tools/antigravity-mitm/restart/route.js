import { execFile, spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import {
  buildAntigravityLaunchArgs,
  buildAntigravityLaunchEnv,
  createAntigravityInstanceId,
  getAntigravityStateDbPath,
  getDefaultAntigravityUserDataDir,
  getNewAntigravityUserDataDir,
} from "../launchHelpers.js";

const execFileAsync = promisify(execFile);
const ANTIGRAVITY_NAME_RE = /antigravity/i;

function uniq(values) {
  return [...new Set(values.filter(Boolean))];
}

function normalizePath(input) {
  const value = String(input || "").trim();
  if (!value) return "";
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return value;
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function listMatchingApps(rootDir, maxDepth = 3) {
  const matches = [];

  async function walk(currentDir, depth) {
    if (depth > maxDepth) return;
    let entries = [];
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (!entry.isDirectory()) continue;

      if (entry.name.endsWith(".app")) {
        if (ANTIGRAVITY_NAME_RE.test(entry.name)) matches.push(fullPath);
        continue;
      }

      if (depth < maxDepth) await walk(fullPath, depth + 1);
    }
  }

  await walk(rootDir, 0);
  return matches;
}

async function scanMacAntigravityApps() {
  const home = os.homedir();
  const directCandidates = [
    "/Applications/Antigravity.app",
    "/Applications/Google Antigravity.app",
    path.join(home, "Applications", "Antigravity.app"),
    path.join(home, "Applications", "Google Antigravity.app"),
  ];

  const direct = [];
  for (const candidate of directCandidates) {
    if (await pathExists(candidate)) direct.push(candidate);
  }

  const scanned = [];
  for (const dir of ["/Applications", path.join(home, "Applications")]) {
    scanned.push(...await listMatchingApps(dir));
  }

  return uniq([...direct, ...scanned]);
}

async function scanWindowsAntigravityApps() {
  const roots = uniq([
    process.env.LOCALAPPDATA,
    process.env.PROGRAMFILES,
    process.env["PROGRAMFILES(X86)"],
  ]);
  const candidates = [];
  const names = [
    "Antigravity\\Antigravity.exe",
    "Google\\Antigravity\\Antigravity.exe",
    "Antigravity\\antigravity.exe",
  ];

  for (const root of roots) {
    for (const name of names) {
      const candidate = path.join(root, name);
      if (await pathExists(candidate)) candidates.push(candidate);
    }
  }

  return uniq(candidates);
}

async function scanLinuxAntigravityApps() {
  const home = os.homedir();
  const candidates = [
    "/usr/bin/antigravity",
    "/usr/local/bin/antigravity",
    "/opt/Antigravity/antigravity",
    path.join(home, ".local", "bin", "antigravity"),
  ];
  const found = [];

  for (const candidate of candidates) {
    if (await pathExists(candidate)) found.push(candidate);
  }

  return found;
}

async function scanAntigravityInstallations() {
  if (process.platform === "darwin") return scanMacAntigravityApps();
  if (process.platform === "win32") return scanWindowsAntigravityApps();
  return scanLinuxAntigravityApps();
}

async function quitAntigravity() {
  if (process.platform === "darwin") {
    await execFileAsync("/usr/bin/osascript", ["-e", 'tell application "Antigravity" to quit']).catch(() => {});
    await execFileAsync("/usr/bin/pkill", ["-x", "Antigravity"]).catch(() => {});
    await execFileAsync("/usr/bin/pkill", ["-f", "Antigravity.app/Contents/MacOS"]).catch(() => {});
    return;
  }

  if (process.platform === "win32") {
    await execFileAsync("taskkill", ["/IM", "Antigravity.exe", "/T", "/F"], { windowsHide: true }).catch(() => {});
    await execFileAsync("taskkill", ["/IM", "antigravity.exe", "/T", "/F"], { windowsHide: true }).catch(() => {});
    return;
  }

  await execFileAsync("pkill", ["-x", "antigravity"]).catch(() => {});
  await execFileAsync("pkill", ["-f", "Antigravity"]).catch(() => {});
}

async function getMacAppExecutable(appPath) {
  if (!appPath.endsWith(".app")) return appPath;

  const infoPath = path.join(appPath, "Contents", "Info.plist");
  try {
    const { stdout } = await execFileAsync("/usr/bin/defaults", ["read", infoPath.replace(/\.plist$/, ""), "CFBundleExecutable"]);
    const executableName = stdout.trim();
    if (executableName) return path.join(appPath, "Contents", "MacOS", executableName);
  } catch {
    // Fall through to the Electron default used by Antigravity builds.
  }

  return path.join(appPath, "Contents", "MacOS", "Electron");
}

async function copyStateDbFamily(sourceDbPath, targetDbPath) {
  const sourceDir = path.dirname(sourceDbPath);
  const targetDir = path.dirname(targetDbPath);
  const baseName = path.basename(sourceDbPath);
  let copied = false;

  await fs.mkdir(targetDir, { recursive: true });

  let entries = [];
  try {
    entries = await fs.readdir(sourceDir);
  } catch {
    return { copiedState: false, sourceDbPath, targetDbPath };
  }

  for (const entry of entries) {
    if (entry !== baseName && !entry.startsWith(`${baseName}-`)) continue;
    const source = path.join(sourceDir, entry);
    const target = path.join(targetDir, entry);
    try {
      await fs.copyFile(source, target);
      copied = true;
    } catch {
      // A live SQLite sidecar can disappear between readdir and copy; the main
      // state DB copy is enough for freshly injected Antigravity auth.
    }
  }

  return { copiedState: copied, sourceDbPath, targetDbPath };
}

async function prepareNewAntigravityInstanceProfile() {
  const home = os.homedir();
  const userDataDir = getNewAntigravityUserDataDir(home, createAntigravityInstanceId());
  const sourceDbPath = getAntigravityStateDbPath(getDefaultAntigravityUserDataDir(home));
  const targetDbPath = getAntigravityStateDbPath(userDataDir);
  const copyResult = await copyStateDbFamily(sourceDbPath, targetDbPath);

  return {
    userDataDir,
    ...copyResult,
  };
}

async function launchAntigravity(appPath, { mode = "restart", userDataDir = "" } = {}) {
  const env = buildAntigravityLaunchEnv();
  const launchArgs = buildAntigravityLaunchArgs({ mode, userDataDir });

  if (process.platform === "darwin") {
    const executable = await getMacAppExecutable(appPath);
    if (!await pathExists(executable)) {
      const openArgs = mode === "new"
        ? ["-n", appPath, "--args", ...launchArgs]
        : [appPath];
      await execFileAsync("/usr/bin/open", openArgs, { env });
      return;
    }
    const child = spawn(executable, launchArgs, {
      cwd: os.homedir(),
      detached: true,
      env,
      stdio: "ignore",
    });
    child.unref();
    return;
  }

  const child = spawn(appPath, launchArgs, {
    detached: true,
    env,
    stdio: "ignore",
    windowsHide: false,
  });
  child.unref();
}

export async function GET() {
  try {
    const installations = await scanAntigravityInstallations();
    return NextResponse.json({ installations });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Failed to scan Antigravity installations" },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const manualPath = normalizePath(body.path);
    const mode = body.mode === "new" ? "new" : "restart";
    const installations = manualPath ? [manualPath] : await scanAntigravityInstallations();
    const appPath = installations[0];

    if (!appPath) {
      return NextResponse.json(
        {
          error: "Antigravity installation was not found",
          needsManualPath: true,
          installations: [],
        },
        { status: 404 },
      );
    }

    if (!await pathExists(appPath)) {
      return NextResponse.json(
        {
          error: `Antigravity path does not exist: ${appPath}`,
          needsManualPath: true,
          path: appPath,
        },
        { status: 400 },
      );
    }

    let instanceProfile = null;
    if (mode === "restart") {
      await quitAntigravity();
      await new Promise((resolve) => setTimeout(resolve, 900));
    } else {
      instanceProfile = await prepareNewAntigravityInstanceProfile();
    }

    await launchAntigravity(appPath, { mode, userDataDir: instanceProfile?.userDataDir || "" });

    return NextResponse.json({
      success: true,
      mode,
      newInstance: mode === "new",
      path: appPath,
      userDataDir: instanceProfile?.userDataDir || null,
      copiedState: instanceProfile?.copiedState ?? null,
      scanned: !manualPath,
      installations,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Failed to restart Antigravity" },
      { status: 500 },
    );
  }
}
