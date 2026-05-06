import { NextResponse } from "next/server";
import {
  getMitmStatus,
  startServer,
  stopServer,
  enableToolDNS,
  disableToolDNS,
  trustCert,
  getCachedPassword,
  setCachedPassword,
  loadEncryptedPassword,
  isSudoPasswordRequired,
  initDbHooks,
} from "@/mitm/manager";
import { getSettings, updateSettings } from "@/lib/localDb";

initDbHooks(getSettings, updateSettings);

const DEFAULT_MITM_ROUTER_BASE = "http://localhost:20128";

function normalizeMitmRouterBaseUrlInput(input) {
  if (input == null || String(input).trim() === "") {
    return DEFAULT_MITM_ROUTER_BASE;
  }
  const t = String(input).trim().replace(/\/+$/, "");
  let u;
  try {
    u = new URL(t);
  } catch {
    throw new Error("Invalid MITM router URL");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error("MITM router URL must use http or https");
  }
  return t;
}

const isWin = process.platform === "win32";

function getPassword(provided) {
  return provided || getCachedPassword() || null;
}

function requiresSudoPassword(pwd) {
  return !isWin && !pwd && isSudoPasswordRequired();
}

function checkIsAdmin() {
  if (isWin) {
    try {
      require("child_process").execSync("net session >nul 2>&1", { windowsHide: true });
      return true;
    } catch {
      return false;
    }
  }
  return typeof process.getuid === "function" && process.getuid() === 0;
}

function checkPrivilege(pwd) {
  if (checkIsAdmin()) return true;
  if (isWin) return false;
  if (!isSudoPasswordRequired()) return true;
  return !!pwd;
}

// GET - Full MITM status (server + per-tool DNS)
export async function GET() {
  try {
    const status = await getMitmStatus();
    const settings = await getSettings();
    const hasCachedPassword = !!getCachedPassword() || !!(await loadEncryptedPassword());
    return NextResponse.json({
      running: status.running,
      pid: status.pid || null,
      certExists: status.certExists || false,
      certTrusted: status.certTrusted || false,
      dnsStatus: status.dnsStatus || {},
      hasCachedPassword,
      isWin,
      needsSudoPassword: !isWin && !hasCachedPassword && isSudoPasswordRequired(),
      isAdmin: checkIsAdmin(),
      mitmRouterBaseUrl:
        (settings.mitmRouterBaseUrl && String(settings.mitmRouterBaseUrl).trim()) ||
        DEFAULT_MITM_ROUTER_BASE,
    });
  } catch (error) {
    console.log("Error getting MITM status:", error.message);
    return NextResponse.json({ error: "Failed to get MITM status" }, { status: 500 });
  }
}

// POST - Start MITM server (cert + server, no DNS)
export async function POST(request) {
  try {
    const { apiKey, sudoPassword, mitmRouterBaseUrl, forceKillPort443 } = await request.json();
    const pwd = getPassword(sudoPassword) || await loadEncryptedPassword() || "";

    if (!apiKey || requiresSudoPassword(pwd)) {
      return NextResponse.json(
        { error: !apiKey ? "Missing apiKey" : "Missing sudoPassword" },
        { status: 400 }
      );
    }

    if (!checkPrivilege(pwd)) {
      return NextResponse.json(
        { error: isWin ? "Administrator required — restart 9Router as Administrator" : "Root or sudo password required to start MITM" },
        { status: 403 }
      );
    }

    if (mitmRouterBaseUrl !== undefined && mitmRouterBaseUrl !== null) {
      try {
        const normalized = normalizeMitmRouterBaseUrlInput(mitmRouterBaseUrl);
        await updateSettings({ mitmRouterBaseUrl: normalized });
      } catch (e) {
        return NextResponse.json(
          { error: e.message || "Invalid MITM router URL" },
          { status: 400 },
        );
      }
    }

    const result = await startServer(apiKey, pwd, !!forceKillPort443);
    if (!isWin) setCachedPassword(pwd);

    return NextResponse.json({ success: true, running: result.running, pid: result.pid });
  } catch (error) {
    console.log("Error starting MITM server:", error.message);
    if (error.code === "PORT_443_BUSY") {
      return NextResponse.json(
        { error: error.message, code: "PORT_443_BUSY", portOwner: error.portOwner },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message || "Failed to start MITM server" }, { status: 500 });
  }
}

// DELETE - Stop MITM server (removes all DNS first, then kills server)
export async function DELETE(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { sudoPassword } = body;
    const pwd = getPassword(sudoPassword) || await loadEncryptedPassword() || "";

    if (requiresSudoPassword(pwd)) {
      return NextResponse.json({ error: "Missing sudoPassword" }, { status: 400 });
    }

    await stopServer(pwd);
    if (!isWin && sudoPassword) setCachedPassword(sudoPassword);

    return NextResponse.json({ success: true, running: false });
  } catch (error) {
    console.log("Error stopping MITM server:", error.message);
    return NextResponse.json({ error: error.message || "Failed to stop MITM server" }, { status: 500 });
  }
}

