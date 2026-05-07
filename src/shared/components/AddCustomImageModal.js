"use client";

import { useState, useEffect } from "react";
import PropTypes from "prop-types";
import { Modal, Input, Button, Badge } from "@/shared/components";
import { IMAGE_SIZE_OPTIONS } from "@/shared/constants/imageSizes";
import { parseImageCurl } from "@/shared/utils/compatibleProvider";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";

export default function AddCustomImageModal({ isOpen, onClose, onCreated, onSaved, node }) {
  const isEdit = !!node;
  const [formData, setFormData] = useState({
    name: "",
    prefix: "",
    baseUrl: DEFAULT_BASE_URL,
    defaultSize: "",
  });
  const [curlText, setCurlText] = useState("");
  const [parseError, setParseError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [checkKey, setCheckKey] = useState("");
  const [checkModelId, setCheckModelId] = useState("");
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    setValidationResult(null);
    setCheckKey("");
    setCheckModelId("");
    setCurlText("");
    setParseError("");
    if (isEdit) {
      setFormData({
        name: node.name || "",
        prefix: node.prefix || "",
        baseUrl: node.baseUrl || DEFAULT_BASE_URL,
        defaultSize: node.defaultSize || "",
      });
    } else {
      setFormData({ name: "", prefix: "", baseUrl: DEFAULT_BASE_URL, defaultSize: "" });
    }
  }, [isOpen, isEdit, node]);

  const handleParseCurl = () => {
    try {
      const parsed = parseImageCurl(curlText);
      setFormData({
        name: parsed.defaultName,
        prefix: parsed.defaultPrefix,
        baseUrl: parsed.baseUrl,
        defaultSize: parsed.imageSize || "",
      });
      setCheckKey(parsed.apiKey || "");
      setCheckModelId(parsed.modelId || "");
      setParseError("");
    } catch (error) {
      setParseError(error.message || "Failed to parse curl");
    }
  };

  const handleSubmit = async () => {
    if (!formData.name.trim() || !formData.prefix.trim() || !formData.baseUrl.trim()) return;
    setSubmitting(true);
    try {
      const url = isEdit ? `/api/provider-nodes/${node.id}` : "/api/provider-nodes";
      const method = isEdit ? "PUT" : "POST";
      const payload = {
        name: formData.name,
        prefix: formData.prefix,
        baseUrl: formData.baseUrl,
        defaultSize: formData.defaultSize.trim(),
      };
      if (!isEdit) payload.type = "custom-image";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        if (isEdit) onSaved?.(data.node);
        else onCreated?.(data.node);
      }
    } catch (error) {
      console.log("Error saving custom image node:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleValidate = async () => {
    setValidating(true);
    try {
      const res = await fetch("/api/provider-nodes/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: formData.baseUrl,
          apiKey: checkKey,
          type: "custom-image",
          modelId: checkModelId.trim() || undefined,
          imageSize: formData.defaultSize.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.normalizedBaseUrl) {
        setFormData((prev) => ({ ...prev, baseUrl: data.normalizedBaseUrl }));
      }
      setValidationResult(data);
    } catch {
      setValidationResult({ valid: false, error: "Network error" });
    } finally {
      setValidating(false);
    }
  };

  const renderValidationResult = () => {
    if (!validationResult) return null;
    const { valid, error } = validationResult;
    if (valid) {
      return <Badge variant="success">Valid</Badge>;
    }
    return (
      <div className="flex flex-col gap-1">
        <Badge variant="error">Invalid</Badge>
        {error && <span className="text-sm text-red-500">{error}</span>}
      </div>
    );
  };

  return (
    <Modal isOpen={isOpen} title={isEdit ? "Edit Custom Image" : "Add Custom Image"} onClose={onClose}>
      <div className="flex flex-col gap-4">
        {!isEdit && (
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-text-main">Import From cURL</label>
            <textarea
              value={curlText}
              onChange={(e) => setCurlText(e.target.value)}
              placeholder={"curl https://api.example.com/v1/images/generations -H \"Authorization: Bearer sk-xxx\" -H \"Content-Type: application/json\" -d '{\"model\":\"gpt-image-1\",\"prompt\":\"A cute cat\",\"size\":\"1024x1024\",\"n\":1}'"}
              className="min-h-32 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-text-muted">Paste a working OpenAI-compatible image curl command to auto-fill fields.</p>
              <Button onClick={handleParseCurl} variant="secondary">Parse cURL</Button>
            </div>
            {parseError && <p className="text-sm text-red-500">{parseError}</p>}
          </div>
        )}

        <Input
          label="Name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="SenseNova Image"
          hint="Required. A friendly label for this image provider."
        />
        <Input
          label="Prefix"
          value={formData.prefix}
          onChange={(e) => setFormData({ ...formData, prefix: e.target.value })}
          placeholder="sensenova"
          hint="Required. Used as the provider prefix for model IDs (e.g. sensenova/sensenova-u1-fast)."
        />
        <Input
          label="Base URL"
          value={formData.baseUrl}
          onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
          placeholder="https://token.sensenova.cn/v1"
          hint="The app will append /images/generations automatically."
        />
        <div>
          <label className="text-xs text-text-muted mb-1 block">Default Size</label>
          <select
            className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:border-primary"
            value={formData.defaultSize}
            onChange={(e) => setFormData({ ...formData, defaultSize: e.target.value })}
          >
            <option value="">Use fallback</option>
            {IMAGE_SIZE_OPTIONS.filter((size) => size !== "auto").map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-text-muted">
            Used by model test and request example for vendors with restricted sizes.
          </p>
        </div>
        <Input
          label="API Key (for Check)"
          type="password"
          value={checkKey}
          onChange={(e) => setCheckKey(e.target.value)}
        />
        <Input
          label="Model ID (for Check)"
          value={checkModelId}
          onChange={(e) => setCheckModelId(e.target.value)}
          placeholder="e.g. sensenova-u1-fast"
          hint="Required for validation. Will send a test image generation request."
        />
        <div className="flex items-center gap-3">
          <Button
            onClick={handleValidate}
            disabled={!checkKey || !checkModelId.trim() || validating || !formData.baseUrl.trim()}
            variant="secondary"
          >
            {validating ? "Checking..." : "Check"}
          </Button>
          {renderValidationResult()}
        </div>
        <div className="flex gap-2">
          <Button
            onClick={handleSubmit}
            fullWidth
            disabled={!formData.name.trim() || !formData.prefix.trim() || !formData.baseUrl.trim() || submitting}
          >
            {submitting ? (isEdit ? "Saving..." : "Creating...") : (isEdit ? "Save" : "Create")}
          </Button>
          <Button onClick={onClose} variant="ghost" fullWidth>Cancel</Button>
        </div>
      </div>
    </Modal>
  );
}

AddCustomImageModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onCreated: PropTypes.func,
  onSaved: PropTypes.func,
  node: PropTypes.shape({
    id: PropTypes.string,
    name: PropTypes.string,
    prefix: PropTypes.string,
    baseUrl: PropTypes.string,
    defaultSize: PropTypes.string,
  }),
};
