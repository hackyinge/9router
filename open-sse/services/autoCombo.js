import { getModelsByProviderId } from "../config/providerModels.js";
import { isModelLockActive } from "./accountFallback.js";

export const AUTO_VARIANTS = ["coding", "fast", "cheap", "offline", "smart", "lkgp"];

const CODING_PROVIDERS = new Set([
  "claude",
  "codex",
  "github",
  "gemini-cli",
  "antigravity",
  "qwen",
  "iflow",
  "cursor",
  "kilocode",
  "cline",
  "opencode",
  "opencode-go",
  "commandcode",
  "glm",
  "kimi",
  "minimax",
  "deepseek",
]);

const OFFLINE_PROVIDERS = new Set(["ollama-local"]);
const CHEAP_PROVIDER_HINTS = new Set(["openrouter", "gemini", "groq", "deepseek", "glm", "kimi", "minimax", "opencode"]);

function normalizeText(value) {
  return String(value || "").toLowerCase();
}

function isLlmModel(model) {
  return (model?.type || "llm") === "llm";
}

function isFastModel(modelId) {
  const id = normalizeText(modelId);
  return /\b(flash|fast|mini|lite|low|spark|turbo)\b/.test(id) || id.includes("-flash") || id.includes("-mini") || id.includes("-lite");
}

function isSmartModel(modelId) {
  const id = normalizeText(modelId);
  return id.includes("opus") || id.includes("pro") || id.includes("max") || id.includes("xhigh") || id.includes("5.5") || id.includes("5.4");
}

function isCheapModel(modelId) {
  const id = normalizeText(modelId);
  return isFastModel(id) || id.includes("free") || id.includes("cheap");
}

export function parseAutoPrefix(model) {
  if (typeof model !== "string" || !model.startsWith("auto")) {
    return { valid: false, isAuto: false, error: "Not an auto-prefixed model" };
  }

  const parts = model.split("/");
  if (parts.length === 1) {
    return model === "auto"
      ? { valid: true, isAuto: true, variant: null }
      : { valid: false, isAuto: true, error: "Invalid auto prefix format" };
  }

  if (parts.length === 2 && parts[0] === "auto") {
    const variant = parts[1];
    if (!variant) return { valid: true, isAuto: true, variant: null };
    if (AUTO_VARIANTS.includes(variant)) return { valid: true, isAuto: true, variant };
    return { valid: false, isAuto: true, error: `Invalid auto variant: ${variant}` };
  }

  return { valid: false, isAuto: true, error: "Invalid auto prefix format" };
}

function getConnectionDefaultModel(connection, variant) {
  const providerModels = getModelsByProviderId(connection?.provider).filter(isLlmModel);

  if (typeof connection?.defaultModel === "string" && connection.defaultModel.trim()) {
    const defaultModel = connection.defaultModel.trim();
    if (!variant || variantAllows(connection.provider, defaultModel, variant)) {
      return defaultModel;
    }
  }

  const model = providerModels.find((entry) => variantAllows(connection.provider, entry.id, variant)) || providerModels[0];
  return model?.id || null;
}

function variantAllows(provider, model, variant) {
  if (!variant || variant === "lkgp") return true;
  if (variant === "offline") return OFFLINE_PROVIDERS.has(provider);
  if (variant === "coding") return CODING_PROVIDERS.has(provider) || normalizeText(model).includes("coder") || normalizeText(model).includes("code");
  if (variant === "fast") return isFastModel(model);
  if (variant === "cheap") return CHEAP_PROVIDER_HINTS.has(provider) || isCheapModel(model);
  if (variant === "smart") return isSmartModel(model);
  return true;
}

function scoreCandidate(connection, model, variant) {
  let score = 0;
  const provider = connection.provider;
  const priority = Number(connection.priority);

  if (connection.testStatus === "active" || connection.testStatus === "ok") score += 35;
  else if (!connection.testStatus || connection.testStatus === "unknown") score += 20;

  if (Number.isFinite(priority) && priority > 0) score += Math.max(0, 25 - priority);
  else score += 10;

  if (connection.lastError) score -= 8;
  if (connection.authType === "none" || connection.id?.startsWith("noauth:")) score += 4;

  if (variant === "coding" && CODING_PROVIDERS.has(provider)) score += 18;
  if (variant === "fast" && isFastModel(model)) score += 20;
  if (variant === "cheap" && (CHEAP_PROVIDER_HINTS.has(provider) || isCheapModel(model))) score += 16;
  if (variant === "smart" && isSmartModel(model)) score += 20;
  if (variant === "offline" && OFFLINE_PROVIDERS.has(provider)) score += 30;

  return score;
}

export function buildAutoComboModelsFromConnections(connections, options = {}) {
  const variant = options.variant || null;
  const limit = Number.isFinite(options.limit) && options.limit > 0 ? options.limit : 8;
  const seen = new Set();
  const candidates = [];

  for (const connection of connections || []) {
    if (!connection?.provider || connection.isActive === false) continue;
    if (connection.testStatus === "unavailable") continue;

    const model = getConnectionDefaultModel(connection, variant);
    if (!model) continue;
    if (isModelLockActive(connection, model)) continue;
    if (!variantAllows(connection.provider, model, variant)) continue;

    const key = `${connection.provider}/${model}`;
    if (seen.has(key)) continue;
    seen.add(key);

    candidates.push({
      model: key,
      score: scoreCandidate(connection, model, variant),
      priority: Number(connection.priority) || 999,
    });
  }

  return candidates
    .sort((a, b) => (b.score - a.score) || (a.priority - b.priority) || a.model.localeCompare(b.model))
    .slice(0, limit)
    .map((candidate) => candidate.model);
}
