import { cookies } from "next/headers";
import { DashboardLayout } from "@/shared/components";
import { UserRoleProvider } from "@/shared/components/UserRoleProvider";
import { getDashboardAuthSession } from "@/lib/auth/dashboardSession";

async function getRoleFromCookie() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("auth_token")?.value;
    if (!token) return null;
    const payload = await getDashboardAuthSession(token);
    if (!payload) return null;
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
