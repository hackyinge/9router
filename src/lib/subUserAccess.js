import { getAuthPayload } from "@/dashboardGuard";
import { getApiKeyByValue, getUserById } from "@/lib/localDb";
import {
  getEffectiveAllowedProviderConnectionIds,
  getEffectiveAllowedProviders,
} from "@/shared/utils/subUserAccess";

export function extractRequestApiKey(request) {
  const authHeader = request?.headers?.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  const xApiKey = request?.headers?.get("x-api-key");
  if (xApiKey) return xApiKey;

  return null;
}

function buildSubUserAccessContext(user, source) {
  if (!user || user.role !== "sub_user") return null;

  return {
    role: "sub_user",
    userId: user.id,
    username: user.username || null,
    permissions: Array.isArray(user.permissions) ? user.permissions : [],
    allowedProviders: getEffectiveAllowedProviders(user),
    allowedProviderConnectionIds: getEffectiveAllowedProviderConnectionIds(user),
    source,
  };
}

export async function resolveSubUserAccessContext(request, explicitApiKey = null) {
  const apiKey = explicitApiKey || extractRequestApiKey(request);
  if (apiKey) {
    const keyRecord = await getApiKeyByValue(apiKey);
    if (keyRecord?.userId) {
      const user = await getUserById(keyRecord.userId);
      const context = buildSubUserAccessContext(user, "api_key");
      if (context) return context;
    }
  }

  const payload = await getAuthPayload(request);
  if (!payload || payload.role !== "sub_user" || !payload.userId) {
    return null;
  }

  const currentUser = await getUserById(payload.userId);
  if (currentUser) {
    return buildSubUserAccessContext(currentUser, "cookie");
  }

  return buildSubUserAccessContext(
    {
      id: payload.userId,
      username: payload.username || null,
      role: payload.role,
      permissions: payload.permissions || [],
      allowedProviders: payload.allowedProviders,
      allowedProviderConnectionIds: payload.allowedProviderConnectionIds,
    },
    "cookie"
  );
}

export function isProviderAllowedForSubUser(context, providerId) {
  if (!context || context.role !== "sub_user") return true;
  return context.allowedProviders.includes(providerId);
}

export function getAllowedProviderConnectionIdsForSubUser(context) {
  if (!context || context.role !== "sub_user") return null;
  if (!Array.isArray(context.allowedProviderConnectionIds)) return null;
  return context.allowedProviderConnectionIds;
}

export function isConnectionAllowedForSubUser(context, connection) {
  if (!context || context.role !== "sub_user") return true;
  if (!connection || !isProviderAllowedForSubUser(context, connection.provider)) return false;

  const allowedConnectionIds = getAllowedProviderConnectionIdsForSubUser(context);
  if (!allowedConnectionIds) return true;
  return allowedConnectionIds.includes(connection.id);
}

export function filterConnectionsForSubUser(connections, context) {
  if (!context || context.role !== "sub_user") return connections;
  return connections.filter((connection) => isConnectionAllowedForSubUser(context, connection));
}
