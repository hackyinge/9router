const https = require("https");
const fs = require("fs");
const path = require("path");
const dns = require("dns");
const zlib = require("zlib");
const { promisify } = require("util");
const { execSync } = require("child_process");
const { log, err, dumpRequest, createResponseDumper } = require("./logger");
const { TARGET_HOSTS, URL_PATTERNS, MODEL_SYNONYMS, getToolForHost } = require("./config");
const {
  createLocalAntigravityLoadCodeAssistPayload,
  createLocalAntigravityOnboardUserPayload,
} = require("./antigravityBootstrap");
const { buildAntigravityAvailableModelsResponse } = require("./antigravityModels");
const { DATA_DIR, MITM_DIR } = require("./paths");
const { getCertForDomain } = require("./cert/generate");
const { getMitmAlias } = require("./dbReader");
const LOCAL_PORT = 443;
const IS_WIN = process.platform === "win32";
const ENABLE_FILE_LOG = true;
const INTERNAL_REQUEST_HEADER = { name: "x-request-source", value: "local" };

// Host rewrite for upstream forward: PROD cloudcode-pa is rate-limited (429),
// daily-cloudcode-pa (dev endpoint) accepts same body+token. Same trick as open-sse.
const HOST_REWRITE = {
  "cloudcode-pa.googleapis.com": "daily-cloudcode-pa.googleapis.com",
  "daily-cloudcode-pa.sandbox.googleapis.com": "daily-cloudcode-pa.googleapis.com",
};

// Load handlers — dev/ overrides handlers/ for private implementations
function loadHandler(name) {
  try { return require(`./dev/${name}`); } catch {}
  return require(`./handlers/${name}`);
}

const handlers = {
  antigravity: loadHandler("antigravity"),
  copilot: loadHandler("copilot"),
  kiro: loadHandler("kiro"),
  cursor: loadHandler("cursor"),
  openrouter: loadHandler("openrouter"),
};

// ── SSL / SNI ─────────────────────────────────────────────────

const certCache = new Map();
let rootCAPem;

function sniCallback(servername, cb) {
  try {
    if (certCache.has(servername)) return cb(null, certCache.get(servername));
    const certData = getCertForDomain(servername);
    if (!certData) return cb(new Error(`Failed to generate cert for ${servername}`));
    const ctx = require("tls").createSecureContext({
      key: certData.key,
      cert: `${certData.cert}\n${rootCAPem}`
    });
    certCache.set(servername, ctx);
    cb(null, ctx);
  } catch (e) {
    err(`SNI error for ${servername}: ${e.message}`);
    cb(e);
  }
}

let sslOptions;
try {
  const rootKey = fs.readFileSync(path.join(MITM_DIR, "rootCA.key"));
  const rootCert = fs.readFileSync(path.join(MITM_DIR, "rootCA.crt"));
  rootCAPem = rootCert.toString("utf8");
  sslOptions = { key: rootKey, cert: rootCert, SNICallback: sniCallback };
} catch (e) {
  err(`Root CA not found: ${e.message}`);
  process.exit(1);
}

// ── Helpers ───────────────────────────────────────────────────

const cachedTargetIPs = {};
const CACHE_TTL_MS = 5 * 60 * 1000;

function getLocalIPv4Aliases() {
  if (process.platform !== "darwin") return [];
  try {
    const out = execSync("ifconfig lo0", { encoding: "utf8", windowsHide: true });
    return [...out.matchAll(/^\s+inet\s+(\d+\.\d+\.\d+\.\d+)\s+/gm)].map((m) => m[1]);
  } catch {
    return [];
  }
}

async function resolveTargetIP(hostname) {
  const cached = cachedTargetIPs[hostname];
  const localAliases = new Set(getLocalIPv4Aliases());
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS && !localAliases.has(cached.ip)) return cached.ip;
  const resolver = new dns.Resolver();
  resolver.setServers(["8.8.8.8"]);
  const resolve4 = promisify(resolver.resolve4.bind(resolver));
  let addresses;
  try {
    addresses = await resolve4(hostname);
  } catch (primaryError) {
    const lookup = promisify(dns.lookup);
    const records = await lookup(hostname, { family: 4, all: true }).catch(() => []);
    addresses = records.map((record) => record.address).filter((addr) => !localAliases.has(addr));
    if (addresses.length === 0) throw primaryError;
  }
  const ip = addresses.find((addr) => !localAliases.has(addr)) || addresses[0];
  cachedTargetIPs[hostname] = { ip, ts: Date.now() };
  return cachedTargetIPs[hostname].ip;
}

