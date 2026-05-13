"use client";

import { useEffect, useState } from "react";
import { MITM_TOOLS } from "@/shared/constants/cliTools";
import { getModelsByProviderId } from "@/shared/constants/models";
import { isAnthropicCompatibleProvider, isOpenAICompatibleProvider } from "@/shared/constants/providers";
import { MitmServerCard, MitmToolCard } from "@/app/(dashboard)/dashboard/cli-tools/components";
import ConsoleLogPanel from "@/app/(dashboard)/dashboard/console-log/ConsoleLogPanel";
import ProviderLimits from "@/app/(dashboard)/dashboard/usage/components/ProviderLimits";
import {
  createDefaultMitmToolVisibility,
  normalizeMitmToolVisibility,
} from "./providerVisibility";

const FOCUS_MITM_TOOLS = Object.entries(MITM_TOOLS);
const FOCUS_MITM_TOOL_IDS = FOCUS_MITM_TOOLS.map(([toolId]) => toolId);
const PROVIDER_VISIBILITY_STORAGE_KEY = "focus-ui-mitm-tool-visibility";
const DEFAULT_MITM_TOOL_VISIBILITY = createDefaultMitmToolVisibility(FOCUS_MITM_TOOL_IDS);

export default function FocusUIPageClient() {
  const [connections, setConnections] = useState([]);
  const [apiKeys, setApiKeys] = useState([]);
  const [modelAliases, setModelAliases] = useState({});
  const [cloudEnabled, setCloudEnabled] = useState(false);
  const [expandedTool, setExpandedTool] = useState(null);
  const [serverExpanded, setServerExpanded] = useState(true);
  const [providersExpanded, setProvidersExpanded] = useState(true);
  const [quotaExpanded, setQuotaExpanded] = useState(true);
  const [logsExpanded, setLogsExpanded] = useState(true);
  const [visibleTools, setVisibleTools] = useState(DEFAULT_MITM_TOOL_VISIBILITY);
  const [visibilityLoaded, setVisibilityLoaded] = useState(false);
  const [mitmStatus, setMitmStatus] = useState({ running: false, certExists: false, dnsStatus: {}, hasCachedPassword: false });

  useEffect(() => {
    fetch("/api/auth/me")
      .then(r => r.json())
      .then(data => { if (data.role === "sub_user") window.location.href = "/dashboard/usage"; })
      .catch(() => {});
    fetchConnections();
    fetchApiKeys();
    fetchAliases();
    fetchCloudSettings();
  }, []);

  useEffect(() => {
    try {
      const savedVisibility = JSON.parse(localStorage.getItem(PROVIDER_VISIBILITY_STORAGE_KEY) || "null");
      if (savedVisibility) {
        setVisibleTools(normalizeMitmToolVisibility(FOCUS_MITM_TOOL_IDS, savedVisibility));
      }
    } catch { /* ignore */ }
    setVisibilityLoaded(true);
  }, []);

  useEffect(() => {
    if (!visibilityLoaded) return;
    try {
      localStorage.setItem(PROVIDER_VISIBILITY_STORAGE_KEY, JSON.stringify(visibleTools));
    } catch { /* ignore */ }
  }, [visibilityLoaded, visibleTools]);

  const fetchConnections = async () => {
    try {
      const res = await fetch("/api/providers");
      if (res.ok) {
        const data = await res.json();
        setConnections(data.connections || []);
      }
    } catch { /* ignore */ }
  };

  const fetchApiKeys = async () => {
    try {
      const res = await fetch("/api/keys");
      if (res.ok) {
        const data = await res.json();
        setApiKeys(data.keys || []);
      }
    } catch { /* ignore */ }
  };

  const fetchAliases = async () => {
    try {
      const res = await fetch("/api/models/alias");
      if (res.ok) {
        const data = await res.json();
        setModelAliases(data.aliases || {});
      }
    } catch { /* ignore */ }
  };

  const fetchCloudSettings = async () => {
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const data = await res.json();
        setCloudEnabled(data.cloudEnabled || false);
      }
    } catch { /* ignore */ }
  };

  const getActiveProviders = () => connections.filter(c => c.isActive !== false);

  const hasActiveProviders = () => {
    const active = getActiveProviders();
    return active.some(conn =>
      getModelsByProviderId(conn.provider).length > 0 ||
      isOpenAICompatibleProvider(conn.provider) ||
      isAnthropicCompatibleProvider(conn.provider)
    );
  };

  const visibleMitmTools = FOCUS_MITM_TOOLS.filter(([toolId]) => visibleTools[toolId]);

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-6 overflow-hidden">
      <CollapsibleSection
        title="MITM Server"
        subtitle="MITM server status and controls"
        expanded={serverExpanded}
        onToggle={() => setServerExpanded((value) => !value)}
        bodyClassName="p-0"
        className="shrink-0"
      >
        <MitmServerCard
          apiKeys={apiKeys}
          cloudEnabled={cloudEnabled}
          onStatusChange={setMitmStatus}
        />
      </CollapsibleSection>

      <CollapsibleSection
        title="Providers"
        subtitle="MITM tool interception status"
        expanded={providersExpanded}
        onToggle={() => setProvidersExpanded((value) => !value)}
        className="shrink-0"
        headerControls={(
          <ProviderVisibilityControls
            tools={FOCUS_MITM_TOOLS}
            visibleTools={visibleTools}
            onToggleTool={(toolId) => setVisibleTools((current) => ({ ...current, [toolId]: !current[toolId] }))}
          />
        )}
      >
        <div className="grid gap-3 sm:gap-4">
          {visibleMitmTools.map(([toolId, tool]) => (
            <MitmToolCard
              key={toolId}
              tool={tool}
              isExpanded={expandedTool === toolId}
              onToggle={() => setExpandedTool(expandedTool === toolId ? null : toolId)}
              serverRunning={mitmStatus.running}
              dnsActive={mitmStatus.dnsStatus?.[toolId] || false}
              hasCachedPassword={mitmStatus.hasCachedPassword || false}
              needsSudoPassword={mitmStatus.needsSudoPassword !== false}
              isWin={mitmStatus.isWin === true}
              apiKeys={apiKeys}
              activeProviders={getActiveProviders()}
              hasActiveProviders={hasActiveProviders()}
              modelAliases={modelAliases}
              cloudEnabled={cloudEnabled}
              onDnsChange={(data) => setMitmStatus(prev => ({ ...prev, dnsStatus: data.dnsStatus ?? prev.dnsStatus }))}
            />
          ))}
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Quota Management"
        subtitle="Provider account quota overview"
        expanded={quotaExpanded}
        onToggle={() => setQuotaExpanded((value) => !value)}
        bodyClassName="p-4"
        className="shrink-0"
      >
        <ProviderLimits
          embedded
          title="Quota Management"
          gridClassName="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
          activeFirst
          maxRows={1}
          maxColumns={4}
        />
      </CollapsibleSection>

      <CollapsibleSection
        title="Console Logs"
        subtitle="MITM / OpenrouterX realtime output"
        expanded={logsExpanded}
        onToggle={() => setLogsExpanded((value) => !value)}
        bodyClassName="flex min-h-0 flex-1 flex-col p-3"
        className={logsExpanded ? "flex min-h-0 flex-1 flex-col" : "shrink-0"}
      >
        <ConsoleLogPanel
          active={logsExpanded}
          compact
          showToolbar
          heightClassName="min-h-0 flex-1"
        />
      </CollapsibleSection>
    </div>
  );
}

