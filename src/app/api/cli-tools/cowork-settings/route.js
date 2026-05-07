"use server";

import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import os from "os";
import crypto from "crypto";
import { COWORK_PLUGINS, buildManagedMcpServers } from "@/shared/constants/coworkPlugins";

const PROVIDER = "gateway";

// Plugin folder mount location.
// Claude Cowork 3p actually launches with --user-data-dir=Claude-3p, so plugins
// must live there (not the system /Library path which requires admin & isn't read in 3p).
const getOrgPluginsCandidates = () => {
  if (os.platform() === "darwin") {
    const home = os.homedir();
    return [
      path.join(home, "Library", "Application Support", "Claude-3p", "org-plugins"),
      path.join(home, "Library", "Application Support", "Claude", "org-plugins"),
      "/Library/Application Support/Claude/org-plugins",
    ];
  }
  if (os.platform() === "win32") {
    const localApp = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
    const programData = process.env.ProgramData || "C:\\ProgramData";
    return [
      path.join(localApp, "Claude-3p", "org-plugins"),
      path.join(localApp, "Claude", "org-plugins"),
      path.join(programData, "Claude", "org-plugins"),
    ];
  }
  return [path.join(os.homedir(), ".config", "Claude-3p", "org-plugins"), "/etc/Claude/org-plugins"];
};

// Pick first writable candidate for org-plugins
async function pickPluginsRoot() {
  for (const dir of getOrgPluginsCandidates()) {
    try {
      await fs.mkdir(dir, { recursive: true });
      // Probe write
      const probe = path.join(dir, ".__9router_probe");
      await fs.writeFile(probe, "ok");
      await fs.unlink(probe);
      return dir;
    } catch { /* try next */ }
  }
  return null;
}

// Create plugin folder mount: org-plugins/<name>/claude-plugin/{plugin.json, version.json, .mcp.json}
async function writeOrgPluginsFolder(selectedPluginNames) {
  const root = await pickPluginsRoot();
  if (!root) return { error: "no_writable_plugins_dir", written: [] };
  const set = new Set(selectedPluginNames || []);
  const selectedPlugins = COWORK_PLUGINS.filter((p) => set.has(p.name));
  // Remove previously-managed plugin subfolders (best-effort)
  for (const p of COWORK_PLUGINS) {
    try { await fs.rm(path.join(root, p.name), { recursive: true, force: true }); } catch { /* ignore */ }
  }
  const written = [];
  for (const p of selectedPlugins) {
    const pluginRoot = path.join(root, p.name);
    const metaDir = path.join(pluginRoot, ".claude-plugin");
    try {
      await fs.mkdir(metaDir, { recursive: true });
      const manifest = { name: p.name, version: "1.0.0", description: p.description || p.name, author: { name: "9router" } };
      await fs.writeFile(path.join(metaDir, "plugin.json"), JSON.stringify(manifest, null, 2));
      // .mcp.json at plugin root, schema: {mcpServers: {name: {type, url, oauth?}}}
      const mcpServers = {};
      for (const s of p.servers) {
        const key = p.servers.length === 1 ? p.name : `${p.name}-${s.key}`;
        mcpServers[key] = {
          type: /\/sse(\b|\/)/i.test(s.url) ? "sse" : "http",
          url: s.url,
        };
      }
      await fs.writeFile(path.join(pluginRoot, ".mcp.json"), JSON.stringify({ mcpServers }, null, 2));
      written.push(p.name);
    } catch (e) {
      return { error: e.code || e.message, written, root };
    }
  }
  return { written, root };
}

// Set operonSkipMcpApprovals[serverName]=true in Claude-3p/config.json so user
// is not prompted for every tool call. Mirrors mcpToolAccessProvider.setSkipApprovals.
async function writeSkipApprovals(managedServers) {
  const cfgPath = path.join(getWriteRoot(), "config.json");
  let cfg = {};
  try {
    cfg = JSON.parse(await fs.readFile(cfgPath, "utf-8")) || {};
  } catch (e) {
    if (e.code !== "ENOENT") return { error: e.code };
  }
  // Reset previous managed entries (those we own == COWORK_PLUGINS server names)
  const ownedNames = new Set();
  for (const p of COWORK_PLUGINS) {
    for (const s of p.servers) {
      ownedNames.add(p.servers.length === 1 ? p.name : `${p.name}-${s.key}`);
    }
  }
  const skip = (cfg.operonSkipMcpApprovals && typeof cfg.operonSkipMcpApprovals === "object") ? cfg.operonSkipMcpApprovals : {};
  for (const k of Object.keys(skip)) {
    if (ownedNames.has(k)) delete skip[k];
  }
  for (const srv of managedServers) {
    if (srv?.name) skip[srv.name] = true;
  }
  cfg.operonSkipMcpApprovals = skip;
  await fs.mkdir(getWriteRoot(), { recursive: true });
  await fs.writeFile(cfgPath, JSON.stringify(cfg, null, 2));
  return { written: Object.keys(skip).length };
}

