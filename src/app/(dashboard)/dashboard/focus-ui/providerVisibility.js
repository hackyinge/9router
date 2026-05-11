export const DEFAULT_VISIBLE_MITM_TOOL_IDS = ["antigravity"];

export function createDefaultMitmToolVisibility(toolIds) {
  return Object.fromEntries(
    toolIds.map((toolId) => [toolId, DEFAULT_VISIBLE_MITM_TOOL_IDS.includes(toolId)]),
  );
}

export function normalizeMitmToolVisibility(toolIds, visibility) {
  return Object.fromEntries(
    toolIds.map((toolId) => [toolId, visibility?.[toolId] === true]),
  );
}
