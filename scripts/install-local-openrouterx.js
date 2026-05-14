#!/usr/bin/env node

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const stagingDir = path.join(rootDir, "npm");
const localDir = path.join(rootDir, "npm-local");
const skipBuild = process.argv.includes("--skip-build");
const keepTarball = process.argv.includes("--keep-tarball");
const defaultMitmRouterBaseUrl = "http://localhost:20502";
const portMigrationNoticeName = "port-migration.json";
const legacyMitmRouterBaseUrls = new Set([
  "http://localhost:20128",
  "http://127.0.0.1:20128",
]);

function run(command, args, options = {}) {
  console.log(`$ ${command} ${args.join(" ")}`);
  return execFileSync(command, args, {
    cwd: options.cwd || rootDir,
    stdio: options.capture ? "pipe" : "inherit",
    encoding: "utf8",
    env: {
      ...process.env,
      ...options.env,
    },
  });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function remove(targetPath) {
  fs.rmSync(targetPath, { recursive: true, force: true });
}

function copy(source, target) {
  fs.cpSync(source, target, { recursive: true, force: true });
}

function getNpmGlobalBin() {
  const prefix = run("npm", ["prefix", "-g"], { capture: true }).trim();
  if (process.platform === "win32") {
    return prefix;
  }
  return path.join(prefix, "bin");
}

function getCommandPath(commandName) {
  if (process.platform === "win32") {
    return path.join(getNpmGlobalBin(), `${commandName}.cmd`);
  }
  return path.join(getNpmGlobalBin(), commandName);
}

function getDataDir() {
  return process.platform === "win32"
    ? path.join(process.env.APPDATA || os.homedir(), "openrouterx")
    : path.join(os.homedir(), ".openrouterx");
}

function normalizeMitmRouterBaseUrl(value) {
  const raw = String(value || "").trim().replace(/\/+$/, "");
  if (!raw || legacyMitmRouterBaseUrls.has(raw)) return defaultMitmRouterBaseUrl;
  return raw;
}

function refreshJsonSettings(dataDir) {
  const filePath = path.join(dataDir, "db.json");
  if (!fs.existsSync(filePath)) return false;
  try {
    const data = readJson(filePath);
    if (!data || typeof data !== "object") return false;
    if (!data.settings || typeof data.settings !== "object" || Array.isArray(data.settings)) {
      data.settings = {};
    }
    const next = normalizeMitmRouterBaseUrl(data.settings.mitmRouterBaseUrl);
    if (data.settings.mitmRouterBaseUrl === next) return false;
    data.settings.mitmRouterBaseUrl = next;
    writeJson(filePath, data);
    return true;
  } catch {
    return false;
  }
}

function refreshSqliteSettings(dataDir) {
  const filePath = path.join(dataDir, "db", "data.sqlite");
  if (!fs.existsSync(filePath)) return false;
  let Database;
  try {
    Database = require("better-sqlite3");
  } catch {
    return false;
  }

  let db;
  try {
    db = new Database(filePath);
    const table = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'settings'").get();
    if (!table) return false;
    const row = db.prepare("SELECT id, data FROM settings WHERE id = 1").get();
    if (!row) return false;
    const settings = JSON.parse(row.data || "{}");
    const next = normalizeMitmRouterBaseUrl(settings.mitmRouterBaseUrl);
    if (settings.mitmRouterBaseUrl === next) return false;
    settings.mitmRouterBaseUrl = next;
    db.prepare("UPDATE settings SET data = ? WHERE id = ?").run(JSON.stringify(settings), row.id);
    return true;
  } catch {
    return false;
  } finally {
    try { db?.close(); } catch {}
  }
}

function refreshRuntimePortSettings() {
  const dataDir = getDataDir();
  const changed = [];
  if (refreshJsonSettings(dataDir)) changed.push("db.json");
  if (refreshSqliteSettings(dataDir)) changed.push("data.sqlite");
  if (changed.length > 0) {
    const noticeDir = path.join(dataDir, "notices");
    fs.mkdirSync(noticeDir, { recursive: true });
    writeJson(path.join(noticeDir, portMigrationNoticeName), {
      id: "port-migration-20128-20502",
      type: "port-migration",
      fromPort: 20128,
      toPort: 20502,
      fromBaseUrl: "http://localhost:20128",
      toBaseUrl: defaultMitmRouterBaseUrl,
      stores: changed,
      createdAt: new Date().toISOString(),
    });
    console.log(`refreshed MITM router port settings: ${changed.join(", ")} -> ${defaultMitmRouterBaseUrl}`);
  }
}

function main() {
  if (!skipBuild) {
    run("npm", ["run", "release:npm:dry"]);
  } else {
    run("npm", ["run", "release:npm:dry", "--", "--skip-build"]);
  }

  assert(fs.existsSync(path.join(stagingDir, "package.json")), "missing npm/package.json; release staging was not generated");

  remove(localDir);
  copy(stagingDir, localDir);

  const pkgPath = path.join(localDir, "package.json");
  const cliPath = path.join(localDir, "cli.js");
  const pkg = readJson(pkgPath);

  pkg.name = "openrouterx-local";
  pkg.description = "Local install build for openrouterX testing";
  pkg.bin = {
    openrouterX: "./cli.js",
  };

  writeJson(pkgPath, pkg);

  let cli = fs.readFileSync(cliPath, "utf8");
  cli = cli.replace(/9router is running in background/g, "openrouterX is running in background");
  cli = cli.replace(/Choose Interface \(9router\)/g, "Choose Interface (openrouterX)");
  cli = cli.replace(/Use PORT=<new-port> 9router/g, "Use PORT=<new-port> openrouterX");
  fs.writeFileSync(cliPath, cli);

  const packOutput = run("npm", ["pack", "--json"], { cwd: localDir, capture: true });
  const packResult = JSON.parse(packOutput)[0];
  const tarballPath = path.join(localDir, packResult.filename);

  run("npm", ["install", "-g", tarballPath, "--ignore-scripts=false", "--force"]);
  refreshRuntimePortSettings();

  const commandPath = getCommandPath("openrouterX");
  assert(fs.existsSync(commandPath), `openrouterX command was not installed: ${commandPath}`);

  const globalPrefix = run("npm", ["prefix", "-g"], { capture: true }).trim();
  const globalPackageRoot = process.platform === "win32"
    ? path.join(globalPrefix, "node_modules", "openrouterx-local")
    : path.join(globalPrefix, "lib", "node_modules", "openrouterx-local");
  const installedPostinstall = path.join(globalPackageRoot, "hooks", "postinstall.js");
  if (fs.existsSync(installedPostinstall)) {
    run(process.execPath, [installedPostinstall]);
  }

  console.log("openrouterX local install ok");
  console.log(`command: ${commandPath}`);
  console.log("run: openrouterX");
  console.log("dashboard: http://localhost:20502/dashboard");
  console.log("uninstall: npm uninstall -g openrouterx-local");

  if (!keepTarball) {
    fs.rmSync(tarballPath, { force: true });
  } else {
    console.log(`kept tarball: ${tarballPath}`);
  }
}

try {
  main();
} catch (error) {
  console.error(`openrouterX local install failed: ${error.message}`);
  process.exit(1);
}
