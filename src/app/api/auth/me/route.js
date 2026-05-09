import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { getUserById } from "@/lib/localDb";
import { getEffectiveAllowedProviders } from "@/shared/utils/subUserAccess";

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "openrouterx-default-secret-change-me"
);

// GET /api/auth/me — return current user info from JWT (no auth check, returns null if not logged in)
export async function GET(request) {
  try {
    const token = request.cookies.get("auth_token")?.value;
    if (!token) return NextResponse.json({ role: null, userId: null });

    const { payload } = await jwtVerify(token, SECRET);
    const currentUser =
      payload.role === "sub_user" && payload.userId
        ? await getUserById(payload.userId)
        : null;

    return NextResponse.json({
      role: currentUser?.role || payload.role || null,
      userId: currentUser?.id || payload.userId || null,
      username: currentUser?.username || payload.username || null,
      displayName: currentUser?.displayName || payload.displayName || null,
      permissions: currentUser?.permissions || payload.permissions || [],
      showQuotaTracker:
        currentUser?.role === "sub_user"
          ? currentUser?.showQuotaTracker !== false
          : true,
      allowedProviders:
        currentUser?.role === "sub_user"
          ? getEffectiveAllowedProviders(currentUser)
          : payload.allowedProviders || [],
    });
  } catch {
    return NextResponse.json({ role: null, userId: null });
  }
}
