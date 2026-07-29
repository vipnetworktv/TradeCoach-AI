"use client";

import { useState } from "react";

const CONFIRM_PHRASE = "DELETE ALL TRADES";

export default function TradingDataSettingsPanel() {
  const [showWipeForm, setShowWipeForm] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function wipeAllTrades() {
    if (confirmText !== CONFIRM_PHRASE) {
      setError(`Type ${CONFIRM_PHRASE} exactly to confirm.`);
      return;
    }

    if (
      !window.confirm(
        "This permanently deletes every synced and imported trade in TradeCoach. This cannot be undone.",
      )
    ) {
      return;
    }

    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/trades/wipe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          confirm: CONFIRM_PHRASE,
        }),
      });

      const data = (await response.json().catch(() => null)) as {
        error?: string;
        message?: string;
        deletedCount?: number;
      } | null;

      if (!response.ok) {
        throw new Error(
          data?.error || "Could not delete your trades.",
        );
      }

      setMessage(
        data?.message ||
          `Deleted ${data?.deletedCount ?? 0} trades.`,
      );
      setConfirmText("");
      setShowWipeForm(false);
    } catch (wipeError) {
      setError(
        wipeError instanceof Error
          ? wipeError.message
          : "Could not delete your trades.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-400">
        Data & Privacy
      </p>

      <h3 className="mt-2 text-2xl font-bold">Your Trading Data</h3>

      <p className="mt-3 text-sm leading-6 text-slate-500">
        Remove bad or duplicate sync data and start fresh. New trades will sync
        again after you reload the Chrome extension on TradingView.
      </p>

      <div className="mt-6 space-y-3">
        <button
          type="button"
          disabled
          className="w-full cursor-not-allowed rounded-xl border border-slate-800 px-5 py-3 text-left font-semibold text-slate-600"
        >
          Download My Data
        </button>

        <button
          type="button"
          disabled
          className="w-full cursor-not-allowed rounded-xl border border-slate-800 px-5 py-3 text-left font-semibold text-slate-600"
        >
          Clear AI Chat History
        </button>

        {!showWipeForm ? (
          <button
            type="button"
            onClick={() => {
              setShowWipeForm(true);
              setMessage(null);
              setError(null);
            }}
            className="w-full rounded-xl border border-rose-500/30 bg-rose-500/10 px-5 py-3 text-left font-semibold text-rose-200 transition hover:bg-rose-500/20"
          >
            Delete All Trades
          </button>
        ) : (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4">
            <p className="text-sm font-semibold text-rose-200">
              Delete every trade in your account
            </p>

            <p className="mt-2 text-xs leading-5 text-slate-400">
              Type{" "}
              <span className="font-mono text-slate-200">
                {CONFIRM_PHRASE}
              </span>{" "}
              below to confirm.
            </p>

            <input
              type="text"
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              placeholder={CONFIRM_PHRASE}
              className="mt-3 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-rose-400"
            />

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  void wipeAllTrades();
                }}
                disabled={loading}
                className="rounded-lg bg-rose-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Deleting..." : "Permanently delete all trades"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowWipeForm(false);
                  setConfirmText("");
                  setError(null);
                }}
                disabled={loading}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {message ? (
        <p className="mt-4 text-sm text-emerald-300">{message}</p>
      ) : null}

      {error ? (
        <p className="mt-4 text-sm text-rose-300">{error}</p>
      ) : null}
    </div>
  );
}
