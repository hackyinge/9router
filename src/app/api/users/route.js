import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { getUsers, createUser, updateUser, deleteUser } from "@/lib/localDb";
import { normalizeProviderIds } from "@/shared/utils/subUserAccess";

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "9router-default-secret-change-me"
);

/** Verify super_admin JWT from cookie */
async function verifySuperAdmin(request) {
  const token = request.cookies.get("auth_token")?.value;
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload.role === "super_admin";
  } catch {
    return false;
  }
}

// GET /api/users — list all sub-users (super_admin only)
export async function GET(request) {
  if (!(await verifySuperAdmin(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const users = await getUsers();
    return NextResponse.json({ users });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/users — create sub-user (super_admin only)
export async function POST(request) {
  if (!(await verifySuperAdmin(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const {
      username,
      password,
      role,
      permissions,
      displayName,
      allowedProviders,
    } = await request.json();
    if (!username || !password) {
      return NextResponse.json({ error: "username and password are required" }, { status: 400 });
    }
    const bcrypt = await import("bcryptjs");
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await createUser({
      username,
      passwordHash,
      role: role || "sub_user",
      permissions: permissions || [],
      displayName: displayName || username,
      allowedProviders: normalizeProviderIds(allowedProviders),
    });
    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
