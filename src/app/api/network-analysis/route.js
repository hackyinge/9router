import { NextResponse } from "next/server";

import { collectNetworkDiagnostics } from "@/lib/network/networkDiagnostics.js";
import { getSettings } from "@/lib/localDb.js";
import { getMitmStatus } from "@/mitm/manager";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const settings = await getSettings();
    let dnsStatus = {};
    try {
      const mitmStatus = await getMitmStatus();
      dnsStatus = mitmStatus?.dnsStatus || {};
    } catch {
      dnsStatus = {};
    }

    const diagnostics = await collectNetworkDiagnostics({ settings, dnsStatus });
    return NextResponse.json(diagnostics);
  } catch (error) {
    console.error("[API ERROR] /api/network-analysis failed:", error);
    return NextResponse.json(
      { error: "Failed to collect network diagnostics" },
      { status: 500 }
    );
  }
}
