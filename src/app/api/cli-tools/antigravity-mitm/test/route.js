import https from "node:https";
import { NextResponse } from "next/server";
import { getMitmAlias } from "@/models";

const DEFAULT_ANTIGRAVITY_ALIASES = {
  "gemini-3.1-pro-high": "gemini-3.1-pro-high",
  "gemini-3.1-pro-low": "gemini-3.1-pro-low",
  "gemini-3-flash-agent": "cx/gpt-5.5",
  "gemini-3-flash": "cx/gpt-5.5",
  "claude-sonnet-4-6": "claude-sonnet-4-6",
  "claude-opus-4-6-thinking": "claude-opus-4-6-thinking",
  "gpt-oss-120b-medium": "gpt-oss-120b-medium",
};

function extractAssistantText(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (typeof part?.text === "string") return part.text;
        return "";
      })
      .join("")
      .trim();
  }
  return "";
}

function extractTextPreview(text) {
  return String(text || "")
    .split(/\r?\n/)
    .filter((line) => line.trim() && line.trim() !== "data: [DONE]")
    .map((line) => line.replace(/^data:\s*/, ""))
    .join("\n")
    .slice(0, 4000);
}

function extractAntigravityText(text) {
  return String(text || "")
    .split(/\r?\n/)
    .filter((line) => line.trim() && line.trim() !== "data: [DONE]")
    .map((line) => line.replace(/^data:\s*/, ""))
    .map((line) => {
      try {
        const parsed = JSON.parse(line);
        const parts = parsed?.response?.candidates?.[0]?.content?.parts;
        if (!Array.isArray(parts)) return "";
        return parts.map((part) => part?.text || "").join("");
      } catch {
        return "";
      }
    })
    .join("")
    .trim();
}

function requestOpenRouter({ path, method = "GET", headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "openrouter.ai",
        port: 443,
        path,
        method,
        headers,
        rejectUnauthorized: false,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            status: res.statusCode || 0,
            headers: res.headers || {},
            text: Buffer.concat(chunks).toString("utf8"),
          });
        });
      }
    );

    req.on("error", reject);
    req.setTimeout(30000, () => {
      req.destroy(new Error("Request timeout"));
    });

    if (body) req.write(body);
    req.end();
  });
}

function requestMitmAntigravity({ publicModel, prompt }) {
  const path = `/v1internal/models/${encodeURIComponent(publicModel)}:generateContent`;
  const body = JSON.stringify({
    userAgent: "antigravity",
    model: publicModel,
    request: {
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {},
    },
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "cloudcode-pa.googleapis.com",
        port: 443,
        path,
        method: "POST",
        headers: {
          Host: "cloudcode-pa.googleapis.com",
          "User-Agent": "antigravity/1.23.2 local-mitm-test",
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          Authorization: "Bearer local-dev-mitm-test",
        },
        rejectUnauthorized: false,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            status: res.statusCode || 0,
            headers: res.headers || {},
            text: Buffer.concat(chunks).toString("utf8"),
          });
        });
      }
    );

    req.on("error", reject);
    req.setTimeout(30000, () => {
      req.destroy(new Error("Request timeout"));
    });

    req.write(body);
    req.end();
  });
}

