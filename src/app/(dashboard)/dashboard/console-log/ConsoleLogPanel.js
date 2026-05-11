"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Card } from "@/shared/components";
import { CONSOLE_LOG_CONFIG } from "@/shared/constants/config";

const LOG_LEVEL_COLORS = {
  LOG: "text-green-400",
  INFO: "text-blue-400",
  WARN: "text-yellow-400",
  ERROR: "text-red-400",
  DEBUG: "text-purple-400",
};

function colorLine(line) {
  const match = line.match(/\[(\w+)\]/g);
  const levelTag = match ? match[1]?.replace(/\[|\]/g, "") : null;
  const color = LOG_LEVEL_COLORS[levelTag] || "text-green-400";
  return <span className={color}>{line}</span>;
}

export default function ConsoleLogPanel({
  active = true,
  heightClassName = "h-[calc(100vh-220px)]",
  compact = false,
  showToolbar = true,
}) {
  const [logs, setLogs] = useState([]);
  const [connected, setConnected] = useState(false);
  const logRef = useRef(null);

  const handleClear = async () => {
    try {
      await fetch("/api/translator/console-logs", { method: "DELETE" });
      // UI clears through the SSE "clear" event.
    } catch (err) {
      console.error("Failed to clear console logs:", err);
    }
  };

  useEffect(() => {
    if (!active) {
      setConnected(false);
      return undefined;
    }

    const es = new EventSource("/api/translator/console-logs/stream");

    es.onopen = () => setConnected(true);

    es.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "init") {
        setLogs(msg.logs.slice(-CONSOLE_LOG_CONFIG.maxLines));
      } else if (msg.type === "line") {
        setLogs((prev) => {
          const next = [...prev, msg.line];
          return next.length > CONSOLE_LOG_CONFIG.maxLines ? next.slice(-CONSOLE_LOG_CONFIG.maxLines) : next;
        });
      } else if (msg.type === "clear") {
        setLogs([]);
      }
    };

    es.onerror = () => setConnected(false);

    return () => es.close();
  }, [active]);

  useEffect(() => {
    if (!logRef.current) return;
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  const body = (
    <>
      {showToolbar && (
        <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-2">
          <div className="flex items-center gap-2 text-[11px] text-text-muted">
            <span className={`size-2 rounded-full ${connected ? "bg-green-500" : "bg-text-muted/40"}`} />
            <span>{connected ? "Live" : "Disconnected"}</span>
          </div>
          <Button size="sm" variant="outline" icon="delete" onClick={handleClear}>
            Clear
          </Button>
        </div>
      )}
      <div
        ref={logRef}
        className={`overflow-y-auto bg-black p-4 font-mono text-xs ${heightClassName} ${compact ? "rounded-lg" : "rounded-b-lg"}`}
      >
        {logs.length === 0 ? (
          <span className="text-text-muted">No console logs yet.</span>
        ) : (
          <div className="space-y-0.5" data-i18n-skip="true">
            {logs.map((line, i) => (
              <div key={`${i}-${line.slice(0, 32)}`}>{colorLine(line)}</div>
            ))}
          </div>
        )}
      </div>
    </>
  );

  if (compact) return body;

  return <Card>{body}</Card>;
}
