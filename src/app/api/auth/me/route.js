import { NextResponse } from "next/server";
import { getSettings, getUserById } from "@/lib/localDb";
import { getDashboardAuthSession } from "@/lib/auth/dashboardSession";
import {
  getEffectiveAllowedProviderConnectionIds,
  getEffectiveAllowedProviders,
} from "@/shared/utils/subUserAccess";

// GET /api/auth/me — return current user info from JWT (no auth check, returns null if not logged in)
export async function GET(request) {
  try {
    const token = request.cookies.get("auth_token")?.value;
    if (!token) return NextResponse.json({ role: null, userId: null });

    const payload = await getDashboardAuthSession(token);
    if (!payload) return NextResponse.json({ role: null, userId: null });
    const currentUser =
      payload.role === "sub_user" && payload.userId
        ? await getUserById(payload.userId)
        : null;
    const settings = await getSettings();
    const providerThinkingScopeKey = currentUser?.id || payload.userId || "super_admin";
    const accountProviderThinking =
      currentUser?.role === "sub_user"
        ? currentUser?.providerThinking || {}
        : (settings.userProviderThinking || {})[providerThinkingScopeKey] || {};

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
      allowedProviderConnectionIds:
        currentUser?.role === "sub_user"
          ? getEffectiveAllowedProviderConnectionIds(currentUser)
          : payload.allowedProviderConnectionIds || null,
      providerThinkingScopeKey,
      providerThinking: accountProviderThinking,
    });
  } catch {
    return NextResponse.json({ role: null, userId: null });
  }
}