async function listOpenRouterModels() {
  const start = Date.now();
  const response = await requestOpenRouter({
    path: "/models",
    method: "GET",
    headers: {
      Accept: "application/json, text/plain;q=0.9, */*;q=0.8",
    },
  });

  const latencyMs = Date.now() - start;
  const rawText = response.text || "";
  const contentType = String(response.headers["content-type"] || "");

  if (!contentType.includes("application/json")) {
    return NextResponse.json(
      {
        ok: false,
        status: response.status,
        latencyMs,
        error: `MITM inactive or misconfigured: expected JSON from https://openrouter.ai/models, got ${contentType || "unknown content-type"}`,
        preview: rawText.slice(0, 200),
      },
      { status: 502 }
    );
  }

  let parsed = null;
  try {
    parsed = rawText ? JSON.parse(rawText) : null;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        status: response.status,
        latencyMs,
        error: "MITM returned non-JSON payload for https://openrouter.ai/models",
        preview: rawText.slice(0, 200),
      },
      { status: 502 }
    );
  }

  if (!response.ok) {
    const detail =
      parsed?.error?.message ||
      parsed?.msg ||
      parsed?.message ||
      parsed?.error ||
      rawText;
    return NextResponse.json(
      {
        ok: false,
        status: response.status,
        latencyMs,
        error: `HTTP ${response.status}${detail ? `: ${String(detail).slice(0, 500)}` : ""}`,
      },
      { status: response.status }
    );
  }

  const models = Array.isArray(parsed) ? parsed : (parsed?.data || parsed?.models || parsed?.results || []);
  return NextResponse.json({
    ok: true,
    status: response.status,
    latencyMs,
    provider: "openrouter",
    count: models.length,
    models,
  });
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const tool = body.tool || "openrouter";
    const mode = String(body.mode || "").trim();
    const publicModel = String(body.publicModel || (tool === "antigravity" ? "claude-sonnet-4-6" : "openai/gpt-5.5")).trim();
    const mappedModelInput = String(body.mappedModel || "").trim();
    const prompt = String(body.prompt || "Reply with exactly: local antigravity mitm ok").trim();

    if (tool !== "openrouter" && tool !== "antigravity") {
      return NextResponse.json({ ok: false, error: "Only openrouter and antigravity MITM tests are supported" }, { status: 400 });
    }

    if (tool === "openrouter" && mode === "models") {
      return await listOpenRouterModels();
    }

    if (!publicModel) {
      return NextResponse.json({ ok: false, error: "publicModel is required" }, { status: 400 });
    }

    const aliases = {
      ...(tool === "antigravity" ? DEFAULT_ANTIGRAVITY_ALIASES : {}),
      ...await getMitmAlias(tool),
    };
    const mappedModel = mappedModelInput || aliases?.[publicModel] || "";
    if (!mappedModel) {
      return NextResponse.json({
        ok: false,
        publicModel,
        error: `No mapped model found for ${publicModel}. Please configure it first.`,
      }, { status: 400 });
    }

    if (tool === "antigravity") {
      const start = Date.now();
      const response = await requestMitmAntigravity({ publicModel, prompt });
      const latencyMs = Date.now() - start;
      const rawText = response.text || "";
      let parsed = null;
      try {
        parsed = rawText ? JSON.parse(rawText) : null;
      } catch {
        parsed = null;
      }

      if (response.status < 200 || response.status >= 300) {
        const detail =
          parsed?.error?.message ||
          parsed?.msg ||
          parsed?.message ||
          parsed?.error ||
          rawText;
        return NextResponse.json({
          ok: false,
          status: response.status,
          latencyMs,
          publicModel,
          mappedModel,
          error: `HTTP ${response.status}${detail ? `: ${String(detail).slice(0, 500)}` : ""}`,
          preview: extractTextPreview(rawText),
        }, { status: response.status || 502 });
      }

      return NextResponse.json({
        ok: true,
        status: response.status,
        latencyMs,
        publicModel,
        mappedModel,
        contentType: response.headers["content-type"] || "",
        reply: extractAntigravityText(rawText),
        preview: extractTextPreview(rawText),
        response: parsed,
      });
    }

    const start = Date.now();
    const response = await requestOpenRouter({
      path: "/api/v1/chat/completions",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer sk_openrouterx",
      },
      body: JSON.stringify({
        model: publicModel,
        stream: false,
        reasoning: { enabled: true },
        messages: [
          {
            role: "user",
            content: "How many r`s are in the word `strawberry?`",
          },
        ],
      }),
    });

    const latencyMs = Date.now() - start;
    const rawText = response.text || "";
    let parsed = null;
    try {
      parsed = rawText ? JSON.parse(rawText) : null;
    } catch {
      parsed = null;
    }

    if (response.status < 200 || response.status >= 300) {
      const detail =
        parsed?.error?.message ||
        parsed?.msg ||
        parsed?.message ||
        parsed?.error ||
        rawText;
      return NextResponse.json({
        ok: false,
        status: response.status,
        latencyMs,
        publicModel,
        mappedModel,
        error: `HTTP ${response.status}${detail ? `: ${String(detail).slice(0, 500)}` : ""}`,
      }, { status: response.status });
    }

    const reply = extractAssistantText(parsed);
    return NextResponse.json({
      ok: true,
      status: response.status,
      latencyMs,
      publicModel,
      mappedModel,
      reply,
      response: parsed,
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error?.message || "OpenRouter MITM test failed",
    }, { status: 500 });
  }
}
