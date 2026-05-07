import { NextResponse } from "next/server";
import { createProviderNode, getProviderNodes } from "@/models";
import {
  OPENAI_COMPATIBLE_PREFIX,
  ANTHROPIC_COMPATIBLE_PREFIX,
  CUSTOM_EMBEDDING_PREFIX,
  CUSTOM_IMAGE_PREFIX,
} from "@/shared/constants/providers";
import { isProviderAllowedForSubUser, resolveSubUserAccessContext } from "@/lib/subUserAccess";
import { inferOpenAICompatibleApiType, normalizeCompatibleBaseUrl } from "@/shared/utils/compatibleProvider";
import { generateId } from "@/shared/utils";

export const dynamic = "force-dynamic";

const OPENAI_COMPATIBLE_DEFAULTS = {
  baseUrl: "https://api.openai.com/v1",
};

const ANTHROPIC_COMPATIBLE_DEFAULTS = {
  baseUrl: "https://api.anthropic.com/v1",
};

const CUSTOM_EMBEDDING_DEFAULTS = {
  baseUrl: "https://api.openai.com/v1",
};

// GET /api/provider-nodes - List all provider nodes
export async function GET(request) {
  try {
    const nodes = await getProviderNodes();
    const subUserContext = await resolveSubUserAccessContext(request);
    const visibleNodes = subUserContext
      ? nodes.filter((node) => isProviderAllowedForSubUser(subUserContext, node.id))
      : nodes;
    return NextResponse.json({ nodes: visibleNodes });
  } catch (error) {
    console.log("Error fetching provider nodes:", error);
    return NextResponse.json({ error: "Failed to fetch provider nodes" }, { status: 500 });
  }
}

// POST /api/provider-nodes - Create provider node
export async function POST(request) {
  try {
    const body = await request.json();
    const { name, prefix, apiType, baseUrl, type, defaultSize } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    if (!prefix?.trim()) {
      return NextResponse.json({ error: "Prefix is required" }, { status: 400 });
    }

    // Determine type
    const nodeType = type || "openai-compatible";

    if (nodeType === "openai-compatible") {
      if (!apiType || !["chat", "responses"].includes(apiType)) {
        return NextResponse.json({ error: "Invalid OpenAI compatible API type" }, { status: 400 });
      }

      const rawBaseUrl = String(baseUrl || OPENAI_COMPATIBLE_DEFAULTS.baseUrl).trim().replace(/\/+$/, "");
      const sanitizedBaseUrl = normalizeCompatibleBaseUrl(
        baseUrl || OPENAI_COMPATIBLE_DEFAULTS.baseUrl,
        "openai-compatible",
      );
      const resolvedApiType = rawBaseUrl !== sanitizedBaseUrl
        ? inferOpenAICompatibleApiType({ url: rawBaseUrl })
        : apiType;

      const node = await createProviderNode({
        id: `${OPENAI_COMPATIBLE_PREFIX}${resolvedApiType}-${generateId()}`,
        type: "openai-compatible",
        prefix: prefix.trim(),
        apiType: resolvedApiType,
        baseUrl: sanitizedBaseUrl,
        name: name.trim(),
      });
      return NextResponse.json({ node }, { status: 201 });
    }

    if (nodeType === "custom-embedding") {
      // Strip trailing slash and /embeddings if user pasted full endpoint
      let sanitizedBaseUrl = (baseUrl || CUSTOM_EMBEDDING_DEFAULTS.baseUrl).trim().replace(/\/$/, "");
      if (sanitizedBaseUrl.endsWith("/embeddings")) {
        sanitizedBaseUrl = sanitizedBaseUrl.slice(0, -"/embeddings".length);
      }

      const node = await createProviderNode({
        id: `${CUSTOM_EMBEDDING_PREFIX}${generateId()}`,
        type: "custom-embedding",
        prefix: prefix.trim(),
        baseUrl: sanitizedBaseUrl,
        name: name.trim(),
      });
      return NextResponse.json({ node }, { status: 201 });
    }

    if (nodeType === "anthropic-compatible") {
      const sanitizedBaseUrl = normalizeCompatibleBaseUrl(
        baseUrl || ANTHROPIC_COMPATIBLE_DEFAULTS.baseUrl,
        "anthropic-compatible",
      );

      const node = await createProviderNode({
        id: `${ANTHROPIC_COMPATIBLE_PREFIX}${generateId()}`,
        type: "anthropic-compatible",
        prefix: prefix.trim(),
        baseUrl: sanitizedBaseUrl,
        name: name.trim(),
      });
      return NextResponse.json({ node }, { status: 201 });
    }

    if (nodeType === "custom-image") {
      const sanitizedBaseUrl = normalizeCompatibleBaseUrl(
        baseUrl || OPENAI_COMPATIBLE_DEFAULTS.baseUrl,
        "custom-image",
      );

      const node = await createProviderNode({
        id: `${CUSTOM_IMAGE_PREFIX}${generateId()}`,
        type: "custom-image",
        prefix: prefix.trim(),
        baseUrl: sanitizedBaseUrl,
        defaultSize: defaultSize?.trim() || "",
        name: name.trim(),
      });
      return NextResponse.json({ node }, { status: 201 });
    }

    return NextResponse.json({ error: "Invalid provider node type" }, { status: 400 });
  } catch (error) {
    console.log("Error creating provider node:", error);
    return NextResponse.json({ error: "Failed to create provider node" }, { status: 500 });
  }
}
