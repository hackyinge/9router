"use client";

import { Suspense, useEffect, useState } from "react";
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
  const [auth, setAuth] = useState({ loading: true, role: null, showQuotaTracker: true });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.role === "sub_user" && data.showQuotaTracker === false) {
          window.location.href = "/dashboard/user";
          return;
        }
        setAuth({
          loading: false,
          role: data.role || null,
          showQuotaTracker: data.showQuotaTracker !== false,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setAuth({ loading: false, role: null, showQuotaTracker: true });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (auth.loading) return <CardSkeleton />;
  return <ProviderLimits readOnly={auth.role === "sub_user"} />;
}
