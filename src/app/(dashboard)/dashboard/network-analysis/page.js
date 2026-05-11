"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Card } from "@/shared/components";

function verdictConfig(verdict) {
  if (verdict === "healthy") {
    return {
      label: "Healthy",
      variant: "success",
      title: "No transport errors in sampled logs",
      detail: "The current app log window does not show route loss, DNS failures, proxy timeout, or socket reset patterns.",
    };
  }
  if (verdict === "upstream_or_socket_instability") {
    return {
      label: "Socket resets",
      variant: "warning",
      title: "Upstream sockets were interrupted",
      detail: "Requests were reset while in flight. This can come from upstream, Wi-Fi churn, or an intermediate proxy.",
    };
  }
  return {
    label: "External route instability",
    variant: "warning",
    title: "Network path instability is affecting OpenrouterX",
    detail: "The log pattern points to local route loss, transient TLS disconnects, or the configured upstream proxy timing out before API calls complete.",
  };
}

function countActive(value) {
  return Array.isArray(value) ? value.length : 0;
}

function formatDate(value) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString();
}

function Snippet({ label, value, skipValue = false }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase text-text-muted/70">{label}</p>
      <p className="mt-1 break-words text-sm text-text-main" data-i18n-skip={skipValue ? "true" : undefined}>
        {value || "None"}
      </p>
    </div>
  );
}

