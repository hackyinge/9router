import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { getUserById, updateUser, deleteUser } from "@/lib/localDb";
import {
  normalizeProviderConnectionIds,
  normalizeProviderIds,
} from "@/shared/utils/subUserAccess";

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "openrouterx-default-secret-change-me"
);

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

// GET /api/users/[id] — get single sub-user
export async function GET(request, { params }) {
  if (!(await verifySuperAdmin(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const user = await getUserById(id);
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ user });
}

// PATCH /api/users/[id] — update sub-user (role, permissions, displayName, password)
export async function PATCH(request, { params }) {
  if (!(await verifySuperAdmin(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const { id } = await params;
    const body = await request.json();
    const update = {
      role: body.role,
      permissions: body.permissions,
      displayName: body.displayName,
      allowedProviders: normalizeProviderIds(body.allowedProviders),
      allowedProviderConnectionIds: normalizeProviderConnectionIds(body.allowedProviderConnectionIds),
      showQuotaTracker: body.showQuotaTracker !== false,
    };
    if (body.password) {
      const bcrypt = await import("bcryptjs");
      update.passwordHash = await bcrypt.hash(body.password, 10);
    }
    const user = await updateUser(id, update);
    if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ user });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

// DELETE /api/users/[id] — delete sub-user
export async function DELETE(request, { params }) {
  if (!(await verifySuperAdmin(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const deleted = await deleteUser(id);
  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
