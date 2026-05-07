import { normalizeCompatibleBaseUrl } from "../../../src/shared/utils/compatibleProvider.js";

// OpenAI-compatible adapter (used by openai, minimax, openrouter, recraft, custom image nodes)

const ENDPOINTS = {
  openai: "https://api.openai.com/v1/images/generations",
  minimax: "https://api.minimaxi.com/v1/images/generations",
  openrouter: "https://openrouter.ai/api/v1/images/generations",
  recraft: "https://external.api.recraft.ai/v1/images/generations",
};

export default function createOpenAIAdapter(providerId) {
  return {
    buildUrl: (_, creds) => {
      const configuredBaseUrl = creds?.providerSpecificData?.baseUrl;
      if (configuredBaseUrl) {
        return `${normalizeCompatibleBaseUrl(configuredBaseUrl, "custom-image")}/images/generations`;
      }
      return ENDPOINTS[providerId];
    },
    buildHeaders: (creds) => {
      const headers = { "Content-Type": "application/json" };
      const key = creds?.apiKey || creds?.accessToken;
      if (key) headers["Authorization"] = `Bearer ${key}`;
      if (providerId === "openrouter") {
        headers["HTTP-Referer"] = "https://endpoint-proxy.local";
        headers["X-Title"] = "Endpoint Proxy";
      }
      return headers;
    },
    buildBody: (model, body, creds) => {
      const { prompt, n = 1, size, quality, style, response_format } = body;
      const requestedSize = typeof size === "string" ? size.trim() : size;
      const fallbackSize = typeof creds?.providerSpecificData?.defaultSize === "string"
        ? creds.providerSpecificData.defaultSize.trim()
        : "";
      const isCustomImageNode = providerId?.startsWith?.("custom-image-");
      const resolvedSize = requestedSize && requestedSize !== "auto"
        ? requestedSize
        : isCustomImageNode
          ? (fallbackSize && fallbackSize !== "auto" ? fallbackSize : "")
          : (requestedSize || "1024x1024");
      const req = { model, prompt, n };
      if (resolvedSize) req.size = resolvedSize;
      if (quality) req.quality = quality;
      if (style) req.style = style;
      if (response_format) req.response_format = response_format;
      return req;
    },
    normalize: (responseBody) => responseBody,
  };
}
