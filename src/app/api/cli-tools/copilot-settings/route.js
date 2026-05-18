"use server";

import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

// Resolve chatLanguageModels.json path per OS
const getConfigPath = () => {
  const home = os.homedir();
  const platform = os.platform();
  if (platform === "win32") {
    return path.join(process.env.APPDATA || home, "Code", "User", "chatLanguageModels.json");
  }
  if (platform === "darwin") {
    return path.join(home, "Library", "Application Support", "Code", "User", "chatLanguageModels.json");
  }
  return path.join(home, ".config", "Code", "User", "chatLanguageModels.json");
};

const readConfig = async () => {
  try {
    const content = await fs.readFile(getConfigPath(), "utf-8");
    return JSON.parse(content);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
};

const ENTRY_NAME = "OpenrouterX";
const LEGACY_ENTRY_NAMES = ["OpenRouterX"];

const isOpenrouterXEntry = (entry) => {
  const name = entry?.name;
  return name === ENTRY_NAME || LEGACY_ENTRY_NAMES.includes(name);
};

const hasOpenRouterXConfig = (config) => {
  if (!Array.isArray(config)) return false;
  return config.some(isOpenrouterXEntry);
};

const getOpenRouterXEntry = (config) => {
  if (!Array.isArray(config)) return null;
  return config.find(isOpenrouterXEntry) || null;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function findMacVsCodeApp() {
  const candidates = [
    "/Applications/Visual Studio Code.app",
    path.join(os.homedir(), "Applications", "Visual Studio Code.app"),
  ];

  for (const appPath of candidates) {
    if (await pathExists(appPath)) return appPath;
  }

  try {
    const { stdout } = await execFileAsync(
      "/usr/bin/mdfind",
      ["kMDItemCFBundleIdentifier == 'com.microsoft.VSCode'"],
      { timeout: 3000 },
    );
    return stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) || null;
  } catch {
    return null;
  }
}

async function restartMacVsCode() {
  const appPath = await findMacVsCodeApp();
  if (!appPath) {
    return {
      success: false,
      attempted: false,
      reason: "Visual Studio Code.app was not found.",
    };
  }

  await execFileAsync(
    "/usr/bin/osascript",
    ["-e", 'tell application "Visual Studio Code" to quit'],
    { timeout: 5000 },
  ).catch(() => null);
  await sleep(900);
  await execFileAsync("/usr/bin/open", [appPath], { timeout: 5000 });

  return {
    success: true,
    attempted: true,
    method: "restart-macos-app",
    appPath,
  };
}

async function restartVsCode() {
  const platform = os.platform();
  if (platform === "darwin") return restartMacVsCode();

  return {
    success: false,
    attempted: false,
    reason: "Automatic VS Code restart is currently supported on macOS only.",
  };
}

// GET - Read current copilot config
export async function GET() {
  try {
    const config = await readConfig();
    const entry = getOpenRouterXEntry(config);

    return NextResponse.json({
      installed: true,
      config,
      hasOpenRouterX: hasOpenRouterXConfig(config),
      configPath: getConfigPath(),
      currentModel: entry?.models?.[0]?.id || null,
      currentUrl: entry?.models?.[0]?.url || null,
    });
  } catch (error) {
    console.log("Error checking copilot settings:", error);
    return NextResponse.json({ error: "Failed to check copilot settings" }, { status: 500 });
  }
}

// POST - Apply OpenrouterX config to chatLanguageModels.json
export async function POST(request) {
  try {
    const { baseUrl, apiKey, models } = await request.json();

    if (!baseUrl || !models?.length) {
      return NextResponse.json({ error: "baseUrl and models are required" }, { status: 400 });
    }

    const configPath = getConfigPath();
    await fs.mkdir(path.dirname(configPath), { recursive: true });

    // Read existing config array
    let config = [];
    try {
      const existing = await fs.readFile(configPath, "utf-8");
      const parsed = JSON.parse(existing);
      config = Array.isArray(parsed) ? parsed : [];
    } catch { /* No existing config */ }

    const endpointUrl = `${baseUrl}/chat/completions#models.ai.azure.com`;
    const keyToUse = apiKey || "sk_openrouterx";

    const newEntry = {
      name: ENTRY_NAME,
      vendor: "azure",
      apiKey: keyToUse,
      models: models.map((id) => ({
        id,
        name: id,
        url: endpointUrl,
        toolCalling: true,
        vision: false,
        maxInputTokens: 128000,
        maxOutputTokens: 16000,
      })),
    };

    // Replace existing OpenrouterX entry or append
    const idx = config.findIndex(isOpenrouterXEntry);
    if (idx >= 0) {
      config[idx] = newEntry;
    } else {
      config.push(newEntry);
    }

    await fs.writeFile(configPath, JSON.stringify(config, null, 2));

    return NextResponse.json({
      success: true,
      message: "Copilot settings applied! Reload VS Code to take effect.",
      configPath,
    });
  } catch (error) {
    console.log("Error updating copilot settings:", error);
    return NextResponse.json({ error: "Failed to update copilot settings" }, { status: 500 });
  }
}

// PATCH - Local app actions
export async function PATCH(request) {
  try {
    const { action } = await request.json().catch(() => ({}));
    if (action !== "restart-vscode") {
      return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
    }

    const result = await restartVsCode();
    if (!result.success) {
      return NextResponse.json(
        {
          ...result,
          error: result.reason || "Failed to restart VS Code",
        },
        { status: result.attempted ? 500 : 404 },
      );
    }

    return NextResponse.json({
      ...result,
      message: "VS Code restarted.",
    });
  } catch (error) {
    console.log("Error restarting VS Code:", error);
    return NextResponse.json(
      { success: false, attempted: true, error: error?.message || "Failed to restart VS Code" },
      { status: 500 },
    );
  }
}

// DELETE - Remove OpenrouterX entry from chatLanguageModels.json
export async function DELETE() {
  try {
    const configPath = getConfigPath();

    let config = [];
    try {
      const existing = await fs.readFile(configPath, "utf-8");
      const parsed = JSON.parse(existing);
      config = Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      if (error.code === "ENOENT") {
        return NextResponse.json({ success: true, message: "No config file to reset" });
      }
      throw error;
    }

    config = config.filter((e) => !isOpenrouterXEntry(e));
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));

    return NextResponse.json({
      success: true,
      message: "OpenrouterX removed from Copilot config",
    });
  } catch (error) {
    console.log("Error resetting copilot settings:", error);
    return NextResponse.json({ error: "Failed to reset copilot settings" }, { status: 500 });
  }
}
