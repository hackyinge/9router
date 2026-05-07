const OPENAI_COMPATIBLE_TYPE = "openai-compatible";
const ANTHROPIC_COMPATIBLE_TYPE = "anthropic-compatible";
const CUSTOM_IMAGE_TYPE = "custom-image";

function stripTrailingSlash(value = "") {
  return String(value).trim().replace(/\/+$/, "");
}

function safeUrlParse(value) {
  try {
    return new URL(String(value).trim());
  } catch {
    return null;
  }
}

function trimKnownOpenAIPath(pathname = "") {
  let path = stripTrailingSlash(pathname);
  const suffixes = ["/chat/completions", "/responses", "/models"];
  for (const suffix of suffixes) {
    if (path.endsWith(suffix)) {
      path = path.slice(0, -suffix.length);
      break;
    }
  }
  return path || "";
}

function trimKnownAnthropicPath(pathname = "") {
  let path = stripTrailingSlash(pathname);
  const suffixes = ["/messages", "/models"];
  for (const suffix of suffixes) {
    if (path.endsWith(suffix)) {
      path = path.slice(0, -suffix.length);
      break;
    }
  }
  return path || "";
}

function trimKnownImagePath(pathname = "") {
  let path = stripTrailingSlash(pathname);
  const suffixes = ["/images/generations", "/images/edits"];
  for (const suffix of suffixes) {
    if (path.endsWith(suffix)) {
      path = path.slice(0, -suffix.length);
      break;
    }
  }
  return path || "";
}

export function normalizeCompatibleBaseUrl(baseUrl, type = OPENAI_COMPATIBLE_TYPE) {
  const parsed = safeUrlParse(baseUrl);
  if (!parsed) return stripTrailingSlash(baseUrl);

  const pathname = type === ANTHROPIC_COMPATIBLE_TYPE
    ? trimKnownAnthropicPath(parsed.pathname)
    : type === CUSTOM_IMAGE_TYPE
      ? trimKnownImagePath(parsed.pathname)
      : trimKnownOpenAIPath(parsed.pathname);

  return `${parsed.origin}${pathname}`.replace(/\/+$/, "");
}

export function inferOpenAICompatibleApiType({ url = "", body = null } = {}) {
  const parsed = safeUrlParse(url);
  const pathname = stripTrailingSlash(parsed?.pathname || "");

  if (pathname.endsWith("/responses")) return "responses";
  if (pathname.endsWith("/chat/completions")) return "chat";

  if (body && typeof body === "object") {
    if (!Array.isArray(body.messages) && body.input !== undefined) return "responses";
    if (Array.isArray(body.messages)) return "chat";
  }

  return "chat";
}

export function inferImageApiPath({ url = "" } = {}) {
  const parsed = safeUrlParse(url);
  const pathname = stripTrailingSlash(parsed?.pathname || "");
  if (pathname.endsWith("/images/edits")) return "/images/edits";
  return "/images/generations";
}

function tokenizeShell(input) {
  const tokens = [];
  let current = "";
  let quote = null;
  let escaped = false;

  const pushCurrent = () => {
    if (current) {
      tokens.push(current);
      current = "";
    }
  };

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];

    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (quote === "'") {
      if (char === "'") {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (quote === '"' || quote === "`") {
      if (char === quote) {
        quote = null;
      } else if (char === "\\" && quote === '"') {
        escaped = true;
      } else {
        current += char;
      }
      continue;
    }

    if (char === "\\" && i + 1 < input.length) {
      escaped = true;
      continue;
    }

    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      pushCurrent();
      continue;
    }

    current += char;
  }

  pushCurrent();
  return tokens;
}

function parseHeaderLine(headerLine = "") {
  const idx = headerLine.indexOf(":");
  if (idx === -1) return null;
  const key = headerLine.slice(0, idx).trim();
  const value = headerLine.slice(idx + 1).trim();
  if (!key) return null;
  return { key, value };
}

