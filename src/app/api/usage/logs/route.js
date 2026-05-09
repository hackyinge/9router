import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { getRecentLogs } from "@/lib/usageDb";

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "openrouterx-default-secret-change-me"
);

/** Extract sub-user userId from JWT (null for super_admin) */
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
    const limit = parseInt(searchParams.get("limit") || "200", 10);

    const userId = await getSubUserId(request);
    const filter = userId ? { userId } : {};
    const logs = await getRecentLogs(limit, filter);
    return NextResponse.json(logs);
  } catch (error) {
    console.error("Error fetching logs:", error);
    return NextResponse.json({ error: "Failed to fetch logs" }, { status: 500 });
  }
}
