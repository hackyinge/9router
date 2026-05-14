import { NextResponse } from "next/server";
import { exec } from "child_process";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import os from "os";
import crypto from "node:crypto";
import { getAuthPayload } from "@/dashboardGuard";
import { ensureCodexActivationTokens, readCodexTokenRefreshError } from "@/lib/codexActivationTokens";
import { isConnectionAllowedForSubUser, resolveSubUserAccessContext } from "@/lib/subUserAccess";
import { getProviderConnectionById, updateProviderConnection } from "@/models";

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

const getCodexDir = () => path.join(os.homedir(), ".codex");
const getCodexAuthPath = () => path.join(getCodexDir(), "auth.json");
const CODEX_INSTALL_COMMAND = "npm install -g @openai/codex";
const CODEX_INSTALL_HINTS = os.platform() === "darwin"
  ? [CODEX_INSTALL_COMMAND, "brew install --cask codex"]
  : [CODEX_INSTALL_COMMAND];
const CODEX_MACOS_APP_CANDIDATES = [
  "/Applications/Codex.app/Contents/MacOS/Codex",
  path.join(os.homedir(), "Applications/Codex.app/Contents/MacOS/Codex"),
  "/Applications/Codex.app",
  path.join(os.homedir(), "Applications/Codex.app"),
];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const CODEX_KEYCHAIN_SERVICE = "Codex Auth";
const CODEX_TOKEN_URL = "https://auth.openai.com/oauth/token";
const CODEX_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";