function parseJsonBody(data) {
  if (!data) return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

function generatePrefix(hostname = "", type = OPENAI_COMPATIBLE_TYPE) {
  const core = String(hostname)
    .toLowerCase()
    .replace(/^api\./, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const shortCore = core || "compatible";
  if (type === ANTHROPIC_COMPATIBLE_TYPE) return `ac-${shortCore}`;
  if (type === CUSTOM_IMAGE_TYPE) return `img-${shortCore}`;
  return `oc-${shortCore}`;
}

export function parseCompatibleCurl(command) {
  const raw = String(command || "").trim();
  if (!raw) {
    throw new Error("cURL command is required");
  }

  const normalized = raw.replace(/\\\s*\n/g, " ").replace(/\r?\n/g, " ").trim();
  const tokens = tokenizeShell(normalized);

  if (tokens.length === 0 || tokens[0] !== "curl") {
    throw new Error("Please paste a valid curl command");
  }

  let method = "GET";
  let url = "";
  let data = "";
  const headers = {};

  for (let i = 1; i < tokens.length; i += 1) {
    const token = tokens[i];

    if ((token === "-X" || token === "--request") && tokens[i + 1]) {
      method = tokens[i + 1].toUpperCase();
      i += 1;
      continue;
    }

    if ((token === "--url" || token === "--location" || token === "--url-query") && tokens[i + 1]) {
      if (token === "--url") {
        url = tokens[i + 1];
      }
      i += 1;
      continue;
    }

    if ((token === "-H" || token === "--header") && tokens[i + 1]) {
      const header = parseHeaderLine(tokens[i + 1]);
      if (header) headers[header.key.toLowerCase()] = header.value;
      i += 1;
      continue;
    }

    if (
      (token === "-d" || token === "--data" || token === "--data-raw" || token === "--data-binary" || token === "--data-ascii")
      && tokens[i + 1]
    ) {
      data = tokens[i + 1];
      i += 1;
      continue;
    }

    if (!url && /^https?:\/\//i.test(token)) {
      url = token;
    }
  }

  if (!url) {
    throw new Error("Could not find request URL in curl command");
  }

  if (data && method === "GET") {
    method = "POST";
  }

  const body = parseJsonBody(data);
  const parsedUrl = safeUrlParse(url);
  const pathname = stripTrailingSlash(parsedUrl?.pathname || "");
  const hasAnthropicHeader = Boolean(headers["anthropic-version"]);
  const type = hasAnthropicHeader || pathname.endsWith("/messages")
    ? ANTHROPIC_COMPATIBLE_TYPE
    : OPENAI_COMPATIBLE_TYPE;
  const apiType = type === OPENAI_COMPATIBLE_TYPE
    ? inferOpenAICompatibleApiType({ url, body })
    : null;
  const apiKey = headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1]
    || headers["x-api-key"]
    || "";
  const modelId = body?.model ? String(body.model) : "";
  const baseUrl = normalizeCompatibleBaseUrl(url, type);
  const hostname = parsedUrl?.hostname || "";
  const defaultName = `${hostname || "Imported"} ${type === ANTHROPIC_COMPATIBLE_TYPE ? "Anthropic" : "OpenAI"} Compatible`;

  return {
    method,
    url,
    headers,
    body,
    type,
    apiType,
    apiKey,
    modelId,
    baseUrl,
    defaultName,
    defaultPrefix: generatePrefix(hostname, type),
    defaultConnectionName: "Imported Key",
  };
}

export function parseImageCurl(command) {
  const raw = String(command || "").trim();
  if (!raw) {
    throw new Error("cURL command is required");
  }

  const normalized = raw.replace(/\\\s*\n/g, " ").replace(/\r?\n/g, " ").trim();
  const tokens = tokenizeShell(normalized);

  if (tokens.length === 0 || tokens[0] !== "curl") {
    throw new Error("Please paste a valid curl command");
  }

  let method = "GET";
  let url = "";
  let data = "";
  const headers = {};

  for (let i = 1; i < tokens.length; i += 1) {
    const token = tokens[i];
    if ((token === "-X" || token === "--request") && tokens[i + 1]) {
      method = tokens[i + 1].toUpperCase();
      i += 1;
      continue;
    }
    if ((token === "--url" || token === "--location") && tokens[i + 1]) {
      if (token === "--url") url = tokens[i + 1];
      i += 1;
      continue;
    }
    if ((token === "-H" || token === "--header") && tokens[i + 1]) {
      const header = parseHeaderLine(tokens[i + 1]);
      if (header) headers[header.key.toLowerCase()] = header.value;
      i += 1;
      continue;
    }
    if (
      (token === "-d" || token === "--data" || token === "--data-raw" || token === "--data-binary" || token === "--data-ascii")
      && tokens[i + 1]
    ) {
      data = tokens[i + 1];
      i += 1;
      continue;
    }
    if (!url && /^https?:\/\//i.test(token)) {
      url = token;
    }
  }

  if (!url) {
    throw new Error("Could not find request URL in curl command");
  }

  if (data && method === "GET") {
    method = "POST";
  }

  const body = parseJsonBody(data);
  const parsedUrl = safeUrlParse(url);
  const hostname = parsedUrl?.hostname || "";
  const apiKey = headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1]
    || headers["x-api-key"]
    || "";
  const modelId = body?.model ? String(body.model) : "";

  return {
    method,
    url,
    headers,
    body,
    type: CUSTOM_IMAGE_TYPE,
    apiKey,
    modelId,
    imageSize: body?.size ? String(body.size) : "",
    baseUrl: normalizeCompatibleBaseUrl(url, CUSTOM_IMAGE_TYPE),
    apiPath: inferImageApiPath({ url }),
    defaultName: `${hostname || "Imported"} Image Provider`,
    defaultPrefix: generatePrefix(hostname, CUSTOM_IMAGE_TYPE),
    defaultConnectionName: "Imported Key",
  };
}

export const COMPATIBLE_PROVIDER_TYPES = {
  openai: OPENAI_COMPATIBLE_TYPE,
  anthropic: ANTHROPIC_COMPATIBLE_TYPE,
  image: CUSTOM_IMAGE_TYPE,
};