function ProviderVisibilityControls({ tools, visibleTools, onToggleTool }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2" onClick={(event) => event.stopPropagation()}>
      {tools.map(([toolId, tool]) => (
        <label
          key={toolId}
          className={`inline-flex min-h-8 cursor-pointer select-none items-center gap-2 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
            visibleTools[toolId]
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border bg-surface text-text-muted hover:border-primary/30 hover:text-text-main"
          }`}
        >
          <input
            type="checkbox"
            checked={visibleTools[toolId] === true}
            onChange={() => onToggleTool(toolId)}
            className="h-3.5 w-3.5 accent-primary"
          />
          <span>{tool.name}</span>
        </label>
      ))}
    </div>
  );
}

function CollapsibleSection({
  title,
  subtitle,
  expanded,
  onToggle,
  children,
  className = "",
  bodyClassName = "p-0",
  headerControls = null,
}) {
  return (
    <div className={`overflow-hidden rounded-xl border border-border bg-surface shadow-sm ${className}`}>
      <div className="flex w-full flex-col gap-3 px-4 py-3 transition-colors hover:bg-surface-2/60 lg:flex-row lg:items-center">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          aria-expanded={expanded}
        >
          <span className={`material-symbols-outlined text-[18px] text-text-muted transition-transform ${expanded ? "rotate-90" : ""}`}>
            chevron_right
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-semibold text-text-main">{title}</span>
            {subtitle && <span className="truncate text-xs text-text-muted">{subtitle}</span>}
          </span>
        </button>
        {headerControls && (
          <div className="min-w-0 flex-1 lg:px-3">
            {headerControls}
          </div>
        )}
        <button
          type="button"
          onClick={onToggle}
          className="self-start text-[10px] font-medium uppercase tracking-wide text-text-muted transition-colors hover:text-text-main lg:self-center"
          aria-expanded={expanded}
        >
          {expanded ? "Collapse" : "Expand"}
        </button>
      </div>
      {expanded && (
        <div className={`border-t border-border ${bodyClassName}`}>
          {children}
        </div>
      )}
    </div>
  );
}
