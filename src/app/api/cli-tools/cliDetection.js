import { exec, execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import os from "os";

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

const COMMON_UNIX_PATHS = [
  "/opt/homebrew/bin",
  "/opt/homebrew/sbin",
  "/usr/local/bin",
  "/usr/bin",
  "/bin",
  "/usr/sbin",
  "/sbin",
  "/Applications/Codex.app/Contents/Resources",
];

async function getNvmBinDirs() {
  if (os.platform() === "win32") return [];
  const versionsDir = path.join(os.homedir(), ".nvm", "versions", "node");
  try {
    const versions = await fs.readdir(versionsDir);
    return versions.map((version) => path.join(versionsDir, version, "bin"));
  } catch {
    return [];
  }
}

function dedupe(items) {
  return [...new Set(items.filter(Boolean))];
}

async function buildLookupEnv() {
  const delimiter = path.delimiter;
  if (os.platform() === "win32") {
    return {
      ...process.env,
      PATH: dedupe([
        process.env.APPDATA ? path.join(process.env.APPDATA, "npm") : null,
        ...(process.env.PATH || "").split(delimiter),
      ]).join(delimiter),
    };
  }

  const nvmBinDirs = await getNvmBinDirs();
  return {
    ...process.env,
    PATH: dedupe([
      ...(process.env.PATH || "").split(delimiter),
      ...nvmBinDirs,
      ...COMMON_UNIX_PATHS,
    ]).join(delimiter),
  };
}

async function commandLookup(command, env) {
  const isWindows = os.platform() === "win32";
  const lookup = isWindows ? `where ${command}` : `command -v ${command}`;
  const { stdout } = await execAsync(lookup, { windowsHide: true, env });
  return stdout.split(/\r?\n/).find(Boolean)?.trim() || command;
}

async function loginShellLookup(command, env) {
  if (os.platform() === "win32") return null;
  if (!/^[a-zA-Z0-9._-]+$/.test(command)) return null;
  try {
    const { stdout } = await execFileAsync("/bin/zsh", ["-lc", `command -v ${command}`], {
      windowsHide: true,
      env,
      timeout: 3000,
    });
    return stdout.split(/\r?\n/).find(Boolean)?.trim() || null;
  } catch {
    return null;
  }
}

async function firstExistingPath(candidates = []) {
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Continue probing other known install locations.
    }
  }
  return null;
}

export async function resolveCliBinary(command, { fallbackCandidates = [] } = {}) {
  const env = await buildLookupEnv();

  try {
    const binaryPath = await commandLookup(command, env);
    return { installed: true, source: "cli", binaryPath };
  } catch {
    const binaryPath = await loginShellLookup(command, env);
    if (binaryPath) return { installed: true, source: "login-shell", binaryPath };
  }

  const fallbackPath = await firstExistingPath(fallbackCandidates);
  if (fallbackPath) return { installed: true, source: "app", binaryPath: fallbackPath };

  return { installed: false };
}

export async function firstExistingCandidate(candidates = []) {
  return firstExistingPath(candidates);
}
