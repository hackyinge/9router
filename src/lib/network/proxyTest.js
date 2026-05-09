import { ProxyAgent, fetch as undiciFetch } from "undici";
import { SocksProxyAgent } from "socks-proxy-agent";

const DEFAULT_TEST_URL = "https://www.gstatic.com/generate_204";
const DEFAULT_TIMEOUT_MS = 8000;

function getErrorMessage(err) {
  if (!err) return "Unknown error";
  const base = err?.message || String(err);
  const causeCode = err?.cause?.code || err?.code;
  const causeMessage = err?.cause?.message;

  if (causeMessage && causeMessage !== base) {
    return causeCode ? `${base}: ${causeMessage} (${causeCode})` : `${base}: ${causeMessage}`;
  }

  if (causeCode && !base.includes(causeCode)) {
    return `${base} (${causeCode})`;
  }

  return base;
}

function normalizeString(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function isSocksProxyUrl(proxyUrl) {
  try {
    return new URL(proxyUrl).protocol.startsWith("socks");
  } catch {
    return false;
  }
}

export async function testProxyUrl({ proxyUrl, testUrl, timeoutMs } = {}) {
  const normalizedProxyUrl = normalizeString(proxyUrl);
  if (!normalizedProxyUrl) {
    return { ok: false, status: 400, error: "proxyUrl is required" };
  }

  const normalizedTestUrl = normalizeString(testUrl) || DEFAULT_TEST_URL;
  const timeoutMsRaw = Number(timeoutMs);
  const normalizedTimeoutMs =
    Number.isFinite(timeoutMsRaw) && timeoutMsRaw > 0
      ? Math.min(timeoutMsRaw, 30000)
      : DEFAULT_TIMEOUT_MS;

  let dispatcher;
  let socksAgent;

  try {
    try {
      if (isSocksProxyUrl(normalizedProxyUrl)) {
        socksAgent = new SocksProxyAgent(normalizedProxyUrl);
      } else {
        dispatcher = new ProxyAgent({ uri: normalizedProxyUrl });
      }
    } catch (err) {
      return {
        ok: false,
        status: 400,
        error: `Invalid proxy URL: ${err?.message || String(err)}`,
      };
    }

    const controller = new AbortController();
    const startedAt = Date.now();
    const timer = setTimeout(() => controller.abort(), normalizedTimeoutMs);

    try {
      const res = socksAgent
        ? await fetchWithSocksAgent(normalizedTestUrl, { method: "HEAD", agent: socksAgent, signal: controller.signal })
        : await undiciFetch(normalizedTestUrl, {
            method: "HEAD",
            dispatcher,
            signal: controller.signal,
            headers: {
              "User-Agent": "OpenRouterX",
            },
          });

      return {
        ok: true,
        status: res.status,
        statusText: res.statusText,
        responseOk: res.responseOk ?? res.ok,
        url: normalizedTestUrl,
        elapsedMs: Date.now() - startedAt,
      };
    } catch (err) {
      const message =
        err?.name === "AbortError"
          ? "Proxy test timed out"
          : getErrorMessage(err);
      return { ok: false, status: 500, error: message };
    } finally {
      clearTimeout(timer);
    }
  } finally {
    try {
      await dispatcher?.close?.();
      await socksAgent?.destroy?.();
    } catch {
      // ignore
    }
  }
}

async function fetchWithSocksAgent(targetUrl, { method, agent, signal }) {
  const url = new URL(targetUrl);
  const transport = url.protocol === "http:" ? await import("node:http") : await import("node:https");
  const httpModule = transport.default ?? transport;

  return new Promise((resolve, reject) => {
    const req = httpModule.request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || (url.protocol === "http:" ? 80 : 443),
      path: `${url.pathname}${url.search}`,
      method,
      headers: { "User-Agent": "OpenRouterX" },
      agent,
    }, (res) => {
      res.resume();
      res.on("end", () => {
        const statusCode = res.statusCode;
        resolve({
          ok: true,
          status: statusCode,
          statusText: res.statusMessage,
          responseOk: statusCode >= 200 && statusCode < 300,
        });
      });
    });

    req.on("error", reject);
    if (signal) {
      if (signal.aborted) {
        req.destroy(new DOMException("This operation was aborted", "AbortError"));
        return;
      }
      signal.addEventListener("abort", () => {
        req.destroy(new DOMException("This operation was aborted", "AbortError"));
      }, { once: true });
    }
    req.end();
  });
}
