const LOCAL_ANTIGRAVITY_PROJECT = "local-openrouterx";

function createLocalAntigravityTier(options = {}) {
  const tier = {
    id: "standard-tier",
    name: "Gemini Code Assist",
    description: "Unlimited coding assistant with the most powerful Gemini models",
    userDefinedCloudaicompanionProject: true,
    privacyNotice: {},
    usesGcpTos: true,
  };

  if (options.isDefault) tier.isDefault = true;
  return tier;
}

function createLocalAntigravityLoadCodeAssistPayload() {
  const currentTier = createLocalAntigravityTier();

  return {
    cloudaicompanionProject: LOCAL_ANTIGRAVITY_PROJECT,
    currentTier,
    userTier: currentTier,
    allowedTiers: [createLocalAntigravityTier({ isDefault: true })],
    gcpManaged: false,
    tosAccepted: true,
    done: true,
    releaseChannel: {
      type: "EXPERIMENTAL",
      name: "Preview Channel",
    },
    paidTier: currentTier,
  };
}

function createLocalAntigravityOnboardUserPayload() {
  const response = createLocalAntigravityLoadCodeAssistPayload();

  return {
    done: true,
    cloudaicompanionProject: LOCAL_ANTIGRAVITY_PROJECT,
    currentTier: response.currentTier,
    allowedTiers: response.allowedTiers,
    gcpManaged: false,
    response,
  };
}

module.exports = {
  LOCAL_ANTIGRAVITY_PROJECT,
  createLocalAntigravityLoadCodeAssistPayload,
  createLocalAntigravityOnboardUserPayload,
};
