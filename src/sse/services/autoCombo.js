import { getProviderConnections } from "@/lib/localDb";
import { FREE_PROVIDERS } from "@/shared/constants/providers.js";
import { getModelsByProviderId } from "open-sse/config/providerModels.js";
import { buildAutoComboModelsFromConnections, parseAutoPrefix } from "open-sse/services/autoCombo.js";

function buildNoAuthConnections() {
  return Object.values(FREE_PROVIDERS)
    .filter((provider) => provider?.noAuth)
    .flatMap((provider, index) => {
      const models = getModelsByProviderId(provider.id)
        .filter((model) => (model?.type || "llm") === "llm");
      if (!models.length) {
        return [{
          id: `noauth:${provider.id}`,
          provider: provider.id,
          authType: "none",
          isActive: true,
          testStatus: "active",
          priority: 900 + index,
        }];
      }
      return models.map((model, modelIndex) => ({
        id: `noauth:${provider.id}:${model.id}`,
        provider: provider.id,
        authType: "none",
        isActive: true,
        testStatus: "active",
        priority: 900 + index + (modelIndex / 100),
        defaultModel: model.id,
      }));
    });
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
