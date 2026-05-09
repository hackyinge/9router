const fs = require("node:fs");
const path = require("node:path");
const { err } = require("../logger");
const { fetchRouter, pipeSSE } = require("./base");

const URL_MAP = {
  "/api/v1/chat/completions": "/v1/chat/completions",
  "/v1/chat/completions": "/v1/chat/completions",
  "/chat/completions": "/v1/chat/completions",
  "/v1/messages": "/v1/messages",
  "/api/v1/responses": "/v1/responses",
  "/v1/responses": "/v1/responses",
  "/responses": "/v1/responses",
  "/api/v1/models": "/v1/models",
  "/v1/models": "/v1/models",
};

function resolveRouterPath(reqUrl) {
  const [pathname, query = ""] = String(reqUrl || "").split("?");
  for (const [pattern, routerPath] of Object.entries(URL_MAP)) {
    if (pathname === pattern || pathname.endsWith(pattern)) {
      return query ? `${routerPath}?${query}` : routerPath;
    }
  }
  return "/v1/chat/completions";
}

function isModelsRequest(reqUrl) {
  const pathname = String(reqUrl || "").split("?")[0];
  return pathname === "/models" || pathname === "/v1/models" || pathname === "/api/v1/models" || pathname.endsWith("/models");
}

function isKeyInfoRequest(reqUrl) {
  const pathname = String(reqUrl || "").split("?")[0];
  return pathname === "/api/v1/key" || pathname === "/api/v1/auth/key";
}

function getLocalModelsPayload() {
  const modelsPath = path.join(__dirname, "..", "models.json");
  return fs.readFileSync(modelsPath, "utf8");
}

function sendJsonPayload(res, payload) {
  if (res.writableEnded) return;
  res.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "public, max-age=300",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function sendOptions(res) {
  if (res.writableEnded) return;
  res.writeHead(204, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "*",
  });
  res.end();
}

function buildKeyInfoPayload() {
  return {
    data: {
      label: "openrouterX MITM API Key",
      limit: null,
      usage: 0,
      usage_daily: 0,
      usage_weekly: 0,
      usage_monthly: 0,
      byok_usage: 0,
      byok_usage_daily: 0,
      byok_usage_weekly: 0,
      byok_usage_monthly: 0,
      is_free_tier: false,
      limit_remaining: null,
      limit_reset: null,
      include_byok_in_limit: false,
      is_provisioning_key: false,
      is_management_key: false,
      rate_limit: { interval: "1h", requests: 100000 },
    },
  };
}

function sendKeyInfo(res) {
  if (res.writableEnded) return;
  const payload = JSON.stringify(buildKeyInfoPayload());
  res.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function buildInjectedModel(publicModelId) {
  const [provider = "openrouter"] = String(publicModelId || "").split("/");
  return {
    id: publicModelId,
    canonical_slug: publicModelId,
    name: publicModelId,
    created: 0,
    description: "Injected by 9Router MITM mapping",
    architecture: {
      modality: "text->text",
      input_modalities: ["text"],
      output_modalities: ["text"],
      tokenizer: "unknown",
      instruct_type: null,
    },
    top_provider: {
      is_moderated: false,
    },
    pricing: {
      prompt: "0",
      completion: "0",
      image: "0",
      request: "0",
      web_search: "0",
      internal_reasoning: "0",
    },
    per_request_limits: null,
    context_length: 128000,
    hugging_face_id: null,
    supported_parameters: ["max_tokens", "temperature", "top_p", "stream", "stop"],
    provider,
  };
}

function injectPublicModels(payload, aliasMappings = {}) {
  const normalized = payload && typeof payload === "object" ? payload : {};
  const currentData = Array.isArray(normalized.data) ? normalized.data : [];
  const existingIds = new Set(currentData.map((item) => item?.id).filter(Boolean));

  const injected = Object.keys(aliasMappings)
    .filter(Boolean)
    .filter((publicId) => !existingIds.has(publicId))
    .map(buildInjectedModel);

  return {
    ...normalized,
    data: [...currentData, ...injected],
  };
}

async function handleModelsRequest(req, res, bodyBuffer, passthrough, aliasMappings) {
  try {
    const payload = getLocalModelsPayload();
    sendJsonPayload(res, payload);
  } catch (error) {
    err(`[openrouter] local models response failed: ${error.message}`);
    if (!res.headersSent) res.writeHead(500, { "Content-Type": "application/json" });
    if (!res.writableEnded) res.end(JSON.stringify({ error: { message: error.message, type: "mitm_error" } }));
  }
}

/**
 * Intercept OpenRouter request — replace public model alias and forward to matching 9Router endpoint.
 */
async function intercept(req, res, bodyBuffer, mappedModel, passthrough, aliasMappings = {}) {
  try {
    if (req.method === "OPTIONS") {
      sendOptions(res);
      return;
    }

    if (req.method === "GET" && isKeyInfoRequest(req.url)) {
      sendKeyInfo(res);
      return;
    }

    if (isModelsRequest(req.url)) {
      return handleModelsRequest(req, res, bodyBuffer, passthrough, aliasMappings);
    }

    const body = JSON.parse(bodyBuffer.toString());
    const resolvedModel = mappedModel || aliasMappings[body.model] || body.model;
    body.model = resolvedModel;
    const routerPath = resolveRouterPath(req.url);
    const routerRes = await fetchRouter(body, routerPath, req.headers);
    await pipeSSE(routerRes, res);
  } catch (error) {
    err(`[openrouter] ${error.message}`);
    if (!res.headersSent) res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { message: error.message, type: "mitm_error" } }));
  }
}

module.exports = {
  intercept,
  resolveRouterPath,
  isModelsRequest,
  isKeyInfoRequest,
  sendKeyInfo,
  buildKeyInfoPayload,
  injectPublicModels,
  buildInjectedModel,
};
