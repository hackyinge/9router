import { extractCodexAccountInfo } from "./providers.js";

const CODEX_FORMATS = new Set(["codex", "openai", "openai-codex", "openai_codex", "chatgpt"]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function normalizeExpiresAt(value) {
  if (value === undefined || value === null || value === "") return null;

  if (typeof value === "number" && Number.isFinite(value)) {
    const millis = value > 10_000_000_000 ? value : value * 1000;
    return new Date(millis).toISOString();
  }

  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) return normalizeExpiresAt(Number(trimmed));

  const time = Date.parse(trimmed);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

function expiresAtOrImmediateRefresh(value) {
  return normalizeExpiresAt(value) || new Date(0).toISOString();
}

function normalizeSourceFormat(format) {
  if (format === "codex_session") return "codex_session";
  if (format === "sub2api") return "sub2api";
  return "cli_proxy_api_auth";
}

function authMethodForFormat(format) {
  return `imported_${normalizeSourceFormat(format)}`;
}

function providerHintMatchesCodex(record, filename = "") {
  const hints = [
    record.__entryKey,
    record.type,
    record.provider,
    record.platform,
    record.service,
    record.source,
    record.kind,
    record.provider_type,
    filename,
  ]
    .filter((value) => typeof value === "string")
    .map((value) => value.toLowerCase());

  return hints.some((value) => {
    const normalized = value.replace(/\s+/g, "-");
    return [...CODEX_FORMATS].some((format) => normalized.includes(format));
  });
}

function readCredentials(record) {
  if (!isObject(record)) return {};
  if (isObject(record.credentials)) return record.credentials;
  if (isObject(record.auth)) return record.auth;
  if (isObject(record.token)) return record.token;
  if (isObject(record.tokens)) return record.tokens;
  if (isObject(record.data) && (record.data.access_token || record.data.accessToken)) return record.data;
  return record;
}

function findCandidateContainers(data) {
  if (!isObject(data)) return [];
  const keys = [
    "accounts",
    "auths",
    "credentials",
    "tokens",
    "items",
    "data",
    "sessions",
    "providers",
  ];

  const containers = [];
  for (const key of keys) {
    const value = data[key];
    if (Array.isArray(value)) containers.push({ key, value });
    if (isObject(value)) {
      containers.push({
        key,
        value: Object.entries(value)
          .filter(([, entry]) => isObject(entry))
          .map(([entryKey, entry]) => ({ __entryKey: entryKey, ...entry })),
      });
    }
  }
  return containers;
}

function hasTokenPair(record) {
  const credentials = readCredentials(record);
  return !!(
    firstString(credentials.accessToken, credentials.access_token)
    && firstString(
      credentials.sessionToken,
      credentials.refreshToken,
      credentials.refresh_token,
      credentials.refresh
    )
  );
}

function inferFormat(record, filename, parentKey) {
  const credentials = readCredentials(record);
  const accessToken = firstString(credentials.accessToken, credentials.access_token);
  const refreshToken = firstString(
    credentials.sessionToken,
    credentials.refreshToken,
    credentials.refresh_token,
    credentials.refresh
  );
  if (!accessToken || !refreshToken) return null;

  if (record.accessToken && record.sessionToken) return "codex_session";
  if (parentKey === "accounts" || parentKey === "sessions" || record.account_type || record.accountType) {
    if (providerHintMatchesCodex(record, filename)) return "sub2api";
  }
  if (providerHintMatchesCodex(record, filename)) return "cli_proxy_api_auth";
  if (firstString(credentials.id_token, credentials.idToken)) return "cli_proxy_api_auth";
  return null;
}

function normalizeRecord(record, { filename = "pasted JSON", parentKey = null } = {}) {
  if (!isObject(record)) return null;
  const credentials = readCredentials(record);
  const format = inferFormat(record, filename, parentKey);
  if (!format) return null;

  const accessToken = firstString(credentials.accessToken, credentials.access_token);
  const refreshToken = firstString(
    credentials.sessionToken,
    credentials.refreshToken,
    credentials.refresh_token,
    credentials.refresh
  );
  const idToken = firstString(credentials.idToken, credentials.id_token, record.idToken, record.id_token);
  const jwtInfo = idToken ? extractCodexAccountInfo(idToken) : {};
  const user = isObject(record.user) ? record.user : {};
  const account = isObject(record.account) ? record.account : {};

  const expiresAt = expiresAtOrImmediateRefresh(
    credentials.expiresAt
      ?? credentials.expires_at
      ?? credentials.expiry
      ?? credentials.expired
      ?? credentials.expires
      ?? record.expiresAt
      ?? record.expires_at
      ?? record.expiry
      ?? record.expired
      ?? record.expires
  );

  const chatgptAccountId = firstString(
    credentials.chatgpt_account_id,
    credentials.chatgptAccountId,
    record.chatgpt_account_id,
    record.chatgptAccountId,
    account.id,
    account.account_id,
    jwtInfo.chatgptAccountId
  );
  const chatgptPlanType = firstString(
    credentials.chatgpt_plan_type,
    credentials.chatgptPlanType,
    credentials.plan_type,
    credentials.planType,
    record.chatgpt_plan_type,
    record.chatgptPlanType,
    record.plan_type,
    record.planType,
    account.planType,
    account.plan_type,
    jwtInfo.chatgptPlanType
  );

  return {
    sourceFormat: normalizeSourceFormat(format),
    accessToken,
    refreshToken,
    expiresAt,
    email: firstString(credentials.email, record.email, user.email, jwtInfo.email),
    displayName: firstString(credentials.displayName, credentials.name, record.displayName, record.name, user.name),
    name: firstString(record.name, credentials.name, user.name),
    priority: Number.isFinite(Number(record.priority)) ? Number(record.priority) : undefined,
    providerSpecificData: {
      chatgptAccountId,
      chatgptPlanType,
      authMethod: authMethodForFormat(format),
      sourceFilename: filename,
    },
  };
}

function collectFromData(data, filename) {
  if (Array.isArray(data)) {
    return data
      .map((item) => normalizeRecord(item, { filename }))
      .filter(Boolean);
  }

  const direct = normalizeRecord(data, { filename });
  if (direct) return [direct];

  const records = [];
  for (const container of findCandidateContainers(data)) {
    for (const item of container.value) {
      const record = normalizeRecord(item, { filename, parentKey: container.key });
      if (record) records.push(record);
    }
  }
  return records;
}

export function parseCodexImportJson(text, filename = "pasted JSON") {
  let data;
  try {
    data = typeof text === "string" ? JSON.parse(text) : text;
  } catch {
    return { records: [], skipped: [{ filename, reason: "Invalid JSON format" }] };
  }

  const records = collectFromData(data, filename);
  if (records.length === 0) {
    return { records: [], skipped: [{ filename, reason: "No supported Codex credentials found" }] };
  }
  return { records, skipped: [] };
}

export function collectCodexImportRecords(input) {
  const items = Array.isArray(input) ? input : [input];
  const records = [];
  const skipped = [];

  for (const item of items) {
    const filename = item?.filename || "pasted JSON";
    const source = Object.prototype.hasOwnProperty.call(item || {}, "jsonText")
      ? item.jsonText
      : item?.data;
    const result = parseCodexImportJson(source, filename);
    records.push(...result.records);
    skipped.push(...result.skipped);
  }

  return { records, skipped };
}
