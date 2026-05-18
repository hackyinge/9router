import { PROVIDER_ID_TO_ALIAS } from "open-sse/config/providerModels.js";
import { errorResponse } from "open-sse/utils/error.js";
import { HTTP_STATUS } from "open-sse/config/runtimeConfig.js";

function invertProviderAliases() {
  return Object.fromEntries(
    Object.entries(PROVIDER_ID_TO_ALIAS || {}).map(([providerId, alias]) => [alias, providerId])
  );
}

const PROVIDER_ALIAS_TO_ID = invertProviderAliases();

export function resolveProviderScope(rawProvider) {
  const provider = String(rawProvider || "").trim();
  if (!provider) return { error: "Missing provider" };

  const providerId = PROVIDER_ALIAS_TO_ID[provider] || provider;
  const providerAlias = PROVIDER_ID_TO_ALIAS[providerId] || provider;
  const acceptedPrefixes = new Set([provider, providerId, providerAlias]);

  return { provider, providerId, providerAlias, acceptedPrefixes };
}

export function normalizeProviderScopedBody(rawProvider, rawBody) {
  const scope = resolveProviderScope(rawProvider);
  if (scope.error) return scope;

  const body = { ...(rawBody || {}) };
  if (!body.model) return { ...scope, body };

  const model = String(body.model);
  const slashIndex = model.indexOf("/");
  if (slashIndex >= 0) {
    const modelProvider = model.slice(0, slashIndex);
    if (!scope.acceptedPrefixes.has(modelProvider)) {
      return {
        ...scope,
        error: `Model "${model}" does not belong to provider "${scope.provider}". Expected prefix: ${scope.providerAlias}/`,
      };
    }
    body.model = `${scope.providerAlias}/${model.slice(slashIndex + 1)}`;
    return { ...scope, body };
  }

  body.model = `${scope.providerAlias}/${model}`;
  return { ...scope, body };
}

export function toProviderScopedModelList(rawProvider, models) {
  const scope = resolveProviderScope(rawProvider);
  if (scope.error) return scope;

  const data = [];
  const seen = new Set();

  for (const model of Array.isArray(models) ? models : []) {
    if (!model?.id) continue;
    if (!scope.acceptedPrefixes.has(model.owned_by)) continue;

    let id = String(model.id);
    for (const prefix of scope.acceptedPrefixes) {
      if (id.startsWith(`${prefix}/`)) {
        id = id.slice(prefix.length + 1);
        break;
      }
    }
    if (!id || seen.has(id)) continue;
    seen.add(id);
    data.push({
      ...model,
      id,
      owned_by: scope.providerAlias,
      parent: null,
    });
  }

  return { ...scope, data };
}

export async function providerScopedRequest(request, context, handler) {
  const params = await context?.params;
  const rawProvider = params?.provider;

  let rawBody;
  try {
    rawBody = await request.json();
  } catch {
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Invalid JSON body");
  }

  const normalized = normalizeProviderScopedBody(rawProvider, rawBody);
  if (normalized.error) {
    return errorResponse(HTTP_STATUS.BAD_REQUEST, normalized.error);
  }

  const nextRequest = new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: JSON.stringify(normalized.body),
  });

  Object.defineProperty(nextRequest, "cookies", {
    value: request.cookies || { get: () => undefined },
    configurable: true,
  });
  Object.defineProperty(nextRequest, "nextUrl", {
    value: request.nextUrl || new URL(request.url),
    configurable: true,
  });

  return handler(nextRequest);
}

export function providerScopedOptions(methods = "GET, POST, OPTIONS") {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": methods,
      "Access-Control-Allow-Headers": "*",
    },
  });
}
