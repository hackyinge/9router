import { EventEmitter } from "node:events";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

function makeJsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status || 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("OpenRouter MITM dashboard test API", () => {
  let capturedRequest;

  beforeEach(() => {
    capturedRequest = null;
    vi.resetModules();

    vi.doMock("next/server", () => ({
      NextResponse: {
        json: makeJsonResponse,
      },
    }));

    vi.doMock("@/models", () => ({
      getMitmAlias: vi.fn().mockResolvedValue({}),
    }));

    vi.doMock("node:https", () => ({
      default: {
        request: vi.fn((options, callback) => {
          capturedRequest = options;
          const req = new EventEmitter();
          req.setTimeout = vi.fn();
          req.write = vi.fn();
          req.destroy = vi.fn();
          req.end = vi.fn(() => {
            const res = new EventEmitter();
            res.statusCode = 200;
            res.headers = { "content-type": "application/json; charset=utf-8" };
            callback(res);
            queueMicrotask(() => {
              res.emit("data", Buffer.from(JSON.stringify({
                data: {
                  label: "openrouterX MITM API Key",
                  usage: 0,
                  rate_limit: { interval: "1h", requests: 100000 },
                },
              })));
              res.emit("end");
            });
          });
          return req;
        }),
      },
    }));
  });

  afterEach(() => {
    vi.doUnmock("next/server");
    vi.doUnmock("@/models");
    vi.doUnmock("node:https");
    vi.restoreAllMocks();
  });

  it("tests OpenRouter key info through the MITM endpoint", async () => {
    const { POST } = await import("@/app/api/cli-tools/antigravity-mitm/test/route.js");
    const response = await POST({
      json: async () => ({ tool: "openrouter", mode: "key" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.status).toBe(200);
    expect(body.request).toMatchObject({
      method: "GET",
      url: "https://openrouter.ai/api/v1/auth/key?include_limits=true",
      headers: {
        Accept: "application/json, text/plain;q=0.9, */*;q=0.8",
        Authorization: "Bearer sk_openrouterx",
      },
    });
    expect(body.response.data.label).toBe("openrouterX MITM API Key");
    expect(capturedRequest).toMatchObject({
      hostname: "openrouter.ai",
      path: "/api/v1/auth/key?include_limits=true",
      method: "GET",
    });
  });
});
