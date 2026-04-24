#!/usr/bin/env node

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const stagingDir = path.join(rootDir, "npm");
const skipBuild = process.argv.includes("--skip-build");
const keepTemp = process.argv.includes("--keep-temp");

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

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function getBinPath(prefixDir) {
  if (process.platform === "win32") {
    return path.join(prefixDir, "9router.cmd");
  }
  return path.join(prefixDir, "bin", "9router");
}

function waitForHttp(url, timeoutMs) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    function attempt() {
      const request = http.get(url, (response) => {
        response.resume();
        resolve(response.statusCode);
      });

      request.on("error", () => {
        if (Date.now() - startedAt >= timeoutMs) {
          reject(new Error(`server did not respond before timeout: ${url}`));
          return;
        }
        setTimeout(attempt, 500);
      });

      request.setTimeout(1000, () => {
        request.destroy();
      });
    }

    attempt();
  });
}

async function main() {
  if (!skipBuild) {
    run("npm", ["run", "release:npm:dry"]);
  } else {
    run("npm", ["run", "release:npm:dry", "--", "--skip-build"]);
  }

  const packOutput = run("npm", ["pack", "--json"], { cwd: stagingDir, capture: true });
  const packResult = JSON.parse(packOutput)[0];
  const tarballPath = path.join(stagingDir, packResult.filename);
  assert(fs.existsSync(tarballPath), `missing packed tarball: ${tarballPath}`);

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "9router-local-install-"));
  const prefixDir = path.join(tempRoot, "prefix");
  fs.mkdirSync(prefixDir, { recursive: true });

  try {
    run("npm", ["install", "-g", tarballPath, "--prefix", prefixDir, "--ignore-scripts=false"]);

    const binPath = getBinPath(prefixDir);
    assert(fs.existsSync(binPath), `missing installed bin: ${binPath}`);

    const installedPkgPath = path.join(prefixDir, "lib", "node_modules", "9router", "package.json");
    const installedAppPath = path.join(prefixDir, "lib", "node_modules", "9router", "app", "server.js");
    const installedHookPath = path.join(prefixDir, "lib", "node_modules", "9router", "hooks", "postinstall.js");
    const installedCliSrcPath = path.join(prefixDir, "lib", "node_modules", "9router", "src", "cli", "terminalUI.js");

    assert(fs.existsSync(installedPkgPath), `missing installed package.json: ${installedPkgPath}`);
    assert(fs.existsSync(installedAppPath), `missing installed app server: ${installedAppPath}`);
    assert(fs.existsSync(installedHookPath), `missing installed postinstall hook: ${installedHookPath}`);
    assert(fs.existsSync(installedCliSrcPath), `missing installed cli src: ${installedCliSrcPath}`);

    const installedPkg = readJson(installedPkgPath);
    assert(installedPkg.name === "9router", "installed package name must be 9router");
    assert(installedPkg.bin?.["9router"] === "./cli.js", "installed bin must be ./cli.js");

    const port = String(23000 + Math.floor(Math.random() * 10000));
    const env = {
      ...process.env,
      HOME: tempRoot,
      USERPROFILE: tempRoot,
      PORT: port,
      HOSTNAME: "127.0.0.1",
      NEXT_PUBLIC_BASE_URL: `http://localhost:${port}`,
    };

    run(binPath, ["--no-browser"], { cwd: tempRoot, env });

    const statusCode = await waitForHttp(`http://127.0.0.1:${port}/api/health`, 30000);
    assert(statusCode && statusCode < 500, `health check returned ${statusCode}`);

    run(binPath, ["status"], { cwd: tempRoot, env });

    console.log(`local npm install smoke test ok: ${tarballPath}`);
    console.log(`installed prefix: ${prefixDir}`);
  } finally {
    try {
      const binPath = getBinPath(prefixDir);
      if (fs.existsSync(binPath)) {
        run(binPath, ["stop"], { cwd: tempRoot, env: { HOME: tempRoot, USERPROFILE: tempRoot } });
      }
    } catch {}

    if (!keepTemp) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
      fs.rmSync(tarballPath, { force: true });
    } else {
      console.log(`kept temp directory: ${tempRoot}`);
      console.log(`kept tarball: ${tarballPath}`);
    }
  }
}

main().catch((error) => {
  console.error(`local npm install test failed: ${error.message}`);
  process.exit(1);
});