function collectBodyRaw(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", chunk => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// Extract model from URL path (Gemini), body (OpenAI/Anthropic), or Kiro conversationState
function extractModel(url, body) {
  const urlMatch = url.match(/\/models\/([^/:]+)/);
  if (urlMatch) return urlMatch[1];
  try {
    const parsed = JSON.parse(body.toString());
    if (parsed.conversationState) {
      return parsed.conversationState.currentMessage?.userInputMessage?.modelId || null;
    }
    return parsed.model || null;
  } catch { return null; }
}

function getMappedModel(tool, model) {
  if (!model) return null;
  try {
    const aliases = {
      ...(MODEL_SYNONYMS?.[tool]?.__defaults || {}),
      ...(getMitmAlias(tool) || {}),
    };
    // Normalize via synonym map (e.g., gemini-default → gemini-3-flash)
    const lookup = MODEL_SYNONYMS?.[tool]?.[model] || model;
    if (aliases[lookup]) return aliases[lookup];
    // Prefix match fallback
    const prefixKey = Object.keys(aliases).find(k => k && aliases[k] && (lookup.startsWith(k) || k.startsWith(lookup)));
    return prefixKey ? aliases[prefixKey] : null;
  } catch { return null; }
}

function respondJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=UTF-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function shouldDumpRequest(req) {
  if (process.env.OPENROUTERX_MITM_DUMP_ALL === "1") return true;
  return !!getToolForHost(req.headers.host);
}

function handleLocalAntigravityBootstrap(req, res) {
  if (req.url.includes(":fetchAvailableModels") && process.env.OPENROUTERX_AG_LOCAL_MODELS !== "0") {
    const payload = buildAntigravityAvailableModelsResponse();
    respondJson(res, 200, payload);
    log(`🧩 bootstrap | antigravity | local fetchAvailableModels (${Object.keys(payload.models || {}).length} models)`);
    return true;
  }

  // The language server refreshes this cache next to the model list. Upstream
  // can reject the MITM-shaped request with INVALID_ARGUMENT, which then marks
  // the whole background cache refresh as failed even when models were local.
  if (req.url.includes(":fetchAdminControls")) {
    respondJson(res, 200, { adminControls: [] });
    log("🧩 bootstrap | antigravity | local fetchAdminControls");
    return true;
  }

  const localAuthBootstrap = process.env.OPENROUTERX_AG_LOCAL_AUTH !== "0"
    || process.env.OPENROUTERX_AG_MOCK_BOOTSTRAP === "1";

  if (!localAuthBootstrap) return false;

  if (req.url.includes(":loadCodeAssist")) {
    respondJson(res, 200, createLocalAntigravityLoadCodeAssistPayload());
    log("🧩 bootstrap | antigravity | local loadCodeAssist");
    return true;
  }

  if (req.url.includes(":onboardUser")) {
    respondJson(res, 200, createLocalAntigravityOnboardUserPayload());
    log("🧩 bootstrap | antigravity | local onboardUser");
    return true;
  }

  if (req.url.includes("/cascadeNuxes")) {
    respondJson(res, 200, {
      nuxes: [],
      completedNuxes: [],
    });
    log("🧩 bootstrap | antigravity | local cascadeNuxes");
    return true;
  }

  return false;
}

function decodeResponseBody(buf, headers = {}) {
  if (!buf || buf.length === 0) return buf;
  const enc = String(headers["content-encoding"] || headers["Content-Encoding"] || "").toLowerCase();
  try {
    if (enc.includes("gzip")) return zlib.gunzipSync(buf);
    if (enc.includes("br")) return zlib.brotliDecompressSync(buf);
    if (enc.includes("deflate")) return zlib.inflateSync(buf);
  } catch (e) {
    err(`loadCodeAssist decode failed: ${e.message}`);
  }
  return buf;
}

function summarizeTier(tier) {
  if (!tier || typeof tier !== "object") return String(tier || "unknown");
  const id = tier.id || tier.tierId || tier.name || tier.displayName || "unknown";
  const name = tier.displayName || tier.name || "";
  const marker = tier.isDefault ? "*" : "";
  return name && name !== id ? `${id}${marker}(${name})` : `${id}${marker}`;
}

function summarizeIneligibleTier(tier) {
  if (!tier || typeof tier !== "object") return String(tier || "unknown");
  const id = tier.id || tier.tierId || tier.name || tier.displayName || "unknown";
  const reason = tier.ineligibilityReason || tier.reason || tier.reasonCode || tier.code || "unknown";
  const message = tier.message || tier.ineligibilityMessage || tier.description || "";
  return message ? `${id}:${reason}:${message}` : `${id}:${reason}`;
}

function inspectAntigravityLoadCodeAssist(rawBuffer, headers) {
  const text = decodeResponseBody(rawBuffer, headers).toString("utf8");
  try {
    const payload = JSON.parse(text);
    const allowed = Array.isArray(payload.allowedTiers)
      ? payload.allowedTiers.map(summarizeTier)
      : [];
    const ineligible = Array.isArray(payload.ineligibleTiers)
      ? payload.ineligibleTiers.map(summarizeIneligibleTier)
      : [];
    const project = payload.cloudaicompanionProject || payload.cloudaicompanionProjectId || payload.project || "";
    const validationUrl = /https?:\/\/\S+/i.test(text) ? "present" : "none";

    log(
      `🧩 loadCodeAssist MITM | status=passthrough | project=${project || "none"} | ` +
      `allowed=${allowed.length ? allowed.join(", ") : "none"} | ` +
      `ineligible=${ineligible.length ? ineligible.join(" | ") : "none"} | validationUrl=${validationUrl}`
    );
  } catch {
    log(`🧩 loadCodeAssist MITM | status=passthrough | non-json response bytes=${rawBuffer.length}`);
  }
}

/**
 * Forward request to real upstream.
 * Optional onResponse(rawBuffer, headers) callback — if provided, tees the response
 * so it's both forwarded to client AND passed to the callback for inspection.
 * Optional transformResponse(rawBuffer, headers) callback — if provided, buffers
 * the full response, passes it to the callback, and sends the returned buffer
 * to the client instead of the original response.
 * Also tees full stream into a dump file when ENABLE_FILE_LOG is on.
 */
async function passthrough(req, res, bodyBuffer, onResponse, transformResponse) {
  const originalHost = (req.headers.host || TARGET_HOSTS[0]).split(":")[0];
  const targetHost = HOST_REWRITE[originalHost] || originalHost;
  const dumper = ENABLE_FILE_LOG && shouldDumpRequest(req) ? createResponseDumper(req, "passthrough") : null;
  let targetIP;
  try {
    targetIP = await resolveTargetIP(targetHost);
  } catch (e) {
    err(`Passthrough resolve error for ${targetHost}: ${e.code || e.message}`);
    if (dumper) { dumper.writeChunk(`\n[ERROR] resolve ${targetHost}: ${e.message}\n`); dumper.end(); }
    if (!res.headersSent) res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { message: `DNS resolve failed for ${targetHost}`, type: "mitm_dns_error" } }));
    return;
  }

  const forwardReq = https.request({
    hostname: targetIP,
    port: 443,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: targetHost },
    servername: targetHost,
    rejectUnauthorized: false
  }, (forwardRes) => {
    // When transformResponse is provided, buffer the full response so we can
    // modify it before sending to the client.
    const shouldBuffer = transformResponse != null;
    if (!shouldBuffer) res.writeHead(forwardRes.statusCode, forwardRes.headers);

    if (!onResponse && !dumper && !shouldBuffer) {
      forwardRes.pipe(res);
      return;
    }

    const chunks = [];
    forwardRes.on("data", chunk => {
      if (dumper) dumper.writeChunk(chunk);
      if (onResponse || shouldBuffer) chunks.push(chunk);
      if (!shouldBuffer) res.write(chunk);
    });
    forwardRes.on("end", () => {
      const rawBuffer = Buffer.concat(chunks);

      if (shouldBuffer) {
        try {
          const modified = transformResponse(rawBuffer, forwardRes.headers);
          // Update Content-Length if present to match modified body
          const headers = { ...forwardRes.headers };
          if (headers["content-length"] != null) {
            headers["content-length"] = String(Buffer.byteLength(modified));
          }
          res.writeHead(forwardRes.statusCode, headers);
          res.end(modified);
        } catch (e) {
          err(`transformResponse error: ${e.message}`);
          if (!res.headersSent) res.writeHead(502);
          res.end("Bad Gateway");
        }
      } else {
        res.end();
      }

      if (dumper) dumper.end();
      if (onResponse) try { onResponse(rawBuffer, forwardRes.headers); } catch { /* ignore */ }
    });
  });

  forwardReq.on("error", (e) => {
    err(`Passthrough error: ${e.message}`);
    if (dumper) { dumper.writeChunk(`\n[ERROR] ${e.message}\n`); dumper.end(); }
    if (!res.headersSent) res.writeHead(502);
    res.end("Bad Gateway");
  });

  if (bodyBuffer.length > 0) forwardReq.write(bodyBuffer);
  forwardReq.end();
}

