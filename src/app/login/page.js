"use client";

import { useState, useEffect } from "react";
import { Card, Button, Input, Select } from "@/shared/components";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasPassword, setHasPassword] = useState(null);
  const [loginAs, setLoginAs] = useState("super_admin"); // "super_admin" | "sub_user"
  const [users, setUsers] = useState([]); // available sub-users
  const [username, setUsername] = useState("");
  const router = useRouter();

  useEffect(() => {
    async function checkAuth() {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

      try {
        const res = await fetch(`${baseUrl}/api/settings/require-login`, {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          await res.json().catch(() => ({}));
          setHasPassword(true);
        } else {
          setHasPassword(true);
        }
      } catch (err) {
        clearTimeout(timeoutId);
        setHasPassword(true);
      }
    }
    checkAuth();
  }, [router]);

  // Fetch sub-user list when switching to sub_user mode
  useEffect(() => {
    if (loginAs === "sub_user") {
      fetch("/api/users")
        .then(r => r.ok ? r.json() : { users: [] })
        .then(d => setUsers(d.users || []))
        .catch(() => setUsers([]));
    }
  }, [loginAs]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password,
          loginAs,
          username: loginAs === "sub_user" ? username : undefined,
        }),
      });

      if (res.ok) {
        router.push("/dashboard");
        router.refresh();
      } else {
        const data = await res.json();
        setError(data.error || "Invalid credentials");
      }
    } catch (err) {
      setError("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleOidcLogin = () => {
    window.location.href = "/api/auth/oidc/start";
  };

  const oidcAvailable = oidcConfigured && ["oidc", "both"].includes(authMode);
  const passwordAvailable = authMode !== "oidc" || !oidcConfigured;

  // Show loading state while checking password
  if (hasPassword === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg p-4">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <p className="text-text-muted mt-4">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg p-4 relative overflow-hidden">
      {/* Faint grid background */}
      <div className="landing-grid absolute inset-0 pointer-events-none" aria-hidden="true" />
      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary mb-2">openrouterx</h1>
          <p className="text-text-muted">Sign in to access the dashboard</p>
        </div>

        <Card>
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            {/* Account type switcher */}
            <div className="flex gap-2">
              {["super_admin", "sub_user"].map(type => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setLoginAs(type)}
                  className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium border transition-all ${
                    loginAs === type
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-black/10 dark:border-white/10 text-text-muted hover:border-primary/50"
                  }`}
                >
                  {type === "super_admin" ? "Super Admin" : "Sub User"}
                </button>
              ))}
            </div>

            {loginAs === "sub_user" ? (
              <>
                {users.length > 0 ? (
                  <Select
                    label="Select user"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    required
                  >
                    <option value="">— Select a user —</option>
                    {users.map(u => (
                      <option key={u.id} value={u.username}>{u.displayName} (@{u.username})</option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    label="Username"
                    placeholder="username"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    required
                  />
                )}
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium">Password</label>
                  <Input
                    type="password"
                    placeholder="Your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
              </>
            ) : (
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Password</label>
                <Input
                  type="password"
                  placeholder="Admin password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoFocus
                />
              </div>
            )}

            {error && <p className="text-xs text-red-500">{error}</p>}

            <Button
              type="submit"
              variant="primary"
              className="w-full"
              loading={loading}
            >
              Sign In
            </Button>

          </form>
        </Card>
      </div>
    </div>
  );
}
