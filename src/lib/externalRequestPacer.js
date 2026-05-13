const DEFAULT_INTERVAL_MS = 1800;
const DEFAULT_JITTER_MS = 1200;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getState() {
  if (!globalThis.__openrouterxExternalRequestPacer) {
    globalThis.__openrouterxExternalRequestPacer = {
      nextAtByKey: new Map(),
    };
  }
  return globalThis.__openrouterxExternalRequestPacer;
}

export async function paceExternalRequest(key = "default", options = {}) {
  const intervalMs = Number.isFinite(options.intervalMs)
    ? Math.max(0, options.intervalMs)
    : DEFAULT_INTERVAL_MS;
  const jitterMs = Number.isFinite(options.jitterMs)
    ? Math.max(0, options.jitterMs)
    : DEFAULT_JITTER_MS;
  const normalizedKey = String(key || "default");
  const state = getState();
  const now = Date.now();
  const availableAt = Math.max(now, state.nextAtByKey.get(normalizedKey) || 0);
  const waitMs = Math.max(0, availableAt - now);
  const jitter = jitterMs > 0 ? Math.floor(Math.random() * jitterMs) : 0;

  state.nextAtByKey.set(normalizedKey, availableAt + intervalMs + jitter);

  if (waitMs > 0) {
    await sleep(waitMs);
  }
}

export function getExternalRequestPaceKey(provider, scope = "provider") {
  return `${scope}:${provider || "unknown"}`;
}
