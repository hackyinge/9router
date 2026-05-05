import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { getUsageHistory } from "@/lib/usageDb";

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "9router-default-secret-change-me"
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
    const filter = {
      provider: searchParams.get("provider") || undefined,
      model: searchParams.get("model") || undefined,
      startDate: searchParams.get("startDate") || undefined,
      endDate: searchParams.get("endDate") || undefined,
    };

    const userId = await getSubUserId(request);
    if (userId) filter.userId = userId;

    const history = await getUsageHistory(filter);
    return NextResponse.json({ history });
  } catch (error) {
    console.error("Error fetching usage history:", error);
    return NextResponse.json({ error: "Failed to fetch usage history" }, { status: 500 });
  }
}
