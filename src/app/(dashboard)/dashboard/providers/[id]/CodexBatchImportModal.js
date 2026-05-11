"use client";

import { useState } from "react";
import PropTypes from "prop-types";
import { Button, Modal } from "@/shared/components";

export default function CodexBatchImportModal({ isOpen, onClose, onSuccess }) {
  const [files, setFiles] = useState([]);
  const [jsonText, setJsonText] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const resetAndClose = () => {
    setFiles([]);
    setJsonText("");
    setResult(null);
    setError(null);
    onClose();
  };

  const handleImport = async () => {
    setImporting(true);
    setResult(null);
    setError(null);

    try {
      const fileItems = await Promise.all(
        files.map(async (file) => ({
          filename: file.name,
          jsonText: await file.text(),
        }))
      );
      const pasted = jsonText.trim()
        ? [{ filename: "pasted JSON", jsonText: jsonText.trim() }]
        : [];
      const items = [...fileItems, ...pasted];

      if (items.length === 0) {
        throw new Error("Select JSON files or paste JSON first");
      }

      const res = await fetch("/api/oauth/codex/import-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to import accounts");

      setResult(data);
      if (data.imported?.length > 0) onSuccess?.();
    } catch (err) {
      setError(err.message || "Failed to import accounts");
    } finally {
      setImporting(false);
    }
  };

  const importedCount = result?.imported?.length || 0;
  const skippedCount = result?.skipped?.length || 0;

  return (
    <Modal isOpen={isOpen} title="Import Codex Accounts" onClose={resetAndClose} size="lg">
      <div className="flex flex-col gap-4">
        <div className="rounded-lg border border-border bg-surface/50 p-3">
          <label className="mb-2 block text-sm font-medium">JSON files</label>
          <input
            type="file"
            accept=".json,application/json"
            multiple
            onChange={(event) => setFiles(Array.from(event.target.files || []))}
            className="block w-full text-sm text-text-muted file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-primary/90"
          />
          {files.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {files.map((file) => (
                <span key={`${file.name}-${file.size}`} className="rounded bg-primary/10 px-2 py-0.5 text-xs text-primary">
                  {file.name}
                </span>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium">Paste JSON</label>
          <textarea
            value={jsonText}
            onChange={(event) => setJsonText(event.target.value)}
            placeholder='[{ "type": "codex", "access_token": "...", "refresh_token": "..." }]'
            className="h-36 w-full resize-none rounded-md border border-black/10 bg-white px-3 py-2 font-mono text-xs text-text-main shadow-inner transition-all placeholder-text-muted/60 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 dark:border-white/10 dark:bg-white/5"
          />
        </div>

        <div className="rounded-lg border border-border bg-background/60 px-3 py-2 text-xs text-text-muted">
          Auto-detects Codex Session JSON, CLI Proxy API Auth JSON, and Sub2API JSON.
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600">
            {error}
          </div>
        )}

        {result && (
          <div className="rounded-lg border border-border bg-surface/40 p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium text-green-600">{importedCount} imported</span>
              {skippedCount > 0 && <span className="text-text-muted">{skippedCount} skipped</span>}
            </div>
            {result.imported?.length > 0 && (
              <div className="max-h-32 overflow-auto rounded border border-border/70">
                {result.imported.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-2 border-b border-border/70 px-2 py-1.5 last:border-b-0">
                    <span className="min-w-0 truncate text-xs">{item.email || item.displayName || item.name || item.id}</span>
                    <span className="shrink-0 text-xs text-text-muted">{item.sourceFormat}</span>
                  </div>
                ))}
              </div>
            )}
            {result.skipped?.length > 0 && (
              <div className="mt-2 max-h-28 overflow-auto rounded border border-border/70">
                {result.skipped.map((item, index) => (
                  <div key={`${item.filename}-${index}`} className="border-b border-border/70 px-2 py-1.5 text-xs last:border-b-0">
                    <span className="font-medium">{item.filename}</span>
                    <span className="text-text-muted"> · {item.reason}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <Button onClick={handleImport} loading={importing} disabled={importing || (!files.length && !jsonText.trim())} fullWidth>
            Import
          </Button>
          <Button onClick={resetAndClose} variant="ghost" fullWidth>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}

CodexBatchImportModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSuccess: PropTypes.func,
};
