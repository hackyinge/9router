"use client";

import { useState, useEffect } from "react";
import { Card, Button, ModelSelectModal, ManualConfigModal } from "@/shared/components";
import Image from "next/image";
import EndpointPresetControl from "./EndpointPresetControl";

const CLOUD_URL = process.env.NEXT_PUBLIC_CLOUD_URL;

export default function DroidToolCard({
  tool,
  isExpanded,
  onToggle,
  baseUrl,
  hasActiveProviders,
  apiKeys,
  activeProviders,
  cloudEnabled,
  initialStatus,
  manualOnly = false,
}) {
  const [droidStatus, setDroidStatus] = useState(null);
  const [checkingDroid, setCheckingDroid] = useState(false);
  const [applying, setApplying] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [message, setMessage] = useState(null);
  const [selectedApiKey, setSelectedApiKey] = useState("");
  const [modelList, setModelList] = useState([]);
  const [modelInput, setModelInput] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [modelAliases, setModelAliases] = useState({});
  const [showManualConfigModal, setShowManualConfigModal] = useState(false);
  const [showInstallGuide, setShowInstallGuide] = useState(false);
  const [customBaseUrl, setCustomBaseUrl] = useState("");
  const effectiveStatus = droidStatus || initialStatus || null;
  const derivedModelList = (() => {
    const models = (effectiveStatus?.settings?.customModels || [])
      .filter((m) => m.id?.startsWith("custom:openrouterx"))
      .sort((a, b) => (a.index || 0) - (b.index || 0))
      .map((m) => m.model)
      .filter(Boolean);
    if (models.length > 0) return models;
    const legacy = effectiveStatus?.settings?.customModels?.find((m) => m.id === "custom:openrouterx-0");
    return legacy?.model ? [legacy.model] : [];
  })();
  const effectiveModelList = modelList.length > 0 ? modelList : derivedModelList;
  const effectiveSelectedApiKey = selectedApiKey || apiKeys?.[0]?.key || "";

  const getConfigStatus = () => {
    if (!effectiveStatus?.installed) return null;
    // Check for any OpenrouterX model entry (support multi-model: custom:openrouterx-0, custom:openrouterx-1, ...)
    const currentConfig = effectiveStatus.settings?.customModels?.find(m => m.id?.startsWith("custom:openrouterx"));
    if (!currentConfig) return "not_configured";
    const localMatch = currentConfig.baseUrl?.includes("localhost") || currentConfig.baseUrl?.includes("127.0.0.1");
    const cloudMatch = cloudEnabled && CLOUD_URL && currentConfig.baseUrl?.startsWith(CLOUD_URL);
    const tunnelMatch = baseUrl && currentConfig.baseUrl?.startsWith(baseUrl);
    if (localMatch || cloudMatch || tunnelMatch) return "configured";
    return "other";
  };

  const configStatus = getConfigStatus();

  useEffect(() => {
    if (!isExpanded) return;
    if (!effectiveStatus) {
      fetch("/api/cli-tools/droid-settings")
        .then((res) => res.json())
        .then((data) => setDroidStatus(data))
        .catch((error) => setDroidStatus({ installed: false, error: error.message }));
    }
    fetch("/api/models/alias")
      .then((res) => res.json())
      .then((data) => setModelAliases(data.aliases || {}))
      .catch((error) => console.log("Error fetching model aliases:", error));
  }, [isExpanded, effectiveStatus]);

  const checkDroidStatus = async () => {
    setCheckingDroid(true);
    try {
      const res = await fetch("/api/cli-tools/droid-settings");
      const data = await res.json();
      setDroidStatus(data);
    } catch (error) {
      setDroidStatus({ installed: false, error: error.message });
    } finally {
      setCheckingDroid(false);
    }
  };

  const getEffectiveBaseUrl = () => {
    const url = customBaseUrl || baseUrl;
    return url.endsWith("/v1") ? url : `${url}/v1`;
  };

  const getDisplayUrl = () => {
    const url = customBaseUrl || baseUrl;
    return url.endsWith("/v1") ? url : `${url}/v1`;
  };

  const addModel = () => {
    const val = modelInput.trim();
    if (!val || modelList.includes(val)) return;
    setModelList((prev) => [...prev, val]);
    setModelInput("");
  };

  const removeModel = (id) => setModelList((prev) => prev.filter((m) => m !== id));

  const handleModelSelect = (model) => {
    if (!model.value || modelList.includes(model.value)) return;
    setModelList((prev) => [...prev, model.value]);
    setModalOpen(false);
  };

  const handleApplySettings = async () => {
    setApplying(true);
    setMessage(null);
    try {
      const keyToUse = effectiveSelectedApiKey?.trim()
        || (apiKeys?.length > 0 ? apiKeys[0].key : null)
        || (!cloudEnabled ? "sk_openrouterx" : null);

      const res = await fetch("/api/cli-tools/droid-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: getEffectiveBaseUrl(),
          apiKey: keyToUse,
            models: effectiveModelList,
            activeModel: effectiveModelList[0] || "",
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: "success", text: "Settings applied successfully!" });
        checkDroidStatus();
      } else {
        setMessage({ type: "error", text: data.error || "Failed to apply settings" });
      }
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setApplying(false);
    }
  };

  const handleResetSettings = async () => {
    setRestoring(true);
    setMessage(null);
    try {
      const res = await fetch("/api/cli-tools/droid-settings", { method: "DELETE" });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: "success", text: "Settings reset successfully!" });
        setModelList([]);
        checkDroidStatus();
      } else {
        setMessage({ type: "error", text: data.error || "Failed to reset settings" });
      }
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setRestoring(false);
    }
  };

  const getManualConfigs = () => {
    const keyToUse = (effectiveSelectedApiKey && effectiveSelectedApiKey.trim())
      ? effectiveSelectedApiKey
      : (!cloudEnabled ? "sk_openrouterx" : "<API_KEY_FROM_DASHBOARD>");

    const settingsContent = {
      customModels: effectiveModelList.map((m, i) => ({
        model: m,
        id: `custom:openrouterx-${i}`,
        index: i,
        baseUrl: getEffectiveBaseUrl(),
        apiKey: keyToUse,
        displayName: m,
        maxOutputTokens: 131072,
        noImageSupport: false,
        provider: "openai",
      })),
    };

    const platform = typeof navigator !== "undefined" && navigator.platform;
    const isWindows = platform?.toLowerCase().includes("win");
    const settingsPath = isWindows
      ? "%USERPROFILE%\\.factory\\settings.json"
      : "~/.factory/settings.json";

    return [
      {
        filename: settingsPath,
        content: JSON.stringify(settingsContent, null, 2),
      },
    ];
  };

  return (
    <Card padding="xs" className="overflow-hidden">
      <div className="flex items-start justify-between gap-3 hover:cursor-pointer sm:items-center" onClick={onToggle}>
        <div className="flex min-w-0 items-center gap-3">
          <div className="size-8 flex items-center justify-center shrink-0">
            <Image src="/providers/droid.png" alt={tool.name} width={32} height={32} className="size-8 object-contain rounded-lg" sizes="32px" onError={(e) => { e.target.style.display = "none"; }} />
          </div>
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h3 className="font-medium text-sm">{tool.name}</h3>
              {configStatus === "configured" && <span className="px-1.5 py-0.5 text-[10px] font-medium bg-green-500/10 text-green-600 dark:text-green-400 rounded-full">Connected</span>}
              {configStatus === "not_configured" && <span className="px-1.5 py-0.5 text-[10px] font-medium bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 rounded-full">Not configured</span>}
              {configStatus === "other" && <span className="px-1.5 py-0.5 text-[10px] font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-full">Other</span>}
            </div>
            <p className="text-xs text-text-muted truncate">{tool.description}</p>
          </div>
        </div>
        <span className={`material-symbols-outlined text-text-muted text-[20px] transition-transform ${isExpanded ? "rotate-180" : ""}`}>expand_more</span>
      </div>

      {isExpanded && (
        <div className="mt-4 pt-4 border-t border-border flex flex-col gap-4">
          {checkingDroid && (
            <div className="flex items-center gap-2 text-text-muted">
              <span className="material-symbols-outlined animate-spin">progress_activity</span>
              <span>Checking Factory Droid CLI...</span>
            </div>
          )}

          {!checkingDroid && effectiveStatus && !effectiveStatus.installed && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-yellow-500">warning</span>
                  <div className="flex-1">
                    <p className="font-medium text-yellow-600 dark:text-yellow-400">Factory Droid CLI not detected locally</p>
                    <p className="text-sm text-text-muted">Manual configuration is still available if OpenrouterX is deployed on a remote server.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 pl-9">
                  <Button variant="secondary" size="sm" onClick={() => setShowManualConfigModal(true)} className="!bg-yellow-500/20 !border-yellow-500/40 !text-yellow-700 dark:!text-yellow-300 hover:!bg-yellow-500/30">
                    <span className="material-symbols-outlined text-[18px] mr-1">content_copy</span>
                    Manual Config
                  </Button>
                  {!manualOnly && (

                    <Button variant="outline" size="sm" onClick={() => setShowInstallGuide(!showInstallGuide)}>
                    <span className="material-symbols-outlined text-[18px] mr-1">{showInstallGuide ? "expand_less" : "help"}</span>
                    {showInstallGuide ? "Hide" : "How to Install"}
                  </Button>

                  )}
                </div>
              </div>
              {!manualOnly && showInstallGuide && (
                <div className="p-4 bg-surface border border-border rounded-lg">
                  <h4 className="font-medium mb-3">Installation Guide</h4>
                  <div className="space-y-3 text-sm">
                    <div>
                      <p className="text-text-muted mb-1">macOS / Linux / Windows:</p>
                      <code className="block px-3 py-2 bg-black/5 dark:bg-white/5 rounded font-mono text-xs">curl -fsSL https://app.factory.ai/cli | sh</code>
                    </div>
                    <p className="text-text-muted">After installation, run <code className="px-1 bg-black/5 dark:bg-white/5 rounded">droid</code> to verify.</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {!checkingDroid && effectiveStatus && (
            <>
              <div className="flex flex-col gap-2">
                {/* Current Base URL */}
                {effectiveStatus?.settings?.customModels?.find(m => m.id?.startsWith("custom:openrouterx"))?.baseUrl && (
                  <div className="flex items-center gap-2">
                    <span className="w-32 shrink-0 text-sm font-semibold text-text-main text-right">Current</span>
                    <span className="material-symbols-outlined text-text-muted text-[14px]">arrow_forward</span>
                    <span className="flex-1 px-2 py-1.5 text-xs text-text-muted truncate">
                      {effectiveStatus.settings.customModels.find(m => m.id?.startsWith("custom:openrouterx")).baseUrl}
                    </span>
                  </div>
                )}

                <EndpointPresetControl
                  baseUrl={getDisplayUrl()}
                  apiKey={selectedApiKey}
                  onBaseUrlChange={setCustomBaseUrl}
                  onApiKeyChange={setSelectedApiKey}
                />

                {/* Base URL */}
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[8rem_auto_1fr_auto] sm:items-center sm:gap-2">
                  <span className="text-xs font-semibold text-text-main sm:text-right sm:text-sm">Base URL</span>
                  <span className="material-symbols-outlined hidden text-text-muted text-[14px] sm:inline">arrow_forward</span>
                  <input
                    type="text"
                    value={getDisplayUrl()}
                    onChange={(e) => setCustomBaseUrl(e.target.value)}
                    placeholder="https://.../v1"
                    className="w-full min-w-0 px-2 py-2 bg-surface rounded border border-border text-xs focus:outline-none focus:ring-1 focus:ring-primary/50 sm:py-1.5"
                  />
                  {!manualOnly && customBaseUrl && customBaseUrl !== baseUrl && (
                    <button onClick={() => setCustomBaseUrl("")} className="p-1 text-text-muted hover:text-primary rounded transition-colors" title="Reset to default">
                      <span className="material-symbols-outlined text-[14px]">restart_alt</span>
                    </button>
                  )}
                </div>

                {/* API Key */}
                <div className="flex items-center gap-2">
                  <span className="w-32 shrink-0 text-sm font-semibold text-text-main text-right">API Key</span>
                  <span className="material-symbols-outlined text-text-muted text-[14px]">arrow_forward</span>
                  {apiKeys.length > 0 ? (
                    <select value={effectiveSelectedApiKey} onChange={(e) => setSelectedApiKey(e.target.value)} className="flex-1 px-2 py-1.5 bg-surface rounded text-xs border border-border focus:outline-none focus:ring-1 focus:ring-primary/50">
                      {apiKeys.map((key) => <option key={key.id} value={key.key}>{key.key}</option>)}
                    </select>
                  ) : (
                    <span className="flex-1 text-xs text-text-muted px-2 py-1.5">
                      {cloudEnabled ? "No API keys - Create one in Keys page" : "sk_openrouterx (default)"}
                    </span>
                  )}
                </div>

                {/* Models */}
                <div className="flex items-center gap-2">
                  <span className="w-32 shrink-0 text-sm font-semibold text-text-main text-right">
                    Models {effectiveModelList.length > 0 && <span className="text-primary">({effectiveModelList.length})</span>}
                  </span>
                  <span className="material-symbols-outlined hidden text-text-muted text-[14px] sm:inline">arrow_forward</span>
                  <div className="flex-1 flex flex-col gap-1">
                    {/* Model list */}
                    {effectiveModelList.length > 0 && (
                      <div className="flex flex-col gap-0.5 mb-1">
                        {effectiveModelList.map((id) => (
                          <div key={id} className="flex items-center gap-1.5 px-2 py-1 bg-bg-secondary rounded border border-border">
                            <span className="flex-1 text-xs font-mono truncate">{id}</span>
                            <button onClick={() => removeModel(id)} className="text-text-muted hover:text-red-500 transition-colors shrink-0" title="Remove">
                              <span className="material-symbols-outlined text-[12px]">close</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Model input row */}
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={modelInput}
                        onChange={(e) => setModelInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addModel(); } }}
                        placeholder="provider/model-id"
                        className="w-full min-w-0 px-2 py-2 bg-surface rounded border border-border text-xs focus:outline-none focus:ring-1 focus:ring-primary/50 sm:py-1.5"
                      />
                      <button
                        onClick={() => setModalOpen(true)}
                        disabled={!hasActiveProviders}
                        className={`px-2 py-1.5 rounded border text-xs shrink-0 ${hasActiveProviders ? "bg-surface border-border hover:border-primary cursor-pointer" : "opacity-50 cursor-not-allowed border-border"}`}
                      >
                        Select
                      </button>
                      <button onClick={addModel} disabled={!modelInput.trim()} className="px-2 py-1.5 rounded border bg-surface border-border hover:border-primary text-xs shrink-0 disabled:opacity-50" title="Add model">
                        <span className="material-symbols-outlined text-[14px]">add</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {message && (
                <div className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs ${message.type === "success" ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-600"}`}>
                  <span className="material-symbols-outlined text-[14px]">{message.type === "success" ? "check_circle" : "error"}</span>
                  <span>{message.text}</span>
                </div>
              )}

              <div className="flex items-center gap-2">
                {!manualOnly && (
                  <>
                    <Button variant="primary" size="sm" onClick={handleApplySettings} disabled={effectiveModelList.length === 0} loading={applying}>
                      <span className="material-symbols-outlined text-[14px] mr-1">save</span>Apply
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleResetSettings} disabled={!effectiveStatus?.hasOpenRouterX} loading={restoring}>
                      <span className="material-symbols-outlined text-[14px] mr-1">restore</span>Reset
                    </Button>
                  </>
                )}
                <Button variant="ghost" size="sm" onClick={() => setShowManualConfigModal(true)}>
                  <span className="material-symbols-outlined text-[14px] mr-1">content_copy</span>Manual Config
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      <ModelSelectModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSelect={handleModelSelect}
        selectedModel={null}
        activeProviders={activeProviders}
        modelAliases={modelAliases}
        title="Select Model for Factory Droid"
      />

      <ManualConfigModal
        isOpen={showManualConfigModal}
        onClose={() => setShowManualConfigModal(false)}
        title="Factory Droid - Manual Configuration"
        configs={getManualConfigs()}
      />
    </Card>
  );
}
