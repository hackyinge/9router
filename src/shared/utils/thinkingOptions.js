export function getThinkingOptionLabel(option, providerId) {
  if (option === "auto") return providerId === "codex" ? "Auto (Medium)" : "Auto";
  if (option === "xhigh") return "XHigh";
  return option.charAt(0).toUpperCase() + option.slice(1);
}

export function buildThinkingOptions(thinkingConfig, providerId) {
  return (thinkingConfig?.options || []).map((option) => ({
    value: option,
    label: getThinkingOptionLabel(option, providerId),
  }));
}