function Metric({ icon, label, value, tone = "default" }) {
  const toneClass = {
    default: "text-text-main",
    warning: "text-yellow-600 dark:text-yellow-400",
    error: "text-red-600 dark:text-red-400",
    success: "text-green-600 dark:text-green-400",
  }[tone];

  return (
    <div className="flex min-h-20 items-center gap-3 rounded-lg border border-border-subtle bg-bg px-4 py-3">
      <span className={`material-symbols-outlined text-[22px] ${toneClass}`}>{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-text-muted">{label}</p>
        <p className={`mt-1 text-lg font-semibold ${toneClass}`}>{value}</p>
      </div>
    </div>
  );
}

export default function NetworkAnalysisPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchDiagnostics = useCallback(async ({ setBusy = true } = {}) => {
    if (setBusy) setLoading(true);
    if (setBusy) setError("");
    try {
      const res = await fetch("/api/network-analysis", { cache: "no-store" });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to load diagnostics");
      setData(payload);
    } catch (err) {
      setError(err.message || "Failed to load diagnostics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((payload) => {
        if (payload.role === "sub_user") window.location.href = "/dashboard/usage";
      })
      .catch(() => {});
    const timer = setTimeout(() => {
      fetchDiagnostics({ setBusy: false });
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchDiagnostics]);

  const verdict = useMemo(() => verdictConfig(data?.verdict), [data?.verdict]);
  const counts = data?.logs?.errorCounts || {};
  const project = data?.project || {};
  const outboundProxy = project.outboundProxy || {};
  const mitm = project.mitm || {};

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={verdict.variant} dot>{verdict.label}</Badge>
            {data?.generatedAt && (
              <span className="text-xs text-text-muted">
                <span>Updated</span>{" "}
                <span data-i18n-skip="true">{formatDate(data.generatedAt)}</span>
              </span>
            )}
          </div>
          <h2 className="mt-2 text-xl font-semibold text-text-main">{verdict.title}</h2>
          <p className="mt-1 max-w-3xl text-sm text-text-muted">{verdict.detail}</p>
        </div>
        <Button icon="refresh" variant="outline" loading={loading} onClick={fetchDiagnostics}>
          Refresh
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Metric icon="route" label="Route loss" value={counts.EADDRNOTAVAIL || 0} tone={(counts.EADDRNOTAVAIL || 0) > 0 ? "warning" : "success"} />
        <Metric icon="sync_problem" label="Socket resets" value={(counts.ECONNRESET || 0) + (counts.TLS_DISCONNECTED || 0)} tone={(counts.ECONNRESET || counts.TLS_DISCONNECTED) ? "warning" : "success"} />
        <Metric icon="vpn_lock" label="Proxy failures" value={counts.PROXY_FAILED || 0} tone={(counts.PROXY_FAILED || 0) > 0 ? "warning" : "success"} />
        <Metric icon="dns" label="DNS errors" value={(counts.ENOTFOUND || 0) + (counts.EAI_AGAIN || 0)} tone={(counts.ENOTFOUND || counts.EAI_AGAIN) ? "error" : "success"} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_1.1fr]">
        <Card title="Project Network Scope" icon="hub" padding="md">
          <div className="grid gap-4 sm:grid-cols-2">
            <Snippet label="System proxy" value={project.systemProxyEnabled ? "Enabled outside OpenrouterX" : "No macOS system proxy detected"} />
            <Snippet label="Risk level" value={project.riskLevel || "Unknown"} />
            <Snippet label="Outbound proxy" value={outboundProxy.enabled ? outboundProxy.url : "Disabled"} skipValue={outboundProxy.enabled} />
            <Snippet
              label="Outbound scope"
              value={
                outboundProxy.scope === "targeted" ? (
                  <>
                    <span>Targeted</span>: <span data-i18n-skip="true">{(outboundProxy.targets || []).join(", ")}</span>
                  </>
                ) : outboundProxy.scope
              }
            />
            <Snippet label="MITM" value={mitm.enabled ? "Enabled" : "Disabled"} />
            <Snippet label="MITM DNS tools" value={countActive(mitm.enabledTools) ? mitm.enabledTools.join(", ") : "None"} skipValue={countActive(mitm.enabledTools) > 0} />
            <Snippet label="Cloudflare tunnel" value={project.tunnels?.cloudflareEnabled ? "Enabled" : "Disabled"} />
            <Snippet label="Tailscale" value={project.tunnels?.tailscaleEnabled ? "Enabled" : "Disabled"} />
          </div>
        </Card>

        <Card title="Current Machine State" icon="monitor_heart" padding="md">
          <div className="grid gap-4 sm:grid-cols-2">
            <Snippet label="Platform" value={data?.system?.platform} skipValue />
            <Snippet label="Hostname" value={data?.system?.hostname} skipValue />
            <Snippet label="Default route" value={(data?.system?.route?.output || "").match(/interface:\s*(\S+)/)?.[1] || "Unknown"} skipValue />
            <Snippet label="Wi-Fi status" value={(data?.system?.ifconfig?.output || "").match(/status:\s*(\S+)/)?.[1] || "Unknown"} />
          </div>
          <details className="mt-4 rounded-lg border border-border-subtle bg-bg p-3">
            <summary className="cursor-pointer text-sm font-semibold text-text-main">Raw DNS and proxy snapshot</summary>
            <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs text-text-muted">
              {[
                "--- scutil --proxy ---",
                data?.system?.proxy?.output || "Unavailable",
                "--- scutil --dns ---",
                data?.system?.dns?.output || "Unavailable",
              ].join("\n")}
            </pre>
          </details>
        </Card>
      </div>

      <Card title="Findings" icon="fact_check" padding="md">
        <div className="space-y-3">
          {(data?.logs?.findings || []).map((finding, index) => (
            <div key={`${finding.title}-${index}`} className="rounded-lg border border-border-subtle bg-bg p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={finding.severity === "warning" ? "warning" : finding.severity === "success" ? "success" : "info"}>
                  {finding.severity}
                </Badge>
                <h3 className="text-sm font-semibold text-text-main">{finding.title}</h3>
              </div>
              <p className="mt-2 text-sm text-text-muted">{finding.detail}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Network Error Timeline" icon="timeline" padding="md">
        {(data?.logs?.timeline || []).length === 0 ? (
          <p className="text-sm text-text-muted">No network transport errors in the sampled logs.</p>
        ) : (
          <div className="max-h-[520px] overflow-auto rounded-lg border border-border-subtle">
            {(data?.logs?.timeline || []).slice().reverse().map((event, index) => (
              <div key={`${event.time}-${index}`} className="border-b border-border-subtle bg-bg p-3 last:border-b-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-text-muted" data-i18n-skip="true">{event.time || "unknown"}</span>
                  <Badge size="sm" variant={event.source === "mitm" ? "primary" : "default"}>{event.source}</Badge>
                  {event.categories.map((category) => (
                    <Badge key={category} size="sm" variant={category === "EADDRNOTAVAIL" ? "warning" : "default"} className="uppercase" data-i18n-skip="true">{category}</Badge>
                  ))}
                </div>
                <p className="mt-2 break-words font-mono text-xs text-text-muted" data-i18n-skip="true">{event.message}</p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