// PATCH - Toggle DNS for a specific tool (enable/disable)
export async function PATCH(request) {
  try {
    const { tool, action, sudoPassword } = await request.json();
    const pwd = getPassword(sudoPassword) || await loadEncryptedPassword() || "";
    // #region debug-point A:patch-entry
    fetch("http://127.0.0.1:7777/event",{method:"POST",body:JSON.stringify({sessionId:"antigravity-mitm-500",runId:"pre-fix",hypothesisId:"A",location:"src/app/api/cli-tools/antigravity-mitm/route.js:167",msg:"[DEBUG] antigravity-mitm PATCH entry",data:{tool,action,hasSudoPassword:!!sudoPassword,hasResolvedPassword:!!pwd,isWin},ts:Date.now()})}).catch(()=>{});
    // #endregion

    if (!tool || !action) {
      // #region debug-point A:missing-input
      fetch("http://127.0.0.1:7777/event",{method:"POST",body:JSON.stringify({sessionId:"antigravity-mitm-500",runId:"pre-fix",hypothesisId:"A",location:"src/app/api/cli-tools/antigravity-mitm/route.js:173",msg:"[DEBUG] antigravity-mitm PATCH rejected for missing input",data:{tool,action},ts:Date.now()})}).catch(()=>{});
      // #endregion
      return NextResponse.json({ error: "tool and action required" }, { status: 400 });
    }
    if (requiresSudoPassword(pwd)) {
      // #region debug-point B:missing-password
      fetch("http://127.0.0.1:7777/event",{method:"POST",body:JSON.stringify({sessionId:"antigravity-mitm-500",runId:"pre-fix",hypothesisId:"B",location:"src/app/api/cli-tools/antigravity-mitm/route.js:178",msg:"[DEBUG] antigravity-mitm PATCH missing sudo password",data:{tool,action,isWin},ts:Date.now()})}).catch(()=>{});
      // #endregion
      return NextResponse.json({ error: "Missing sudoPassword" }, { status: 400 });
    }
    if (!checkPrivilege(pwd)) {
      // #region debug-point B:privilege-denied
      fetch("http://127.0.0.1:7777/event",{method:"POST",body:JSON.stringify({sessionId:"antigravity-mitm-500",runId:"pre-fix",hypothesisId:"B",location:"src/app/api/cli-tools/antigravity-mitm/route.js:183",msg:"[DEBUG] antigravity-mitm PATCH privilege denied",data:{tool,action,isWin},ts:Date.now()})}).catch(()=>{});
      // #endregion
      return NextResponse.json(
        { error: isWin ? "Administrator required — restart 9Router as Administrator" : "Root or sudo password required to modify DNS" },
        { status: 403 }
      );
    }

    if (action === "enable") {
      // #region debug-point C:enable-start
      fetch("http://127.0.0.1:7777/event",{method:"POST",body:JSON.stringify({sessionId:"antigravity-mitm-500",runId:"pre-fix",hypothesisId:"C",location:"src/app/api/cli-tools/antigravity-mitm/route.js:191",msg:"[DEBUG] antigravity-mitm enabling tool dns",data:{tool},ts:Date.now()})}).catch(()=>{});
      // #endregion
      await enableToolDNS(tool, pwd);
    } else if (action === "disable") {
      // #region debug-point C:disable-start
      fetch("http://127.0.0.1:7777/event",{method:"POST",body:JSON.stringify({sessionId:"antigravity-mitm-500",runId:"pre-fix",hypothesisId:"C",location:"src/app/api/cli-tools/antigravity-mitm/route.js:196",msg:"[DEBUG] antigravity-mitm disabling tool dns",data:{tool},ts:Date.now()})}).catch(()=>{});
      // #endregion
      await disableToolDNS(tool, pwd);
    } else if (action === "trust-cert") {
      await trustCert(pwd);
      if (!isWin && sudoPassword) setCachedPassword(sudoPassword);
      const status = await getMitmStatus();
      return NextResponse.json({ success: true, certTrusted: status.certTrusted });
    } else {
      return NextResponse.json({ error: "action must be enable, disable, or trust-cert" }, { status: 400 });
    }

    if (!isWin && sudoPassword) setCachedPassword(sudoPassword);

    const status = await getMitmStatus();
    // #region debug-point D:patch-success
    fetch("http://127.0.0.1:7777/event",{method:"POST",body:JSON.stringify({sessionId:"antigravity-mitm-500",runId:"pre-fix",hypothesisId:"D",location:"src/app/api/cli-tools/antigravity-mitm/route.js:210",msg:"[DEBUG] antigravity-mitm PATCH success",data:{tool,action,dnsStatus:status.dnsStatus||{}},ts:Date.now()})}).catch(()=>{});
    // #endregion
    return NextResponse.json({ success: true, dnsStatus: status.dnsStatus });
  } catch (error) {
    // #region debug-point E:patch-error
    fetch("http://127.0.0.1:7777/event",{method:"POST",body:JSON.stringify({sessionId:"antigravity-mitm-500",runId:"pre-fix",hypothesisId:"E",location:"src/app/api/cli-tools/antigravity-mitm/route.js:213",msg:"[DEBUG] antigravity-mitm PATCH error",data:{message:error?.message||null,stack:error?.stack||null,code:error?.code||null},ts:Date.now()})}).catch(()=>{});
    // #endregion
    console.log("Error toggling DNS:", error.message);
    return NextResponse.json({ error: error.message || "Failed to toggle DNS" }, { status: 500 });
  }
}