// Candidate user-data roots — Cowork can run from either Claude-3p (3p mode) or Claude (1p mode w/ cowork features)
const getCandidateRoots = () => {
  if (os.platform() === "darwin") {
    const base = path.join(os.homedir(), "Library", "Application Support");
    return [path.join(base, "Claude-3p"), path.join(base, "Claude")];
  }
  if (os.platform() === "win32") {
    const localApp = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
    const roaming = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    return [
      path.join(localApp, "Claude-3p"),
      path.join(roaming, "Claude-3p"),
      path.join(localApp, "Claude"),
      path.join(roaming, "Claude"),
    ];
  }
  return [
    path.join(os.homedir(), ".config", "Claude-3p"),
    path.join(os.homedir(), ".config", "Claude"),
  ];
};

// Claude.app/exe install paths — fallback detect when no user-data folder yet
const getAppInstallPaths = () => {
  if (os.platform() === "darwin") {
    return ["/Applications/Claude.app", path.join(os.homedir(), "Applications", "Claude.app")];
  }
  if (os.platform() === "win32") {
    const localApp = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
    const programFiles = process.env["ProgramFiles"] || "C:\\Program Files";
    return [
      path.join(localApp, "AnthropicClaude"),
      path.join(programFiles, "Claude"),
      path.join(programFiles, "AnthropicClaude"),
    ];
  }
  return [];
};

// For READ: prefer existing configLibrary (any root). For WRITE: always Claude-3p (first candidate).
const resolveAppRootForRead = async () => {
  const candidates = getCandidateRoots();
  for (const dir of candidates) {
    try {
      await fs.access(path.join(dir, "configLibrary"));
      return dir;
    } catch { /* try next */ }
  }
  return candidates[0];
};

const getWriteRoot = () => getCandidateRoots()[0]; // always Claude-3p

const getConfigDir = async () => path.join(await resolveAppRootForRead(), "configLibrary");
const getWriteConfigDir = () => path.join(getWriteRoot(), "configLibrary");
const getMetaPath = async () => path.join(await getConfigDir(), "_meta.json");
const getWriteMetaPath = () => path.join(getWriteConfigDir(), "_meta.json");

// Locate Claude (1p) folder for claude_desktop_config.json bootstrap
const get1pRoot = () => {
  if (os.platform() === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "Claude");
  }
  if (os.platform() === "win32") {
    const localApp = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
    const roaming = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    return path.join(roaming, "Claude"); // 1p uses roaming on Win
  }
  return path.join(os.homedir(), ".config", "Claude");
};

