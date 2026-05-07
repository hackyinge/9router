import { NextResponse } from "next/server";
import { getApiKeys } from "@/lib/localDb";
import { getAuthPayload } from "@/dashboardGuard";
import { getModelInfo } from "@/sse/services/model";
import { resolveSubUserAccessContext, isProviderAllowedForSubUser } from "@/lib/subUserAccess";
import { getProviderNodeById } from "@/models";

// POST /api/models/test - Ping a single model via internal completions or embeddings
export async function POST(request) {
  try {
    const { model, kind } = await request.json();
    if (!model) return NextResponse.json({ error: "Model required" }, { status: 400 });

    const subUserContext = await resolveSubUserAccessContext(request);
    if (subUserContext) {
      const modelInfo = await getModelInfo(model);
      if (!modelInfo?.provider || !isProviderAllowedForSubUser(subUserContext, modelInfo.provider)) {
        return NextResponse.json({ ok: false, error: "This provider is not enabled for the current sub-user." }, { status: 403 });
      }
    }

    const baseUrl = process.env.BASE_URL ||
      (() => { const u = new URL(request.url); return `${u.protocol}//${u.host}`; })();

    // Get an active internal API key for auth (if requireApiKey is enabled)
    let apiKey = null;
    try {
      const payload = await getAuthPayload(request);
      const keys = payload?.role === "sub_user"
        ? await getApiKeys({ userId: payload.userId })
        : await getApiKeys();
      apiKey = keys.find((k) => k.isActive !== false)?.key || null;
    } catch {}

    const headers = { "Content-Type": "application/json" };
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

    const start = Date.now();

    // Route to appropriate endpoint based on kind
    if (kind === "embedding") {
      const res = await fetch(`${baseUrl}/api/v1/embeddings`, {
        method: "POST",
        headers,
        body: JSON.stringify({ model, input: "test" }),
        signal: AbortSignal.timeout(15000),
      });
      const latencyMs = Date.now() - start;
      const rawText = await res.text().catch(() => "");
      let parsed = null;
      try { parsed = rawText ? JSON.parse(rawText) : null; } catch {}

      if (!res.ok) {
        const detail = parsed?.error?.message || parsed?.error || rawText;
        return NextResponse.json({ ok: false, latencyMs, error: `HTTP ${res.status}${detail ? `: ${String(detail).slice(0, 240)}` : ""}`, status: res.status });
      }
      const hasEmbedding = Array.isArray(parsed?.data) && parsed.data.length > 0 && Array.isArray(parsed.data[0]?.embedding);
      if (!hasEmbedding) {
        return NextResponse.json({ ok: false, latencyMs, status: res.status, error: "Provider returned no embedding data" });
      }
      return NextResponse.json({ ok: true, latencyMs, error: null, status: res.status });
    }

    if (kind === "image") {
      const resolvedModelInfo = await getModelInfo(model);
      const customImageNode = resolvedModelInfo?.provider
        ? await getProviderNodeById(resolvedModelInfo.provider)
        : null;
      const resolvedSize = customImageNode?.type === "custom-image" && customImageNode?.defaultSize
        ? customImageNode.defaultSize
        : "1024x1024";
      const res = await fetch(`${baseUrl}/api/v1/images/generations`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model,
          prompt: "test",
          n: 1,
          size: resolvedSize,
        }),
        signal: AbortSignal.timeout(20000),
      });
      const latencyMs = Date.now() - start;
      const rawText = await res.text().catch(() => "");
      let parsed = null;
      try { parsed = rawText ? JSON.parse(rawText) : null; } catch {}

      if (!res.ok) {
        const detail = parsed?.error?.message || parsed?.msg || parsed?.message || parsed?.error || rawText;
        return NextResponse.json({
          ok: false,
          latencyMs,
          error: `HTTP ${res.status}${detail ? `: ${String(detail).slice(0, 240)}` : ""}`,
          status: res.status,
        });
      }

      const hasData = Array.isArray(parsed?.data) && parsed.data.length > 0;
      if (!hasData) {
        return NextResponse.json({
          ok: false,
          latencyMs,
          status: res.status,
          error: "Provider returned no image generation data",
        });
      }

      return NextResponse.json({ ok: true, latencyMs, error: null, status: res.status });
    }

    // Default: chat completions
    const res = await fetch(`${baseUrl}/api/v1/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        max_tokens: 1,
        stream: false,
        messages: [{ role: "user", content: "hi" }],
      }),
      signal: AbortSignal.timeout(15000),
    });
    const latencyMs = Date.now() - start;

    const rawText = await res.text().catch(() => "");
    let parsed = null;
    try {
      parsed = rawText ? JSON.parse(rawText) : null;
    } catch {}

    if (!res.ok) {
      const detail = parsed?.error?.message || parsed?.msg || parsed?.message || parsed?.error || rawText;
      const error = `HTTP ${res.status}${detail ? `: ${String(detail).slice(0, 240)}` : ""}`;
      return NextResponse.json({ ok: false, latencyMs, error, status: res.status });
    }

    // Some providers may return HTTP 200 but not a real completion for invalid models.
    const providerStatus = parsed?.status;
    const providerMsg = parsed?.msg || parsed?.message;
    const hasProviderErrorStatus = providerStatus !== undefined
      && providerStatus !== null
      && String(providerStatus) !== "200"
      && String(providerStatus) !== "0";
    if (hasProviderErrorStatus && providerMsg) {
      return NextResponse.json({
        ok: false,
        latencyMs,
        status: res.status,
        error: `Provider status ${providerStatus}: ${String(providerMsg).slice(0, 240)}`,
      });
    }

    if (parsed?.error) {
      const providerError = parsed?.error?.message || parsed?.error || "Provider returned an error";
      return NextResponse.json({
        ok: false,
        latencyMs,
        status: res.status,
        error: String(providerError).slice(0, 240),
      });
    }

    const hasChoices = Array.isArray(parsed?.choices) && parsed.choices.length > 0;
    if (!hasChoices) {
      return NextResponse.json({
        ok: false,
        latencyMs,
        status: res.status,
        error: "Provider returned no completion choices for this model",
      });
    }

    return NextResponse.json({ ok: true, latencyMs, error: null, status: res.status });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
