#!/usr/bin/env node

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const stagingDir = path.join(rootDir, "npm");
const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const prepareOnly = args.has("--prepare-only");
const skipBuild = args.has("--skip-build");
const registryArg = process.argv.find((arg) => arg.startsWith("--registry="));
const tagArg = process.argv.find((arg) => arg.startsWith("--tag="));
const registry = registryArg ? registryArg.slice("--registry=".length) : "https://registry.npmjs.org/";
const tag = tagArg ? tagArg.slice("--tag=".length) : "latest";

function run(command, commandArgs, options = {}) {
  console.log(`$ ${command} ${commandArgs.join(" ")}`);
  return execFileSync(command, commandArgs, {
    cwd: options.cwd || rootDir,
    stdio: options.capture ? "pipe" : "inherit",
    encoding: "utf8",
    env: {
      ...process.env,
      NODE_ENV: options.nodeEnv || process.env.NODE_ENV,
    },
  });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
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

function ensureDir(targetPath) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
}

function findStandaloneAppDir(standaloneDir) {
  const directServer = path.join(standaloneDir, "server.js");
  if (fs.existsSync(directServer)) {
    return standaloneDir;
  }

  const candidates = [];
  const stack = [standaloneDir];

  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (!entry.isDirectory()) {
        continue;
      }
      if (entry.name === "node_modules") {
        continue;
      }
      if (fs.existsSync(path.join(fullPath, "server.js")) && fs.existsSync(path.join(fullPath, ".next"))) {
        candidates.push(fullPath);
      }
      stack.push(fullPath);
    }
  }

  candidates.sort((a, b) => a.length - b.length);
  return candidates[0];
}

function ensureSourceContract() {
  const pkg = readJson(path.join(rootDir, "package.json"));
  const isLegacyCliPackage = pkg.name === "9router" && pkg.private === false;
  const isAppSourcePackage = pkg.name === "9router-app" && pkg.private === true;
  assert(
    isLegacyCliPackage || isAppSourcePackage,
    "package.json must be either legacy 9router publish layout or current 9router-app source layout"
  );

  const cli = fs.readFileSync(path.join(rootDir, "cli.js"), "utf8");
  assert(cli.startsWith("#!/usr/bin/env node"), "cli.js must start with a node shebang");
}

function createPublishPackageJson() {
  const rootPkg = readJson(path.join(rootDir, "package.json"));
  return {
    name: "@yina-npm/openrouterx",
    version: rootPkg.version,
    description: "openrouterX CLI - Start and manage 9Router server",
    bin: {
      openrouterX: "./cli.js",
    },
    files: [
      "cli.js",
      "src",
      "hooks",
      "app",
      "README.md",
      "LICENSE",
    ],
    scripts: {
      postinstall: "node hooks/postinstall.js",
    },
    dependencies: {
      "node-forge": rootPkg.dependencies["node-forge"],
      "node-machine-id": rootPkg.dependencies["node-machine-id"],
      react: rootPkg.dependencies.react,
      "react-dom": rootPkg.dependencies["react-dom"],
    },
    engines: {
      node: ">=18.0.0",
    },
    keywords: ["openrouterx", "9router", "cli", "proxy", "ai", "api"],
    license: "MIT",
  };
}

function createAppPackageJson() {
  const rootPkg = readJson(path.join(rootDir, "package.json"));
  return {
    name: "9router-app",
    version: rootPkg.version,
    description: "9Router web dashboard",
    private: true,
    scripts: {
      dev: "next dev --webpack --port 20502",
      build: "NODE_ENV=production next build --webpack",
      start: "NODE_ENV=production next start",
      "dev:bun": "bun --bun next dev --webpack --port 20502",
      "build:bun": "NODE_ENV=production bun --bun next build --webpack",
      "start:bun": "NODE_ENV=production bun ./.next/standalone/server.js",
    },
    dependencies: rootPkg.dependencies,
    optionalDependencies: rootPkg.optionalDependencies,
    devDependencies: rootPkg.devDependencies,
  };
}

