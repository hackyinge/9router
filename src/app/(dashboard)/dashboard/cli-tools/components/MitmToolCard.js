"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, Button, Badge, Input, Modal, ModelSelectModal } from "@/shared/components";
import { TOOL_HOSTS } from "@/shared/constants/mitmToolHosts";
import Image from "next/image";

const OPENROUTER_TEST_MODEL = "openai/gpt-5.5";
const OPENROUTER_TEST_PROMPT = "How many r`s are in the word `strawberry?`";
const ANTIGRAVITY_LOCAL_MODEL = "claude-sonnet-4-6";
const ANTIGRAVITY_LOCAL_PROMPT = "Reply with exactly: local antigravity mitm ok";

function buildLocalMappedCurl(mappedModel) {
  const modelValue = OPENROUTER_TEST_MODEL;
  const mappedValue = mappedModel || "<mapped-model>";
  return [
    "curl https://openrouter.ai/api/v1/chat/completions \\",
    '  -H "Content-Type: application/json" \\',
    '  -H "Authorization: Bearer sk_openrouterx" \\',
    "  -d '{",
    `    "model": "${modelValue}",`,
    '    "messages": [',
    "      {",
    '        "role": "user",',
    `        "content": "${OPENROUTER_TEST_PROMPT}"`,
    "      }",
    "    ],",
    '    "reasoning": { "enabled": true },',
    '    "stream": false',
    "  }'",
    "",
    `# Expected MITM mapping target: ${mappedValue}`,
  ].join("\n");
}

function buildOpenRouterModelsCurl() {
  return [
    "curl https://openrouter.ai/models",
  ].join("\n");
}

/**
 * Per-tool MITM card — shows DNS status + model mappings.
 * - Auto-saves model mapping on blur or modal select
 * - Skips sudo modal if password is already cached
 * - Model mappings can be prepared before DNS is active
 */
