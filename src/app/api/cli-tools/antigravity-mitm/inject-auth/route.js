import { NextResponse } from "next/server";
import { execFileSync, spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import { ANTIGRAVITY_CONFIG } from "@/lib/oauth/constants/oauth.js";
import { buildAntigravityLaunchEnv } from "../launchHelpers.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ANTIGRAVITY_APP_CANDIDATES = [
  "/Applications/Antigravity.app",
  "/Applications/Google Antigravity.app",
  path.join(os.homedir(), "Applications", "Antigravity.app"),
  path.join(os.homedir(), "Applications", "Google Antigravity.app"),
];

function getAntigravityGlobalStorageDir() {
  if (process.platform === "win32") {
    return path.join(os.homedir(), "AppData", "Roaming", "Antigravity", "User", "globalStorage");
  }
  if (process.platform === "linux") {
    return path.join(os.homedir(), ".config", "Antigravity", "User", "globalStorage");
  }
  return path.join(os.homedir(), "Library", "Application Support", "Antigravity", "User", "globalStorage");
}

function getAntigravityStateDbPath() {
  return path.join(getAntigravityGlobalStorageDir(), "state.vscdb");
}

function encodeVarint(value) {
  let n = BigInt(value);
  const bytes = [];
  while (n >= 0x80n) {
    bytes.push(Number((n & 0x7fn) | 0x80n));
    n >>= 7n;
  }
  bytes.push(Number(n));
  return Buffer.from(bytes);
}

function encodeLengthDelimitedField(fieldNumber, data) {
  const payload = Buffer.isBuffer(data) ? data : Buffer.from(data);
  return Buffer.concat([
    encodeVarint((BigInt(fieldNumber) << 3n) | 2n),
    encodeVarint(payload.length),
    payload,
  ]);
}

function encodeStringField(fieldNumber, value) {
  return encodeLengthDelimitedField(fieldNumber, Buffer.from(String(value), "utf8"));
}

function encodeVarintField(fieldNumber, value) {
  return Buffer.concat([
    encodeVarint((BigInt(fieldNumber) << 3n) | 0n),
    encodeVarint(value),
  ]);
}

function createTimestampPayload(seconds) {
  return Buffer.concat([
    encodeVarintField(1, seconds),
    encodeVarintField(2, 0),
  ]);
}

function isPersonalEmail(email) {
  const normalized = String(email || "").toLowerCase();
  return ["@gmail.com", "@outlook.com", "@hotmail.com", "@qq.com", "@163.com"].some((suffix) => normalized.endsWith(suffix));
}

function createOAuthInfoPayload(account) {
  const isGcpTos = account.isGcpTos === true && !isPersonalEmail(account.email);
  const fields = [
    encodeStringField(1, account.accessToken),
    encodeStringField(2, account.tokenType || "Bearer"),
    encodeStringField(3, account.refreshToken),
    encodeLengthDelimitedField(4, createTimestampPayload(account.expiryDateSeconds)),
  ];

  if (account.idToken) fields.push(encodeStringField(5, account.idToken));
  if (isGcpTos) fields.push(encodeVarintField(6, 1));

  return Buffer.concat(fields);
}

function createUnifiedStateEntry(sentinelKey, payload) {
  const row = encodeStringField(1, Buffer.from(payload).toString("base64"));
  const dataEntry = Buffer.concat([
    encodeStringField(1, sentinelKey),
    encodeLengthDelimitedField(2, row),
  ]);
  return encodeLengthDelimitedField(1, dataEntry).toString("base64");
}

function createMinimalUserStatusPayload(email) {
  return Buffer.concat([
    encodeStringField(3, email),
    encodeStringField(7, email),
  ]);
}

function createStringValuePayload(value) {
  return encodeStringField(3, value);
}

