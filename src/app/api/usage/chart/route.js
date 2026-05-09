import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { getChartData } from "@/lib/usageDb";

const VALID_PERIODS = new Set(["24h", "7d", "30d", "60d"]);
const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "openrouterx-default-secret-change-me"
);

async function getSubUserId(request) {
  const token = request.cookies.get("auth_token")?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload.role === "sub_user" ? payload.userId : null;
  } catch {
    return null;
  }
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
