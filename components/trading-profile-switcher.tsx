"use client";

import { useMemo, useState } from "react";

import {
  formatTradingProfileStartedAt,
  sortTradingProfiles,
  type TradingProfile,
} from "@/lib/trading-profiles";

type TradingProfileSwitcherProps = {
  profiles: TradingProfile[];
  activeProfile: TradingProfile | null;
  loading?: boolean;
  actionLoading?: boolean;
  error?: string | null;
  onCreateProfile: (name: string) => Promise<boolean>;
  onActivateProfile: (profileId: string) => Promise<boolean>;
};

export default function TradingProfileSwitcher({
  profiles,
  activeProfile,
  loading = false,
  actionLoading = false,
  error = null,
  onCreateProfile,
  onActivateProfile,
}: TradingProfileSwitcherProps) {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newProfileName, setNewProfileName] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const sortedProfiles = useMemo(
    () => sortTradingProfiles(profiles),
    [profiles],
  );

  async function handleCreateProfile() {
    const trimmedName = newProfileName.trim();

    if (!trimmedName) {
      setLocalError("Enter a profile name.");
      return;
    }

    setLocalError(null);
    const success = await onCreateProfile(trimmedName);

    if (success) {
      setNewProfileName("");
      setShowCreateForm(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-300">
            Trading profile
          </p>

          <p className="mt-1 max-w-2xl text-xs text-slate-500">
            Stats reset when you start a new profile. Your full trade history
            stays in the log below.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setShowCreateForm((current) => !current);
            setLocalError(null);
          }}
          disabled={loading || actionLoading}
          className="rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-sm font-semibold text-cyan-200 transition hover:border-cyan-300 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          New profile
        </button>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="min-w-[220px] flex-1">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Active profile
          </span>

          <select
            value={activeProfile?.id || ""}
            onChange={(event) => {
              void onActivateProfile(event.target.value);
            }}
            disabled={
              loading ||
              actionLoading ||
              sortedProfiles.length === 0
            }
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {sortedProfiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name}
              </option>
            ))}
          </select>
        </label>

        {activeProfile ? (
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm text-slate-400">
            Stats from{" "}
            <span className="text-slate-200">
              {formatTradingProfileStartedAt(
                activeProfile.stats_started_at,
              )}
            </span>
          </div>
        ) : null}
      </div>

      {showCreateForm ? (
        <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
          <label>
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Profile name
            </span>

            <input
              type="text"
              value={newProfileName}
              onChange={(event) => setNewProfileName(event.target.value)}
              placeholder="e.g. Funded eval, March reset"
              maxLength={80}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
            />
          </label>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                void handleCreateProfile();
              }}
              disabled={actionLoading}
              className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {actionLoading ? "Creating..." : "Start new profile"}
            </button>

            <button
              type="button"
              onClick={() => {
                setShowCreateForm(false);
                setLocalError(null);
                setNewProfileName("");
              }}
              disabled={actionLoading}
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
          </div>

          <p className="mt-3 text-xs leading-5 text-slate-500">
            This starts fresh stats from right now. Older trades remain in your
            history and in previous profiles.
          </p>
        </div>
      ) : null}

      {localError || error ? (
        <p className="mt-3 text-sm text-rose-300">
          {localError || error}
        </p>
      ) : null}
    </div>
  );
}
