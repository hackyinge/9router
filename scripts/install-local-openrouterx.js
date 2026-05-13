#!/usr/bin/env node

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const stagingDir = path.join(rootDir, "npm");
const localDir = path.join(rootDir, "npm-local");
const skipBuild = process.argv.includes("--skip-build");
const keepTarball = process.argv.includes("--keep-tarball");

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

  const commandPath = getCommandPath("openrouterX");
  assert(fs.existsSync(commandPath), `openrouterX command was not installed: ${commandPath}`);

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
