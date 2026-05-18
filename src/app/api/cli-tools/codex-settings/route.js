import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { parseTOML, stringifyTOML } from "confbox";
import { getAuthPayload } from "@/dashboardGuard";
import { resolveCliBinary } from "../cliDetection";

async function requirePayload(request) {
  const payload = await getAuthPayload(request);
  if (!payload) {
    return { payload: null, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { payload, response: null };
}

const getCodexDir = () => path.join(os.homedir(), ".codex");
const getCodexConfigPath = () => path.join(getCodexDir(), "config.toml");
const getCodexAuthPath = () => path.join(getCodexDir(), "auth.json");
const PROVIDER_KEY = "openrouterx";
const PROVIDER_LABEL = "OpenrouterX";
const CODEX_INSTALL_COMMAND = "npm install -g @openai/codex";
const CODEX_INSTALL_HINTS = os.platform() === "darwin"
  ? [CODEX_INSTALL_COMMAND, "brew install --cask codex"]
  : [CODEX_INSTALL_COMMAND];
const CODEX_MACOS_APP_CANDIDATES = [
  "/Applications/Codex.app/Contents/Resources/codex",
  path.join(os.homedir(), "Applications/Codex.app/Contents/Resources/codex"),
  "/Applications/Codex.app/Contents/MacOS/Codex",
  path.join(os.homedir(), "Applications/Codex.app/Contents/MacOS/Codex"),
  "/Applications/Codex.app",
  path.join(os.homedir(), "Applications/Codex.app"),
];

const normalizeCodexModel = (model) => {
  if (typeof model !== "string") return model;
  return model.startsWith("cx/") ? model.slice(3) : model;
};

// Flatten confbox-parsed TOML into a writable object, preserving nested tables
const parsedToWritable = (obj) => obj ?? {};

// Set a nested key from a flat dotted path, creating intermediate objects as needed
const setNestedSection = (obj, dottedKey, value) => {
  const keys = dottedKey.split(".");
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (cur[keys[i]] == null || typeof cur[keys[i]] !== "object") {
      cur[keys[i]] = {};
    }
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
};

// Delete a nested key from a flat dotted path
const deleteNestedSection = (obj, dottedKey) => {
  const keys = dottedKey.split(".");
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    cur = cur?.[keys[i]];
    if (cur == null) return;
  }
  delete cur[keys[keys.length - 1]];
};

// Check CLI first, then standard macOS app locations.
const checkCodexInstalled = async () => {
  return resolveCliBinary("codex", {
    fallbackCandidates: os.platform() === "darwin" ? CODEX_MACOS_APP_CANDIDATES : [],
  });
};

// Read current config.toml
const readConfig = async () => {
  try {
    const configPath = getCodexConfigPath();
    const content = await fs.readFile(configPath, "utf-8");
    return content;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
};

// Check if config has OpenrouterX settings
const hasOpenRouterXConfig = (config) => {
  if (!config) return false;
  return config.includes(`model_provider = "${PROVIDER_KEY}"`) || config.includes(`[model_providers.${PROVIDER_KEY}]`);
};

// GET - Check codex CLI and read current settings
export async function GET(request) {
  try {
    const { response } = await requirePayload(request);
    if (response) return response;

    const detectedCodex = await checkCodexInstalled();
    
    if (!detectedCodex.installed) {
      return NextResponse.json({
        installed: false,
        config: null,
        installCommand: CODEX_INSTALL_COMMAND,
        installHints: CODEX_INSTALL_HINTS,
        message: "Local Codex is not installed",
      });
    }

    const config = await readConfig();

    return NextResponse.json({
      installed: true,
      detectedCodex,
      config,
      hasOpenRouterX: hasOpenRouterXConfig(config),
      configPath: getCodexConfigPath(),
    });
  } catch (error) {
    console.log("Error checking codex settings:", error);
    return NextResponse.json({ error: "Failed to check codex settings" }, { status: 500 });
  }
}

// POST - Update OpenrouterX settings (merge with existing config)
export async function POST(request) {
  try {
    const { payload, response } = await requirePayload(request);
    if (response) return response;
    if (payload.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { baseUrl, apiKey, model, subagentModel } = await request.json();
    const normalizedModel = normalizeCodexModel(model);
    const normalizedSubagentModel = normalizeCodexModel(subagentModel);
    
    if (!baseUrl || !apiKey || !normalizedModel) {
      return NextResponse.json({ error: "baseUrl, apiKey and model are required" }, { status: 400 });
    }

    const codexDir = getCodexDir();
    const configPath = getCodexConfigPath();

    // Ensure directory exists
    await fs.mkdir(codexDir, { recursive: true });

    // Read and parse existing config
    let parsed = {};
    try {
      const existingConfig = await fs.readFile(configPath, "utf-8");
      parsed = parsedToWritable(parseTOML(existingConfig));
    } catch { /* No existing config */ }

    // Update only OpenrouterX related fields (api_key goes to auth.json, not config.toml)
    parsed.model = normalizedModel;
    parsed.model_provider = PROVIDER_KEY;

    // Update or create openrouterx provider section (no api_key - Codex reads from auth.json)
    // Ensure /v1 suffix is added only once
    const normalizedBaseUrl = baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`;
    setNestedSection(parsed, `model_providers.${PROVIDER_KEY}`, {
      name: PROVIDER_LABEL,
      base_url: normalizedBaseUrl,
      wire_api: "responses",
    });

    // Add subagent configuration
    const effectiveSubagentModel = normalizedSubagentModel || normalizedModel;
    setNestedSection(parsed, "agents.subagent", {
      model: effectiveSubagentModel,
    });

    // Write merged config
    const configContent = stringifyTOML(parsed);
    await fs.writeFile(configPath, configContent);

    // Update auth.json with OPENAI_API_KEY (Codex reads this first)
    const authPath = getCodexAuthPath();
    let authData = {};
    try {
      const existingAuth = await fs.readFile(authPath, "utf-8");
      authData = JSON.parse(existingAuth);
    } catch { /* No existing auth */ }
    
    // Force apikey mode (keep existing tokens untouched for ChatGPT login reuse)
    authData.OPENAI_API_KEY = apiKey;
    authData.auth_mode = "apikey";
    await fs.writeFile(authPath, JSON.stringify(authData, null, 2));

    return NextResponse.json({
      success: true,
      message: "Codex settings applied successfully!",
      configPath,
    });
  } catch (error) {
    console.log("Error updating codex settings:", error);
    return NextResponse.json({ error: "Failed to update codex settings" }, { status: 500 });
  }
}

// DELETE - Remove OpenrouterX settings only (keep other settings)
export async function DELETE(request) {
  try {
    const { payload, response } = await requirePayload(request);
    if (response) return response;
    if (payload.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const configPath = getCodexConfigPath();

    // Read and parse existing config
    let parsed = {};
    try {
      const existingConfig = await fs.readFile(configPath, "utf-8");
      parsed = parsedToWritable(parseTOML(existingConfig));
    } catch (error) {
      if (error.code === "ENOENT") {
        return NextResponse.json({
          success: true,
          message: "No config file to reset",
        });
      }
      throw error;
    }

    // Remove OpenrouterX related root fields only if they point to openrouterx
    if (parsed.model_provider === PROVIDER_KEY) {
      delete parsed.model;
      delete parsed.model_provider;
    }

    // Remove openrouterx provider section
    deleteNestedSection(parsed, `model_providers.${PROVIDER_KEY}`);

    // Remove subagent configuration
    deleteNestedSection(parsed, "agents.subagent");

    // Write updated config
    const configContent = stringifyTOML(parsed);
    await fs.writeFile(configPath, configContent);

    // Remove OPENAI_API_KEY from auth.json
    const authPath = getCodexAuthPath();
    try {
      const existingAuth = await fs.readFile(authPath, "utf-8");
      const authData = JSON.parse(existingAuth);
      delete authData.OPENAI_API_KEY;
      delete authData.auth_mode;

      // Write back or delete if empty
      if (Object.keys(authData).length === 0) {
        await fs.unlink(authPath);
      } else {
        await fs.writeFile(authPath, JSON.stringify(authData, null, 2));
      }
    } catch { /* No auth file */ }

    return NextResponse.json({
      success: true,
      message: "OpenrouterX settings removed successfully",
    });
  } catch (error) {
    console.log("Error resetting codex settings:", error);
    return NextResponse.json({ error: "Failed to reset codex settings" }, { status: 500 });
  }
}
