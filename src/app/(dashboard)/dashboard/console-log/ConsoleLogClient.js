"use client";

import { useEffect } from "react";
import ConsoleLogPanel from "./ConsoleLogPanel";

export default function ConsoleLogClient() {
  useEffect(() => {
    fetch("/api/auth/me")
      .then(r => r.json())
      .then(data => { if (data.role === "sub_user") window.location.href = "/dashboard/usage"; })
      .catch(() => {});
  }, []);

  return (
    <div className="">
      <ConsoleLogPanel />
    </div>
  );
}
