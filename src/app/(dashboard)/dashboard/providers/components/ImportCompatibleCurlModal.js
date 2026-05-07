"use client";

import { useState } from "react";
import PropTypes from "prop-types";
import { Badge, Button, Input, Modal, Select } from "@/shared/components";
import { parseCompatibleCurl } from "@/shared/utils/compatibleProvider";

const TYPE_OPTIONS = [
  { value: "openai-compatible", label: "OpenAI Compatible" },
  { value: "anthropic-compatible", label: "Anthropic Compatible" },
];

const API_TYPE_OPTIONS = [
  { value: "chat", label: "Chat Completions" },
  { value: "responses", label: "Responses API" },
];

export default function ImportCompatibleCurlModal({ isOpen, onClose, onImported, notify }) {
  const [curlText, setCurlText] = useState("");
  const [parsed, setParsed] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [parseError, setParseError] = useState("");
  const [formData, setFormData] = useState({
    type: "openai-compatible",
    apiType: "chat",
    name: "",
    prefix: "",
    baseUrl: "",
    connectionName: "Imported Key",
    apiKey: "",
    modelId: "",
  });

  const resetState = () => {
    setCurlText("");
    setParsed(null);
    setSubmitting(false);
    setParseError("");
    setFormData({
      type: "openai-compatible",
      apiType: "chat",
      name: "",
      prefix: "",
      baseUrl: "",
      connectionName: "Imported Key",
      apiKey: "",
      modelId: "",
    });
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleParse = () => {
    try {
      const result = parseCompatibleCurl(curlText);
      setParsed(result);
      setParseError("");
      setFormData({
        type: result.type,
        apiType: result.apiType || "chat",
        name: result.defaultName,
        prefix: result.defaultPrefix,
        baseUrl: result.baseUrl,
        connectionName: result.defaultConnectionName,
        apiKey: result.apiKey,
        modelId: result.modelId,
      });
    } catch (error) {
      setParsed(null);
      setParseError(error.message || "Failed to parse curl");
    }
  };

  const handleCreate = async () => {
    if (!formData.name.trim() || !formData.prefix.trim() || !formData.baseUrl.trim()) return;

    setSubmitting(true);
    try {
      const nodePayload = {
        name: formData.name.trim(),
        prefix: formData.prefix.trim(),
        baseUrl: formData.baseUrl.trim(),
        type: formData.type,
      };

      if (formData.type === "openai-compatible") {
        nodePayload.apiType = formData.apiType;
      }

      const nodeRes = await fetch("/api/provider-nodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nodePayload),
      });
      const nodeData = await nodeRes.json();
      if (!nodeRes.ok) {
        throw new Error(nodeData.error || "Failed to create compatible provider");
      }

      let createdConnection = null;
      if (formData.apiKey.trim()) {
        const connectionRes = await fetch("/api/providers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: nodeData.node.id,
            apiKey: formData.apiKey.trim(),
            name: formData.connectionName.trim() || "Imported Key",
            testStatus: "unknown",
          }),
        });
        const connectionData = await connectionRes.json();
        if (!connectionRes.ok) {
          throw new Error(connectionData.error || "Compatible provider created, but API key import failed");
        }
        createdConnection = connectionData.connection;
      }

      notify.success("Compatible provider imported from cURL");
      onImported?.({ node: nodeData.node, connection: createdConnection });
      handleClose();
    } catch (error) {
      notify.error(error.message || "Failed to import curl");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} title="Import Compatible Provider From cURL" onClose={handleClose}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-text-main">Paste cURL</label>
          <textarea
            value={curlText}
            onChange={(e) => setCurlText(e.target.value)}
            placeholder={"curl --request POST --url https://api.example.com/v1/chat/completions --header 'Authorization: Bearer sk-xxx' --header 'Content-Type: application/json' --data '{\"model\":\"gpt-4o-mini\",\"messages\":[{\"role\":\"user\",\"content\":\"Hello\"}]}'"}
            className="min-h-40 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-text-muted">
              Supports full endpoint URLs like `/v1/chat/completions`, `/responses`, or `/v1/messages`.
            </p>
            <Button onClick={handleParse} variant="secondary" className="w-full sm:w-auto">
              Parse cURL
            </Button>
          </div>
          {parseError && <p className="text-sm text-red-500">{parseError}</p>}
        </div>

        {parsed && (
          <>
            <div className="flex flex-wrap gap-2">
              <Badge variant="success">Detected</Badge>
              <Badge variant="default">
                {formData.type === "anthropic-compatible" ? "Anthropic Compatible" : "OpenAI Compatible"}
              </Badge>
              {formData.type === "openai-compatible" && (
                <Badge variant="default">
                  {formData.apiType === "responses" ? "Responses API" : "Chat Completions"}
                </Badge>
              )}
            </div>

            <Select
              label="Provider Type"
              value={formData.type}
              options={TYPE_OPTIONS}
              onChange={(e) => setFormData((prev) => ({
                ...prev,
                type: e.target.value,
                apiType: e.target.value === "anthropic-compatible" ? "chat" : prev.apiType,
              }))}
            />

            {formData.type === "openai-compatible" && (
              <Select
                label="API Type"
                value={formData.apiType}
                options={API_TYPE_OPTIONS}
                onChange={(e) => setFormData((prev) => ({ ...prev, apiType: e.target.value }))}
              />
            )}

            <Input
              label="Provider Name"
              value={formData.name}
              onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Compatible Provider"
            />
            <Input
              label="Prefix"
              value={formData.prefix}
              onChange={(e) => setFormData((prev) => ({ ...prev, prefix: e.target.value }))}
              placeholder="oc-example"
            />
            <Input
              label="Base URL"
              value={formData.baseUrl}
              onChange={(e) => setFormData((prev) => ({ ...prev, baseUrl: e.target.value }))}
              placeholder="https://api.example.com/v1"
            />
            <Input
              label="Connection Name"
              value={formData.connectionName}
              onChange={(e) => setFormData((prev) => ({ ...prev, connectionName: e.target.value }))}
              placeholder="Imported Key"
            />
            <Input
              label="API Key"
              type="password"
              value={formData.apiKey}
              onChange={(e) => setFormData((prev) => ({ ...prev, apiKey: e.target.value }))}
              placeholder="Bearer token from curl"
            />
            <Input
              label="Detected Model"
              value={formData.modelId}
              onChange={(e) => setFormData((prev) => ({ ...prev, modelId: e.target.value }))}
              placeholder="Optional"
            />
          </>
        )}

        <div className="flex gap-2">
          <Button
            onClick={handleCreate}
            fullWidth
            disabled={!parsed || !formData.name.trim() || !formData.prefix.trim() || !formData.baseUrl.trim() || submitting}
          >
            {submitting ? "Importing..." : "Create Provider"}
          </Button>
          <Button onClick={handleClose} variant="ghost" fullWidth>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}

ImportCompatibleCurlModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onImported: PropTypes.func,
  notify: PropTypes.shape({
    success: PropTypes.func.isRequired,
    error: PropTypes.func.isRequired,
  }).isRequired,
};