export default function MitmToolCard({
  tool,
  isExpanded,
  onToggle,
  serverRunning,
  dnsActive,
  hasCachedPassword,
  needsSudoPassword,
  isWin,
  apiKeys,
  activeProviders,
  hasActiveProviders,
  modelAliases = {},
  cloudEnabled,
  onDnsChange,
}) {
  const [loading, setLoading] = useState(false);
  const [warning, setWarning] = useState(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [sudoPassword, setSudoPassword] = useState("");
  const [pendingDnsAction, setPendingDnsAction] = useState(null);
  const [modalError, setModalError] = useState(null);
  const [modelMappings, setModelMappings] = useState({});
  const [modalOpen, setModalOpen] = useState(false);
  const [currentEditingAlias, setCurrentEditingAlias] = useState(null);
  const [restarting, setRestarting] = useState(false);
  const [restartMessage, setRestartMessage] = useState(null);
  const [showRestartPathModal, setShowRestartPathModal] = useState(false);
  const [restartPath, setRestartPath] = useState("");
  const [localPrompt, setLocalPrompt] = useState(ANTIGRAVITY_LOCAL_PROMPT);
  const [localChatLoading, setLocalChatLoading] = useState(false);
  const [localChatResult, setLocalChatResult] = useState(null);
  const [injectingAuth, setInjectingAuth] = useState(false);
  const [injectAuthMessage, setInjectAuthMessage] = useState(null);
  const [authJsonInput, setAuthJsonInput] = useState("");
  const authFileInputRef = useRef(null);

  const mitmHosts = TOOL_HOSTS[tool.id] ?? [];
  const canRunWithoutPassword = isWin || hasCachedPassword || needsSudoPassword === false;
  const canRestartAntigravity = tool.id === "antigravity";

  const loadSavedMappings = useCallback(async () => {
    try {
      const res = await fetch(`/api/cli-tools/antigravity-mitm/alias?tool=${tool.id}`);
      if (res.ok) {
        const data = await res.json();
        if (Object.keys(data.aliases || {}).length > 0) setModelMappings(data.aliases);
      }
    } catch { /* ignore */ }
  }, [tool.id]);

  useEffect(() => {
    if (!isExpanded) return;
    Promise.resolve().then(() => {
      loadSavedMappings();
    });
  }, [isExpanded, loadSavedMappings]);

  const saveMappings = useCallback(async (mappings) => {
    try {
      await fetch("/api/cli-tools/antigravity-mitm/alias", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: tool.id, mappings }),
      });
    } catch { /* ignore */ }
  }, [tool.id]);

  const handleMappingBlur = (alias, value) => {
    saveMappings({ ...modelMappings, [alias]: value });
  };

  const handleModelMappingChange = (alias, value) => {
    setModelMappings(prev => ({ ...prev, [alias]: value }));
  };

  const openModelSelector = (alias) => {
    setCurrentEditingAlias(alias);
    setModalOpen(true);
  };

  const handleModelSelect = (model) => {
    if (!currentEditingAlias || model.isPlaceholder) return;
    const updated = { ...modelMappings, [currentEditingAlias]: model.value };
    setModelMappings(updated);
    saveMappings(updated);
  };

  const handleDnsToggle = () => {
    if (!serverRunning) return;
    const action = dnsActive ? "disable" : "enable";
    if (canRunWithoutPassword) {
      doDnsAction(action, "");
    } else {
      setPendingDnsAction(action);
      setShowPasswordModal(true);
      setModalError(null);
    }
  };

  const doDnsAction = async (action, password) => {
    setLoading(true);
    setWarning(null);
    try {
      const res = await fetch("/api/cli-tools/antigravity-mitm", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: tool.id, action, sudoPassword: password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to toggle DNS");

      if (action === "enable") {
        setWarning(`Restart ${tool.name} to apply changes`);
      }

      setShowPasswordModal(false);
      setSudoPassword("");
      onDnsChange?.(data);
    } catch { /* ignore */ } finally {
      setLoading(false);
      setPendingDnsAction(null);
    }
  };

  const handleConfirmPassword = () => {
    if (!sudoPassword.trim()) {
      setModalError("Sudo password is required");
      return;
    }
    doDnsAction(pendingDnsAction, sudoPassword);
  };

  const restartAntigravity = async (path = "") => {
    setRestarting(true);
    setRestartMessage(null);
    try {
      const res = await fetch("/api/cli-tools/antigravity-mitm/restart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(path ? { path } : {}),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.needsManualPath) {
          setShowRestartPathModal(true);
          setRestartMessage({ type: "error", text: data.error || "Antigravity was not found" });
          return;
        }
        throw new Error(data.error || "Failed to restart Antigravity");
      }

      setShowRestartPathModal(false);
      setRestartPath("");
      setRestartMessage({ type: "success", text: `Restarted Antigravity${data.path ? `: ${data.path}` : ""}` });
    } catch (error) {
      setRestartMessage({ type: "error", text: error.message });
    } finally {
      setRestarting(false);
    }
  };

  const handleConfirmRestartPath = () => {
    const path = restartPath.trim();
    if (!path) {
      setRestartMessage({ type: "error", text: "Antigravity path is required" });
      return;
    }
    restartAntigravity(path);
  };

  const injectAuthKey = async () => {
    setInjectingAuth(true);
    setInjectAuthMessage(null);
    try {
      let credentials;
      const trimmedJson = authJsonInput.trim();
      if (trimmedJson) {
        try {
          credentials = JSON.parse(trimmedJson);
        } catch {
          throw new Error("Account JSON is not valid");
        }
      }

      const res = await fetch("/api/cli-tools/antigravity-mitm/inject-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials ? { credentials } : {}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to inject auth key");

      setInjectAuthMessage({ type: "success", text: data.message || "Auth key injected. Please restart Antigravity." });
    } catch (error) {
      setInjectAuthMessage({ type: "error", text: error.message });
    } finally {
      setInjectingAuth(false);
    }
  };

  const handleAuthFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      JSON.parse(text);
      setAuthJsonInput(text);
      setInjectAuthMessage({ type: "success", text: `Loaded ${file.name}` });
    } catch {
      setInjectAuthMessage({ type: "error", text: "Selected file is not valid JSON" });
    } finally {
      event.target.value = "";
    }
  };

  const runLocalAntigravityChat = async () => {
    const prompt = localPrompt.trim();
    if (!prompt) {
      setLocalChatResult({ type: "error", text: "Prompt is required" });
      return;
    }

    setLocalChatLoading(true);
    setLocalChatResult(null);
    try {
      const res = await fetch("/api/cli-tools/antigravity-mitm/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool: "antigravity",
          publicModel: ANTIGRAVITY_LOCAL_MODEL,
          prompt,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Local Antigravity MITM test failed");

      setLocalChatResult({
        type: "success",
        text: data.reply || data.preview || "Request completed",
        meta: `${data.publicModel} -> ${data.mappedModel} · ${data.latencyMs}ms`,
      });
    } catch (error) {
      setLocalChatResult({ type: "error", text: error.message });
    } finally {
      setLocalChatLoading(false);
    }
  };

  return (
    <>
      <Card padding="xs" className="overflow-hidden">
        <div className="flex items-start justify-between gap-3 hover:cursor-pointer sm:items-center" onClick={onToggle}>
          <div className="flex min-w-0 items-center gap-3">
            <div className="size-8 flex items-center justify-center shrink-0">
              <Image
                src={tool.image}
                alt={tool.name}
                width={32}
                height={32}
                className="size-8 object-contain rounded-lg"
                sizes="32px"
                onError={(e) => { e.target.style.display = "none"; }}
              />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-medium text-sm">{tool.name}</h3>
                {!serverRunning ? (
                  <Badge variant="default" size="sm">Server off</Badge>
                ) : dnsActive ? (
                  <Badge variant="success" size="sm">Active</Badge>
                ) : (
                  <Badge variant="warning" size="sm">DNS off</Badge>
                )}
              </div>
              <p className="text-xs text-text-muted sm:truncate">Intercept {tool.name} requests via MITM proxy</p>
            </div>
          </div>
          <span className={`material-symbols-outlined text-text-muted text-[20px] transition-transform ${isExpanded ? "rotate-180" : ""}`}>
            expand_more
          </span>
        </div>

        {isExpanded && (
          <div className="mt-4 pt-4 border-t border-border flex flex-col gap-4">
            {/* Hosts */}
            {mitmHosts.length > 0 && (
              <div className="mt-2 rounded-md border border-border bg-surface/50 px-2 py-1.5">
                <p className="text-[10px] font-medium tracking-wide text-text-main/80 mb-1">
                  Edit hosts file manually to add the following entries:
                </p>
                <ul className="list-none space-y-0.5 font-mono text-[10px] text-text-muted break-all">
                  {mitmHosts.map((h) => (
                    <li key={h}>127.0.0.1 {h}</li>
                  ))}
                </ul>
              </div>
            )}
            {/* Info */}
            <div className="flex flex-col gap-0.5 text-[11px] text-text-muted px-1">
              <p>Toggle DNS to redirect {tool.name} traffic through OpenRouterX via MITM.</p>
              {!dnsActive && (
                <p className="text-amber-600 text-[10px] mt-1">
                  ⚠️ DNS off: mappings are saved locally and will apply after DNS is enabled
                </p>
              )}
            </div>

            {/* Model Mappings */}
            {tool.defaultModels?.length > 0 && (
              <div className="flex flex-col gap-2">
                {tool.defaultModels.map((model) => (
                  <div key={model.alias} className="grid grid-cols-1 gap-1.5 sm:grid-cols-[9rem_auto_1fr_auto] sm:items-center sm:gap-2">
                    <span className="text-xs font-semibold text-text-main sm:text-right">{model.name}</span>
                    <span className="material-symbols-outlined hidden text-text-muted text-[14px] sm:inline">arrow_forward</span>
                    <div className="relative w-full min-w-0">
                      <input
                        type="text"
                        value={modelMappings[model.alias] || ""}
                        onChange={(e) => handleModelMappingChange(model.alias, e.target.value)}
                        onBlur={(e) => handleMappingBlur(model.alias, e.target.value)}
                        placeholder="provider/model-id"
                        className="w-full min-w-0 pl-2 pr-7 py-2 bg-surface rounded border border-border text-xs focus:outline-none focus:ring-1 focus:ring-primary/50 sm:py-1.5"
                      />
                      {modelMappings[model.alias] && (
                        <button
                          onClick={() => {
                            handleModelMappingChange(model.alias, "");
                            saveMappings({ ...modelMappings, [model.alias]: "" });
                          }}
                          className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 text-text-muted hover:text-red-500 rounded transition-colors"
                          title="Clear"
                        >
                          <span className="material-symbols-outlined text-[14px]">close</span>
                        </button>
                      )}
                    </div>
                    <button
                      onClick={() => openModelSelector(model.alias)}
                      disabled={!hasActiveProviders}
                      className={`rounded border px-2 py-2 text-xs transition-colors sm:py-1.5 ${hasActiveProviders ? "bg-surface border-border hover:border-primary cursor-pointer" : "opacity-50 cursor-not-allowed border-border"}`}
                    >
                      Select
                    </button>
                  </div>
                ))}
              </div>
            )}

            {tool.defaultModels?.length === 0 && (
              <p className="text-xs text-text-muted px-1">Model mappings will be available soon.</p>
            )}

            {/* Start / Stop DNS button */}
            <div className="flex flex-col gap-2 sm:items-start">
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
                {dnsActive ? (
                  <button
                    onClick={handleDnsToggle}
                    disabled={!serverRunning || loading}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs font-medium text-red-500 transition-colors hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:py-1.5"
                  >
                    <span className="material-symbols-outlined text-[16px]">stop_circle</span>
                    Stop DNS
                  </button>
                ) : (
                  <button
                    onClick={handleDnsToggle}
                    disabled={!serverRunning || loading}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-4 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:py-1.5"
                  >
                    <span className="material-symbols-outlined text-[16px]">play_circle</span>
                    Start DNS
                  </button>
                )}
                {canRestartAntigravity && (
                  <button
                    onClick={() => restartAntigravity()}
                    disabled={restarting}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-4 py-2 text-xs font-medium text-text-main transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:py-1.5"
                    title="Restart Antigravity"
                  >
                    <span className={`material-symbols-outlined text-[16px] ${restarting ? "animate-spin" : ""}`}>
                      {restarting ? "progress_activity" : "restart_alt"}
                    </span>
                    Restart Antigravity
                  </button>
                )}
                {canRestartAntigravity && (
                  <button
                    onClick={injectAuthKey}
                    disabled={injectingAuth}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs font-medium text-amber-600 transition-colors hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:py-1.5"
                    title="Inject Antigravity auth from a refresh-token JSON in Downloads or ~/.antigravity_tools"
                  >
                    <span className={`material-symbols-outlined text-[16px] ${injectingAuth ? "animate-spin" : ""}`}>
                      {injectingAuth ? "progress_activity" : "key"}
                    </span>
                    Inject Auth Key
                  </button>
                )}
              </div>
              {canRestartAntigravity && (
                <div className="grid w-full gap-2 rounded-lg border border-border bg-surface/50 p-3 sm:max-w-2xl">
                  <input
                    ref={authFileInputRef}
                    type="file"
                    accept="application/json,.json"
                    className="hidden"
                    onChange={handleAuthFileChange}
                  />
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-medium text-text-main">Antigravity account JSON</p>
                    <button
                      type="button"
                      onClick={() => authFileInputRef.current?.click()}
                      className="inline-flex items-center gap-1 rounded border border-border bg-surface px-2 py-1 text-[11px] text-text-main transition-colors hover:border-primary hover:text-primary"
                    >
                      <span className="material-symbols-outlined text-[14px]">upload_file</span>
                      Load JSON
                    </button>
                  </div>
                  <textarea
                    value={authJsonInput}
                    onChange={(event) => setAuthJsonInput(event.target.value)}
                    placeholder='[{"email":"name@gmail.com","refresh_token":"..."}]'
                    spellCheck={false}
                    className="min-h-20 w-full resize-y rounded border border-border bg-background px-2 py-2 font-mono text-[11px] text-text-main outline-none focus:ring-1 focus:ring-primary/50"
                  />
                  <p className="text-[10px] text-text-muted">
                    Paste a new account JSON here or load a local file; this takes priority over the built-in fallback account.
                  </p>
                </div>
              )}

              {/* Warning below button */}
              {warning && (
                <div className="flex items-center gap-2 px-2 py-1.5 rounded text-xs text-amber-500">
                  <span className="material-symbols-outlined text-[14px]">warning</span>
                  <span>{warning}</span>
                </div>
              )}
              {restartMessage && (
                <div className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs ${restartMessage.type === "success" ? "text-green-600" : "text-red-600"}`}>
                  <span className="material-symbols-outlined text-[14px]">{restartMessage.type === "success" ? "check_circle" : "error"}</span>
                  <span>{restartMessage.text}</span>
                </div>
              )}
              {injectAuthMessage && (
                <div className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs ${injectAuthMessage.type === "success" ? "text-green-600" : "text-red-600"}`}>
                  <span className="material-symbols-outlined text-[14px]">{injectAuthMessage.type === "success" ? "check_circle" : "error"}</span>
                  <span>{injectAuthMessage.text}</span>
                </div>
              )}
              {tool.id === "openrouter" && (
                <div className="flex flex-col gap-2">
                  <p className="text-[11px] text-text-muted px-1">
                    Both tests hit `openrouter.ai` directly. If MITM is inactive, they should fail or return the wrong payload.
                  </p>
                  <div className="rounded-lg border border-border bg-surface/50 p-3">
                    <p className="mb-2 text-[11px] font-medium text-text-main">MITM Chat curl</p>
                    <pre className="wrap-break-word whitespace-pre-wrap text-[10px] text-text-muted" data-i18n-skip="true">
                      {buildLocalMappedCurl(String(modelMappings[OPENROUTER_TEST_MODEL] || "").trim())}
                    </pre>
                  </div>
                  <div className="rounded-lg border border-border bg-surface/50 p-3">
                    <p className="mb-2 text-[11px] font-medium text-text-main">OpenRouter Models curl</p>
                    <pre className="wrap-break-word whitespace-pre-wrap text-[10px] text-text-muted" data-i18n-skip="true">
                      {buildOpenRouterModelsCurl()}
                    </pre>
                  </div>
                </div>
              )}

            </div>
          </div>
        )}
      </Card>

      <Modal
        isOpen={showRestartPathModal}
        onClose={() => {
          setShowRestartPathModal(false);
          setRestartPath("");
        }}
        title="Antigravity Path"
        size="md"
      >
        <div className="flex flex-col gap-4">
          <p className="text-xs text-text-muted">
            Antigravity was not found in common install locations. Enter the local app path, for example <code className="rounded bg-surface-2 px-1 py-0.5">/Applications/Antigravity.app</code>.
          </p>
          <Input
            value={restartPath}
            onChange={(e) => setRestartPath(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !restarting) handleConfirmRestartPath(); }}
            placeholder="/Applications/Antigravity.app"
          />
          {restartMessage && (
            <div className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs ${restartMessage.type === "success" ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-600"}`}>
              <span className="material-symbols-outlined text-[14px]">{restartMessage.type === "success" ? "check_circle" : "error"}</span>
              <span>{restartMessage.text}</span>
            </div>
          )}
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setShowRestartPathModal(false); setRestartPath(""); }}
              disabled={restarting}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleConfirmRestartPath}
              loading={restarting}
            >
              Restart
            </Button>
          </div>
        </div>
      </Modal>

      {/* Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 flex w-full max-w-sm flex-col gap-4 rounded-xl border border-border bg-surface p-5 shadow-xl sm:p-6">
            <h3 className="font-semibold text-text-main">Sudo Password Required</h3>
            <div className="flex items-start gap-3 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <span className="material-symbols-outlined text-yellow-500 text-[20px]">warning</span>
              <p className="text-xs text-text-muted">Required to modify /etc/hosts and flush DNS cache</p>
            </div>
            <Input
              type="password"
              placeholder="Enter sudo password"
              value={sudoPassword}
              onChange={(e) => setSudoPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !loading) handleConfirmPassword(); }}
            />
            {modalError && (
              <div className="flex items-center gap-2 px-2 py-1.5 rounded text-xs bg-red-500/10 text-red-600">
                <span className="material-symbols-outlined text-[14px]">error</span>
                <span>{modalError}</span>
              </div>
            )}
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setShowPasswordModal(false); setSudoPassword(""); setModalError(null); }} disabled={loading}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={handleConfirmPassword} loading={loading}>
                Confirm
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Model Select Modal */}
      <ModelSelectModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSelect={handleModelSelect}
        selectedModel={currentEditingAlias ? modelMappings[currentEditingAlias] : null}
        activeProviders={activeProviders}
        modelAliases={modelAliases}
        title={`Select model for ${currentEditingAlias}`}
      />
    </>
  );
}
