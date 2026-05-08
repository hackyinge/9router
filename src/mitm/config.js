// All intercepted domains + URL patterns per tool

const TARGET_HOSTS = [
  "daily-cloudcode-pa.googleapis.com",
  "cloudcode-pa.googleapis.com",
  "daily-cloudcode-pa.sandbox.googleapis.com",
  "api.individual.githubcopilot.com",
  "q.us-east-1.amazonaws.com",
  "api2.cursor.sh",
  "openrouter.ai",
  "api.openrouter.ai",
];

const URL_PATTERNS = {
  antigravity: [":generateContent", ":streamGenerateContent"],
  copilot: ["/chat/completions", "/v1/messages", "/responses"],
  kiro: ["/generateAssistantResponse"],
  cursor: ["/BidiAppend", "/RunSSE", "/RunPoll", "/Run"],
  openrouter: ["/models", "/api/v1/models", "/chat/completions", "/v1/chat/completions", "/v1/messages", "/responses"],
};

// Synonym map: rawModel from request → canonical alias key in mitmAlias DB
const MODEL_SYNONYMS = {
  antigravity: {
    "gemini-default": "gemini-3-flash",
    "gemini-3-flash-agent": "gemini-3-flash",
    "gemini-3.1-flash-lite": "gemini-3-flash",
    "gemini-2.5-flash-lite": "gemini-3-flash",
    "gemini-2.5-flash": "gemini-3-flash",
    __defaults: {
      "gemini-3.1-pro-high": "gemini-3.1-pro-high",
      "gemini-3.1-pro-low": "gemini-3.1-pro-low",
      "gemini-3-flash-agent": "cx/gpt-5.5",
      "gemini-3-flash": "cx/gpt-5.5",
      "claude-sonnet-4-6": "claude-sonnet-4-6",
      "claude-opus-4-6-thinking": "claude-opus-4-6-thinking",
      "gpt-oss-120b-medium": "gpt-oss-120b-medium",
    },
  },
};

// URL substrings whose request/response should NOT be dumped to file (telemetry, polling, empty)
const LOG_BLACKLIST_URL_PARTS = [
  "recordCodeAssistMetrics",
  "recordTrajectoryAnalytics",
  "fetchAdminControls",
  "listExperiments",
  "fetchUserInfo",
];

function getToolForHost(host) {
  const h = (host || "").split(":")[0];
  if (h === "api.individual.githubcopilot.com") return "copilot";
  if (h === "daily-cloudcode-pa.googleapis.com" || h === "cloudcode-pa.googleapis.com" || h === "daily-cloudcode-pa.sandbox.googleapis.com") return "antigravity";
  if (h === "q.us-east-1.amazonaws.com") return "kiro";
  if (h === "api2.cursor.sh") return "cursor";
  if (h === "openrouter.ai" || h === "api.openrouter.ai") return "openrouter";
  return null;
}

module.exports = { TARGET_HOSTS, URL_PATTERNS, MODEL_SYNONYMS, LOG_BLACKLIST_URL_PARTS, getToolForHost };
