import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { getRecentLogs } from "@/lib/usageDb";

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "9router-default-secret-change-me"
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
    const userId = await getSubUserId(request);
    const filter = userId ? { userId } : {};
    const logs = await getRecentLogs(200, filter);
    return NextResponse.json(logs);
  } catch (error) {
    console.error("[API ERROR] /api/usage/logs failed:", error);
    console.error("[API ERROR] Stack:", error?.stack);
    return NextResponse.json({ error: "Failed to fetch logs" }, { status: 500 });
  }
}