const decodeJwtPayload = (jwt) => {
  try {
    if (!jwt || typeof jwt !== "string") return null;
    const parts = jwt.split(".");
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch {
    return null;
  }
};

async function requireCodexActivationAccess(request) {
  const payload = await getAuthPayload(request);
  if (!payload) {
    return { payload: null, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (payload.role !== "super_admin" && payload.role !== "sub_user") {
    return { payload, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { payload, response: null };
}

async function detectMacCodexApp() {
  if (os.platform() !== "darwin") return null;
  for (const candidate of CODEX_MACOS_APP_CANDIDATES) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Continue probing other standard macOS install locations.
    }
  }
  return null;
}

async function checkCodexInstalled() {
  try {
    const isWindows = os.platform() === "win32";
    const command = isWindows ? "where codex" : "which codex";
    const env = isWindows
      ? { ...process.env, PATH: `${process.env.APPDATA}\\npm;${process.env.PATH}` }
      : process.env;
    const { stdout } = await execAsync(command, { windowsHide: true, env });
    const binaryPath = stdout.split(/\r?\n/).find(Boolean)?.trim() || "codex";
    const appPath = await detectMacCodexApp();
    return { installed: true, source: "cli", binaryPath, appPath };
  } catch {
    const appPath = await detectMacCodexApp();
    return appPath
      ? { installed: true, source: "app", binaryPath: appPath, appPath }
      : { installed: false };
  }
}

async function isMacCodexRunning() {
  if (os.platform() !== "darwin") return false;
  try {
    await execAsync("pgrep -x Codex", { timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

async function restartLocalCodex(detectedCodex) {
  if (os.platform() !== "darwin") {
    return {
      attempted: false,
      success: false,
      reason: "Automatic Codex restart is currently supported on macOS Codex.app only.",
    };
  }

  const appPath = detectedCodex?.appPath || await detectMacCodexApp();
  if (!appPath) {
    return {
      attempted: false,
      success: false,
      reason: "Codex CLI was detected, but Codex.app was not found for automatic restart.",
    };
  }

  const wasRunning = await isMacCodexRunning();
  try {
    if (wasRunning) {
      await execAsync("osascript -e 'tell application \"Codex\" to quit'", { timeout: 5000 }).catch(() => null);
      for (let i = 0; i < 10; i += 1) {
        if (!(await isMacCodexRunning())) break;
        await sleep(300);
      }
      if (await isMacCodexRunning()) {
        await execAsync("pkill -x Codex", { timeout: 3000 }).catch(() => null);
        await sleep(500);
      }
    }

    await execAsync("open -a Codex", { timeout: 5000 });
    return {
      attempted: true,
      success: true,
      method: wasRunning ? "restart-macos-app" : "start-macos-app",
      appPath,
    };
  } catch (error) {
    return {
      attempted: true,
      success: false,
      method: "restart-macos-app",
      appPath,
      reason: error?.message || "Failed to restart Codex.app",
    };
  }
}

function getAccountId(connection) {
  const providerData = connection.providerSpecificData || {};
  const accessPayload = decodeJwtPayload(connection.accessToken);
  const idPayload = decodeJwtPayload(connection.idToken);
  const accessAuth = accessPayload?.["https://api.openai.com/auth"] || {};
  const idAuth = idPayload?.["https://api.openai.com/auth"] || {};
  return (
    providerData.chatgptAccountId ||
    accessAuth.chatgpt_account_id ||
    idAuth.chatgpt_account_id ||
    accessPayload?.account_id ||
    idPayload?.account_id ||
    null
  );
}

function getEmailFromTokens(connection) {
  const accessPayload = decodeJwtPayload(connection.accessToken);
  const idPayload = decodeJwtPayload(connection.idToken);
  return connection.email || idPayload?.email || accessPayload?.email || null;
}

async function readAuthJson() {
  try {
    return JSON.parse(await fs.readFile(getCodexAuthPath(), "utf8"));
  } catch {
    return {};
  }
}

function codexAuthToConnection(authData) {
  const tokens = authData?.tokens || {};
  const providerSpecificData = {};
  if (tokens.account_id) providerSpecificData.chatgptAccountId = tokens.account_id;
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    idToken: tokens.id_token,
    providerSpecificData,
  };
}

function connectionsReferToSameCodexAccount(connection, candidate) {
  if (!candidate?.accessToken && !candidate?.idToken) return false;
  if (connection.refreshToken && candidate.refreshToken && connection.refreshToken === candidate.refreshToken) {
    return true;
  }

  const connectionAccountId = getAccountId(connection);
  const candidateAccountId = getAccountId(candidate);
  if (connectionAccountId && candidateAccountId && connectionAccountId === candidateAccountId) {
    return true;
  }

  const connectionEmail = getEmailFromTokens(connection);
  const candidateEmail = getEmailFromTokens(candidate);
  return !!(connectionEmail && candidateEmail && connectionEmail === candidateEmail);
}

async function hydrateMissingTokensFromLocalCodexAuth(connection) {
  const candidate = codexAuthToConnection(await readAuthJson());
  if (!connectionsReferToSameCodexAccount(connection, candidate)) return connection;

  const updateData = {};
  if (!connection.accessToken && candidate.accessToken) updateData.accessToken = candidate.accessToken;
  if (!connection.refreshToken && candidate.refreshToken) updateData.refreshToken = candidate.refreshToken;
  if (!connection.idToken && candidate.idToken) updateData.idToken = candidate.idToken;

  if (Object.keys(updateData).length === 0) return connection;
  const updated = await updateProviderConnection(connection.id, updateData);
  return updated || { ...connection, ...updateData };
}

async function readOptionalFile(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

async function writeAuthJsonAtomic(authData) {
  const authPath = getCodexAuthPath();
  const tmpPath = `${authPath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmpPath, `${JSON.stringify(authData, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(tmpPath, authPath);
}

async function restoreAuthJsonSnapshot(snapshot) {
  if (snapshot === null) {
    await fs.rm(getCodexAuthPath(), { force: true }).catch(() => null);
    return;
  }
  await writeAuthJsonAtomic(JSON.parse(snapshot));
}

async function refreshCodexTokens(connection) {
  if (!connection.refreshToken) {
    throw new Error("This Codex account is missing refresh_token. Re-authorize or re-import it first.");
  }

  const response = await fetch(CODEX_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: CODEX_CLIENT_ID,
      refresh_token: connection.refreshToken,
    }),
  });

  if (!response.ok) {
    throw await readCodexTokenRefreshError(response);
  }

  const tokens = await response.json();
  const refreshed = {
    accessToken: tokens.access_token || connection.accessToken,
    refreshToken: tokens.refresh_token || connection.refreshToken,
    idToken: tokens.id_token || connection.idToken,
    expiresAt: tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : connection.expiresAt,
  };

  if (!refreshed.accessToken) {
    throw new Error("Codex token refresh did not return an access_token snapshot.");
  }

  const accountId = getAccountId({ ...connection, ...refreshed });
  const idPayload = decodeJwtPayload(refreshed.idToken);
  const email = connection.email || idPayload?.email;
  const providerSpecificData = {
    ...(connection.providerSpecificData || {}),
  };
  const idAuth = idPayload?.["https://api.openai.com/auth"] || {};
  if (accountId) providerSpecificData.chatgptAccountId = accountId;
  if (idAuth.chatgpt_plan_type) providerSpecificData.chatgptPlanType = idAuth.chatgpt_plan_type;

  const updateData = {
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken,
    idToken: refreshed.idToken,
    expiresAt: refreshed.expiresAt,
    providerSpecificData,
  };
  if (email) updateData.email = email;

  await updateProviderConnection(connection.id, updateData);
  return { ...connection, ...updateData };
}

async function buildCodexKeychainAccount() {
  const codexDir = getCodexDir();
  let resolved = codexDir;
  try {
    resolved = await fs.realpath(codexDir);
  } catch {
    // Directory is created before keychain writes; keep the configured path as fallback.
  }
  const digest = crypto.createHash("sha256").update(resolved).digest("hex");
  return `cli|${digest.slice(0, 16)}`;
}

async function writeCodexKeychain(authData) {
  if (os.platform() !== "darwin") {
    return { attempted: false, success: false, reason: "Codex Keychain auth is only used on macOS." };
  }

  try {
    const account = await buildCodexKeychainAccount();
    await execFileAsync("security", [
      "add-generic-password",
      "-U",
      "-s",
      CODEX_KEYCHAIN_SERVICE,
      "-a",
      account,
      "-w",
      JSON.stringify(authData),
    ], { timeout: 5000 });
    return { attempted: true, success: true, service: CODEX_KEYCHAIN_SERVICE, account };
  } catch (error) {
    return {
      attempted: true,
      success: false,
      service: CODEX_KEYCHAIN_SERVICE,
      reason: error?.message || "Failed to write Codex Keychain auth",
    };
  }
}

export async function POST(request) {
  try {
    const { payload, response } = await requireCodexActivationAccess(request);
    if (response) return response;
    const subUserContext = payload.role === "sub_user"
      ? await resolveSubUserAccessContext(request)
      : null;
    if (payload.role === "sub_user" && !subUserContext) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { connectionId, restartCodex = true } = await request.json();
    if (!connectionId) {
      return NextResponse.json({ error: "connectionId is required" }, { status: 400 });
    }

    let connection = await getProviderConnectionById(connectionId);
    if (!connection || connection.provider !== "codex" || connection.authType !== "oauth") {
      return NextResponse.json({ error: "Codex OAuth account not found" }, { status: 404 });
    }
    if (subUserContext && !isConnectionAllowedForSubUser(subUserContext, connection)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    connection = await hydrateMissingTokensFromLocalCodexAuth(connection);
    if (!connection.refreshToken) {
      return NextResponse.json({ error: "This Codex account is missing refresh_token. Re-authorize or re-import it first." }, { status: 400 });
    }

    const detectedCodex = await checkCodexInstalled();
    if (!detectedCodex.installed) {
      return NextResponse.json({
        error: "Local Codex is not installed",
        installCommand: CODEX_INSTALL_COMMAND,
        installHints: CODEX_INSTALL_HINTS,
      }, { status: 404 });
    }

    let tokenSource = "unknown";
    let tokenWarning = null;
    try {
      const tokenResult = await ensureCodexActivationTokens(connection, {
        refreshTokens: refreshCodexTokens,
      });
      connection = tokenResult.connection;
      tokenSource = tokenResult.tokenSource;
      tokenWarning = tokenResult.tokenWarning || null;
    } catch (error) {
      return NextResponse.json({
        error: error?.message || "Failed to refresh Codex account before activation",
        code: error?.code || null,
      }, { status: 400 });
    }
    if (!connection.accessToken) {
      return NextResponse.json({ error: "This Codex account is missing access_token after refresh. Re-authorize or re-import it first." }, { status: 400 });
    }

    await fs.mkdir(getCodexDir(), { recursive: true });
    const authData = await readAuthJson();
    const accountId = getAccountId(connection);
    const tokens = {
      access_token: connection.accessToken,
      refresh_token: connection.refreshToken,
    };
    if (connection.idToken) tokens.id_token = connection.idToken;
    if (accountId) tokens.account_id = accountId;

    delete authData.auth_mode;
    authData.OPENAI_API_KEY = null;
    authData.tokens = tokens;
    authData.last_refresh = new Date().toISOString();

    const previousAuthJson = await readOptionalFile(getCodexAuthPath());
    await writeAuthJsonAtomic(authData);
    const keychain = await writeCodexKeychain(authData);
    if (!keychain.success) {
      await restoreAuthJsonSnapshot(previousAuthJson).catch(() => null);
      return NextResponse.json({
        error: `Failed to write Codex Keychain auth: ${keychain.reason || "unknown error"}`,
        keychain,
      }, { status: 500 });
    }
    const restart = restartCodex === false
      ? { attempted: false, success: false, skipped: true }
      : await restartLocalCodex(detectedCodex);

    return NextResponse.json({
      success: true,
      authPath: getCodexAuthPath(),
      account: connection.email || connection.name || connection.id,
      accountId,
      detectedCodex,
      keychain,
      restart,
      tokenSource,
      tokenWarning,
      restartRequired: !restart.success || !keychain.success,
      message: keychain.success && restart.success
        ? "Codex account applied to auth.json and Keychain, then Codex was restarted."
        : "Codex account applied, but Codex may still require a manual login check.",
    });
  } catch (error) {
    console.log("Error activating Codex account:", error);
    return NextResponse.json({ error: error?.message || "Failed to activate Codex account" }, { status: 500 });
  }
}
