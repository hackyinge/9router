import { getProviderConnections } from "@/lib/localDb";
import { buildAutoComboModelsFromConnections, parseAutoPrefix } from "open-sse/services/autoCombo.js";

export async function getAutoComboModels(modelStr, options = {}) {
  const parsed = parseAutoPrefix(modelStr);
  if (!parsed.isAuto) return { isAuto: false, models: null };
  if (!parsed.valid) return { isAuto: true, error: parsed.error, models: null };

  const connections = await getProviderConnections({ isActive: true });
  const models = buildAutoComboModelsFromConnections(
    connections,
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
