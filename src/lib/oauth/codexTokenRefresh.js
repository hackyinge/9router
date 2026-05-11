function toExpiresAt(expiresIn, now = Date.now()) {
  if (!expiresIn || !Number.isFinite(Number(expiresIn))) return null;
  return new Date(now + Number(expiresIn) * 1000).toISOString();
}

function labelConnection(connection) {
  return connection.email || connection.displayName || connection.name || connection.id;
}

export async function refreshCodexConnections(connections, { refreshToken, updateConnection, now = Date.now } = {}) {
  if (!Array.isArray(connections)) {
    throw new Error("connections must be an array");
  }
  if (typeof refreshToken !== "function") {
    throw new Error("refreshToken function is required");
  }
  if (typeof updateConnection !== "function") {
    throw new Error("updateConnection function is required");
  }

  const refreshed = [];
  const skipped = [];
  const failed = [];

  for (const connection of connections) {
    if (!connection?.id) continue;
    if (!connection.refreshToken) {
      skipped.push({
        id: connection.id,
        name: labelConnection(connection),
        reason: "Missing refresh token",
      });
      continue;
    }

    try {
      const tokenData = await refreshToken(connection.refreshToken, connection);
      if (!tokenData?.accessToken) {
        const reason = tokenData?.code || tokenData?.error || "Refresh returned no access token";
        const statusUpdate = {
          testStatus: "unavailable",
          lastError: reason,
          lastErrorAt: new Date(now()).toISOString(),
          errorCode: tokenData?.error || "refresh_failed",
        };
        await updateConnection(connection.id, statusUpdate);
        failed.push({
          id: connection.id,
          name: labelConnection(connection),
          reason,
        });
        continue;
      }

      const expiresAt = toExpiresAt(tokenData.expiresIn, now()) || connection.expiresAt || null;
      const updates = {
        accessToken: tokenData.accessToken,
        refreshToken: tokenData.refreshToken || connection.refreshToken,
        expiresAt,
        expiresIn: tokenData.expiresIn,
        testStatus: "active",
        lastError: null,
        lastErrorAt: null,
        errorCode: null,
        rateLimitedUntil: null,
      };
      await updateConnection(connection.id, updates);
      refreshed.push({
        id: connection.id,
        name: labelConnection(connection),
        email: connection.email,
        expiresAt,
        refreshTokenRotated: !!tokenData.refreshToken && tokenData.refreshToken !== connection.refreshToken,
      });
    } catch (error) {
      const reason = error.message || "Failed to refresh token";
      await updateConnection(connection.id, {
        testStatus: "unavailable",
        lastError: reason,
        lastErrorAt: new Date(now()).toISOString(),
        errorCode: "refresh_error",
      });
      failed.push({
        id: connection.id,
        name: labelConnection(connection),
        reason,
      });
    }
  }

  return {
    success: refreshed.length > 0,
    refreshed,
    skipped,
    failed,
    total: connections.length,
  };
}
