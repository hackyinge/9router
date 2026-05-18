"use server";

import { NextResponse } from "next/server";
import { getMitmAlias, setMitmAliasAll } from "@/models";
import { writeAliasForTool } from "@/lib/mitmAliasCache";

const DEFAULT_ANTIGRAVITY_ALIASES = {
  "gemini-3.1-pro-high": "gemini-3.1-pro-high",
  "gemini-3.1-pro-low": "gemini-3.1-pro-low",
  "gemini-3-flash-agent": "cx/gpt-5.5",
  "gemini-3-flash": "cx/gpt-5.5",
  "claude-sonnet-4-6": "claude-sonnet-4-6",
  "claude-opus-4-6-thinking": "claude-opus-4-6-thinking",
  "gpt-oss-120b-medium": "gpt-oss-120b-medium",
};

// GET - Get MITM aliases for a tool
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const toolName = searchParams.get("tool");
    let aliases = await getMitmAlias(toolName || undefined);
    if (toolName === "antigravity" && Object.keys(aliases || {}).length === 0) {
      aliases = DEFAULT_ANTIGRAVITY_ALIASES;
      await setMitmAliasAll(toolName, aliases);
    }
    return NextResponse.json({ aliases });
  } catch (error) {
    console.log("Error fetching MITM aliases:", error.message);
    return NextResponse.json({ error: "Failed to fetch aliases" }, { status: 500 });
  }
}

// PUT - Save MITM aliases for a specific tool
export async function PUT(request) {
  try {
    const { tool, mappings } = await request.json();

    if (!tool || !mappings || typeof mappings !== "object") {
      return NextResponse.json({ error: "tool and mappings required" }, { status: 400 });
    }


    const filtered = {};
    for (const [alias, model] of Object.entries(mappings)) {
      if (model && model.trim()) {
        filtered[alias] = model.trim();
      }
    }

    await setMitmAliasAll(tool, filtered);
    writeAliasForTool(tool, filtered);
    return NextResponse.json({ success: true, aliases: filtered });
  } catch (error) {
    console.log("Error saving MITM aliases:", error.message);
    return NextResponse.json({ error: "Failed to save aliases" }, { status: 500 });
  }
}
