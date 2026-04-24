const { err } = require("../logger");
const { fetchRouter, pipeSSE } = require("./base");

const URL_MAP = {
  "/v1/chat/completions": "/v1/chat/completions",
  "/chat/completions": "/v1/chat/completions",
  "/v1/messages": "/v1/messages",
  "/responses": "/v1/responses",
};

function resolveRouterPath(reqUrl) {
  for (const [pattern, routerPath] of Object.entries(URL_MAP)) {
    if (reqUrl.includes(pattern)) return routerPath;
  }
  return "/v1/chat/completions";
}

function isModelsRequest(reqUrl) {
  return reqUrl.includes("/models") || reqUrl.includes("/api/v1/models");
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
  if (typeof passthrough !== "function") {
    if (!res.headersSent) res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { message: "Passthrough unavailable for models request", type: "mitm_error" } }));
    return;
  }

  await passthrough(req, res, bodyBuffer, (rawBuffer) => {
    try {
      const upstream = JSON.parse(rawBuffer.toString() || "{}");
      const merged = injectPublicModels(upstream, aliasMappings);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(merged));
    } catch (error) {
      err(`[openrouter] models response rewrite failed: ${error.message}`);
      if (!res.headersSent) res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: error.message, type: "mitm_error" } }));
    }
  });
}

/**
 * Intercept OpenRouter request — replace public model alias and forward to matching 9Router endpoint.
 */
async function intercept(req, res, bodyBuffer, mappedModel, passthrough, aliasMappings = {}) {
  try {
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

module.exports = { intercept, resolveRouterPath, isModelsRequest, injectPublicModels, buildInjectedModel };
