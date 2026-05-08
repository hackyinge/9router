const REAL_AVAILABLE_MODELS_FIXTURE = require("./antigravityAvailableModels.fixture.json");

const BASE_MODEL_EXPERIMENTS = {
  experiments: {
    CASCADE_USE_EXPERIMENT_CHECKPOINTER: {
      stringValue: JSON.stringify({
        strategy: "CHECKPOINT_STRATEGY_SINGLE_PROMPT",
        max_token_limit: "128000",
        token_threshold: "50000",
        max_overhead_ratio: "0.15",
        moving_window_size: "1",
        enabled: true,
        max_output_tokens: "16384",
        checkpoint_model: "MODEL_PLACEHOLDER_M50",
        retry_config: {
          max_retries: 0,
          initial_sleep_duration_ms: 1000,
          exponential_multiplier: 2,
          include_error_feedback: false,
        },
      }, null, 4),
    },
  },
};

const COMMON_CODE_MIME_TYPES = {
  "application/json": true,
  "application/pdf": true,
  "application/rtf": true,
  "application/x-ipynb+json": true,
  "application/x-javascript": true,
  "application/x-python-code": true,
  "application/x-typescript": true,
  "image/heic": true,
  "image/heif": true,
  "image/jpeg": true,
  "image/png": true,
  "image/webp": true,
  "text/css": true,
  "text/csv": true,
  "text/html": true,
  "text/javascript": true,
  "text/markdown": true,
  "text/plain": true,
  "text/rtf": true,
  "text/x-python": true,
  "text/x-python-script": true,
  "text/x-typescript": true,
  "text/xml": true,
  "video/mp4": true,
  "video/webm": true,
};

function quota(resetDays = 7) {
  const resetTime = new Date(Date.now() + resetDays * 24 * 60 * 60 * 1000).toISOString();
  return { remainingFraction: 1, resetTime };
}

function geminiModel(displayName, model, options = {}) {
  return {
    displayName,
    supportsImages: true,
    supportsThinking: true,
    thinkingBudget: options.thinkingBudget ?? 1024,
    minThinkingBudget: options.minThinkingBudget ?? 128,
    recommended: true,
    maxTokens: 1048576,
    maxOutputTokens: 65535,
    tokenizerType: "LLAMA_WITH_SPECIAL",
    quotaInfo: quota(options.resetDays),
    model,
    apiProvider: "API_PROVIDER_GOOGLE_GEMINI",
    modelProvider: "MODEL_PROVIDER_GOOGLE",
    supportsVideo: true,
    supportedMimeTypes: COMMON_CODE_MIME_TYPES,
    requiresImageOutputOutsideFunctionResponses: options.requiresImageOutputOutsideFunctionResponses,
    modelExperiments: BASE_MODEL_EXPERIMENTS,
  };
}

function anthropicModel(displayName, model) {
  return {
    displayName,
    supportsImages: true,
    supportsThinking: true,
    thinkingBudget: 1024,
    recommended: true,
    maxTokens: 250000,
    maxOutputTokens: 64000,
    tokenizerType: "LLAMA_WITH_SPECIAL",
    quotaInfo: quota(),
    model,
    apiProvider: "API_PROVIDER_ANTHROPIC_VERTEX",
    modelProvider: "MODEL_PROVIDER_ANTHROPIC",
    supportedMimeTypes: {
      "image/heic": true,
      "image/heif": true,
      "image/jpeg": true,
      "image/png": true,
      "image/webp": true,
    },
    modelExperiments: BASE_MODEL_EXPERIMENTS,
  };
}

function openAiModel(displayName, model) {
  return {
    displayName,
    supportsThinking: true,
    thinkingBudget: 8192,
    recommended: true,
    maxTokens: 131072,
    maxOutputTokens: 32768,
    tokenizerType: "LLAMA_WITH_SPECIAL",
    quotaInfo: quota(),
    model,
    apiProvider: "API_PROVIDER_OPENAI_VERTEX",
    modelProvider: "MODEL_PROVIDER_OPENAI",
    modelExperiments: BASE_MODEL_EXPERIMENTS,
  };
}

function tabModel(model, maxTokens = 16384) {
  return {
    maxTokens,
    maxOutputTokens: 4096,
    tokenizerType: "QWEN2",
    quotaInfo: { remainingFraction: 1 },
    model,
    apiProvider: "API_PROVIDER_INTERNAL",
    supportsCumulativeContext: true,
    supportsEstimateTokenCounter: true,
    isInternal: true,
    promptTemplaterType: "PROMPT_TEMPLATER_TYPE_CHATML",
    toolFormatterType: "TOOL_FORMATTER_TYPE_XML",
    requiresLeadInGeneration: true,
  };
}

function googleTabModel(model, maxTokens = 16384) {
  return {
    maxTokens,
    maxOutputTokens: 4096,
    tokenizerType: "LLAMA_WITH_SPECIAL",
    quotaInfo: { remainingFraction: 1 },
    model,
    apiProvider: "API_PROVIDER_GOOGLE_GEMINI",
    modelProvider: "MODEL_PROVIDER_GOOGLE",
    supportsCumulativeContext: true,
    supportsEstimateTokenCounter: true,
    isInternal: true,
    promptTemplaterType: "PROMPT_TEMPLATER_TYPE_CHATML",
    toolFormatterType: "TOOL_FORMATTER_TYPE_XML",
    requiresLeadInGeneration: true,
  };
}

