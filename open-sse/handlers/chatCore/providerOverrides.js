export function applyProviderThinkingOverrides(body, provider, providerThinking) {
  let nextBody = body;

  if (provider === "codex" && providerThinking?.fastMode === true && !nextBody.service_tier) {
    nextBody = { ...nextBody, service_tier: "priority" };
  }

  // on/off -> extended type (body.thinking), none/low/medium/high -> effort type (body.reasoning_effort)
  if (providerThinking?.mode && providerThinking.mode !== "auto") {
    const mode = providerThinking.mode;
    if (mode === "on" && !nextBody.thinking) {
      console.log("Injecting provider-level thinking config override: on");
      nextBody = { ...nextBody, thinking: { type: "enabled", budget_tokens: 10000 } };
    } else if (mode === "off" && !nextBody.thinking) {
      nextBody = { ...nextBody, thinking: { type: "disabled" } };
    } else if (!nextBody.reasoning_effort) {
      nextBody = { ...nextBody, reasoning_effort: mode };
    }
  }

  return nextBody;
}
