"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, KeyRound, Loader2, Save, Shield } from "lucide-react";

export default function ObsoletePasswordAdminPage() {
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [settingsPassword, setSettingsPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/security/obsolete-password", {
        cache: "no-store",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error || "Forbidden");
        setConfigured(null);
        return;
      }
      setConfigured(Boolean(j.configured));
    } catch {
      setError("Failed to load");
      setConfigured(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const submit = async () => {
    setError("");
    setOk("");
    const p = newPassword.trim();
    if (p.length < 6) {
      setError("New password must be at least 6 characters.");
      return;
    }
    if (p !== confirm.trim()) {
      setError("Passwords do not match.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/security/obsolete-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newPassword: p,
          settingsPassword: settingsPassword || undefined,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error || "Failed to update password.");
        return;
      }
      setOk("Obsolete password updated.");
      setNewPassword("");
      setConfirm("");
      await load();
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-slate-950 text-white">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-white/5 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-purple-600 p-2 shadow">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-black">Security · Obsolete Password</h1>
              <p className="text-[11px] font-semibold text-white/60">
                Reset the password used to mark/restore SOPs as obsolete.
              </p>
            </div>
          </div>
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-bold text-white/80 hover:bg-white/10"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Admin
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-6">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-xl">
          {loading ? (
            <div className="flex items-center justify-center py-14 text-white/60">
              <Loader2 className="mr-3 h-5 w-5 animate-spin" />
              Loading…
            </div>
          ) : configured === null ? (
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-200">
              {error || "Forbidden"}
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] font-black uppercase tracking-widest text-white/70">
                    <KeyRound className="h-4 w-4 text-amber-300" />
                    Status:{" "}
                    <span className={configured ? "text-emerald-300" : "text-amber-300"}>
                      {configured ? "Configured" : "Not configured"}
                    </span>
                  </div>
                  <p className="mt-3 text-[12px] font-semibold text-white/70">
                    This page never shows existing passwords. It only lets you set a new one.
                  </p>
                </div>
              </div>

              {ok ? (
                <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm font-semibold text-emerald-200">
                  {ok}
                </div>
              ) : null}
              {error ? (
                <div className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-sm font-semibold text-rose-200">
                  {error}
                </div>
              ) : null}

              <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <label className="text-[11px] font-black uppercase tracking-widest text-white/60">
                    Settings password (optional)
                  </label>
                  <input
                    type="password"
                    value={settingsPassword}
                    onChange={(e) => setSettingsPassword(e.target.value)}
                    placeholder="Only needed if ADMIN_SETTINGS_PASSWORD is set"
                    className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-purple-400"
                  />
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <label className="text-[11px] font-black uppercase tracking-widest text-white/60">
                    New obsolete password
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min 6 characters"
                    className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-purple-400"
                  />
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-4 md:col-span-2">
                  <label className="text-[11px] font-black uppercase tracking-widest text-white/60">
                    Confirm new password
                  </label>
                  <input
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Re-type password"
                    className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-purple-400"
                  />
                </div>
              </div>

              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => void load()}
                  className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs font-black uppercase tracking-widest text-white/70 hover:bg-white/10"
                  disabled={saving}
                >
                  Reload
                </button>
                <button
                  type="button"
                  onClick={() => void submit()}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-2 text-xs font-black uppercase tracking-widest text-white hover:bg-purple-700 disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Saving…
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" /> Update password
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

