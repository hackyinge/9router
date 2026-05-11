import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const ROOT_DIR = path.resolve(import.meta.dirname, "../..");

const NETWORK_ANALYSIS_LITERALS = [
  "Network Analysis",
  "Diagnose local connectivity, proxy, DNS, and MITM network impact",
  "Healthy",
  "No transport errors in sampled logs",
  "The current app log window does not show route loss, DNS failures, proxy timeout, or socket reset patterns.",
  "Socket resets",
  "Upstream sockets were interrupted",
  "Requests were reset while in flight. This can come from upstream, Wi-Fi churn, or an intermediate proxy.",
  "External route instability",
  "Network path instability is affecting OpenrouterX",
  "The log pattern points to local route loss, transient TLS disconnects, or the configured upstream proxy timing out before API calls complete.",
  "Updated",
  "Refresh",
  "Route loss",
  "Proxy failures",
  "DNS errors",
  "Project Network Scope",
  "System proxy",
  "No macOS system proxy detected",
  "Enabled outside OpenrouterX",
  "Risk level",
  "Outbound proxy",
  "Outbound scope",
  "Targeted",
  "MITM DNS tools",
  "Cloudflare tunnel",
  "Tailscale",
  "Current Machine State",
  "Platform",
  "Hostname",
  "Default route",
  "Wi-Fi status",
  "Raw DNS and proxy snapshot",
  "Findings",
  "warning",
  "success",
  "info",
  "Local route became unavailable",
  "EADDRNOTAVAIL means Node could not allocate a usable local outbound address at that moment. This normally points to Wi-Fi/DHCP/route churn or VPN/proxy path loss before an upstream request completed.",
  "Configured outbound proxy timed out",
  "OpenrouterX fell back after the configured proxy connection timed out. Because the app stores this as a targeted proxy allowlist, the failure affects selected upstream API calls rather than macOS global networking.",
  "Existing TLS sockets were reset",
  "TLS disconnects and ECONNRESET are consistent with transient network drops, upstream resets, or proxy interruption while MITM passthrough traffic was active.",
  "No recent network transport errors in app logs",
  "The sampled OpenrouterX logs do not currently show connection resets, route loss, DNS failures, or proxy timeouts.",
  "Network Error Timeline",
  "No network transport errors in the sampled logs.",
  "Unknown",
  "None",
  "Disabled",
  "Enabled",
  "low",
  "medium",
  "high",
];

function readLocale(locale) {
  return JSON.parse(
    fs.readFileSync(path.join(ROOT_DIR, "public", "i18n", "literals", `${locale}.json`), "utf8")
  );
}

describe("Network Analysis i18n literals", () => {
  it.each(["zh-CN", "zh-TW"])("%s covers every Network Analysis literal", (locale) => {
    const translations = readLocale(locale);
    const missing = NETWORK_ANALYSIS_LITERALS.filter((literal) => !translations[literal]);
    expect(missing).toEqual([]);
  });
});
