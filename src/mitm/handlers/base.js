const { log, err } = require("../logger");

const DEFAULT_LOCAL_ROUTER = "http://localhost:20502";
const ROUTER_BASE = String(process.env.MITM_ROUTER_BASE || DEFAULT_LOCAL_ROUTER)
  .trim()
  .replace(/^(['"])(.*)\1$/, "$2")
  .replace(/\/+$/, "") || DEFAULT_LOCAL_ROUTER;
const API_KEY = String(process.env.ROUTER_API_KEY || "")
  .trim()
  .replace(/^(['"])(.*)\1$/, "$2");

// Headers that must not be forwarded to OpenrouterX
const STRIP_HEADERS = new Set([
  "host", "content-length", "connection", "transfer-encoding",
  "content-type", "authorization"
]);

function normalizeRouterPath(path) {
  const rawPath = String(path || "").trim() || "/v1/chat/completions";
  if (rawPath === "/v1") return "/api/v1";
  if (rawPath.startsWith("/v1/")) return `/api${rawPath}`;
  return rawPath;
}

/**
 * Send body to OpenrouterX at the given path and return the fetch Response object.
 * Optionally forwards client headers (stripped of hop-by-hop / overridden keys).
 */
async function fetchRouter(openaiBody, path = "/v1/chat/completions", clientHeaders = {}) {
  const routerPath = normalizeRouterPath(path);
  const forwarded = {};
  for (const [k, v] of Object.entries(clientHeaders)) {
    if (!STRIP_HEADERS.has(k.toLowerCase())) forwarded[k] = v;
  }

  const response = await fetch(`${ROUTER_BASE}${routerPath}`, {
    method: "POST",
    headers: {
      ...forwarded,
      "Content-Type": "application/json",
      ...(API_KEY && { "Authorization": `Bearer ${API_KEY}` })
    },
    body: JSON.stringify(openaiBody)
  });

  // Forward response as-is (status + body). pipeSSE will propagate status.
  return response;
}

/**
 * Pipe SSE stream from router directly to client response.
 * Optional dumper tees the stream into a debug file.
 */
async function pipeSSE(routerRes, res, dumper) {
  const ct = routerRes.headers.get("content-type") || "application/json";
  const status = routerRes.status || 200;
  const resHeaders = { "Content-Type": ct, "Cache-Control": "no-cache", "Connection": "keep-alive" };
  if (ct.includes("text/event-stream")) resHeaders["X-Accel-Buffering"] = "no";
  res.writeHead(status, resHeaders);
  if (dumper) dumper.writeHeader(routerRes.status, Object.fromEntries(routerRes.headers));

  if (!routerRes.body) {
    const text = await routerRes.text().catch(() => "");
    if (dumper) { dumper.writeChunk(text); dumper.end(); }
    res.end(text);
    return;
  }

  const reader = routerRes.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) { if (dumper) dumper.end(); res.end(); break; }
    if (dumper) dumper.writeChunk(value);
    res.write(decoder.decode(value, { stream: true }));
  }
}

module.exports = { fetchRouter, normalizeRouterPath, pipeSSE };