// Set deploymentMode="3p" in Claude/claude_desktop_config.json (preserve existing keys)
const bootstrapDeploymentMode = async () => {
  const cfgPath = path.join(get1pRoot(), "claude_desktop_config.json");
  let cfg = {};
  try {
    const content = await fs.readFile(cfgPath, "utf-8");
    cfg = JSON.parse(content);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (cfg.deploymentMode === "3p") return false; // no change
  cfg.deploymentMode = "3p";
  await fs.mkdir(get1pRoot(), { recursive: true });
  await fs.writeFile(cfgPath, JSON.stringify(cfg, null, 2));
  return true;
};

// Cowork is available if either (a) any user-data root exists or (b) Claude app is installed
const checkInstalled = async () => {
  for (const dir of [...getCandidateRoots(), ...getAppInstallPaths()]) {
    try {
      await fs.access(dir);
      return true;
    } catch { /* try next */ }
  }
  return false;
};

const readJson = async (filePath) => {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
};

// Ensure meta exists in Claude-3p/configLibrary (write target). If meta already exists in Claude/ (1p), copy appliedId.
const ensureMeta = async () => {
  const writeMetaPath = getWriteMetaPath();
  let meta = await readJson(writeMetaPath);
  if (!meta || !meta.appliedId) {
    // Try to inherit from any existing root
    const existingRead = await readJson(await getMetaPath());
    if (existingRead?.appliedId) {
      meta = existingRead;
    } else {
      const newId = crypto.randomUUID();
      meta = { appliedId: newId, entries: [{ id: newId, name: "Default" }] };
    }
    await fs.mkdir(getWriteConfigDir(), { recursive: true });
    await fs.writeFile(writeMetaPath, JSON.stringify(meta, null, 2));
  }
  return meta;
};

export async function GET() {
  try {
    const installed = await checkInstalled();
    if (!installed) {
      return NextResponse.json({
        installed: false,
        config: null,
        message: "Claude Desktop (Cowork mode) not detected",
      });
    }

    const meta = await readJson(await getMetaPath());
    const appliedId = meta?.appliedId || null;
    const configDir = await getConfigDir();
    const configPath = appliedId ? path.join(configDir, `${appliedId}.json`) : null;
    const config = configPath ? await readJson(configPath) : null;

    const baseUrl = config?.inferenceGatewayBaseUrl || null;
    const models = Array.isArray(config?.inferenceModels)
      ? config.inferenceModels.map((m) => (typeof m === "string" ? m : m?.name)).filter(Boolean)
      : [];

    // managedMcpServers stored as native array in configLibrary <uuid>.json
    const managedMcpArr = Array.isArray(config?.managedMcpServers) ? config.managedMcpServers : [];
    const selectedPlugins = COWORK_PLUGINS
      .filter((p) => p.servers.some((s) => managedMcpArr.some((v) => v?.url === s.url)))
      .map((p) => p.name);

    const has9Router = !!(config?.inferenceProvider === PROVIDER && baseUrl);

    return NextResponse.json({
      installed: true,
      config,
      has9Router,
      configPath,
      cowork: {
        appliedId,
        baseUrl,
        models,
        provider: config?.inferenceProvider || null,
        selectedPlugins,
      },
      availablePlugins: COWORK_PLUGINS.map((p) => ({ name: p.name, description: p.description })),
    });
  } catch (error) {
    console.log("Error reading cowork settings:", error);
    return NextResponse.json({ error: "Failed to read cowork settings" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { baseUrl, apiKey, models, plugins } = await request.json();

    if (!baseUrl || !apiKey) {
      return NextResponse.json({ error: "baseUrl and apiKey are required" }, { status: 400 });
    }

    const modelsArray = Array.isArray(models) ? models.filter((m) => typeof m === "string" && m.trim()) : [];
    if (modelsArray.length === 0) {
      return NextResponse.json({ error: "At least one model is required" }, { status: 400 });
    }

    const pluginsArray = Array.isArray(plugins) ? plugins.filter((p) => typeof p === "string") : [];
    const managedMcpServers = buildManagedMcpServers(pluginsArray);

    const bootstrapped = await bootstrapDeploymentMode();
    const meta = await ensureMeta();
    const configPath = path.join(getWriteConfigDir(), `${meta.appliedId}.json`);

    const newConfig = {
      inferenceProvider: PROVIDER,
      inferenceGatewayBaseUrl: baseUrl,
      inferenceGatewayApiKey: apiKey,
      inferenceModels: modelsArray.map((name) => ({ name })),
      isLocalDevMcpEnabled: true,
      isDesktopExtensionEnabled: true,
    };
    if (managedMcpServers.length > 0) {
      newConfig.managedMcpServers = managedMcpServers;
    }

    await fs.writeFile(configPath, JSON.stringify(newConfig, null, 2));

    // Plugin folder mount (best-effort, doesn't fail the request)
    const pluginsResult = await writeOrgPluginsFolder(pluginsArray);
    // Auto-skip approvals for managed servers
    let skipResult = null;
    try { skipResult = await writeSkipApprovals(managedMcpServers); } catch (e) { skipResult = { error: e.message }; }

    return NextResponse.json({
      success: true,
      bootstrapped,
      message: bootstrapped
        ? "Cowork enabled (3p mode set). Quit & reopen Claude Desktop."
        : "Cowork settings applied. Quit & reopen Claude Desktop.",
      configPath,
      plugins: pluginsResult,
      skipApprovals: skipResult,
    });
  } catch (error) {
    console.log("Error applying cowork settings:", error);
    return NextResponse.json({ error: "Failed to apply cowork settings" }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const meta = await readJson(await getMetaPath());
    if (!meta?.appliedId) {
      return NextResponse.json({ success: true, message: "No active config to reset" });
    }
    const configPath = path.join(await getConfigDir(), `${meta.appliedId}.json`);
    try {
      await fs.writeFile(configPath, JSON.stringify({}, null, 2));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await writeOrgPluginsFolder([]);
    try { await writeSkipApprovals([]); } catch { /* ignore */ }
    return NextResponse.json({ success: true, message: "Cowork config reset" });
  } catch (error) {
    console.log("Error resetting cowork settings:", error);
    return NextResponse.json({ error: "Failed to reset cowork settings" }, { status: 500 });
  }
}
