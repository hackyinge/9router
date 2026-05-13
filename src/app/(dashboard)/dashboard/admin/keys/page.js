"use client";

import { useState, useEffect } from "react";
import { Card, Button, Modal, Input, Select } from "@/shared/components";

export default function AdminKeysPage() {
  const [keys, setKeys] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [assignModal, setAssignModal] = useState(null); // key being assigned
  const [assignUserId, setAssignUserId] = useState("");
  const [assignLoading, setAssignLoading] = useState(false);

  useEffect(() => {
    // Guard: only super_admin may access this page
    fetch("/api/auth/me")
      .then(r => r.json())
      .then(data => {
        if (data.role !== "super_admin") {
          window.location.href = "/dashboard/usage";
        } else {
          fetchData();
        }
      })
      .catch(() => { window.location.href = "/dashboard/usage"; });
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const [keysRes, usersRes] = await Promise.all([
        fetch("/api/keys"),
        fetch("/api/users"),
      ]);
      const keysData = await keysRes.json();
      const usersData = await usersRes.json();
      setKeys(keysData.keys || []);
      setUsers(usersData.users || []);
    } finally {
      setLoading(false);
    }
  }

  async function handleAssign(key) {
    setAssignLoading(true);
    try {
      const res = await fetch(`/api/keys/${key.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: assignUserId || null }),
      });
      if (res.ok) {
        setAssignModal(null);
        setAssignUserId("");
        fetchData();
      }
    } finally {
      setAssignLoading(false);
    }
  }

  function getUserDisplay(userId) {
    if (!userId) return { label: "Unassigned (Admin)", color: "text-text-muted" };
    const user = users.find(u => u.id === userId);
    return { label: user ? `${user.displayName} (@${user.username})` : userId, color: "text-primary" };
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">API Key Management</h1>
        <p className="text-sm text-text-muted mt-1">Assign API keys to sub-users. Only the assigned user can use that key.</p>
      </div>

      {loading ? (
        <p className="text-text-muted">Loading...</p>
      ) : keys.length === 0 ? (
        <Card>
          <p className="text-text-muted text-center py-8">No API keys yet. Create one in the Endpoint page.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {keys.map(key => {
            const { label, color } = getUserDisplay(key.userId);
            return (
              <Card key={key.id} className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-surface-alt flex items-center justify-center">
                    <span className="material-symbols-outlined text-text-muted text-[20px]">key</span>
                  </div>
                  <div>
                    <p className="font-semibold font-mono text-sm">{key.name}</p>
                    <p className={`text-xs ${color}`}>
                      {label}
                      {key.assignedAt && <span className="ml-2 text-text-muted"><span>assigned</span> {new Date(key.assignedAt).toLocaleDateString()}</span>}
                    </p>
                  </div>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => { setAssignModal(key); setAssignUserId(key.userId || ""); }}
                >
                  {key.userId ? "Reassign" : "Assign to User"}
                </Button>
              </Card>
            );
          })}
        </div>
      )}

      {/* Assign Modal */}
      {assignModal && (
        <Modal
          isOpen={!!assignModal}
          title={<><span>Assign Key:</span> {assignModal.name}</>}
          onClose={() => setAssignModal(null)}
        >
          <div className="flex flex-col gap-4">
            <Select
              label="Assign to user"
              value={assignUserId}
              onChange={e => setAssignUserId(e.target.value)}
            >
              <option value="">— Unassigned (Admin only) —</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.displayName} (@{u.username})</option>
              ))}
            </Select>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setAssignModal(null)}>Cancel</Button>
              <Button loading={assignLoading} onClick={() => handleAssign(assignModal)}>Save</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