// ── Request handler ───────────────────────────────────────────

const server = https.createServer(sslOptions, async (req, res) => {
  try {
    if (req.url === "/_mitm_health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, pid: process.pid }));
      return;
    }

    const bodyBuffer = await collectBodyRaw(req);
    if (ENABLE_FILE_LOG && shouldDumpRequest(req)) dumpRequest(req, bodyBuffer, "raw");

    // Anti-loop: skip requests from OpenrouterX
    if (req.headers[INTERNAL_REQUEST_HEADER.name] === INTERNAL_REQUEST_HEADER.value) {
      return passthrough(req, res, bodyBuffer);
    }

    const tool = getToolForHost(req.headers.host);
    if (!tool) return passthrough(req, res, bodyBuffer);

    if (tool === "antigravity" && handleLocalAntigravityBootstrap(req, res)) return;
    if (tool === "antigravity" && req.url.includes(":loadCodeAssist")) {
      log("🧩 loadCodeAssist MITM | passthrough inspect");
      return passthrough(req, res, bodyBuffer, inspectAntigravityLoadCodeAssist);
    }

    const patterns = URL_PATTERNS[tool] || [];
    const isChat = patterns.some(p => req.url.includes(p));
    if (!isChat) return passthrough(req, res, bodyBuffer);

    // Cursor uses binary proto — model extraction not possible at this layer.
    // Delegate directly to handler which decodes proto internally.
    if (tool === "cursor") {
      return handlers[tool].intercept(req, res, bodyBuffer, null, passthrough);
    }

    const model = extractModel(req.url, bodyBuffer);
    const mappedModel = getMappedModel(tool, model);
    const aliasMappings = getMitmAlias(tool) || {};
    if (!mappedModel && tool !== "openrouter" && !req.url.includes("/models")) {
      log(`⏩ passthrough | no mapping | ${tool} | ${model || "unknown"}`);
      return passthrough(req, res, bodyBuffer);
    }

    log(`⚡ intercept | ${tool} | ${model || req.url} → ${mappedModel || "dynamic"}`);
    return handlers[tool].intercept(req, res, bodyBuffer, mappedModel, passthrough, aliasMappings);
  } catch (e) {
    err(`Unhandled error: ${e.message}`);
    if (!res.headersSent) res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { message: e.message, type: "mitm_error" } }));
  }
});