function writeJson(filePath, value) {
  ensureDir(filePath);
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writePostinstallHook() {
  const content = `#!/usr/bin/env node

const { execSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const appDir = path.join(__dirname, "..", "app");
const betterSqlitePath = path.join(appDir, "node_modules", "better-sqlite3");
const defaultMitmRouterBaseUrl = "http://localhost:20502";
const portMigrationNoticeName = "port-migration.json";
const legacyMitmRouterBaseUrls = new Set([
  "http://localhost:20128",
  "http://127.0.0.1:20128",
]);

function getDataDir() {
  return process.platform === "win32"
    ? path.join(process.env.APPDATA || os.homedir(), "openrouterx")
    : path.join(os.homedir(), ".openrouterx");
}

function normalizeMitmRouterBaseUrl(value) {
  const raw = String(value || "").trim().replace(/\\/+$/, "");
  if (!raw || legacyMitmRouterBaseUrls.has(raw)) return defaultMitmRouterBaseUrl;
  return raw;
}

function refreshJsonSettings(dataDir) {
  const filePath = path.join(dataDir, "db.json");
  if (!fs.existsSync(filePath)) return false;
  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!data || typeof data !== "object") return false;
    if (!data.settings || typeof data.settings !== "object" || Array.isArray(data.settings)) {
      data.settings = {};
    }
    const next = normalizeMitmRouterBaseUrl(data.settings.mitmRouterBaseUrl);
    if (data.settings.mitmRouterBaseUrl === next) return false;
    data.settings.mitmRouterBaseUrl = next;
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\\n");
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
    Database = require(path.join(appDir, "node_modules", "better-sqlite3"));
  } catch {
    try { Database = require("better-sqlite3"); } catch { return false; }
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
    fs.writeFileSync(path.join(noticeDir, portMigrationNoticeName), JSON.stringify({
      id: "port-migration-20128-20502",
      type: "port-migration",
      fromPort: 20128,
      toPort: 20502,
      fromBaseUrl: "http://localhost:20128",
      toBaseUrl: defaultMitmRouterBaseUrl,
      stores: changed,
      createdAt: new Date().toISOString(),
    }, null, 2) + "\\n");
    console.log("refreshed MITM router port settings: " + changed.join(", ") + " -> " + defaultMitmRouterBaseUrl);
  }
}

refreshRuntimePortSettings();

if (!fs.existsSync(betterSqlitePath)) {
  console.log("better-sqlite3 not found, skipping rebuild");
  process.exit(0);
}

function isValidBinary() {
  const binaryPath = path.join(betterSqlitePath, "build", "Release", "better_sqlite3.node");

  if (!fs.existsSync(binaryPath)) {
    return false;
  }

  const fd = fs.openSync(binaryPath, "r");
  const buffer = Buffer.alloc(4);
  fs.readSync(fd, buffer, 0, 4, 0);
  fs.closeSync(fd);

  const magic = buffer.toString("hex");
  const isLinux = magic.startsWith("7f454c46");
  const isMacOS = magic.startsWith("cffaedfe") || magic.startsWith("cefaedfe");
  const isWindows = magic.startsWith("4d5a");

  return (process.platform === "linux" && isLinux) ||
    (process.platform === "darwin" && isMacOS) ||
    (process.platform === "win32" && isWindows);
}

if (isValidBinary()) {
  console.log("better-sqlite3 binary is valid for this platform, skipping rebuild");
  process.exit(0);
}

console.log("Rebuilding better-sqlite3 for current platform...");

try {
  execSync("npm rebuild better-sqlite3 --build-from-source", {
    cwd: appDir,
    stdio: "inherit",
    timeout: 120000,
  });
  console.log("better-sqlite3 rebuilt successfully");
} catch (error) {
  console.warn("Failed to rebuild better-sqlite3. The app may not work correctly.");
  console.warn("Make sure you have build tools installed (python, make, gcc/node-gyp)");
  console.warn("Error:", error.message);
  process.exit(0);
}
`;

  const hookPath = path.join(stagingDir, "hooks", "postinstall.js");
  ensureDir(hookPath);
  fs.writeFileSync(hookPath, content);
  fs.chmodSync(hookPath, 0o755);
}

function prepareStagingPackage() {
  const standaloneDir = path.join(rootDir, ".next", "standalone");
  const standaloneAppDir = findStandaloneAppDir(standaloneDir);
  const appDir = path.join(stagingDir, "app");

  assert(fs.existsSync(path.join(rootDir, ".next", "BUILD_ID")), "missing .next/BUILD_ID; run build first");
  assert(standaloneAppDir, "missing standalone server.js; next.config.mjs output must be standalone");

  remove(stagingDir);
  fs.mkdirSync(stagingDir, { recursive: true });

  copy(path.join(rootDir, "cli.js"), path.join(stagingDir, "cli.js"));
  copy(path.join(rootDir, "README.md"), path.join(stagingDir, "README.md"));
  copy(path.join(rootDir, "LICENSE"), path.join(stagingDir, "LICENSE"));
  writePostinstallHook();

  if (fs.existsSync(path.join(rootDir, "src", "cli"))) {
    copy(path.join(rootDir, "src", "cli"), path.join(stagingDir, "src", "cli"));
  }

  copy(standaloneAppDir, appDir);
  ensureDir(path.join(appDir, ".next", "static"));
  copy(path.join(rootDir, ".next", "static"), path.join(appDir, ".next", "static"));
  copy(path.join(rootDir, "public"), path.join(appDir, "public"));

  if (fs.existsSync(path.join(rootDir, "src", "mitm"))) {
    remove(path.join(appDir, "src", "mitm"));
    copy(path.join(rootDir, "src", "mitm"), path.join(appDir, "src", "mitm"));
  }

  if (fs.existsSync(path.join(rootDir, "src", "shared", "utils", "apiKey.js"))) {
    copy(path.join(rootDir, "src", "shared", "utils", "apiKey.js"), path.join(appDir, "src", "shared", "utils", "apiKey.js"));
  }

  if (fs.existsSync(path.join(rootDir, "src", "shared", "constants", "mitmToolHosts.js"))) {
    copy(path.join(rootDir, "src", "shared", "constants", "mitmToolHosts.js"), path.join(appDir, "src", "shared", "constants", "mitmToolHosts.js"));
  }

  remove(path.join(appDir, ".env"));
  remove(path.join(appDir, ".env.local"));
  remove(path.join(appDir, "data"));

  writeJson(path.join(stagingDir, "package.json"), createPublishPackageJson());
  writeJson(path.join(appDir, "package.json"), createAppPackageJson());
}

function validatePackFiles(files) {
  const paths = files.map((file) => file.path);
  const required = ["cli.js", "package.json", "app/server.js", "app/package.json", "hooks/postinstall.js", "src/cli/terminalUI.js", "src/cli/tray/icon.png", "src/cli/tray/icon.ico", "README.md", "LICENSE"];
  const forbiddenPatterns = [/(^|\/)\.env($|\.)/, /^(data|app\/data)\//, /(^|\/)db\.json$/, /(^|\/)\.omc\//, /(^|\/)tests\//, /(^|\/)\.git\//];

  for (const file of required) {
    assert(paths.includes(file), `npm pack is missing ${file}`);
  }

  assert(paths.some((file) => file.startsWith("app/.next/")), "npm pack must include app/.next");
  assert(paths.some((file) => file.startsWith("app/node_modules/")), "npm pack must include app/node_modules");

  for (const file of paths) {
    for (const pattern of forbiddenPatterns) {
      assert(!pattern.test(file), `forbidden file in npm pack: ${file}`);
    }
  }
}

function packDryRun() {
  const output = run("npm", ["pack", "--dry-run", "--json"], { cwd: stagingDir, capture: true });
  const result = JSON.parse(output)[0];
  validatePackFiles(result.files);
  console.log(`npm pack dry-run ok: ${result.filename}, files=${result.entryCount}, size=${result.unpackedSize}`);
}

function main() {
  ensureSourceContract();
  remove(path.join(rootDir, "app"));

  if (!skipBuild) {
    run("npm", ["run", "build"], { nodeEnv: "production" });
  }

  prepareStagingPackage();
  packDryRun();

  if (prepareOnly || dryRun) {
    return;
  }

  if (!process.env.NODE_AUTH_TOKEN) {
    run("npm", ["whoami", "--registry", registry]);
  }

  run("npm", ["publish", "--registry", registry, "--tag", tag], { cwd: stagingDir });
}

try {
  main();
} catch (error) {
  console.error(`release failed: ${error.message}`);
  process.exit(1);
}
