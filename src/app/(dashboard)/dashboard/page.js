import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { getMachineId } from "@/shared/utils/machine";
import EndpointPageClient from "./endpoint/EndpointPageClient";

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "openrouterx-default-secret-change-me"
);

async function getAuthFromCookie() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("auth_token")?.value;
    if (!token) return null;
    const { payload } = await jwtVerify(token, SECRET);
    return payload;
  } catch {
    return null;
  }
}

export default async function DashboardPage() {
  const auth = await getAuthFromCookie();

  // Sub-users are redirected to usage dashboard
  if (auth?.role === "sub_user") {
    redirect("/dashboard/usage");
  }

  const machineId = await getMachineId();
  return <EndpointPageClient machineId={machineId} />;
}
