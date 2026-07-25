"use client";

import { useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";

function formatSessionTime(value: string | undefined) {
  if (!value) {
    return "Unknown";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export default function ActiveSessionPanel() {
  const supabase = useMemo(() => createClient(), []);

  const [email, setEmail] = useState("");
  const [lastSignInAt, setLastSignInAt] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function loadSession() {
      setLoading(true);
      setErrorMessage("");

      try {
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser();

        if (error || !user) {
          throw new Error(error?.message || "You must be logged in.");
        }

        setEmail(user.email || "");
        setLastSignInAt(user.last_sign_in_at || undefined);
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Could not load session details.",
        );
      } finally {
        setLoading(false);
      }
    }

    void loadSession();
  }, [supabase]);

  async function signOutOtherDevices() {
    setBusy(true);
    setMessage("");
    setErrorMessage("");

    try {
      const { error } = await supabase.auth.signOut({
        scope: "others",
      });

      if (error) {
        throw error;
      }

      setMessage("Signed out on all other devices.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not sign out other devices.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-400">
        Active Sessions
      </p>

      <h3 className="mt-2 text-2xl font-bold">Signed-In Devices</h3>

      <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/50 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-semibold">
              {loading ? "Loading session..." : email || "Current session"}
            </p>

            <p className="mt-2 text-sm text-slate-500">
              Last sign-in: {formatSessionTime(lastSignInAt)}
            </p>

            <p className="mt-1 text-sm text-slate-600">Current session</p>
          </div>

          <span className="mt-1 h-3 w-3 rounded-full bg-emerald-400" />
        </div>
      </div>

      {message ? (
        <p className="mt-4 text-sm text-emerald-400">{message}</p>
      ) : null}

      {errorMessage ? (
        <p className="mt-4 text-sm text-rose-400">{errorMessage}</p>
      ) : null}

      <button
        type="button"
        disabled={loading || busy}
        onClick={() => {
          void signOutOtherDevices();
        }}
        className="mt-5 w-full rounded-xl border border-slate-700 px-5 py-3 font-semibold text-slate-300 transition hover:border-rose-400 hover:text-rose-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Signing out..." : "Sign Out Other Devices"}
      </button>
    </div>
  );
}
