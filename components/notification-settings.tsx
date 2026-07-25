"use client";

import { useEffect, useState } from "react";

import {
  DEFAULT_NOTIFICATION_SETTINGS,
  NOTIFICATION_OPTION_META,
  type NotificationSettings,
} from "@/lib/notifications/types";

export default function NotificationSettingsPanel() {
  const [settings, setSettings] = useState<NotificationSettings>(
    DEFAULT_NOTIFICATION_SETTINGS,
  );
  const [email, setEmail] = useState("");
  const [emailConfigured, setEmailConfigured] = useState(false);
  const [setupRequired, setSetupRequired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function loadSettings() {
      setLoading(true);
      setErrorMessage("");

      try {
        const response = await fetch("/api/notifications/settings");
        const data = (await response.json()) as {
          settings?: NotificationSettings;
          email?: string;
          emailConfigured?: boolean;
          setupRequired?: boolean;
          error?: string;
        };

        if (!response.ok || !data.settings) {
          throw new Error(data.error || "Could not load notification settings.");
        }

        setSettings(data.settings);
        setEmail(data.email || "");
        setEmailConfigured(Boolean(data.emailConfigured));
        setSetupRequired(Boolean(data.setupRequired));
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Could not load notification settings.",
        );
      } finally {
        setLoading(false);
      }
    }

    void loadSettings();
  }, []);

  function updateSetting(
    key: keyof NotificationSettings,
    value: boolean,
  ) {
    setSettings((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function saveSettings() {
    setSaving(true);
    setMessage("");
    setErrorMessage("");

    try {
      const response = await fetch("/api/notifications/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ settings }),
      });

      const data = (await response.json()) as {
        settings?: NotificationSettings;
        email?: string;
        emailConfigured?: boolean;
        error?: string;
      };

      if (!response.ok || !data.settings) {
        throw new Error(data.error || "Could not save notification settings.");
      }

      setSettings(data.settings);
      setEmail(data.email || "");
      setEmailConfigured(Boolean(data.emailConfigured));
      setSetupRequired(false);
      setMessage("Notification settings saved.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not save notification settings.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function sendTestEmail() {
    setTesting(true);
    setMessage("");
    setErrorMessage("");

    try {
      const response = await fetch("/api/notifications/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reportType: "daily_report",
        }),
      });

      const data = (await response.json()) as {
        message?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || "Could not send test email.");
      }

      setMessage(data.message || "Test email sent.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not send test email.",
      );
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 md:p-8">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-400">
          Notifications
        </p>

        <h3 className="mt-2 text-2xl font-bold">
          Email & Report Notifications
        </h3>

        <p className="mt-2 text-sm leading-6 text-slate-500">
          Choose which reports and account alerts you receive at{" "}
          {email || "your account email"}.
        </p>
      </div>

      {!emailConfigured ? (
        <div className="mt-5 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-200">
          Email delivery is not configured yet. Add `RESEND_API_KEY` and
          `EMAIL_FROM` to `.env.local`, then restart the dev server. For quick
          testing, Resend allows `onboarding@resend.dev` as the sender.
        </div>
      ) : null}

      {setupRequired ? (
        <div className="mt-5 rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-4 text-sm text-cyan-100">
          Database setup required: open Supabase → SQL Editor and run the full
          contents of `supabase/setup_notifications.sql` once. After that,
          refresh this page and click Save Notification Settings.
        </div>
      ) : null}

      {errorMessage ? (
        <div className="mt-5 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-200">
          {errorMessage}
        </div>
      ) : null}

      {message ? (
        <div className="mt-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-200">
          {message}
        </div>
      ) : null}

      <div className="mt-6 space-y-4">
        {loading ? (
          <p className="text-sm text-slate-500">Loading notification settings...</p>
        ) : null}

        {!loading
          ? NOTIFICATION_OPTION_META.map((option) => (
              <label
                key={option.key}
                className="flex cursor-pointer items-start justify-between gap-5 rounded-2xl border border-slate-800 bg-slate-950/50 p-5"
              >
                <span>
                  <span className="block font-semibold">{option.title}</span>

                  <span className="mt-1 block text-sm leading-6 text-slate-500">
                    {option.description}
                  </span>
                </span>

                <span className="relative mt-1 inline-flex shrink-0 items-center">
                  <input
                    type="checkbox"
                    checked={settings[option.key]}
                    onChange={(event) => {
                      updateSetting(option.key, event.target.checked);
                    }}
                    className="peer sr-only"
                  />

                  <span className="h-7 w-12 rounded-full bg-slate-700 transition peer-checked:bg-cyan-500" />

                  <span className="absolute left-1 h-5 w-5 rounded-full bg-white transition peer-checked:translate-x-5" />
                </span>
              </label>
            ))
          : null}
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={() => {
            void saveSettings();
          }}
          disabled={loading || saving || setupRequired}
          className="rounded-xl bg-cyan-500 px-5 py-3 font-bold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save Notification Settings"}
        </button>

        <button
          type="button"
          onClick={() => {
            void sendTestEmail();
          }}
          disabled={loading || testing || !emailConfigured}
          className="rounded-xl border border-slate-700 px-5 py-3 font-semibold text-slate-300 transition hover:border-cyan-400 hover:text-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {testing ? "Sending..." : "Send Test Daily Report"}
        </button>
      </div>
    </div>
  );
}