function imageModel(displayName, model) {
  return {
    displayName,
    supportsImages: true,
    maxTokens: 32768,
    maxOutputTokens: 8192,
    tokenizerType: "LLAMA_WITH_SPECIAL",
    quotaInfo: quota(),
    model,
    apiProvider: "API_PROVIDER_GOOGLE_GEMINI",
    modelProvider: "MODEL_PROVIDER_GOOGLE",
    supportedMimeTypes: COMMON_CODE_MIME_TYPES,
  };
}

function freshResetTime(days = 7) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function cloneFixtureWithFreshQuota() {
  const payload = JSON.parse(JSON.stringify(REAL_AVAILABLE_MODELS_FIXTURE));
  const agentIds = new Set(
    (payload.agentModelSorts || [])
      .flatMap((sort) => sort.groups || [])
      .flatMap((group) => group.modelIds || []),
  );

  for (const [id, model] of Object.entries(payload.models || {})) {
    if (!model.quotaInfo) model.quotaInfo = { remainingFraction: 1 };
    model.quotaInfo.remainingFraction = typeof model.quotaInfo.remainingFraction === "number"
      ? model.quotaInfo.remainingFraction
      : 1;
    if (model.quotaInfo.resetTime) {
      model.quotaInfo.resetTime = freshResetTime(agentIds.has(id) ? 7 : 1);
    }
  }

  return payload;
}

function buildAntigravityAvailableModelsResponse() {
  if (REAL_AVAILABLE_MODELS_FIXTURE?.models) return cloneFixtureWithFreshQuota();

  const models = {
    "gemini-2.5-flash-thinking": geminiModel("Gemini 3.1 Flash Lite", "MODEL_GOOGLE_GEMINI_2_5_FLASH_THINKING"),
    "gemini-2.5-pro": geminiModel("Gemini 2.5 Pro", "MODEL_GOOGLE_GEMINI_2_5_PRO", {
      requiresImageOutputOutsideFunctionResponses: true,
    }),
    "gemini-2.5-flash-lite": geminiModel("Gemini 3.1 Flash Lite", "MODEL_GOOGLE_GEMINI_2_5_FLASH_LITE"),
    "gemini-2.5-flash": geminiModel("Gemini 3.1 Flash Lite", "MODEL_GOOGLE_GEMINI_2_5_FLASH"),
    "gemini-3.1-flash-lite": geminiModel("Gemini 3.1 Flash Lite", "MODEL_PLACEHOLDER_M50"),
    "gemini-3.1-pro-high": geminiModel("Gemini 3.1 Pro (High)", "MODEL_PLACEHOLDER_M37", {
      thinkingBudget: 10001,
    }),
    "gemini-3.1-pro-low": geminiModel("Gemini 3.1 Pro (Low)", "MODEL_PLACEHOLDER_M36", {
      thinkingBudget: 1001,
    }),
    "gemini-3-flash-agent": geminiModel("Gemini 3 Flash", "MODEL_PLACEHOLDER_M84", {
      thinkingBudget: -1,
      minThinkingBudget: 32,
    }),
    "gemini-3-flash": geminiModel("Gemini 3 Flash", "MODEL_PLACEHOLDER_M18", {
      thinkingBudget: -1,
      minThinkingBudget: 32,
    }),
    "gemini-3.1-flash-image": imageModel("Gemini 3.1 Flash Image", "MODEL_PLACEHOLDER_M21"),
    "claude-sonnet-4-6": anthropicModel("Claude Sonnet 4.6 (Thinking)", "MODEL_PLACEHOLDER_M35"),
    "claude-opus-4-6-thinking": anthropicModel("Claude Opus 4.6 (Thinking)", "MODEL_PLACEHOLDER_M26"),
    "gpt-oss-120b-medium": openAiModel("GPT-OSS 120B (Medium)", "MODEL_OPENAI_GPT_OSS_120B_MEDIUM"),
    "tab_flash_lite_preview": googleTabModel("MODEL_PLACEHOLDER_M19"),
    "tab_jump_flash_lite_preview": googleTabModel("MODEL_PLACEHOLDER_M28"),
    "chat_20706": tabModel("MODEL_CHAT_20706"),
    "chat_23310": tabModel("MODEL_CHAT_23310", 32768),
  };

  return {
    models,
    defaultAgentModelId: "gemini-3.1-pro-high",
    agentModelSorts: [
      {
        displayName: "Recommended",
        groups: [
          {
            modelIds: [
              "gemini-3.1-pro-high",
              "gemini-3.1-pro-low",
              "gemini-3-flash-agent",
              "claude-sonnet-4-6",
              "claude-opus-4-6-thinking",
              "gpt-oss-120b-medium",
            ],
          },
        ],
      },
    ],
    commandModelIds: ["gemini-3-flash"],
    tabModelIds: ["chat_20706", "chat_23310"],
    imageGenerationModelIds: [],
    mqueryModelIds: ["gemini-3.1-flash-lite"],
    webSearchModelIds: ["gemini-3.1-flash-lite"],
    commitMessageModelIds: ["gemini-3-flash"],
    audioTranscriptionModelIds: [],
    experimentIds: [],
    tieredModelIds: {},
  };
}

module.exports = { buildAntigravityAvailableModelsResponse };
