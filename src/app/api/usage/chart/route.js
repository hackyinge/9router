import { NextResponse } from "next/server";
import { getChartData } from "@/lib/usageDb";
import { getDashboardAuthSession } from "@/lib/auth/dashboardSession";

const VALID_PERIODS = new Set(["today", "24h", "7d", "30d", "60d"]);

async function getSubUserId(request) {
  const token = request.cookies.get("auth_token")?.value;
  if (!token) return null;
  const payload = await getDashboardAuthSession(token);
  return payload?.role === "sub_user" ? payload.userId : null;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "24h";

    if (!VALID_PERIODS.has(period)) {
      return NextResponse.json({ error: "Invalid period" }, { status: 400 });
    }

    const userId = await getSubUserId(request);
    const data = await getChartData(period, userId ? { userId } : {});
    return NextResponse.json(data);
  } catch (error) {
    console.error("[API] Failed to get chart data:", error);
    return NextResponse.json({ error: "Failed to fetch chart data" }, { status: 500 });
  }
}
