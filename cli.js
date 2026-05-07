#!/usr/bin/env node

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");

const pkg = require("./package.json");

const APP_NAME = "openrouterX";
const APP_DATA_DIR_NAME = "openrouterx";
const DATA_DIR = process.platform === "win32"
  ? path.join(process.env.APPDATA || os.homedir(), APP_DATA_DIR_NAME)
  : path.join(os.homedir(), `.${APP_DATA_DIR_NAME}`);
const PID_FILE = path.join(DATA_DIR, "server.pid");
const META_FILE = path.join(DATA_DIR, "server.json");
const LOG_FILE = path.join(DATA_DIR, "server.log");
const DEFAULT_PORT = "20128";
const DEFAULT_HOST = "0.0.0.0";

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    command: "start",
    port: undefined,
    host: undefined,
    foreground: false,
    noBrowser: false,
    skipUpdate: false,
    help: false,
    version: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (["start", "status", "stop", "restart", "open", "logs"].includes(arg)) {
      options.command = arg;
    } else if (arg === "--port" || arg === "-p") {
      options.port = argv[index + 1];
      index += 1;
    } else if (arg.startsWith("--port=")) {
      options.port = arg.slice("--port=".length);
    } else if (arg === "--host" || arg === "-H") {
      options.host = argv[index + 1];
      index += 1;
    } else if (arg.startsWith("--host=")) {
      options.host = arg.slice("--host=".length);
    } else if (arg === "--foreground" || arg === "--log" || arg === "-l") {
      options.foreground = true;
    } else if (arg === "--no-browser" || arg === "-n") {
      options.noBrowser = true;
    } else if (arg === "--skip-update") {
      options.skipUpdate = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--version" || arg === "-v") {
      options.version = true;
    }
  }

  return options;
}

function getPreferredPort(env = process.env, options = {}) {
  const raw = options.port || env?.PORT;
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return DEFAULT_PORT;
  }
  return String(raw);
}

function getPortConflictMessage(port) {
  return [
    `Port ${port} is already in use by an existing ${APP_NAME} instance.`,
    `Use PORT=<new-port> ${APP_NAME} to run on a different port.`,
  ].join("\n");
}

function formatHelp() {
  return `
Usage: ${APP_NAME} [command] [options]

Commands:
  start               Start server in background (default)
  status              Show background server status
  stop                Stop background server
  restart             Restart background server
  open                Open dashboard in browser
  logs                Print log file path

Options:
  -p, --port <port>   Port to run the server (default: ${DEFAULT_PORT})
  -H, --host <host>   Host to bind (default: ${DEFAULT_HOST})
  -n, --no-browser    Do not open browser automatically
  -l, --log           Show server logs in foreground
  --foreground        Run in foreground
  --skip-update       Skip auto-update check
  -h, --help          Show this help message
  -v, --version       Show version
`;
}

function formatChooserBanner(serverUrl) {
  return [
    "========================================",
    `  ${APP_NAME}`,
    `  Server: ${serverUrl}`,
    "========================================",
  ].join("\n");
}

function getChooserOptions() {
  return ["Web UI", "Terminal UI", "Hide to Tray", "Exit"];
}

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readMeta() {
  try {
    return JSON.parse(fs.readFileSync(META_FILE, "utf8"));
  } catch {
    return null;
  }
}

function writeMeta(meta) {
  ensureDataDir();
  fs.writeFileSync(META_FILE, `${JSON.stringify(meta, null, 2)}\n`);
}

function writePid(pid) {
  ensureDataDir();
  fs.writeFileSync(PID_FILE, `${pid}\n`);
}

