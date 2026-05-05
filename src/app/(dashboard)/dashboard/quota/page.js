import { Suspense } from "react";
import { CardSkeleton } from "@/shared/components/Loading";
import ProviderLimits from "../usage/components/ProviderLimits";

export default function QuotaPage() {
  return (
    <Suspense fallback={<CardSkeleton />}>
      <QuotaPageClient />
    </Suspense>
  );
}

function QuotaPageClient() {
  if (typeof window !== "undefined") {
    fetch("/api/auth/me")
      .then(r => r.json())
      .then(data => { if (data.role === "sub_user") window.location.href = "/dashboard/usage"; })
      .catch(() => {});
  }
  return <ProviderLimits />;
}
