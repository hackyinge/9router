import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { DATA_DIR } from "@/lib/dataDir.js";

const execFileAsync = promisify(execFile);
const MAX_LOG_BYTES = 512 * 1024;
const NETWORK_ERROR_PATTERNS = [
  ["EADDRNOTAVAIL", /EADDRNOTAVAIL/g],
  ["ECONNRESET", /ECONNRESET/g],
  ["ETIMEDOUT", /ETIMEDOUT/g],
  ["ENOTFOUND", /ENOTFOUND/g],
  ["EAI_AGAIN", /EAI_AGAIN/g],
  ["TLS_DISCONNECTED", /Client network socket disconnected before secure TLS connection was established/g],
  ["PROXY_FAILED", /Proxy failed|Proxy connection timed out/g],
  ["FETCH_FAILED", /network "fetch failed"|fetch failed/g],
];

const MITM_TOOL_HOSTS = {
  antigravity: [
    "daily-cloudcode-pa.googleapis.com",
    "cloudcode-pa.googleapis.com",
    "daily-cloudcode-pa.sandbox.googleapis.com",
  ],
  copilot: ["api.individual.githubcopilot.com"],
  kiro: ["q.us-east-1.amazonaws.com", "codewhisperer.us-east-1.amazonaws.com"],
  cursor: ["api2.cursor.sh"],
  openrouter: ["openrouter.ai", "api.openrouter.ai"],
};

function safeReadTail(filePath, maxBytes = MAX_LOG_BYTES) {
  try {
    const stat = fs.statSync(filePath);
    const start = Math.max(0, stat.size - maxBytes);
    const fd = fs.openSync(filePath, "r");
    try {
      const buffer = Buffer.alloc(stat.size - start);
      fs.readSync(fd, buffer, 0, buffer.length, start);
      return buffer.toString("utf8");
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return "";
  }
}

function timestampForLogTime(timeText, now = new Date()) {
  const match = String(timeText).match(/^(\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return null;
  const date = new Date(now);
  date.setHours(Number(match[1]), Number(match[2]), Number(match[3]), 0);
  if (date.getTime() > now.getTime() + 60 * 1000) {
    date.setDate(date.getDate() - 1);
  }
  return date.toISOString();
}

function extractTimeline(logText, now, windowHours = 24) {
  const cutoff = now.getTime() - windowHours * 60 * 60 * 1000;
  const events = [];
  for (const line of String(logText || "").split(/\r?\n/)) {
    if (!line) continue;
    const hasNetworkError = NETWORK_ERROR_PATTERNS.some(([, pattern]) => {
      pattern.lastIndex = 0;
      return pattern.test(line);
    });
    if (!hasNetworkError) continue;

    const time = line.match(/\[(\d{2}:\d{2}:\d{2})\]/)?.[1] || "";
    const timestamp = timestampForLogTime(time, now);
    if (timestamp && new Date(timestamp).getTime() < cutoff) continue;
    const matched = NETWORK_ERROR_PATTERNS
      .filter(([, pattern]) => {
        pattern.lastIndex = 0;
        return pattern.test(line);
      })
      .map(([name]) => name);
    events.push({
      time,
      timestamp,
      categories: matched,
      source: line.includes("[MITM]") ? "mitm" : line.includes("[ProxyFetch]") ? "outbound_proxy" : "router",
      message: line.replace(/\x1b\[[0-9;]*m/g, "").slice(0, 300),
    });
  }
  return events.slice(-80);
}

function countErrors(timeline) {
  const counts = {};
  for (const [name] of NETWORK_ERROR_PATTERNS) counts[name] = 0;
  for (const event of timeline) {
    for (const category of event.categories) {
      counts[category] = (counts[category] || 0) + 1;
    }
  }
  return counts;
}

function buildFindings(errorCounts, timeline) {
  const findings = [];
  if ((errorCounts.EADDRNOTAVAIL || 0) > 0) {
    findings.push({
      severity: "warning",
      title: "Local route became unavailable",
      detail: "EADDRNOTAVAIL means Node could not allocate a usable local outbound address at that moment. This normally points to Wi-Fi/DHCP/route churn or VPN/proxy path loss before an upstream request completed.",
    });
  }
  if ((errorCounts.PROXY_FAILED || 0) > 0) {
    findings.push({
      severity: "warning",
      title: "Configured outbound proxy timed out",
      detail: "OpenrouterX fell back after the configured proxy connection timed out. Because the app stores this as a targeted proxy allowlist, the failure affects selected upstream API calls rather than macOS global networking.",
    });
  }
  if ((errorCounts.TLS_DISCONNECTED || 0) + (errorCounts.ECONNRESET || 0) > 0) {
    findings.push({
      severity: "info",
      title: "Existing TLS sockets were reset",
      detail: "TLS disconnects and ECONNRESET are consistent with transient network drops, upstream resets, or proxy interruption while MITM passthrough traffic was active.",
    });
  }
  if (timeline.length === 0) {
    findings.push({
      severity: "success",
      title: "No recent network transport errors in app logs",
      detail: "The sampled OpenrouterX logs do not currently show connection resets, route loss, DNS failures, or proxy timeouts.",
    });
  }
  return findings;
}

export function analyzeNetworkLogs(logText, { now = new Date(), windowHours = 24 } = {}) {
  const timeline = extractTimeline(logText, now, windowHours);
  const errorCounts = countErrors(timeline);
  const routeLoss = (errorCounts.EADDRNOTAVAIL || 0) + (errorCounts.ETIMEDOUT || 0);
  const proxyOrFetch = (errorCounts.PROXY_FAILED || 0) + (errorCounts.FETCH_FAILED || 0);
  const resetCount = (errorCounts.ECONNRESET || 0) + (errorCounts.TLS_DISCONNECTED || 0);

  let verdict = "healthy";
  if (routeLoss > 0 || proxyOrFetch > 0) verdict = "external_or_route_instability";
  else if (resetCount > 0) verdict = "upstream_or_socket_instability";

  return {
    verdict,
    windowHours,
    errorCounts,
    eventCount: timeline.length,
    timeline,
    findings: buildFindings(errorCounts, timeline),
  };
}

export function redactProxyUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.password) url.password = "***";
    const redacted = url.toString();
    return url.pathname === "/" && !raw.endsWith("/") ? redacted.replace(/\/$/, "") : redacted;
  } catch {
    return raw;
  }
}

function parseTargets(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function hasSystemProxyEnabled(systemProxyText) {
  const text = String(systemProxyText || "");
  return /(HTTPEnable|HTTPSEnable|SOCKSEnable)\s*:\s*1/.test(text);
}

export function buildProjectNetworkSummary({ settings = {}, systemProxyText = "", dnsStatus = {} } = {}) {
  const targets = parseTargets(settings.outboundProxyTargets);
  const enabledTools = Object.entries(settings.dnsToolEnabled || {})
    .filter(([, enabled]) => enabled === true)
    .map(([tool]) => tool);
  const activeDnsTools = Object.entries(dnsStatus || {})
    .filter(([, enabled]) => enabled === true)
    .map(([tool]) => tool);

  let riskLevel = "low";
  if (settings.mitmEnabled && enabledTools.length > 0) riskLevel = "medium";
  if (hasSystemProxyEnabled(systemProxyText)) riskLevel = "high";

  return {
    systemProxyManagedByProject: false,
    systemProxyEnabled: hasSystemProxyEnabled(systemProxyText),
    outboundProxy: {
      enabled: settings.outboundProxyEnabled === true && Boolean(settings.outboundProxyUrl),
      url: redactProxyUrl(settings.outboundProxyUrl),
      targets,
      scope: targets.length > 0 ? "targeted" : settings.outboundProxyUrl ? "process_wide" : "none",
    },
    mitm: {
      enabled: settings.mitmEnabled === true,
      enabledTools,
      activeDnsTools,
      hosts: Object.fromEntries(enabledTools.map((tool) => [tool, MITM_TOOL_HOSTS[tool] || []])),
    },
    tunnels: {
      cloudflareEnabled: settings.tunnelEnabled === true,
      tailscaleEnabled: settings.tailscaleEnabled === true,
    },
    riskLevel,
  };
}

async function runCommand(command, args = []) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      timeout: 2500,
      maxBuffer: 256 * 1024,
      windowsHide: true,
    });
    return { ok: true, output: stdout || stderr || "" };
  } catch (error) {
    return { ok: false, output: error.stdout || error.stderr || error.message || String(error) };
  }
}

