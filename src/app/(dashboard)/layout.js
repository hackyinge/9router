import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { DashboardLayout } from "@/shared/components";
import { UserRoleProvider } from "@/shared/components/UserRoleProvider";

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "9router-default-secret-change-me"
);

async function getRoleFromCookie() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("auth_token")?.value;
    if (!token) return null;
    const { payload } = await jwtVerify(token, SECRET);
    return {
      role: payload.role || null,
      userId: payload.userId || null,
      displayName: payload.displayName || null,
    };
  } catch {
    return null;
  }
}

export default async function DashboardRootLayout({ children }) {
  const auth = await getRoleFromCookie();
  return (
    <UserRoleProvider role={auth?.role} userId={auth?.userId} displayName={auth?.displayName}>
      <DashboardLayout>{children}</DashboardLayout>
    </UserRoleProvider>
  );
}

