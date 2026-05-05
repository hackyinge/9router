"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, Badge } from "@/shared/components";
import AvailableModelRow from "@/shared/components/AvailableModelRow";
import OverviewCards from "../usage/components/OverviewCards";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { AI_PROVIDERS } from "@/shared/constants/providers";
import { getModelsByProviderId } from "@/shared/constants/models";

function buildChatRequestBody(model) {
  return {
    model,
    stream: false,
    messages: [
      {
        role: "user",
        content: "Hello, please introduce yourself briefly.",
      },
    ],
  };
}

function prettyJson(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

async function formatFetchResponse(res) {
  const text = await res.text();
  try {
    return prettyJson(JSON.parse(text));
  } catch {
    return text || `HTTP ${res.status}`;
  }
}

function buildChatCurlSnippet(baseUrl, apiKey, model) {
  const requestBody = {
    ...buildChatRequestBody(model),
  };

  return `curl -X POST ${baseUrl}/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${apiKey || "YOUR_KEY"}" \\
  -d '${JSON.stringify(requestBody)}'`;
}

function sortModelsByAdminOrder(providerId, providerModels) {
  const builtInOrder = getModelsByProviderId(providerId).map((model) => model.id);
  const orderMap = new Map(builtInOrder.map((modelId, index) => [modelId, index]));

  return [...providerModels].sort((a, b) => {
    const indexA = orderMap.has(a.id) ? orderMap.get(a.id) : Number.MAX_SAFE_INTEGER;
    const indexB = orderMap.has(b.id) ? orderMap.get(b.id) : Number.MAX_SAFE_INTEGER;

    if (indexA !== indexB) return indexA - indexB;
    return a.id.localeCompare(b.id, "en", { numeric: true });
  });
}

export default function SubUserPage() {
  const [user, setUser] = useState(null);
  const [keys, setKeys] = useState([]);
  const [stats, setStats] = useState({ totalRequests: 0, totalPromptTokens: 0, totalCompletionTokens: 0, totalCost: 0 });
  const [providers, setProviders] = useState([]);
  const [models, setModels] = useState([]);
  const [allowedProviders, setAllowedProviders] = useState([]);
  const [modelTestResults, setModelTestResults] = useState({});
  const [modelsTestError, setModelsTestError] = useState("");
  const [testingModelId, setTestingModelId] = useState(null);
  const [requestBaseUrl, setRequestBaseUrl] = useState("http://localhost:20128");
  const [loading, setLoading] = useState(true);
  const { copied, copy } = useCopyToClipboard();

  useEffect(() => {
    Promise.all([
      fetch("/api/auth/me").then(r => r.json()),
      fetch("/api/keys").then(r => r.json()),
      fetch("/api/usage/stats?period=7d").then(r => r.json()).catch(() => ({ totalRequests: 0, totalPromptTokens: 0, totalCompletionTokens: 0, totalCost: 0 })),
      fetch("/api/providers").then(r => r.json()).catch(() => ({ connections: [] })),
      fetch("/api/v1/models").then(r => r.json()).catch(() => ({ data: [] })),
    ]).then(([userData, keysData, statsData, providersData, modelsData]) => {
      if (userData.role !== "sub_user") {
        window.location.href = userData.role === "super_admin" ? "/dashboard" : "/login";
        return;
      }
      setUser(userData);
      setAllowedProviders(userData.allowedProviders || []);
      setKeys(keysData.keys || []);
      setStats(statsData);
      setProviders((providersData.connections || []).filter(connection => connection.isActive !== false));
      setModels((modelsData.data || []).filter(model => model?.id && typeof model.id === "string"));
    }).catch(() => {
      window.location.href = "/login";
    }).finally(() => {
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && window.location?.origin) {
      setRequestBaseUrl(window.location.origin);
    }
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-text-muted">Loading...</p>
      </div>
    );
  }

  const assignedKeys = keys.filter(k => k.userId === user?.userId);
  const activeAssignedKey = assignedKeys.find((key) => key.isActive !== false)?.key || "";
  const groupedModels = allowedProviders.map((providerId) => {
    const providerMeta = AI_PROVIDERS[providerId] || {};
    const alias = providerMeta.alias || providerId;
    const connection = providers.find(item => item.provider === providerId);
    return {
      providerId,
      providerName: providerMeta.name || connection?.name || providerId,
      models: sortModelsByAdminOrder(
        providerId,
        models
          .filter(model => model.id.startsWith(`${alias}/`))
          .map(model => ({
            id: model.root || model.id.slice(alias.length + 1),
            fullModel: model.id,
            name: model.root || model.id.slice(alias.length + 1),
          }))
      ),
    };
  }).filter(group => group.models.length > 0);

  const handleTestModel = async (fullModel) => {
    if (testingModelId) return;
    setTestingModelId(fullModel);
    try {
      const res = await fetch("/api/models/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: fullModel }),
      });
      const data = await res.json();
      setModelTestResults(prev => ({ ...prev, [fullModel]: data.ok ? "ok" : "error" }));
      setModelsTestError(data.ok ? "" : (data.error || "Model not reachable"));
    } catch {
      setModelTestResults(prev => ({ ...prev, [fullModel]: "error" }));
      setModelsTestError("Network error");
    } finally {
      setTestingModelId(null);
    }
  };

  const runModelRequest = async (fullModel) => {
    if (!activeAssignedKey) {
      return {
        ok: false,
        responseText: prettyJson({ error: "No active API key assigned to this sub-user." }),
        latencyMs: 0,
      };
    }

    const start = Date.now();
    const res = await fetch("/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${activeAssignedKey}`,
      },
      body: JSON.stringify(buildChatRequestBody(fullModel)),
    });

    return {
      ok: res.ok,
      responseText: await formatFetchResponse(res),
      latencyMs: Date.now() - start,
    };
  };

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">
          {user?.displayName || user?.username || "Welcome"}
        </h1>
        <p className="text-sm text-text-muted mt-1">
          Sub-user account &middot; @{user?.username}
        </p>
      </div>

      <div>
        <h2 className="text-sm font-semibold uppercase text-text-muted mb-3">Usage (Last 7 Days)</h2>
        <OverviewCards stats={stats} />
      </div>

      <div>
        <h2 className="text-sm font-semibold uppercase text-text-muted mb-3">My API Keys</h2>
        {assignedKeys.length === 0 ? (
          <Card className="p-6 text-center">
            <p className="text-text-muted text-sm">No API keys assigned yet.</p>
            <p className="text-text-muted text-xs mt-1">Contact your administrator to get a key assigned.</p>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {assignedKeys.map(key => (
              <Card key={key.id} className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-surface-alt flex items-center justify-center">
                    <span className="material-symbols-outlined text-text-muted text-[18px]">key</span>
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{key.name}</p>
                    <p className="font-mono text-xs text-text-muted">
                      {key.key.slice(0, 8)}.......{key.key.slice(-4)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {key.isActive === false && <Badge variant="error" size="sm">Inactive</Badge>}
                  {key.assignedAt && (
                    <span className="text-xs text-text-muted">
                      Assigned {new Date(key.assignedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-sm font-semibold uppercase text-text-muted mb-3">Available Models</h2>
        {!!modelsTestError && (
          <p className="text-xs text-red-500 mb-3 break-words">{modelsTestError}</p>
        )}
        {groupedModels.length === 0 ? (
          <Card className="p-6 text-center">
            <p className="text-text-muted text-sm">No models available for the providers currently enabled for this sub-user.</p>
            <p className="text-text-muted text-xs mt-1">Ask your administrator to enable one or more providers in User Management.</p>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {groupedModels.map((group) => (
              <Card key={group.providerId} className="p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-sm">{group.providerName}</p>
                  <Badge variant="secondary" size="sm">{group.models.length} models</Badge>
                </div>
                <div className="flex flex-col gap-2">
                  {group.models.map((model) => (
                    <AvailableModelRow
                      key={model.fullModel}
                      model={model}
                      fullModel={model.fullModel}
                      copied={copied}
                      onCopy={copy}
                      testStatus={modelTestResults[model.fullModel]}
                      onTest={() => handleTestModel(model.fullModel)}
                      isTesting={testingModelId === model.fullModel}
                      requestSnippet={buildChatCurlSnippet(requestBaseUrl, activeAssignedKey, model.fullModel)}
                      onRunRequest={() => runModelRequest(model.fullModel)}
                    />
                  ))}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-sm font-semibold uppercase text-text-muted mb-3">Quick Access</h2>
        <div className="grid grid-cols-1 gap-3">
          <QuickLink href="/dashboard/usage" icon="analytics" label="Usage &amp; Logs" desc="View your request history" />
        </div>
      </div>
    </div>
  );
}

function QuickLink({ href, icon, label, desc }) {
  return (
    <Link href={href}>
      <Card className="p-4 flex items-center gap-3 hover:border-primary transition-colors cursor-pointer">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
          <span className="material-symbols-outlined text-primary text-[18px]">{icon}</span>
        </div>
        <div>
          <p className="font-semibold text-sm">{label}</p>
          <p className="text-xs text-text-muted">{desc}</p>
        </div>
      </Card>
    </Link>
  );
}