function readPid() {
  try {
    const pid = Number(fs.readFileSync(PID_FILE, "utf8").trim());
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function removeRuntimeFiles() {
  fs.rmSync(PID_FILE, { force: true });
  fs.rmSync(META_FILE, { force: true });
}

function isProcessRunning(pid) {
  if (!pid) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function openBrowser(url) {
  const command = process.platform === "darwin"
    ? "open"
    : process.platform === "win32"
      ? "cmd"
      : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  spawn(command, args, { detached: true, stdio: "ignore" }).unref();
}

function printStatus() {
  const pid = readPid();
  const meta = readMeta();

  if (isProcessRunning(pid)) {
    console.log(`${APP_NAME} is running`);
    console.log(`PID: ${pid}`);
    console.log(`URL: ${meta?.baseUrl || `http://localhost:${DEFAULT_PORT}`}`);
    console.log(`Log: ${LOG_FILE}`);
    return true;
  }

  removeRuntimeFiles();
  console.log(`${APP_NAME} is not running`);
  return false;
}

function stopServer() {
  const pid = readPid();

  if (!isProcessRunning(pid)) {
    removeRuntimeFiles();
    console.log(`${APP_NAME} is not running`);
    return false;
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch {
    removeRuntimeFiles();
    console.log(`${APP_NAME} is not running`);
    return false;
  }

  removeRuntimeFiles();
  console.log(`${APP_NAME} stopped`);
  return true;
}

function createLogFileDescriptors() {
  ensureDataDir();
  fs.appendFileSync(LOG_FILE, `\n[${new Date().toISOString()}] Starting ${APP_NAME}\n`);
  const out = fs.openSync(LOG_FILE, "a");
  const err = fs.openSync(LOG_FILE, "a");
  return ["ignore", out, err];
}

function closeLogFileDescriptors(stdio) {
  for (const fd of stdio.slice(1)) {
    try {
      fs.closeSync(fd);
    } catch {}
  }
}

function checkPortAvailable(port, host) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once("error", (err) => {
      if (err && err.code === "EADDRINUSE") {
        resolve(false);
        return;
      }
      resolve(true);
    });

    server.once("listening", () => {
      server.close(() => resolve(true));
    });

    server.listen(Number(port), host);
  });
}

function printChooser(serverUrl) {
  console.log(formatChooserBanner(serverUrl));
  getChooserOptions().forEach((option, index) => {
    const marker = index === 0 ? "★" : "☆";
    console.log(` ${marker} ${option}`);
  });
}

async function runCli() {
  const options = parseArgs();

  if (options.help) {
    console.log(formatHelp());
    process.exit(0);
    return;
  }

  if (options.version) {
    console.log(pkg.version);
    process.exit(0);
    return;
  }

  if (options.command === "status") {
    process.exit(printStatus() ? 0 : 1);
    return;
  }

  if (options.command === "stop") {
    stopServer();
    process.exit(0);
    return;
  }

  if (options.command === "logs") {
    console.log(LOG_FILE);
    process.exit(0);
    return;
  }

  const meta = readMeta();
  if (options.command === "open") {
    const url = meta?.baseUrl || `http://localhost:${DEFAULT_PORT}`;
    openBrowser(`${url}/dashboard`);
    console.log(`Opened ${url}/dashboard`);
    process.exit(0);
    return;
  }

  if (options.command === "restart") {
    stopServer();
  }

  const projectRoot = __dirname;
  const appRoot = path.join(projectRoot, "app");
  const serverEntry = path.join(appRoot, "server.js");
  const port = getPreferredPort(process.env, options);
  const host = options.host || process.env.HOSTNAME || DEFAULT_HOST;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `http://localhost:${port}`;
  const foreground = options.foreground || (process.env.ORX_CHOOSER_ACTION !== undefined && process.env.ORX_CHOOSER_ACTION !== "hide");
  const runningPid = readPid();

  if (isProcessRunning(runningPid) && options.command !== "restart") {
    const runningMeta = readMeta();
    console.log(`${APP_NAME} is already running on ${runningMeta?.baseUrl || baseUrl}`);
    console.log(`PID: ${runningPid}`);
    process.exit(0);
    return;
  }

  const available = await checkPortAvailable(port, host);
  if (!available) {
    console.error(getPortConflictMessage(port));
    process.exit(1);
    return;
  }

  printChooser(baseUrl);

  const stdio = foreground ? "inherit" : createLogFileDescriptors();
  const child = spawn(process.execPath, [serverEntry], {
    cwd: appRoot,
    stdio,
    detached: !foreground,
    env: {
      ...process.env,
      PORT: port,
      HOSTNAME: host,
      NEXT_PUBLIC_BASE_URL: baseUrl,
    },
  });

  if (!foreground) {
    writePid(child.pid);
    writeMeta({
      pid: child.pid,
      port,
      host,
      baseUrl,
      dashboardUrl: `${baseUrl}/dashboard`,
      logFile: LOG_FILE,
      startedAt: new Date().toISOString(),
    });
    child.unref();
    closeLogFileDescriptors(stdio);
    if (!options.noBrowser) {
      openBrowser(`${baseUrl}/dashboard`);
    }
    console.log(`${APP_NAME} is running in background on ${baseUrl}`);
    console.log(`Dashboard: ${baseUrl}/dashboard`);
    console.log(`Log: ${LOG_FILE}`);
    process.exit(0);
    return;
  }

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

if (require.main === module) {
  runCli();
}

module.exports = {
  parseArgs,
  getPreferredPort,
  getPortConflictMessage,
  formatHelp,
  formatChooserBanner,
  getChooserOptions,
  isProcessRunning,
  printStatus,
  stopServer,
};
