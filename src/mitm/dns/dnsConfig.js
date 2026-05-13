const { exec, spawn, execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { log, err } = require("../logger");
const { TOOL_HOSTS } = require("../../shared/constants/mitmToolHosts.js");
const { runElevatedPowerShell, isAdmin } = require("../winElevated.js");

/**
 * Atomic-ish write for Windows hosts file with rollback on failure.
 * Strategy: write `.new` sibling → rename current to `.bak` → rename `.new` to target.
 * If anything fails mid-way, restore from `.bak`. Same-volume renames are atomic on NTFS.
 */
function atomicWriteHostsWin(target, originalContent, newContent) {
  const tmpNew = `${target}.openrouterx.new`;
  const tmpBak = `${target}.openrouterx.bak`;
  try {
    fs.writeFileSync(tmpNew, newContent, "utf8");
    try { fs.unlinkSync(tmpBak); } catch { /* none */ }
    fs.renameSync(target, tmpBak);
    try {
      fs.renameSync(tmpNew, target);
    } catch (e) {
      // Rollback: restore original
      try { fs.renameSync(tmpBak, target); } catch { fs.writeFileSync(target, originalContent, "utf8"); }
      throw e;
    }
    try { fs.unlinkSync(tmpBak); } catch { /* best effort */ }
  } finally {
    try { fs.unlinkSync(tmpNew); } catch { /* already moved or never created */ }
  }
}

const IS_WIN = process.platform === "win32";
const IS_MAC = process.platform === "darwin";
const HOSTS_FILE = IS_WIN
  ? path.join(process.env.SystemRoot || "C:\\Windows", "System32", "drivers", "etc", "hosts")
  : "/etc/hosts";
const MAC_PF_ANTIGRAVITY_ANCHOR = "com.apple/openrouterx-mitm-antigravity";
const MAC_ANTIGRAVITY_FALLBACK_IPS = [
  "216.239.32.223",
  "216.239.34.223",
  "216.239.36.223",
  "216.239.38.223",
];
const MAC_ANTIGRAVITY_LEGACY_SHARED_IP_PREFIXES = [
  "142.250.",
  "142.251.",
  "172.217.",
];
const REQUIRED_HOST_LOOPBACKS = IS_WIN ? ["127.0.0.1"] : ["127.0.0.1", "::1"];

function isMacAntigravityPfRedirectEnabled(env = process.env) {
  return String(env.OPENROUTERX_MITM_ANTIGRAVITY_PF || "").trim() === "1";
}

function lineHasHostEntry(line, address, host) {
  const trimmed = String(line || "").trim();
  if (!trimmed || trimmed.startsWith("#")) return false;
  const parts = trimmed.split(/\s+/);
  return parts[0] === address && parts.slice(1).includes(host);
}

function hasHostLoopback(content, host, address) {
  return String(content || "")
    .split(/\r?\n/)
    .some((line) => lineHasHostEntry(line, address, host));
}

function hostHasRequiredLoopbacks(content, host, loopbacks = REQUIRED_HOST_LOOPBACKS) {
  return loopbacks.every((address) => hasHostLoopback(content, host, address));
}

function getMissingHostsEntries(content, hosts, loopbacks = REQUIRED_HOST_LOOPBACKS) {
  return hosts.flatMap((host) =>
    loopbacks
      .filter((address) => !hasHostLoopback(content, host, address))
      .map((address) => `${address} ${host}`)
  );
}

/** True when `sudo` exists (e.g. missing on minimal Docker images like Alpine). */
function isSudoAvailable() {
  if (IS_WIN) return false;
  try {
    execSync("command -v sudo", { stdio: "ignore", windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

function canRunSudoWithoutPassword() {
  if (IS_WIN || !isSudoAvailable()) return true;
  try {
    execSync("sudo -n true", { stdio: "ignore", windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

function isSudoPasswordRequired() {
  return !IS_WIN && isSudoAvailable() && !canRunSudoWithoutPassword();
}

/**
 * Execute command with sudo password via stdin (macOS/Linux only).
 * Without sudo in PATH (containers), runs via sh — same user, no elevation.
 */
function execWithPassword(command, password) {
  return new Promise((resolve, reject) => {
    const useSudo = isSudoAvailable();
    const child = useSudo
      ? spawn("sudo", ["-S", "sh", "-c", command], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true })
      : spawn("sh", ["-c", command], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", (d) => { stderr += d; });

    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr || `Exit code ${code}`));
    });

    if (useSudo) {
      child.stdin.write(`${password}\n`);
      child.stdin.end();
    }
  });
}

/**
 * Trim trailing blank lines/whitespace, ensure file ends with exactly one newline.
 */
function normalizeHostsContent(content) {
  const eol = IS_WIN ? "\r\n" : "\n";
  return content.replace(/[\r\n\s]+$/g, "") + eol;
}

/**
 * Flush DNS cache (macOS/Linux)
 */
async function flushDNS(sudoPassword) {
  if (IS_WIN) return; // Windows flushes inline via ipconfig
  if (IS_MAC) {
    await execWithPassword("dscacheutil -flushcache && killall -HUP mDNSResponder", sudoPassword);
  } else {
    await execWithPassword("resolvectl flush-caches 2>/dev/null || true", sudoPassword);
  }
}

function shellQuoteSingle(str) {
  return `'${String(str).replace(/'/g, "'\\''")}'`;
}

function getDefaultMacInterface() {
  if (!IS_MAC) return "";
  try {
    const out = execSync("route -n get default 2>/dev/null | awk '/interface:/{print $2; exit}'", {
      encoding: "utf8",
      windowsHide: true,
    }).trim();
    return out || "en0";
  } catch {
    return "en0";
  }
}

async function getMacAntigravityRedirectIPs() {
  return [...MAC_ANTIGRAVITY_FALLBACK_IPS];
}

function getMacLoopbackIPv4Aliases() {
  if (!IS_MAC) return [];
  try {
    const out = execSync("ifconfig lo0", { encoding: "utf8", windowsHide: true });
    return [...out.matchAll(/^\s+inet\s+(\d+\.\d+\.\d+\.\d+)\s+/gm)].map((m) => m[1]);
  } catch {
    return [];
  }
}

function getMacLegacyAntigravityAliases() {
  return getMacLoopbackIPv4Aliases().filter((ip) =>
    MAC_ANTIGRAVITY_LEGACY_SHARED_IP_PREFIXES.some((prefix) => ip.startsWith(prefix))
  );
}

async function enableMacAntigravityRedirect(sudoPassword) {
  if (!IS_MAC) return;
  if (!isMacAntigravityPfRedirectEnabled()) {
    await disableMacAntigravityRedirect(sudoPassword);
    log("🌐 PF antigravity: skipped (hosts-only mode; set OPENROUTERX_MITM_ANTIGRAVITY_PF=1 to opt in)");
    return;
  }
  const ips = await getMacAntigravityRedirectIPs();
  if (ips.length === 0) return;

  await enableMacAntigravityLoopbackAliases(sudoPassword, ips);

  const iface = getDefaultMacInterface();
  const rules = [
    `table <openrouterx_antigravity> persist { ${ips.join(", ")} }`,
    `rdr pass on ${iface} inet proto tcp from any to <openrouterx_antigravity> port 443 -> 127.0.0.1 port 443`,
    "",
  ].join("\n");
  const command = [
    "pfctl -E >/dev/null 2>&1 || true",
    `printf '%s' ${shellQuoteSingle(rules)} | pfctl -a ${shellQuoteSingle(MAC_PF_ANTIGRAVITY_ANCHOR)} -f -`,
  ].join(" && ");

  await execWithPassword(command, sudoPassword);
  log(`🌐 PF antigravity: ✅ redirect active on ${iface} (${ips.length} IPs)`);
}

async function disableMacAntigravityRedirect(sudoPassword) {
  if (!IS_MAC) return;
  const ips = [...new Set([
    ...await getMacAntigravityRedirectIPs(),
    ...getMacLegacyAntigravityAliases(),
  ])];
  await execWithPassword(`pfctl -a ${shellQuoteSingle(MAC_PF_ANTIGRAVITY_ANCHOR)} -F all >/dev/null 2>&1 || true`, sudoPassword);
  await disableMacAntigravityLoopbackAliases(sudoPassword, ips);
  log("🌐 PF antigravity: ✅ redirect removed");
}

async function enableMacAntigravityLoopbackAliases(sudoPassword, ips) {
  if (!IS_MAC || !ips.length) return;
  const commands = ips.map((ip) => `ifconfig lo0 alias ${ip}/32 2>/dev/null || true`);
  await execWithPassword(commands.join("; "), sudoPassword);
  log(`🌐 lo0 antigravity: ✅ aliases active (${ips.length} IPs)`);
}

async function disableMacAntigravityLoopbackAliases(sudoPassword, ips) {
  if (!IS_MAC || !ips.length) return;
  const commands = ips.map((ip) => `ifconfig lo0 -alias ${ip} 2>/dev/null || true`);
  await execWithPassword(commands.join("; "), sudoPassword);
}

async function ensureToolNetworkRedirect(tool, sudoPassword) {
  if (tool === "antigravity") await enableMacAntigravityRedirect(sudoPassword);
}

async function removeToolNetworkRedirect(tool, sudoPassword) {
  if (tool === "antigravity") await disableMacAntigravityRedirect(sudoPassword);
}

/**
 * Check if DNS entry exists for a specific host
 */
function checkDNSEntry(host = null) {
  try {
    const hostsContent = fs.readFileSync(HOSTS_FILE, "utf8");
    if (host) return hostHasRequiredLoopbacks(hostsContent, host);
    // Legacy: check all antigravity hosts (backward compat)
    return TOOL_HOSTS.antigravity.every(h => hostHasRequiredLoopbacks(hostsContent, h));
  } catch {
    return false;
  }
}

/**
 * Check DNS status per tool — returns { [tool]: boolean }
 */
function checkAllDNSStatus() {
  try {
    const hostsContent = fs.readFileSync(HOSTS_FILE, "utf8");
    const result = {};
    for (const [tool, hosts] of Object.entries(TOOL_HOSTS)) {
      result[tool] = hosts.every(h => hostHasRequiredLoopbacks(hostsContent, h));
    }
    return result;
  } catch {
    return Object.fromEntries(Object.keys(TOOL_HOSTS).map(t => [t, false]));
  }
}

/**
 * Add DNS entries for a specific tool
 */
async function addDNSEntry(tool, sudoPassword) {
  const hosts = TOOL_HOSTS[tool];
  if (!hosts) throw new Error(`Unknown tool: ${tool}`);

  const currentContent = fs.readFileSync(HOSTS_FILE, "utf8");
  const entriesToAdd = getMissingHostsEntries(currentContent, hosts);
  if (entriesToAdd.length === 0) {
    log(`🌐 DNS ${tool}: already active`);
    await ensureToolNetworkRedirect(tool, sudoPassword);
    return;
  }

  try {
    if (IS_WIN) {
      // Read → trim → append → atomic write (Node-side, no CLI size limit)
      const current = currentContent;
      const trimmed = current.replace(/[\r\n\s]+$/g, "");
      const toAppend = entriesToAdd.join("\r\n");
      const next = `${trimmed}\r\n${toAppend}\r\n`;
      atomicWriteHostsWin(HOSTS_FILE, current, next);
      await runElevatedPowerShell("ipconfig /flushdns | Out-Null");
    } else {
      const current = currentContent;
      const trimmed = current.replace(/[\r\n\s]+$/g, "");
      const toAppend = entriesToAdd.join("\n");
      const next = `${trimmed}\n${toAppend}\n`;
      // Use tee via sudo to overwrite atomically — escape single quotes in content
      const escaped = next.replace(/'/g, "'\\''");
      await execWithPassword(`printf '%s' '${escaped}' | tee ${HOSTS_FILE} > /dev/null`, sudoPassword);
      await flushDNS(sudoPassword);
    }
    await ensureToolNetworkRedirect(tool, sudoPassword);
    log(`🌐 DNS ${tool}: ✅ added ${entriesToAdd.join(", ")}`);
  } catch (error) {
    const msg = error.message?.includes("incorrect password") ? "Wrong sudo password" : `Failed to add DNS entry: ${error.message}`;
    throw new Error(msg);
  }
}

/**
 * Remove DNS entries for a specific tool
 */
async function removeDNSEntry(tool, sudoPassword) {
  const hosts = TOOL_HOSTS[tool];
  if (!hosts) throw new Error(`Unknown tool: ${tool}`);

  const entriesToRemove = hosts.filter(h => checkDNSEntry(h));
  if (entriesToRemove.length === 0) {
    log(`🌐 DNS ${tool}: already inactive`);
    await removeToolNetworkRedirect(tool, sudoPassword);
    return;
  }

  try {
    if (IS_WIN) {
      const current = fs.readFileSync(HOSTS_FILE, "utf8");
      const filtered = current.split(/\r?\n/).filter(l => !entriesToRemove.some(h => l.includes(h))).join("\r\n");
      const next = filtered.replace(/[\r\n\s]+$/g, "") + "\r\n";
      atomicWriteHostsWin(HOSTS_FILE, current, next);
      await runElevatedPowerShell("ipconfig /flushdns | Out-Null");
    } else {
      const current = fs.readFileSync(HOSTS_FILE, "utf8");
      const filtered = current.split(/\r?\n/).filter(l => !entriesToRemove.some(h => l.includes(h))).join("\n");
      const next = filtered.replace(/[\r\n\s]+$/g, "") + "\n";
      const escaped = next.replace(/'/g, "'\\''");
      await execWithPassword(`printf '%s' '${escaped}' | tee ${HOSTS_FILE} > /dev/null`, sudoPassword);
      await flushDNS(sudoPassword);
    }
    await removeToolNetworkRedirect(tool, sudoPassword);
    log(`🌐 DNS ${tool}: ✅ removed ${entriesToRemove.join(", ")}`);
  } catch (error) {
    const msg = error.message?.includes("incorrect password") ? "Wrong sudo password" : `Failed to remove DNS entry: ${error.message}`;
    throw new Error(msg);
  }
}

/**
 * Remove ALL tool DNS entries (used when stopping server)
 */
async function removeAllDNSEntries(sudoPassword) {
  for (const tool of Object.keys(TOOL_HOSTS)) {
    try {
      await removeDNSEntry(tool, sudoPassword);
    } catch (e) {
      err(`DNS ${tool}: failed to remove — ${e.message}`);
    }
  }
}

/**
 * Sync removal of ALL tool DNS entries — for use during process shutdown
 * when async ops aren't safe. Assumes caller already has root/admin rights.
 */
function removeAllDNSEntriesSync() {
  try {
    if (IS_MAC) {
      try { execSync(`pfctl -a ${MAC_PF_ANTIGRAVITY_ANCHOR} -F all >/dev/null 2>&1 || true`, { stdio: "ignore" }); } catch { /* ignore */ }
      for (const ip of MAC_ANTIGRAVITY_FALLBACK_IPS) {
        try { execSync(`ifconfig lo0 -alias ${ip} 2>/dev/null || true`, { stdio: "ignore" }); } catch { /* ignore */ }
      }
    }
    if (!fs.existsSync(HOSTS_FILE)) return;
    const allHosts = Object.values(TOOL_HOSTS).flat();
    const content = fs.readFileSync(HOSTS_FILE, "utf8");
    const eol = IS_WIN ? "\r\n" : "\n";
    const filtered = content.split(/\r?\n/).filter(l => !allHosts.some(h => l.includes(h))).join(eol);
    const next = filtered.replace(/[\r\n\s]+$/g, "") + eol;
    if (next === content) return;
    fs.writeFileSync(HOSTS_FILE, next, "utf8");
    if (IS_WIN) {
      try { execSync("ipconfig /flushdns", { windowsHide: true, stdio: "ignore" }); } catch { /* ignore */ }
    } else if (IS_MAC) {
      try { execSync("dscacheutil -flushcache && killall -HUP mDNSResponder", { stdio: "ignore" }); } catch { /* ignore */ }
    } else {
      try { execSync("resolvectl flush-caches 2>/dev/null || true", { stdio: "ignore" }); } catch { /* ignore */ }
    }
  } catch { /* best effort during shutdown */ }
}

module.exports = {
  TOOL_HOSTS,
  addDNSEntry,
  removeDNSEntry,
  removeAllDNSEntries,
  removeAllDNSEntriesSync,
  execWithPassword,
  isSudoAvailable,
  canRunSudoWithoutPassword,
  isSudoPasswordRequired,
  checkDNSEntry,
  checkAllDNSStatus,
  getMissingHostsEntries,
  hostHasRequiredLoopbacks,
  isMacAntigravityPfRedirectEnabled,
};
