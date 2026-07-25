"use client";

import { FormEvent, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";

const MIN_PASSWORD_LENGTH = 8;

export default function PasswordSettingsPanel() {
  const supabase = useMemo(() => createClient(), []);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setErrorMessage("");

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setErrorMessage(
        `New password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      );
      setBusy(false);
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage("New password and confirmation do not match.");
      setBusy(false);
      return;
    }

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user?.email) {
        throw new Error(userError?.message || "You must be logged in.");
      }

      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });

      if (verifyError) {
        throw new Error("Current password is incorrect.");
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        throw updateError;
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage("Password updated.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not update password.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-400">
        Security
      </p>

      <h3 className="mt-2 text-2xl font-bold">Password & Access</h3>

      <form onSubmit={handleSubmit} className="mt-6 space-y-5">
        <label>
          <span className="mb-2 block text-sm font-medium text-slate-400">
            Current Password
          </span>

          <input
            type="password"
            value={currentPassword}
            disabled={busy}
            autoComplete="current-password"
            onChange={(event) => setCurrentPassword(event.target.value)}
            placeholder="Enter current password"
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-400 disabled:opacity-60"
          />
        </label>

        <label>
          <span className="mb-2 block text-sm font-medium text-slate-400">
            New Password
          </span>

          <input
            type="password"
            value={newPassword}
            disabled={busy}
            autoComplete="new-password"
            onChange={(event) => setNewPassword(event.target.value)}
            placeholder="Enter new password"
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-400 disabled:opacity-60"
          />
        </label>

        <label>
          <span className="mb-2 block text-sm font-medium text-slate-400">
            Confirm New Password
          </span>

          <input
            type="password"
            value={confirmPassword}
            disabled={busy}
            autoComplete="new-password"
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="Confirm new password"
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-400 disabled:opacity-60"
          />
        </label>

        {message ? (
          <p className="text-sm text-emerald-400">{message}</p>
        ) : null}

        {errorMessage ? (
          <p className="text-sm text-rose-400">{errorMessage}</p>
        ) : null}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl border border-slate-700 px-5 py-3 font-semibold text-slate-300 transition hover:border-cyan-400 hover:text-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Updating..." : "Update Password"}
        </button>
      </form>
    </div>
  );
}
