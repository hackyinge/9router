import { NextResponse } from "next/server";
import { getSettings, getUserByUsername } from "@/lib/localDb";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
import { cookies } from "next/headers";
import { getEffectiveAllowedProviders } from "@/shared/utils/subUserAccess";

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "9router-default-secret-change-me"
);

function isTunnelRequest(request, settings) {
  const host = (request.headers.get("host") || "").split(":")[0].toLowerCase();
  const tunnelHost = settings.tunnelUrl ? new URL(settings.tunnelUrl).hostname.toLowerCase() : "";
  const tailscaleHost = settings.tailscaleUrl ? new URL(settings.tailscaleUrl).hostname.toLowerCase() : "";
  return (tunnelHost && host === tunnelHost) || (tailscaleHost && host === tailscaleHost);
}

export async function POST(request) {
  try {
    const { password, loginAs, username } = await request.json();
    const settings = await getSettings();

    // Block login via tunnel/tailscale if dashboard access is disabled
    if (isTunnelRequest(request, settings) && settings.tunnelDashboardAccess !== true) {
      return NextResponse.json({ error: "Dashboard access via tunnel is disabled" }, { status: 403 });
    }

    // ── Super Admin login ─────────────────────────────────────────
    if (loginAs !== "sub_user") {
      const storedHash = settings.password;
      let isValid = false;
      if (storedHash) {
        isValid = await bcrypt.compare(password, storedHash);
      } else {
        const initialPassword = process.env.INITIAL_PASSWORD || "123456";
        isValid = password === initialPassword;
      }

      if (isValid) {
        const forceSecureCookie = process.env.AUTH_COOKIE_SECURE === "true";
        const forwardedProto = request.headers.get("x-forwarded-proto");
        const useSecureCookie = forceSecureCookie || forwardedProto === "https";

        const token = await new SignJWT({
          authenticated: true,
          role: "super_admin",
          permissions: ["*"],
        })
          .setProtectedHeader({ alg: "HS256" })
          .setExpirationTime("24h")
          .sign(SECRET);

        const cookieStore = await cookies();
        cookieStore.set("auth_token", token, {
          httpOnly: true,
          secure: useSecureCookie,
          sameSite: "lax",
          path: "/",
        });

        return NextResponse.json({ success: true, role: "super_admin" });
      }

      return NextResponse.json({ error: "Invalid password" }, { status: 401 });
    }

    // ── Sub-user login ───────────────────────────────────────────
    if (!username || !password) {
      return NextResponse.json({ error: "Username and password are required" }, { status: 400 });
    }

    const subUser = await getUserByUsername(username);
    if (!subUser) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const isPasswordValid = await bcrypt.compare(password, subUser.passwordHash);
    if (!isPasswordValid) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const forceSecureCookie = process.env.AUTH_COOKIE_SECURE === "true";
    const forwardedProto = request.headers.get("x-forwarded-proto");
    const useSecureCookie = forceSecureCookie || forwardedProto === "https";

    const subToken = await new SignJWT({
      authenticated: true,
      userId: subUser.id,
      username: subUser.username,
      displayName: subUser.displayName,
      role: subUser.role || "sub_user",
      permissions: subUser.permissions || [],
      showQuotaTracker: subUser.showQuotaTracker !== false,
      allowedProviders: getEffectiveAllowedProviders(subUser),
    })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("24h")
      .sign(SECRET);

    const cookieStore = await cookies();
    cookieStore.set("auth_token", subToken, {
      httpOnly: true,
      secure: useSecureCookie,
      sameSite: "lax",
      path: "/",
    });

    return NextResponse.json({ success: true, role: subUser.role || "sub_user" });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
