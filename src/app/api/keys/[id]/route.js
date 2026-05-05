import { NextResponse } from "next/server";
import { deleteApiKey, getApiKeyById, updateApiKey, assignApiKeyToUser, unassignApiKey } from "@/lib/localDb";
import { jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "9router-default-secret-change-me"
);

async function getRouteKeyId(request, params) {
  const resolved = await params;
  if (resolved?.id) return resolved.id;
  const segments = request.nextUrl.pathname.split("/").filter(Boolean);
  return segments[segments.length - 1] || null;
}

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

// GET /api/keys/[id] - Get single key
export async function GET(request, { params }) {
  if (!(await verifySuperAdmin(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const id = await getRouteKeyId(request, params);
    const key = await getApiKeyById(id);
    if (!key) return NextResponse.json({ error: "Key not found" }, { status: 404 });
    return NextResponse.json({ key });
  } catch (error) {
    console.log("Error fetching key:", error);
    return NextResponse.json({ error: "Failed to fetch key" }, { status: 500 });
  }
}

// PATCH /api/keys/[id] - Assign key to user, update isActive, or unassign
// Body: { userId?: string | null, isActive?: boolean }
export async function PATCH(request, { params }) {
  if (!(await verifySuperAdmin(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const id = await getRouteKeyId(request, params);
    const { userId, isActive } = await request.json();
    const existing = await getApiKeyById(id);
    if (!existing) return NextResponse.json({ error: "Key not found" }, { status: 404 });

    // Assign / unassign userId
    if (userId !== undefined) {
      if (userId === null) {
        await unassignApiKey(id);
      } else {
        await assignApiKeyToUser(id, userId);
      }
    }

    // Update isActive
    if (isActive !== undefined) {
      await updateApiKey(id, { isActive });
    }

    const updated = await getApiKeyById(id);
    return NextResponse.json({ key: updated });
  } catch (error) {
    console.log("Error updating key:", error);
    return NextResponse.json({ error: "Failed to update key" }, { status: 500 });
  }
}

// DELETE /api/keys/[id] - Soft-delete (set isActive=false)
export async function DELETE(request, { params }) {
  if (!(await verifySuperAdmin(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const id = await getRouteKeyId(request, params);
    const updated = await updateApiKey(id, { isActive: false });
    if (!updated) return NextResponse.json({ error: "Key not found" }, { status: 404 });
    return NextResponse.json({ message: "Key deleted successfully" });
  } catch (error) {
    console.log("Error deleting key:", error);
    return NextResponse.json({ error: "Failed to delete key" }, { status: 500 });
  }
}
