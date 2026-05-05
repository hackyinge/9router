"use client";

import { useState } from "react";
import PropTypes from "prop-types";

export default function AvailableModelRow({
  model,
  fullModel,
  copied,
  onCopy,
  testStatus,
  onTest,
  isTesting,
  requestSnippet,
  onRunRequest,
}) {
  const [showRequest, setShowRequest] = useState(false);
  const [running, setRunning] = useState(false);
  const [responseText, setResponseText] = useState("");
  const [responseOk, setResponseOk] = useState(null);
  const [latencyMs, setLatencyMs] = useState(null);
  const borderColor = testStatus === "ok"
    ? "border-green-500/40"
    : testStatus === "error"
    ? "border-red-500/40"
    : "border-border";

  const iconColor = testStatus === "ok"
    ? "#22c55e"
    : testStatus === "error"
    ? "#ef4444"
    : undefined;

  const handleRun = async () => {
    if (!onRunRequest || running) return;
    setRunning(true);
    try {
      const result = await onRunRequest();
      setResponseText(result?.responseText || "");
      setResponseOk(result?.ok === true);
      setLatencyMs(typeof result?.latencyMs === "number" ? result.latencyMs : null);
    } catch (error) {
      setResponseText(error?.message || "Request failed");
      setResponseOk(false);
      setLatencyMs(null);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className={`group px-3 py-2 rounded-lg border ${borderColor} hover:bg-sidebar/50`}>
      <div className="flex items-center gap-2">
        <span
          className="material-symbols-outlined text-base"
          style={iconColor ? { color: iconColor } : undefined}
        >
          {testStatus === "ok" ? "check_circle" : testStatus === "error" ? "cancel" : "smart_toy"}
        </span>
        <div className="flex flex-col gap-1 min-w-0 flex-1">
          <code className="text-xs text-text-muted font-mono bg-sidebar px-1.5 py-0.5 rounded break-all">
            {fullModel}
          </code>
          {model.name && <span className="text-[9px] text-text-muted/70 italic pl-1">{model.name}</span>}
        </div>
        {onTest && (
          <div className="relative group/btn">
            <button
              onClick={onTest}
              disabled={isTesting}
              className={`p-0.5 hover:bg-sidebar rounded text-text-muted hover:text-primary transition-opacity ${isTesting ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
            >
              <span
                className="material-symbols-outlined text-sm"
                style={isTesting ? { animation: "spin 1s linear infinite" } : undefined}
              >
                {isTesting ? "progress_activity" : "science"}
              </span>
            </button>
            <span className="pointer-events-none absolute mt-1 top-5 left-1/2 -translate-x-1/2 text-[10px] text-text-muted whitespace-nowrap opacity-0 group-hover/btn:opacity-100 transition-opacity">
              {isTesting ? "Testing..." : "Test"}
            </span>
          </div>
        )}
        {requestSnippet && (
          <div className="relative group/btn">
            <button
              onClick={() => setShowRequest((value) => !value)}
              className="p-0.5 hover:bg-sidebar rounded text-text-muted hover:text-primary transition-opacity opacity-0 group-hover:opacity-100"
            >
              <span className="material-symbols-outlined text-sm">
                {showRequest ? "expand_less" : "terminal"}
              </span>
            </button>
            <span className="pointer-events-none absolute mt-1 top-5 left-1/2 -translate-x-1/2 text-[10px] text-text-muted whitespace-nowrap opacity-0 group-hover/btn:opacity-100 transition-opacity">
              {showRequest ? "Hide curl" : "Show curl"}
            </span>
          </div>
        )}
        <div className="relative group/btn">
          <button
            onClick={() => onCopy(fullModel, `model-${fullModel}`)}
            className="p-0.5 hover:bg-sidebar rounded text-text-muted hover:text-primary"
          >
            <span className="material-symbols-outlined text-sm">
              {copied === `model-${fullModel}` ? "check" : "content_copy"}
            </span>
          </button>
          <span className="pointer-events-none absolute mt-1 top-5 left-1/2 -translate-x-1/2 text-[10px] text-text-muted whitespace-nowrap opacity-0 group-hover/btn:opacity-100 transition-opacity">
            {copied === `model-${fullModel}` ? "Copied!" : "Copy"}
          </span>
        </div>
      </div>
      {requestSnippet && showRequest && (
        <div className="mt-3 pl-6">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Request</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onCopy(requestSnippet, `request-${fullModel}`)}
                className="flex items-center gap-1 text-[10px] text-text-muted hover:text-primary transition-colors"
              >
                <span className="material-symbols-outlined text-[14px]">
                  {copied === `request-${fullModel}` ? "check" : "content_copy"}
                </span>
                {copied === `request-${fullModel}` ? "Copied" : "Copy"}
              </button>
              {onRunRequest && (
                <button
                  onClick={handleRun}
                  disabled={running}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-primary text-white text-[10px] font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span
                    className="material-symbols-outlined text-[14px]"
                    style={running ? { animation: "spin 1s linear infinite" } : undefined}
                  >
                    {running ? "progress_activity" : "play_arrow"}
                  </span>
                  {running ? "Running..." : "Run"}
                </button>
              )}
            </div>
          </div>
          <pre className="bg-sidebar rounded-lg px-3 py-2.5 text-[11px] font-mono text-text-main overflow-x-auto whitespace-pre wrap-break-word">
            {requestSnippet}
          </pre>
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">
                Response {latencyMs !== null && <span className="font-normal normal-case">&#9889; {latencyMs}ms</span>}
              </span>
              {responseText && (
                <button
                  onClick={() => onCopy(responseText, `response-${fullModel}`)}
                  className="flex items-center gap-1 text-[10px] text-text-muted hover:text-primary transition-colors"
                >
                  <span className="material-symbols-outlined text-[14px]">
                    {copied === `response-${fullModel}` ? "check" : "content_copy"}
                  </span>
                  {copied === `response-${fullModel}` ? "Copied" : "Copy"}
                </button>
              )}
            </div>
            <pre className={`bg-sidebar rounded-lg px-3 py-2.5 text-[11px] font-mono overflow-x-auto whitespace-pre wrap-break-word ${responseOk === false ? "text-red-400" : "text-text-main"} opacity-80`}>
              {responseText || '{\n  "message": "Response will appear here after running."\n}'}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

AvailableModelRow.propTypes = {
  model: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string,
  }).isRequired,
  fullModel: PropTypes.string.isRequired,
  copied: PropTypes.string,
  onCopy: PropTypes.func.isRequired,
  testStatus: PropTypes.oneOf(["ok", "error"]),
  onTest: PropTypes.func,
  isTesting: PropTypes.bool,
  requestSnippet: PropTypes.string,
  onRunRequest: PropTypes.func,
};
