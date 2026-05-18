import { NextResponse } from "next/server";
import { getApiKeys } from "@/lib/localDb";
import { getAuthPayload } from "@/dashboardGuard";
import { getModelInfo } from "@/sse/services/model";
import { getAutoComboModels } from "@/sse/services/autoCombo";
import { resolveSubUserAccessContext, isProviderAllowedForSubUser } from "@/lib/subUserAccess";
import { getProviderNodeById } from "@/models";
import { UPDATER_CONFIG } from "@/shared/constants/config";
import { getConsistentMachineId } from "@/shared/utils/machineId";

const CLI_TOKEN_HEADER = "x-openrouterx-cli-token";
const CLI_TOKEN_SALT = "openrouterx-cli-auth";

async function testChatModel({ baseUrl, headers, model, startedAt }) {
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
  const latencyMs = Date.now() - startedAt;

  const rawText = await res.text().catch(() => "");
  let parsed = null;
  try {
    parsed = rawText ? JSON.parse(rawText) : null;
  } catch {}

  if (!res.ok) {
    const detail = parsed?.error?.message || parsed?.msg || parsed?.message || parsed?.error || rawText;
    const error = `HTTP ${res.status}${detail ? `: ${String(detail).slice(0, 240)}` : ""}`;
    return { ok: false, latencyMs, error, status: res.status, model };
  }

  // Some providers may return HTTP 200 but not a real completion for invalid models.
  const providerStatus = parsed?.status;
  const providerMsg = parsed?.msg || parsed?.message;
  const hasProviderErrorStatus = providerStatus !== undefined
    && providerStatus !== null
    && String(providerStatus) !== "200"
    && String(providerStatus) !== "0";
  if (hasProviderErrorStatus && providerMsg) {
    return {
      ok: false,
      latencyMs,
      status: res.status,
      error: `Provider status ${providerStatus}: ${String(providerMsg).slice(0, 240)}`,
      model,
    };
  }

  if (parsed?.error) {
    const providerError = parsed?.error?.message || parsed?.error || "Provider returned an error";
    return {
      ok: false,
      latencyMs,
      status: res.status,
      error: String(providerError).slice(0, 240),
      model,
    };
  }

  const hasChoices = Array.isArray(parsed?.choices) && parsed.choices.length > 0;
  if (!hasChoices) {
    return {
      ok: true,
      latencyMs,
      status: res.status,
      warning: "Provider responded but did not return completion choices yet",
      warningCode: "no_completion_choices",
      model,
    };
  }

  const hasMessage = parsed.choices.some((choice) => {
    const content = choice?.message?.content ?? choice?.delta?.content ?? choice?.text;
    return typeof content === "string" ? content.trim().length > 0 : content !== undefined && content !== null;
  });

  return {
    ok: true,
    latencyMs,
    error: null,
    status: res.status,
    warning: hasMessage ? null : "Provider responded but did not return message content yet",
    warningCode: hasMessage ? null : "no_message_content",
    model,
  };
}

async function testChatModelWithAutoFallback({ baseUrl, headers, model, startedAt }) {
  const autoCombo = await getAutoComboModels(model);
  if (!autoCombo.isAuto) {
    return testChatModel({ baseUrl, headers, model, startedAt });
  }
  if (autoCombo.error) {
    return { ok: false, latencyMs: Date.now() - startedAt, status: 400, error: autoCombo.error };
  }

  const candidates = autoCombo.models || [];
  if (!candidates.length) {
    return { ok: false, latencyMs: Date.now() - startedAt, status: 404, error: `No available providers for ${model}` };
  }

  let bestWarning = null;
  let lastError = null;
  for (const candidate of candidates) {
    const result = await testChatModel({ baseUrl, headers, model: candidate, startedAt });
    if (result.ok && !result.warning) {
      return { ...result, routedModel: candidate };
    }
    if (result.ok) {
      bestWarning = { ...result, routedModel: candidate };
      continue;
    }
    lastError = { ...result, routedModel: candidate };
  }

  return bestWarning || lastError || {
    ok: false,
    latencyMs: Date.now() - startedAt,
    status: 503,
    error: `No usable providers for ${model}`,
  };
}

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
      `http://127.0.0.1:${process.env.PORT || UPDATER_CONFIG.appPort}`;

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
    // Bypass dashboardGuard for internal self-call via CLI token (machineId-based)
    headers[CLI_TOKEN_HEADER] = await getConsistentMachineId(CLI_TOKEN_SALT);

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
    return NextResponse.json(await testChatModelWithAutoFallback({ baseUrl, headers, model, startedAt: start }));
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
