import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

const fetchRouterMock = vi.fn();
const pipeSSEMock = vi.fn();
const errMock = vi.fn();

const baseModule = require("../../src/mitm/handlers/base.js");
const loggerModule = require("../../src/mitm/logger.js");

baseModule.fetchRouter = fetchRouterMock;
baseModule.pipeSSE = pipeSSEMock;
loggerModule.err = errMock;
loggerModule.log = vi.fn();

describe("OpenRouter MITM integration", () => {
  beforeEach(() => {
    fetchRouterMock.mockReset();
    pipeSSEMock.mockReset();
    errMock.mockReset();
  });

  it("识别 OpenRouter 官方 host 为 openrouter 工具", () => {
    const { getToolForHost } = require("../../src/mitm/config.js");

    expect(getToolForHost("openrouter.ai")).toBe("openrouter");
    expect(getToolForHost("openrouter.ai:443")).toBe("openrouter");
    expect(getToolForHost("api.openrouter.ai")).toBe("openrouter");
  });

  it("将 OpenRouter chat 请求改写模型后转发到 9Router chat completions", async () => {
    const { intercept } = require("../../src/mitm/handlers/openrouter.js");
    const req = {
      url: "/api/v1/chat/completions",
      headers: {
        host: "openrouter.ai",
        authorization: "Bearer or-test",
        "x-custom-header": "keep-me",
      },
    };
    const res = {
      headersSent: false,
      writeHead: vi.fn(),
      end: vi.fn(),
    };
    const routerResponse = { ok: true, headers: new Headers(), body: null, text: vi.fn() };
    const body = {
      model: "openai/gpt-5.4",
      stream: true,
      messages: [{ role: "user", content: "hello" }],
    };

    fetchRouterMock.mockResolvedValue(routerResponse);

    await intercept(
      req,
      res,
      Buffer.from(JSON.stringify(body)),
      "GPT",
      undefined,
      { "openai/gpt-5.4": "GPT" },
    );

    expect(fetchRouterMock).toHaveBeenCalledTimes(1);
    expect(fetchRouterMock).toHaveBeenCalledWith(
      {
        model: "GPT",
        stream: true,
        messages: [{ role: "user", content: "hello" }],
      },
      "/v1/chat/completions",
      req.headers,
    );
    expect(pipeSSEMock).toHaveBeenCalledWith(routerResponse, res);
  });

  it("为 OpenRouter key info 校验返回本地兼容响应", async () => {
    const { intercept, isKeyInfoRequest } = require("../../src/mitm/handlers/openrouter.js");
    const req = {
      url: "/api/v1/auth/key?include_limits=true",
      method: "GET",
      headers: {
        host: "openrouter.ai",
        authorization: "Bearer sk-openrouterx",
      },
    };
    const res = {
      writableEnded: false,
      writeHead: vi.fn(),
      end: vi.fn(),
    };

    expect(isKeyInfoRequest(req.url)).toBe(true);

    await intercept(req, res, Buffer.alloc(0), null, undefined, {});

    expect(fetchRouterMock).not.toHaveBeenCalled();
    expect(pipeSSEMock).not.toHaveBeenCalled();
    expect(res.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    }));

    const payload = JSON.parse(res.end.mock.calls[0][0]);
    expect(payload.data.label).toBe("openrouterX MITM API Key");
    expect(payload.data.rate_limit).toEqual({ interval: "1h", requests: 100000 });
    expect(payload.data.is_free_tier).toBe(false);
  });

  it("为 OpenRouter /models 返回本地公开模型列表，供第三方 IDE 校验通过", async () => {
    const { intercept } = require("../../src/mitm/handlers/openrouter.js");
    const req = {
      url: "/api/v1/models",
      method: "GET",
      headers: {
        host: "openrouter.ai",
      },
    };
    const res = {
      writeHead: vi.fn(),
      end: vi.fn(),
    };

    await intercept(
      req,
      res,
      Buffer.alloc(0),
      null,
      undefined,
      {
        "openai/gpt-5.4": "GPT",
        "anthropic/claude-sonnet-4.6": "GPT",
        "anthropic/claude-sonnet-4": "GPT",
        "anthropic/claude-opus-4": "GPT",
      },
    );

    expect(fetchRouterMock).not.toHaveBeenCalled();
    expect(res.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({
      "Content-Type": "application/json; charset=utf-8",
    }));

    const payload = JSON.parse(res.end.mock.calls[0][0]);
    const ids = payload.data.map((item) => item.id);

    expect(ids).toContain("openai/gpt-5.4");
    expect(ids).toContain("anthropic/claude-sonnet-4.6");

    const gpt54 = payload.data.find((item) => item.id === "openai/gpt-5.4");
    const claude46 = payload.data.find((item) => item.id === "anthropic/claude-sonnet-4.6");

    expect(gpt54.name).toBeTruthy();
    expect(claude46.name).toBeTruthy();
    expect(gpt54.top_provider).toHaveProperty("is_moderated");
    expect(claude46.top_provider).toHaveProperty("is_moderated");
  });
});
