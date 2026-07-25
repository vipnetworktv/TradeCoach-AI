"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import {
  buildProfileMetadata,
  getUserProfileFromMetadata,
} from "@/lib/user-profile";
import { createClient } from "@/lib/supabase/client";

export default function ProfileSettingsPanel() {
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [initials, setInitials] = useState("TC");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function loadProfile() {
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

        const profile = getUserProfileFromMetadata(
          user.user_metadata,
          user.email,
        );

        setEmail(user.email || "");
        setFirstName(profile.firstName);
        setLastName(profile.lastName);
        setInitials(profile.initials);
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Could not load profile.",
        );
      } finally {
        setLoading(false);
      }
    }

    void loadProfile();
  }, [supabase]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setErrorMessage("");

    const normalizedFirst = firstName.trim();
    const normalizedLast = lastName.trim();

    if (!normalizedFirst) {
      setErrorMessage("First name is required.");
      setSaving(false);
      return;
    }

    try {
      const { data, error } = await supabase.auth.updateUser({
        data: buildProfileMetadata(normalizedFirst, normalizedLast),
      });

      if (error) {
        throw error;
      }

      const profile = getUserProfileFromMetadata(
        data.user?.user_metadata,
        data.user?.email || email,
      );

      setFirstName(profile.firstName);
      setLastName(profile.lastName);
      setInitials(profile.initials);
      setMessage("Profile saved.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not save profile.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 md:p-8">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-400">
          Profile
        </p>

        <h3 className="mt-2 text-2xl font-bold">Personal Information</h3>

        <p className="mt-2 text-sm leading-6 text-slate-500">
          Update the information associated with your TradeCoach AI account.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-cyan-500 text-2xl font-extrabold text-slate-950">
            {initials}
          </div>

          <div>
            <p className="font-semibold">Profile Photo</p>

            <p className="mt-1 text-sm text-slate-500">
              Custom profile photos are coming soon. Your initials are shown for
              now.
            </p>
          </div>
        </div>

        <div className="mt-8 grid gap-5 md:grid-cols-2">
          <label>
            <span className="mb-2 block text-sm font-medium text-slate-400">
              First Name
            </span>

            <input
              type="text"
              value={firstName}
              disabled={loading || saving}
              onChange={(event) => setFirstName(event.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-400 disabled:opacity-60"
            />
          </label>

          <label>
            <span className="mb-2 block text-sm font-medium text-slate-400">
              Last Name
            </span>

            <input
              type="text"
              value={lastName}
              disabled={loading || saving}
              onChange={(event) => setLastName(event.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-400 disabled:opacity-60"
            />
          </label>

          <label className="md:col-span-2">
            <span className="mb-2 block text-sm font-medium text-slate-400">
              Email Address
            </span>

            <input
              type="email"
              value={email}
              readOnly
              className="w-full rounded-xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-slate-400 outline-none"
            />

            <p className="mt-2 text-xs leading-5 text-slate-500">
              Email changes are managed through your login account. Contact
              support if you need to move to a different address.
            </p>
          </label>
        </div>

        {message ? (
          <p className="mt-5 text-sm text-emerald-400">{message}</p>
        ) : null}

        {errorMessage ? (
          <p className="mt-5 text-sm text-rose-400">{errorMessage}</p>
        ) : null}

        <button
          type="submit"
          disabled={loading || saving}
          className="mt-6 rounded-xl bg-cyan-500 px-5 py-3 font-bold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Saving..." : loading ? "Loading..." : "Save Profile"}
        </button>
      </form>
    </div>
  );
}
