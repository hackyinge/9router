const { execSync } = require("child_process");

function uniqueAddresses(addresses) {
  return [...new Set(addresses || [])].filter(Boolean);
}

function parseMacRouteOutput(output) {
  const route = {};
  for (const line of String(output || "").split(/\r?\n/)) {
    const match = line.match(/^\s*([^:]+):\s*(.+?)\s*$/);
    if (!match) continue;
    route[match[1].trim()] = match[2].trim();
  }
  const flags = route.flags
    ? route.flags.replace(/[<>]/g, "").split(",").map((flag) => flag.trim()).filter(Boolean)
    : [];
  return {
    destination: route.destination || "",
    gateway: route.gateway || "",
    interface: route.interface || "",
    flags,
  };
}

function isLocalRoute(route) {
  if (!route) return false;
  if (route.interface === "lo0" || route.interface === "lo") return true;
  return Array.isArray(route.flags) && route.flags.includes("LOCAL");
}

function getAddressRouteStatus(address) {
  if (process.platform !== "darwin") return { address, local: false, reason: "unsupported_platform" };
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(address)) return { address, local: false, reason: "not_ipv4" };
  try {
    const route = parseMacRouteOutput(execSync(`route -n get ${address}`, {
      encoding: "utf8",
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
    }));
    const local = isLocalRoute(route);
    return {
      address,
      local,
      reason: local ? "local_route" : "reachable_route",
      route,
    };
  } catch {
    return { address, local: false, reason: "route_unknown" };
  }
}

function normalizePickOptions(localAliasesOrOptions = [], avoidAddresses = []) {
  if (Array.isArray(localAliasesOrOptions)) {
    return {
      localAddresses: localAliasesOrOptions,
      avoidAddresses,
      routeInspector: null,
    };
  }
  return {
    localAddresses: localAliasesOrOptions.localAddresses || [],
    avoidAddresses: localAliasesOrOptions.avoidAddresses || [],
    routeInspector: localAliasesOrOptions.routeInspector || getAddressRouteStatus,
  };
}

function describeBlockedAddress(address, local, avoid, routeStatus) {
  if (avoid.has(address)) return { address, reason: "retry_avoid" };
  if (local.has(address)) return { address, reason: "local_address" };
  if (routeStatus?.local) {
    return {
      address,
      reason: routeStatus.reason || "local_route",
      interface: routeStatus.route?.interface,
      flags: routeStatus.route?.flags,
    };
  }
  return null;
}

function pickReachableAddress(addresses, localAliasesOrOptions = [], avoidAddresses = []) {
  const options = normalizePickOptions(localAliasesOrOptions, avoidAddresses);
  const local = new Set(options.localAddresses);
  const avoid = new Set(options.avoidAddresses);
  for (const address of uniqueAddresses(addresses)) {
    const routeStatus = options.routeInspector ? options.routeInspector(address) : null;
    if (!describeBlockedAddress(address, local, avoid, routeStatus)) return address;
  }
  return null;
}

function createLocalAliasResolutionError(hostname, addresses, localAliasesOrOptions = []) {
  const options = normalizePickOptions(localAliasesOrOptions);
  const local = new Set(options.localAddresses);
  const avoid = new Set(options.avoidAddresses);
  const blocked = uniqueAddresses(addresses)
    .map((address) => describeBlockedAddress(
      address,
      local,
      avoid,
      options.routeInspector ? options.routeInspector(address) : null,
    ))
    .filter(Boolean);
  const detail = blocked.length
    ? blocked.map((item) => {
      const via = item.interface ? ` via ${item.interface}` : "";
      return `${item.address} (${item.reason}${via})`;
    }).join(", ")
    : "no reachable IPv4 address";
  const error = new Error(`MITM upstream ${hostname} resolved only to ${detail}`);
  error.code = "MITM_LOCAL_ALIAS_ROUTE";
  error.addresses = addresses;
  error.blockedAddresses = blocked;
  return error;
}

module.exports = {
  pickReachableAddress,
  createLocalAliasResolutionError,
  getAddressRouteStatus,
  isLocalRoute,
  parseMacRouteOutput,
};
