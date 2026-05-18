import { getProviderConnections } from "@/lib/localDb";
import { FREE_PROVIDERS } from "@/shared/constants/providers.js";
import { buildAutoComboModelsFromConnections, parseAutoPrefix } from "open-sse/services/autoCombo.js";

function buildNoAuthConnections() {
  return Object.values(FREE_PROVIDERS)
    .filter((provider) => provider?.noAuth)
    .map((provider, index) => ({
      id: `noauth:${provider.id}`,
      provider: provider.id,
      authType: "none",
      isActive: true,
      testStatus: "active",
      priority: 900 + index,
    }));
}

export async function getAutoComboModels(modelStr, options = {}) {
  const parsed = parseAutoPrefix(modelStr);
  if (!parsed.isAuto) return { isAuto: false, models: null };
  if (!parsed.valid) return { isAuto: true, error: parsed.error, models: null };

  const connections = await getProviderConnections({ isActive: true });
  const models = buildAutoComboModelsFromConnections(
    [...connections, ...buildNoAuthConnections()],
    {
      variant: parsed.variant,
      limit: options.limit || 8,
    },
  );

  return {
    isAuto: true,
    variant: parsed.variant,
    models,
  };
}
