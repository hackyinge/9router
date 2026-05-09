import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { getApiKeys } from "@/lib/localDb";

/**
 * GET /api/usage/api-keys
 * Returns API key options for filtering request details.
 * - sub_user: only keys assigned to them
 * - others: all keys
 *
 * Note: this endpoint intentionally does NOT return the raw key string.
 */
const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "openrouterx-default-secret-change-me"
);

async function getAuthPayload(request) {
  const token = request.cookies.get("auth_token")?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload || null;
  } catch {
    return null;
  }
}

export async function GET(request) {
  try {
    const payload = await getAuthPayload(request);
    if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const isSubUser = payload.role === "sub_user";
    const userId = payload.userId || null;

    const keys = await getApiKeys(isSubUser ? { userId } : {});
    const apiKeys = (keys || []).map((k) => ({
      id: k.id,
      name: k.name,
    }));

    return NextResponse.json({ apiKeys });
  } catch (error) {
    console.error("[API] Failed to get api keys:", error);
    return NextResponse.json({ error: "Failed to fetch api keys" }, { status: 500 });
  }
}