function quoteSql(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function runSqlite(dbPath, sql) {
  execFileSync("sqlite3", [dbPath, sql], { encoding: "utf8", timeout: 10000 });
}

function writeAntigravityState(account) {
  const dbPath = getAntigravityStateDbPath();
  if (!fs.existsSync(dbPath)) {
    throw new Error(`Antigravity state DB not found: ${dbPath}`);
  }

  const backupPath = `${dbPath}.bak-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  fs.copyFileSync(dbPath, backupPath);

  const oauthTokenValue = createUnifiedStateEntry(
    "oauthTokenInfoSentinelKey",
    createOAuthInfoPayload(account),
  );
  const userStatusValue = createUnifiedStateEntry(
    "userStatusSentinelKey",
    createMinimalUserStatusPayload(account.email),
  );
  const statements = [
    `INSERT OR REPLACE INTO ItemTable (key, value) VALUES ('antigravityUnifiedStateSync.oauthToken', ${quoteSql(oauthTokenValue)});`,
    `INSERT OR REPLACE INTO ItemTable (key, value) VALUES ('antigravityUnifiedStateSync.userStatus', ${quoteSql(userStatusValue)});`,
    "INSERT OR REPLACE INTO ItemTable (key, value) VALUES ('antigravityOnboarding', 'true');",
  ];

  if (account.projectId) {
    const enterpriseValue = createUnifiedStateEntry(
      "enterpriseGcpProjectId",
      createStringValuePayload(account.projectId),
    );
    statements.push(`INSERT OR REPLACE INTO ItemTable (key, value) VALUES ('antigravityUnifiedStateSync.enterprisePreferences', ${quoteSql(enterpriseValue)});`);
  } else {
    statements.push("DELETE FROM ItemTable WHERE key = 'antigravityUnifiedStateSync.enterprisePreferences';");
  }

  if (account.deviceProfile?.mac_machine_id) {
    statements.push(`INSERT OR REPLACE INTO ItemTable (key, value) VALUES ('telemetry.serviceMachineId', ${quoteSql(account.deviceProfile.mac_machine_id)});`);
  }

  runSqlite(dbPath, statements.join("\n"));
  return { dbPath, backupPath };
}

function normalizeCredential(input) {
  if (!input) return null;
  if (Array.isArray(input)) return input.map(normalizeCredential).find(Boolean) || null;

  const refreshToken = input.refresh_token || input.refreshToken || input.token?.refresh_token || input.token?.refreshToken;
  if (!refreshToken) return null;

  return {
    email: input.email || input.user_email || input.userEmail || input.account?.email || "",
    refreshToken,
    isGcpTos: input.is_gcp_tos ?? input.isGcpTos ?? input.token?.is_gcp_tos ?? input.token?.isGcpTos ?? false,
    projectId: input.project_id || input.projectId || input.token?.project_id || input.token?.projectId || "",
    idToken: input.id_token || input.idToken || input.token?.id_token || input.token?.idToken || "",
    deviceProfile: input.device_profile || input.deviceProfile || null,
  };
}

function readJsonIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function pickCredential(body) {
  let parsedJsonText = null;
  if (typeof body?.jsonText === "string" && body.jsonText.trim()) {
    parsedJsonText = JSON.parse(body.jsonText);
  }

  return normalizeCredential(body?.credential)
    || normalizeCredential(body?.credentials)
    || normalizeCredential(parsedJsonText)
    || normalizeCredential(body)
    || normalizeCredential(readJsonIfExists(body?.credentialsPath))
    || normalizeCredential(readJsonIfExists(path.join(os.homedir(), ".antigravity_tools", "antigravity-auth.json")));
}

async function refreshAntigravityAccessToken(credential) {
  const response = await fetch(ANTIGRAVITY_CONFIG.tokenUrl, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: credential.refreshToken,
      client_id: ANTIGRAVITY_CONFIG.clientId,
      client_secret: ANTIGRAVITY_CONFIG.clientSecret,
    }),
  });

  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!response.ok || !data.access_token) {
    throw new Error(`Google token refresh failed (${response.status}): ${data.error_description || data.error || text}`);
  }

  return data;
}

async function fetchUserInfo(accessToken) {
  const response = await fetch(`${ANTIGRAVITY_CONFIG.userInfoUrl}?alt=json`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "x-request-source": "local",
    },
  });
  if (!response.ok) return {};
  return response.json().catch(() => ({}));
}

async function fetchProjectId(accessToken) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "User-Agent": ANTIGRAVITY_CONFIG.loadCodeAssistUserAgent,
    "X-Goog-Api-Client": ANTIGRAVITY_CONFIG.loadCodeAssistApiClient,
    "Client-Metadata": ANTIGRAVITY_CONFIG.loadCodeAssistClientMetadata,
    "x-request-source": "local",
  };
  const metadata = { ideType: "IDE_UNSPECIFIED", platform: "PLATFORM_UNSPECIFIED", pluginType: "GEMINI" };

  try {
    const response = await fetch(ANTIGRAVITY_CONFIG.loadCodeAssistEndpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ metadata }),
    });
    if (!response.ok) return "";
    const data = await response.json();
    return String(data.cloudaicompanionProject?.id || data.cloudaicompanionProject || "").trim();
  } catch {
    return "";
  }
}

function quitAntigravity() {
  if (process.platform === "darwin") {
    execFileSync("/usr/bin/osascript", ["-e", 'tell application "Antigravity" to quit'], { stdio: "ignore", timeout: 5000 });
    execFileSync("/usr/bin/pkill", ["-x", "Antigravity"], { stdio: "ignore", timeout: 5000 });
    execFileSync("/usr/bin/pkill", ["-f", "Antigravity.app/Contents/MacOS"], { stdio: "ignore", timeout: 5000 });
    return;
  }

  if (process.platform === "win32") {
    execFileSync("taskkill", ["/IM", "Antigravity.exe", "/T", "/F"], { stdio: "ignore", windowsHide: true, timeout: 5000 });
    return;
  }

  execFileSync("pkill", ["-f", "Antigravity"], { stdio: "ignore", timeout: 5000 });
}

function findAntigravityAppPath() {
  return ANTIGRAVITY_APP_CANDIDATES.find((candidate) => fs.existsSync(candidate)) || "";
}

function getMacAppExecutable(appPath) {
  if (!appPath || !appPath.endsWith(".app")) return appPath;
  const infoPath = path.join(appPath, "Contents", "Info.plist");
  try {
    const executableName = execFileSync("/usr/bin/defaults", ["read", infoPath.replace(/\.plist$/, ""), "CFBundleExecutable"], { encoding: "utf8" }).trim();
    if (executableName) return path.join(appPath, "Contents", "MacOS", executableName);
  } catch {
    // Fall through to the Electron default used by Antigravity builds.
  }
  return path.join(appPath, "Contents", "MacOS", "Electron");
}

function launchAntigravity(appPath) {
  const env = buildAntigravityLaunchEnv();
  if (process.platform === "darwin") {
    const executable = getMacAppExecutable(appPath);
    if (executable && fs.existsSync(executable)) {
      const child = spawn(executable, [], {
        cwd: os.homedir(),
        detached: true,
        env,
        stdio: "ignore",
      });
      child.unref();
      return;
    }
    execFileSync("/usr/bin/open", [appPath || "-a", appPath ? undefined : "Antigravity"].filter(Boolean), { env, stdio: "ignore", timeout: 5000 });
    return;
  }

  const executable = process.platform === "win32" ? "Antigravity.exe" : "antigravity";
  const child = spawn(executable, [], { detached: true, env, stdio: "ignore", windowsHide: false });
  child.unref();
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const credential = pickCredential(body);
    if (!credential) {
      return NextResponse.json(
        { error: "No Antigravity refresh_token credential was found" },
        { status: 400 },
      );
    }

    const tokens = await refreshAntigravityAccessToken(credential);
    const userInfo = await fetchUserInfo(tokens.access_token);
    const email = credential.email || userInfo.email;
    if (!email) throw new Error("Could not resolve account email from credential or Google userinfo");

    const account = {
      email,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || credential.refreshToken,
      tokenType: tokens.token_type || "Bearer",
      expiryDateSeconds: Math.floor(Date.now() / 1000) + Number(tokens.expires_in || 3600),
      idToken: tokens.id_token || credential.idToken || "",
      isGcpTos: credential.isGcpTos === true,
      projectId: credential.projectId || await fetchProjectId(tokens.access_token),
      deviceProfile: credential.deviceProfile,
    };

    try {
      quitAntigravity();
    } catch {
      // Antigravity may not be running; writing state still works.
    }
    await sleep(900);

    const writeResult = writeAntigravityState(account);
    const appPath = findAntigravityAppPath();

    try {
      launchAntigravity(appPath);
    } catch {
      // The DB write is the important part; surface path info so manual launch remains possible.
    }

    return NextResponse.json({
      success: true,
      email,
      projectId: account.projectId || null,
      restarted: true,
      path: appPath || null,
      ...writeResult,
      message: `Injected Antigravity auth for ${email} and restarted Antigravity.`,
    });
  } catch (error) {
    console.error("Error injecting Antigravity auth:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to inject Antigravity auth" },
      { status: 500 },
    );
  }
}