// Kill only processes LISTENING on LOCAL_PORT (not outbound connections)
function killPort(port) {
  try {
    let pidList = [];
    if (IS_WIN) {
      const psCmd = `powershell -NonInteractive -WindowStyle Hidden -Command ` +
        `"Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess"`;
      const out = execSync(psCmd, { encoding: "utf-8", windowsHide: true }).trim();
      if (!out) return;
      pidList = out.split(/\r?\n/).map(s => s.trim()).filter(p => p && Number(p) !== process.pid && Number(p) > 4);
    } else {
      const out = execSync(`lsof -nP -iTCP:${port} -sTCP:LISTEN -t`, { encoding: "utf-8", windowsHide: true }).trim();
      if (!out) return;
      pidList = out.split("\n").filter(p => p && Number(p) !== process.pid);
    }
    if (pidList.length === 0) return;
    pidList.forEach(pid => {
      try {
        if (IS_WIN) execSync(`taskkill /F /PID ${pid}`, { windowsHide: true });
        else process.kill(Number(pid), "SIGKILL");
      } catch (e) {
        err(`Failed to kill PID ${pid}: ${e.message}`);
      }
    });
    log(`Killed ${pidList.length} process(es) on port ${port}`);
  } catch (e) {
    if (e.status !== 1) throw e;
  }
}

try {
  killPort(LOCAL_PORT);
} catch (e) {
  err(`Cannot kill process on port ${LOCAL_PORT}: ${e.message}`);
  process.exit(1);
}

server.listen(LOCAL_PORT, () => log(`🚀 Server ready on :${LOCAL_PORT}`));

server.on("error", (e) => {
  if (e.code === "EADDRINUSE") err(`Port ${LOCAL_PORT} already in use`);
  else if (e.code === "EACCES") err(`Permission denied for port ${LOCAL_PORT}`);
  else err(e.message);
  process.exit(1);
});

const { removeAllDNSEntriesSync } = require("./dns/dnsConfig");
let isShuttingDown = false;
const shutdown = () => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  // Strip tool hosts from /etc/hosts so other apps aren't broken after exit
  removeAllDNSEntriesSync();
  const forceExit = setTimeout(() => process.exit(0), 1500);
  server.close(() => { clearTimeout(forceExit); process.exit(0); });
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
if (process.platform === "win32") process.on("SIGBREAK", shutdown);
