"use client";

import { useState, useEffect } from "react";
import { Card, Button, Modal, Input } from "@/shared/components";
import { AI_PROVIDERS } from "@/shared/constants/providers";
import { getEffectiveAllowedProviders, LEGACY_SUB_USER_VISIBLE_PROVIDERS } from "@/shared/utils/subUserAccess";

export default function AdminUsersPage() {
  const [users, setUsers] = useState([]);
  const [providerOptions, setProviderOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ username: "", password: "", displayName: "", role: "sub_user", permissions: [], allowedProviders: [] });
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({ displayName: "", role: "", permissions: [], allowedProviders: [], password: "" });
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
      const [usersRes, providersRes] = await Promise.all([
        fetch("/api/users"),
        fetch("/api/providers"),
      ]);
      const usersData = await usersRes.json();
      const providersData = await providersRes.json();
      setUsers(usersData.users || []);
      setProviderOptions(buildProviderOptions(providersData.connections || []));
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
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setFormError(data.error || "Failed"); return; }
      setShowCreate(false);
      setForm({ username: "", password: "", displayName: "", role: "sub_user", permissions: [], allowedProviders: getDefaultAllowedProviders(providerOptions) });
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
    });
    setFormError("");
    setShowCreate(true);
  };

  const toggleAllowedProvider = (providerId, setState) => {
    setState((current) => {
      const exists = current.allowedProviders.includes(providerId);
      return {
        ...current,
        allowedProviders: exists
          ? current.allowedProviders.filter((id) => id !== providerId)
          : [...current.allowedProviders, providerId],
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
                <Button variant="secondary" size="sm" onClick={() => openEdit(user)}>Edit</Button>
                <Button variant="danger" size="sm" onClick={() => setDeleteConfirm(user)}>Delete</Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <Modal isOpen={showCreate} title="Create Sub-user" onClose={() => setShowCreate(false)}>
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
              onToggle={(providerId) => toggleAllowedProvider(providerId, setForm)}
            />
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
        <Modal isOpen={!!editingUser} title={`Edit ${editingUser.username}`} onClose={() => setEditingUser(null)}>
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
              onToggle={(providerId) => toggleAllowedProvider(providerId, setEditForm)}
            />
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

function buildProviderOptions(connections) {
  const byProvider = new Map();

  for (const connection of connections) {
    if (!connection?.provider || byProvider.has(connection.provider)) continue;

    byProvider.set(connection.provider, {
      id: connection.provider,
      label: AI_PROVIDERS[connection.provider]?.name || connection.name || connection.provider,
    });
  }

  return Array.from(byProvider.values()).sort((a, b) => a.label.localeCompare(b.label, "en"));
}

function getDefaultAllowedProviders(providerOptions) {
  const providerIds = providerOptions.map((option) => option.id);
  const legacyMatches = LEGACY_SUB_USER_VISIBLE_PROVIDERS.filter((providerId) =>
    providerIds.includes(providerId)
  );

  if (legacyMatches.length > 0) return legacyMatches;
  return providerIds;
}

function formatAllowedProviders(user, providerOptions) {
  const optionMap = new Map(providerOptions.map((option) => [option.id, option.label]));
  const allowedProviders = getEffectiveAllowedProviders(user, getDefaultAllowedProviders(providerOptions));

  if (allowedProviders.length === 0) return "No providers enabled";

  const labels = allowedProviders.map((providerId) => optionMap.get(providerId) || providerId);
  if (labels.length <= 2) return labels.join(", ");
  return `${labels.slice(0, 2).join(", ")} +${labels.length - 2}`;
}

function ProviderSelector({ providerOptions, selectedProviders, onToggle }) {
  return (
    <div>
      <p className="text-sm font-medium mb-2">Allowed Providers</p>
      {providerOptions.length === 0 ? (
        <p className="text-xs text-text-muted">Connect providers first, then assign them to this sub-user.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {providerOptions.map((provider) => (
            <label key={provider.id} className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={selectedProviders.includes(provider.id)}
                onChange={() => onToggle(provider.id)}
              />
              {provider.label}
            </label>
          ))}
        </div>
      )}
      <p className="text-xs text-text-muted mt-2">Only the selected providers will be visible and usable for this sub-user.</p>
    </div>
  );
}
