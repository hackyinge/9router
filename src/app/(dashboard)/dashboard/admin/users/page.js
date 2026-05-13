"use client";

import { useState, useEffect } from "react";
import { Card, Button, Modal, Input } from "@/shared/components";
import { AI_PROVIDERS } from "@/shared/constants/providers";
import {
  getEffectiveAllowedProviderConnectionIds,
  getEffectiveAllowedProviders,
  LEGACY_SUB_USER_VISIBLE_PROVIDERS,
} from "@/shared/utils/subUserAccess";

export default function AdminUsersPage() {
  const [users, setUsers] = useState([]);
  const [providerOptions, setProviderOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ username: "", password: "", displayName: "", role: "sub_user", permissions: [], allowedProviders: [], allowedProviderConnectionIds: [], showQuotaTracker: true, codexFastMode: false });
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({ displayName: "", role: "", permissions: [], allowedProviders: [], allowedProviderConnectionIds: [], showQuotaTracker: true, codexFastMode: false, password: "" });
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  useEffect(() => {
    // Guard: only super_admin may access this page
    fetch("/api/auth/me")
      .then(r => r.json())
      .then(data => {
        if (data.role !== "super_admin") {
          window.location.href = "/dashboard/usage";
        } else {
          fetchUsers();
        }
      })
      .catch(() => { window.location.href = "/dashboard/usage"; });
  }, []);

  async function fetchUsers() {
    setLoading(true);
    try {
      const [usersRes, providersRes, nodesRes] = await Promise.all([
        fetch("/api/users"),
        fetch("/api/providers"),
        fetch("/api/provider-nodes"),
      ]);
      const usersData = await usersRes.json();
      const providersData = await providersRes.json();
      const nodesData = await nodesRes.json();
      setUsers(usersData.users || []);
      setProviderOptions(buildProviderOptions(providersData.connections || [], nodesData.nodes || []));
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    setFormError("");
    setFormLoading(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          providerThinking: buildProviderThinking(form.codexFastMode),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setFormError(data.error || "Failed"); return; }
      setShowCreate(false);
      setForm({
        username: "",
        password: "",
        displayName: "",
        role: "sub_user",
        permissions: [],
        allowedProviders: getDefaultAllowedProviders(providerOptions),
        allowedProviderConnectionIds: getDefaultAllowedProviderConnectionIds(providerOptions),
        showQuotaTracker: true,
        codexFastMode: false,
      });
      fetchUsers();
    } catch {
      setFormError("Network error");
    } finally {
      setFormLoading(false);
    }
  }

  function openEdit(user) {
    setEditingUser(user);
    setEditForm({
      displayName: user.displayName,
      role: user.role,
      permissions: user.permissions || [],
      allowedProviders: getEffectiveAllowedProviders(user, getDefaultAllowedProviders(providerOptions)),
      allowedProviderConnectionIds: getEffectiveAllowedProviderConnectionIds(user) ?? getDefaultAllowedProviderConnectionIdsForUser(user, providerOptions),
      showQuotaTracker: user.showQuotaTracker !== false,
      codexFastMode: user.providerThinking?.codex?.fastMode === true,
      password: "",
    });
  }

  async function handleEdit(e) {
    e.preventDefault();
    setFormLoading(true);
    try {
      const body = {
        displayName: editForm.displayName,
        role: editForm.role,
        permissions: editForm.permissions,
        allowedProviders: editForm.allowedProviders,
        allowedProviderConnectionIds: editForm.allowedProviderConnectionIds,
        showQuotaTracker: editForm.showQuotaTracker,
        providerThinking: buildProviderThinking(editForm.codexFastMode),
      };
      if (editForm.password) body.password = editForm.password;
      const res = await fetch(`/api/users/${editingUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) return;
      setEditingUser(null);
      fetchUsers();
    } finally {
      setFormLoading(false);
    }
  }

  async function handleDelete(userId) {
    await fetch(`/api/users/${userId}`, { method: "DELETE" });
    setDeleteConfirm(null);
    fetchUsers();
  }

  const availablePermissions = ["view_usage", "view_logs", "view_keys", "manage_own_keys"];
  const openCreate = () => {
    setForm({
      username: "",
      password: "",
      displayName: "",
      role: "sub_user",
      permissions: [],
      allowedProviders: getDefaultAllowedProviders(providerOptions),
      allowedProviderConnectionIds: getDefaultAllowedProviderConnectionIds(providerOptions),
      showQuotaTracker: true,
      codexFastMode: false,
    });
    setFormError("");
    setShowCreate(true);
  };

  const toggleAllowedProvider = (providerId, setState) => {
    setState((current) => {
      const exists = current.allowedProviders.includes(providerId);
      const providerAccountIds = getProviderAccountIds(providerOptions, providerId);
      return {
        ...current,
        allowedProviders: exists
          ? current.allowedProviders.filter((id) => id !== providerId)
          : [...current.allowedProviders, providerId],
        allowedProviderConnectionIds: exists
          ? current.allowedProviderConnectionIds.filter((id) => !providerAccountIds.includes(id))
          : Array.from(new Set([...current.allowedProviderConnectionIds, ...providerAccountIds])),
      };
    });
  };

  const toggleAllowedConnection = (providerId, connectionId, setState) => {
    setState((current) => {
      const exists = current.allowedProviderConnectionIds.includes(connectionId);
      const nextConnectionIds = exists
        ? current.allowedProviderConnectionIds.filter((id) => id !== connectionId)
        : [...current.allowedProviderConnectionIds, connectionId];
      const nextProviders = current.allowedProviders.includes(providerId)
        ? current.allowedProviders
        : [...current.allowedProviders, providerId];

      return {
        ...current,
        allowedProviders: nextProviders,
        allowedProviderConnectionIds: nextConnectionIds,
      };
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">User Management</h1>
          <p className="text-sm text-text-muted mt-1">Manage sub-users and their permissions</p>
        </div>
        <Button onClick={openCreate}>+ Add Sub-user</Button>
      </div>

      {loading ? (
        <p className="text-text-muted">Loading...</p>
      ) : users.length === 0 ? (
        <Card>
          <p className="text-text-muted text-center py-8">No sub-users yet. Create one to get started.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {users.map(user => (
            <Card key={user.id} className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-lg">
                  {user.displayName?.charAt(0)?.toUpperCase() || user.username?.charAt(0)?.toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold">{user.displayName}</p>
                  <p className="text-sm text-text-muted">@{user.username} · {user.role}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs px-2 py-1 rounded-full bg-surface-alt text-text-muted">
                  {user.permissions?.join(", ") || "no perms"}
                </span>
                <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary">
                  {formatAllowedProviders(user, providerOptions)}
                </span>
                <span className="text-xs px-2 py-1 rounded-full bg-surface-alt text-text-muted">
                  {formatAllowedAccounts(user, providerOptions)}
                </span>
                <span className={`text-xs px-2 py-1 rounded-full ${user.showQuotaTracker !== false ? "bg-emerald-500/10 text-emerald-600" : "bg-surface-alt text-text-muted"}`}>
                  {user.showQuotaTracker !== false ? "Quota On" : "Quota Off"}
                </span>
                <span className={`text-xs px-2 py-1 rounded-full ${user.providerThinking?.codex?.fastMode === true ? "bg-orange-500/10 text-orange-600" : "bg-surface-alt text-text-muted"}`}>
                  {user.providerThinking?.codex?.fastMode === true ? "Fast On" : "Fast Off"}
                </span>
                <Button variant="secondary" size="sm" onClick={() => openEdit(user)}>Edit</Button>
                <Button variant="danger" size="sm" onClick={() => setDeleteConfirm(user)}>Delete</Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <Modal isOpen={showCreate} title="Create Sub-user" onClose={() => setShowCreate(false)} size="full">
          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            <Input label="Username" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} required />
            <Input label="Display Name" value={form.displayName} onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))} />
            <Input label="Password" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required />
            <div>
              <p className="text-sm font-medium mb-2">Permissions</p>
              <div className="flex flex-wrap gap-2">
                {availablePermissions.map(p => (
                  <label key={p} className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <input type="checkbox" checked={form.permissions.includes(p)}
                      onChange={e => setForm(f => ({
                        ...f,
                        permissions: e.target.checked ? [...f.permissions, p] : f.permissions.filter(x => x !== p)
                      }))} />
                    {p}
                  </label>
                ))}
              </div>
            </div>
            <ProviderSelector
              providerOptions={providerOptions}
              selectedProviders={form.allowedProviders}
              selectedConnectionIds={form.allowedProviderConnectionIds}
              onToggle={(providerId) => toggleAllowedProvider(providerId, setForm)}
              onToggleConnection={(providerId, connectionId) => toggleAllowedConnection(providerId, connectionId, setForm)}
            />
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.showQuotaTracker}
                onChange={(e) => setForm((f) => ({ ...f, showQuotaTracker: e.target.checked }))}
              />
              Allow Quota Tracker for this sub-user
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.codexFastMode}
                onChange={(e) => setForm((f) => ({ ...f, codexFastMode: e.target.checked }))}
              />
              Enable Codex Fast Mode for this sub-user
            </label>
            {formError && <p className="text-red-500 text-sm">{formError}</p>}
            <div className="flex justify-end gap-2 mt-2">
              <Button variant="secondary" type="button" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button type="submit" loading={formLoading}>Create</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit Modal */}
      {editingUser && (
        <Modal isOpen={!!editingUser} title={`Edit ${editingUser.username}`} onClose={() => setEditingUser(null)} size="full">
          <form onSubmit={handleEdit} className="flex flex-col gap-4">
            <Input label="Display Name" value={editForm.displayName}
              onChange={e => setEditForm(f => ({ ...f, displayName: e.target.value }))} />
            <div>
              <p className="text-sm font-medium mb-2">Permissions</p>
              <div className="flex flex-wrap gap-2">
                {availablePermissions.map(p => (
                  <label key={p} className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <input type="checkbox" checked={editForm.permissions.includes(p)}
                      onChange={e => setEditForm(f => ({
                        ...f,
                        permissions: e.target.checked ? [...f.permissions, p] : f.permissions.filter(x => x !== p)
                      }))} />
                    {p}
                  </label>
                ))}
              </div>
            </div>
            <ProviderSelector
              providerOptions={providerOptions}
              selectedProviders={editForm.allowedProviders}
              selectedConnectionIds={editForm.allowedProviderConnectionIds}
              onToggle={(providerId) => toggleAllowedProvider(providerId, setEditForm)}
              onToggleConnection={(providerId, connectionId) => toggleAllowedConnection(providerId, connectionId, setEditForm)}
            />
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={editForm.showQuotaTracker}
                onChange={(e) => setEditForm((f) => ({ ...f, showQuotaTracker: e.target.checked }))}
              />
              Allow Quota Tracker for this sub-user
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={editForm.codexFastMode}
                onChange={(e) => setEditForm((f) => ({ ...f, codexFastMode: e.target.checked }))}
              />
              Enable Codex Fast Mode for this sub-user
            </label>
            <Input label="New Password (leave blank to keep)" type="password" value={editForm.password}
              onChange={e => setEditForm(f => ({ ...f, password: e.target.value }))} />
            <div className="flex justify-end gap-2 mt-2">
              <Button variant="secondary" type="button" onClick={() => setEditingUser(null)}>Cancel</Button>
              <Button type="submit" loading={formLoading}>Save</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Confirm Modal */}
      {deleteConfirm && (
        <Modal isOpen={!!deleteConfirm} title="Delete User" onClose={() => setDeleteConfirm(null)}>
          <p className="mb-4">Delete user <strong>{deleteConfirm.username}</strong>? This cannot be undone.</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => handleDelete(deleteConfirm.id)}>Delete</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function buildProviderOptions(connections, nodes) {
  const nodeMap = new Map((nodes || []).map((node) => [node.id, node]));
  const options = new Map();

  for (const connection of connections || []) {
    const providerId = connection?.provider;
    if (!providerId) continue;

    const providerMeta = AI_PROVIDERS[providerId];
    const providerNode = nodeMap.get(providerId);
    const typeLabel = providerNode ? ({
      "openai-compatible": "OpenAI Compatible",
      "anthropic-compatible": "Anthropic Compatible",
      "custom-embedding": "Custom Embedding",
      "custom-image": "Custom Image",
    }[providerNode.type] || "Custom Provider") : null;

    if (!options.has(providerId)) {
      options.set(providerId, {
        id: providerId,
        label: providerNode
          ? `${providerNode.name || providerNode.prefix || providerId} (${typeLabel})`
          : (providerMeta?.name || connection.name || providerId),
        defaultEnabled: true,
        accounts: [],
      });
    }

    options.get(providerId).accounts.push({
      id: connection.id,
      label: connection.displayName || connection.name || connection.email || connection.id,
      isActive: connection.isActive !== false,
    });
  }

  return Array.from(options.values())
    .map((option) => ({
      ...option,
      accounts: option.accounts.sort((a, b) => a.label.localeCompare(b.label, "en")),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "en"));
}

function getDefaultAllowedProviders(providerOptions) {
  const defaultProviderIds = providerOptions
    .filter((option) => option.defaultEnabled)
    .map((option) => option.id);
  const providerIds = providerOptions.map((option) => option.id);
  const legacyMatches = LEGACY_SUB_USER_VISIBLE_PROVIDERS.filter((providerId) =>
    providerIds.includes(providerId)
  );

  if (defaultProviderIds.length > 0) return defaultProviderIds;
  if (legacyMatches.length > 0) return legacyMatches;
  return providerIds;
}

function getProviderAccountIds(providerOptions, providerId) {
  return providerOptions
    .find((option) => option.id === providerId)
    ?.accounts
    ?.map((account) => account.id) || [];
}

function getDefaultAllowedProviderConnectionIds(providerOptions) {
  return providerOptions.flatMap((option) => option.accounts.map((account) => account.id));
}

function getDefaultAllowedProviderConnectionIdsForUser(user, providerOptions) {
  const allowedProviders = getEffectiveAllowedProviders(user, getDefaultAllowedProviders(providerOptions));
  const allowedSet = new Set(allowedProviders);
  return providerOptions
    .filter((option) => allowedSet.has(option.id))
    .flatMap((option) => option.accounts.map((account) => account.id));
}

function formatAllowedProviders(user, providerOptions) {
  const optionMap = new Map(providerOptions.map((option) => [option.id, option.label]));
  const allowedProviders = getEffectiveAllowedProviders(user, getDefaultAllowedProviders(providerOptions));

  if (allowedProviders.length === 0) return "No providers enabled";

  const labels = allowedProviders.map((providerId) => optionMap.get(providerId) || providerId);
  if (labels.length <= 2) return labels.join(", ");
  return `${labels.slice(0, 2).join(", ")} +${labels.length - 2}`;
}

function formatAllowedAccounts(user, providerOptions) {
  const allowedProviders = getEffectiveAllowedProviders(user, getDefaultAllowedProviders(providerOptions));
  const allowedProviderSet = new Set(allowedProviders);
  const effectiveConnectionIds =
    getEffectiveAllowedProviderConnectionIds(user) ??
    getDefaultAllowedProviderConnectionIdsForUser(user, providerOptions);
  const allowedConnectionSet = new Set(effectiveConnectionIds);
  const totalAccounts = providerOptions
    .filter((option) => allowedProviderSet.has(option.id))
    .reduce((count, option) => count + option.accounts.length, 0);

  if (totalAccounts === 0) return "No accounts";
  return `${allowedConnectionSet.size}/${totalAccounts} accounts`;
}

function buildProviderThinking(codexFastMode) {
  return {
    codex: {
      fastMode: codexFastMode === true,
    },
  };
}

function ProviderSelector({ providerOptions, selectedProviders, selectedConnectionIds, onToggle, onToggleConnection }) {
  const selectedProviderSet = new Set(selectedProviders);
  const selectedConnectionSet = new Set(selectedConnectionIds);

  return (
    <div>
      <p className="text-sm font-medium mb-2">Allowed Providers & Accounts</p>
      {providerOptions.length === 0 ? (
        <p className="text-xs text-text-muted">Connect providers first, then assign them to this sub-user.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {providerOptions.map((provider) => (
            <div key={provider.id} className="rounded-lg border border-border bg-background p-3">
              <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedProviderSet.has(provider.id)}
                  onChange={() => onToggle(provider.id)}
                />
                {provider.label}
              </label>
              {provider.accounts.length > 0 && (
                <div className="mt-2 grid gap-1.5 pl-6 sm:grid-cols-2">
                  {provider.accounts.map((account) => (
                    <label
                      key={account.id}
                      className="flex min-w-0 items-center gap-1.5 text-xs text-text-muted cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        disabled={!selectedProviderSet.has(provider.id)}
                        checked={selectedProviderSet.has(provider.id) && selectedConnectionSet.has(account.id)}
                        onChange={() => onToggleConnection(provider.id, account.id)}
                      />
                      <span className="truncate">{account.label}</span>
                      {!account.isActive && <span className="shrink-0 text-[10px] text-amber-600">inactive</span>}
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-text-muted mt-2">Only selected providers and selected provider accounts will be visible and usable for this sub-user.</p>
    </div>
  );
}
