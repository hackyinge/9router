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

  it("为 OpenRouter /models 注入精简后的公开模型名，供第三方 IDE 校验通过", async () => {
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

    const upstreamModels = {
      data: [
        {
          id: "openai/gpt-4o",
          name: "GPT-4o",
          canonical_slug: "openai/gpt-4o",
        },
      ],
    };

    const passthrough = vi.fn(async (_req, _res, _bodyBuffer, onResponse) => {
      onResponse(Buffer.from(JSON.stringify(upstreamModels)), { "content-type": "application/json" });
    });

    await intercept(
      req,
      res,
      Buffer.alloc(0),
      null,
      passthrough,
      {
        "openai/gpt-5.4": "GPT",
        "anthropic/claude-sonnet-4.6": "GPT",
        "anthropic/claude-sonnet-4": "GPT",
        "anthropic/claude-opus-4": "GPT",
      },
    );

    expect(passthrough).toHaveBeenCalledTimes(1);
    expect(res.writeHead).toHaveBeenCalledWith(200, { "Content-Type": "application/json" });

    const payload = JSON.parse(res.end.mock.calls[0][0]);
    const ids = payload.data.map((item) => item.id);

    expect(ids).toEqual([
      "openai/gpt-4o",
      "openai/gpt-5.4",
      "anthropic/claude-sonnet-4.6",
      "anthropic/claude-sonnet-4",
      "anthropic/claude-opus-4",
    ]);

    const gpt54 = payload.data.find((item) => item.id === "openai/gpt-5.4");
    const claude46 = payload.data.find((item) => item.id === "anthropic/claude-sonnet-4.6");

    expect(gpt54.name).toBe("openai/gpt-5.4");
    expect(claude46.name).toBe("anthropic/claude-sonnet-4.6");
    expect(gpt54.top_provider).toEqual({ is_moderated: false });
    expect(claude46.top_provider).toEqual({ is_moderated: false });
  });
});
