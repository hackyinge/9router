export const LEGACY_SUB_USER_VISIBLE_PROVIDERS = ["codex", "alicode"];

export function normalizeProviderIds(providerIds) {
  if (!Array.isArray(providerIds)) return [];

  return Array.from(
    new Set(
      providerIds
        .map((providerId) =>
          typeof providerId === "string" ? providerId.trim() : ""
        )
        .filter(Boolean)
    )
  );
}

export function hasConfiguredAllowedProviders(user) {
  return !!(
    user &&
    typeof user === "object" &&
    Object.prototype.hasOwnProperty.call(user, "allowedProviders")
  );
}

export function getEffectiveAllowedProviders(
  user,
  fallbackProviders = LEGACY_SUB_USER_VISIBLE_PROVIDERS
) {
  if (hasConfiguredAllowedProviders(user)) {
    return normalizeProviderIds(user.allowedProviders);
  }

  return normalizeProviderIds(fallbackProviders);
}