async function collectSystemState() {
  const [proxy, dns, route, ifconfig] = await Promise.all([
    process.platform === "darwin" ? runCommand("scutil", ["--proxy"]) : Promise.resolve({ ok: false, output: "system proxy inspection is only supported on macOS" }),
    process.platform === "darwin" ? runCommand("scutil", ["--dns"]) : Promise.resolve({ ok: false, output: "DNS inspection is only supported on macOS" }),
    process.platform === "darwin" ? runCommand("route", ["-n", "get", "default"]) : Promise.resolve({ ok: false, output: "" }),
    process.platform === "darwin" ? runCommand("ifconfig", ["en0"]) : Promise.resolve({ ok: false, output: "" }),
  ]);

  return {
    platform: process.platform,
    hostname: os.hostname(),
    sampledAt: new Date().toISOString(),
    proxy,
    dns,
    route,
    ifconfig,
  };
}

export async function collectNetworkDiagnostics({ settings = {}, dnsStatus = {} } = {}) {
  const serverLog = safeReadTail(path.join(DATA_DIR, "server.log"));
  const requestLog = safeReadTail(path.join(DATA_DIR, "log.txt"), 128 * 1024);
  const system = await collectSystemState();
  const logAnalysis = analyzeNetworkLogs(`${serverLog}\n${requestLog}`);
  const project = buildProjectNetworkSummary({
    settings,
    dnsStatus,
    systemProxyText: system.proxy.output,
  });

  return {
    verdict: logAnalysis.verdict,
    generatedAt: new Date().toISOString(),
    system,
    project,
    logs: logAnalysis,
  };
}
