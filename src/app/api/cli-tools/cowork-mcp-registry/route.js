"use server";

import { NextResponse } from "next/server";

const REGISTRY_URL = "https://api.anthropic.com/mcp-registry/v0/servers";
const VISIBILITY = "commercial,gsuite,gsuite-google";
const PLUGINS_REPO = "anthropics/knowledge-work-plugins";
const GH_API = "https://api.github.com";
const GH_RAW = "https://raw.githubusercontent.com";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1h

const G_KEY = "__9routerCoworkMcpRegistryCache";
function gcache() {
  if (!globalThis[G_KEY]) globalThis[G_KEY] = { ts: 0, data: null };
  return globalThis[G_KEY];
}

// Fetch full registry across pagination
async function fetchRegistry() {
  const out = [];
  let cursor = "";
  for (let i = 0; i < 20; i++) {
    const url = `${REGISTRY_URL}?limit=500&visibility=${VISIBILITY}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const r = await fetch(url, { headers: { "accept": "application/json" } });
    if (!r.ok) break;
    const j = await r.json();
    for (const item of j.servers || []) {
      const s = item.server || {};
      const remote = (s.remotes || [])[0];
      if (!remote?.url) continue;
      const transport = remote.type === "streamable-http" ? "http" : (remote.type === "sse" ? "sse" : "http");
      out.push({
        source: "registry",
        name: s.name,
        title: s.title || s.name,
        description: s.description || "",
        url: remote.url,
        transport,
      });
    }
    cursor = j.metadata?.nextCursor;
    if (!cursor) break;
  }
  return out;
}

// Fetch plugins from anthropics/knowledge-work-plugins. Each plugin folder contains
// .claude-plugin/plugin.json with mcp_servers map.
async function fetchPlugins() {
  const r = await fetch(`${GH_API}/repos/${PLUGINS_REPO}/contents/`, { headers: { "accept": "application/vnd.github.v3+json" } });
  if (!r.ok) return [];
  const items = await r.json();
  const dirs = items.filter((i) => i.type === "dir" && !i.name.startsWith(".") && i.name !== "partner-built");
  const out = [];
  await Promise.all(dirs.map(async (d) => {
    try {
      const url = `${GH_RAW}/${PLUGINS_REPO}/main/${d.name}/.claude-plugin/plugin.json`;
      const pr = await fetch(url);
      if (!pr.ok) return;
      const pj = await pr.json();
      const servers = pj.mcp_servers || pj.mcpServers || {};
      for (const [key, srv] of Object.entries(servers)) {
        if (!srv?.url || typeof srv.url !== "string") continue;
        if (!/^https?:\/\//i.test(srv.url)) continue;
        const transport = /\/sse(\b|\/)/i.test(srv.url) ? "sse" : (srv.type === "sse" ? "sse" : "http");
        out.push({
          source: "plugins",
          plugin: d.name,
          name: `${d.name}-${key}`,
          title: pj.name || d.name,
          description: pj.description || "",
          url: srv.url,
          transport,
        });
      }
    } catch { /* skip */ }
  }));
  return out;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const force = searchParams.get("refresh") === "1";
  const cache = gcache();
  if (!force && cache.data && Date.now() - cache.ts < CACHE_TTL_MS) {
    return NextResponse.json({ cached: true, ...cache.data });
  }
  try {
    const [registry, plugins] = await Promise.all([fetchRegistry(), fetchPlugins()]);
    // Deduplicate by url
    const seen = new Set();
    const merged = [...registry, ...plugins].filter((s) => {
      if (seen.has(s.url)) return false;
      seen.add(s.url);
      return true;
    });
    const data = { servers: merged, counts: { registry: registry.length, plugins: plugins.length, total: merged.length } };
    cache.ts = Date.now();
    cache.data = data;
    return NextResponse.json({ cached: false, ...data });
  } catch (e) {
    return NextResponse.json({ error: e.message, servers: [], counts: { total: 0 } }, { status: 500 });
  }
}
