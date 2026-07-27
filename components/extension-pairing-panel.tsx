"use client";

import { useCallback, useEffect, useState } from "react";

import ExtensionInstallModal from "@/components/extension-install-modal";
import {
  EXTENSION_DOWNLOAD_URL,
  EXTENSION_INSTALL_DISMISS_KEY,
  EXTENSION_STORE_URL,
} from "@/lib/extension-install";

type SyncDevice = {
  id: string;
  device_name: string | null;
  browser: string | null;
  extension_version: string | null;
  last_seen_at: string | null;
  last_successful_sync_at: string | null;
  is_active: boolean | null;
  created_at: string | null;
};

type PairingCodeResponse = {
  success?: boolean;
  code?: string;
  device_name?: string;
  expires_at?: string;
  expires_in_seconds?: number;
  detail?: string;
  error?: string;
};

function formatTimestamp(value: string | null) {
  if (!value) {
    return "Never";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatCountdown(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export default function ExtensionPairingPanel({
  compact = false,
  autoOpenInstallGuide = false,
}: {
  compact?: boolean;
  autoOpenInstallGuide?: boolean;
}) {
  const [devices, setDevices] = useState<SyncDevice[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [showInstallGuide, setShowInstallGuide] = useState(false);

  const loadDevices = useCallback(async () => {
    setLoadingDevices(true);
    setErrorMessage("");

    try {
      const response = await fetch("/api/sync/devices", {
        cache: "no-store",
      });
      const data = (await response.json()) as {
        devices?: SyncDevice[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || "Could not load paired devices.");
      }

      setDevices(
        (data.devices ?? []).filter((device) => device.is_active !== false),
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not load paired devices.",
      );
    } finally {
      setLoadingDevices(false);
    }
  }, []);

  useEffect(() => {
    void loadDevices();
  }, [loadDevices]);

  useEffect(() => {
    if (!autoOpenInstallGuide || loadingDevices) {
      return;
    }

    if (devices.length > 0) {
      return;
    }

    if (sessionStorage.getItem(EXTENSION_INSTALL_DISMISS_KEY) === "1") {
      return;
    }

    setShowInstallGuide(true);
  }, [autoOpenInstallGuide, devices.length, loadingDevices]);

  useEffect(() => {
    if (!expiresAt) {
      setSecondsRemaining(0);
      return;
    }

    const updateRemaining = () => {
      const remaining = Math.max(
        0,
        Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000),
      );
      setSecondsRemaining(remaining);

      if (remaining === 0) {
        setPairingCode(null);
        setExpiresAt(null);
      }
    };

    updateRemaining();
    const interval = window.setInterval(updateRemaining, 1000);
    return () => window.clearInterval(interval);
  }, [expiresAt]);

  async function generateCode() {
    setGenerating(true);
    setMessage("");
    setErrorMessage("");

    try {
      const response = await fetch("/api/sync/pairing-code", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          device_name: "TradeCoach Sync",
        }),
      });

      const data = (await response.json()) as PairingCodeResponse;

      if (!response.ok || !data.code) {
        throw new Error(
          data.detail || data.error || "Could not generate a pairing code.",
        );
      }

      setPairingCode(data.code);
      setExpiresAt(data.expires_at ?? null);
      setSecondsRemaining(data.expires_in_seconds ?? 600);
      setMessage(
        "Enter this code in the TradeCoach Sync extension popup within 10 minutes.",
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not generate a pairing code.",
      );
    } finally {
      setGenerating(false);
    }
  }

  async function copyCode() {
    if (!pairingCode) {
      return;
    }

    try {
      await navigator.clipboard.writeText(pairingCode);
      setMessage("Pairing code copied.");
    } catch {
      setErrorMessage("Could not copy the pairing code.");
    }
  }

  async function revokeDevice(deviceId: string) {
    setRevokingId(deviceId);
    setMessage("");
    setErrorMessage("");

    try {
      const response = await fetch(`/api/sync/devices/${deviceId}`, {
        method: "DELETE",
      });
      const data = (await response.json()) as {
        success?: boolean;
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || "Could not revoke the device.");
      }

      setMessage(data.message || "Extension pairing revoked.");
      await loadDevices();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not revoke the device.",
      );
    } finally {
      setRevokingId(null);
    }
  }

  function closeInstallGuide() {
    sessionStorage.setItem(EXTENSION_INSTALL_DISMISS_KEY, "1");
    setShowInstallGuide(false);
  }

  const hasPairedDevice = devices.length > 0;

  return (
    <>
      <div
        className={
          compact
            ? "rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.05] p-5"
            : "rounded-3xl border border-slate-800 bg-slate-900/60 p-6"
        }
      >
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-400">
          TradeCoach Sync Extension
        </p>

        <h3 className="mt-2 text-2xl font-bold">
          {compact ? "Step 1 · Pair the extension" : "Pair Chrome Extension"}
        </h3>

        <p className="mt-3 text-sm leading-6 text-slate-400">
          Download and install the Chrome extension, then generate a pairing code
          and enter it in the extension popup before connecting a broker tab.
        </p>

        <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/60 p-4 sm:flex sm:items-center sm:justify-between sm:gap-4">
          <div>
            <p className="text-sm font-semibold text-white">
              {EXTENSION_STORE_URL
                ? "Install from Chrome Web Store"
                : "Download TradeCoach Sync"}
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              New here? Open the setup guide for a step-by-step walkthrough.
            </p>
          </div>

          <div className="mt-3 flex flex-wrap gap-2 sm:mt-0">
            {EXTENSION_STORE_URL ? (
              <a
                href={EXTENSION_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
              >
                Chrome Web Store
              </a>
            ) : (
              <a
                href={EXTENSION_DOWNLOAD_URL}
                download
                className="rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
              >
                Download .zip
              </a>
            )}

            <button
              type="button"
              onClick={() => setShowInstallGuide(true)}
              className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-cyan-300/40 hover:text-white"
            >
              Setup guide
            </button>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void generateCode()}
            disabled={generating}
            className="rounded-xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {generating ? "Generating..." : "Generate pairing code"}
          </button>

          {pairingCode ? (
            <button
              type="button"
              onClick={() => void copyCode()}
              className="rounded-xl border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:border-cyan-300/40 hover:text-white"
            >
              Copy code
            </button>
          ) : null}
        </div>

        {pairingCode ? (
          <div className="mt-5 rounded-2xl border border-cyan-300/20 bg-slate-950/70 p-5 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Pairing code
            </p>
            <p className="mt-3 font-mono text-3xl font-bold tracking-[0.35em] text-cyan-300">
              {pairingCode}
            </p>
            <p className="mt-3 text-xs text-slate-500">
              Expires in {formatCountdown(secondsRemaining)}
            </p>
          </div>
        ) : null}

        {message ? (
          <p className="mt-4 text-sm text-emerald-300">{message}</p>
        ) : null}

        {errorMessage ? (
          <p className="mt-4 text-sm text-rose-300">{errorMessage}</p>
        ) : null}

        {!compact ? (
          <div className="mt-8 border-t border-slate-800 pt-6">
            <div className="flex items-center justify-between gap-4">
              <h4 className="text-lg font-semibold text-white">
                Paired browsers
              </h4>
              <button
                type="button"
                onClick={() => void loadDevices()}
                className="text-sm font-medium text-cyan-300 transition hover:text-cyan-200"
              >
                Refresh
              </button>
            </div>

            {loadingDevices ? (
              <p className="mt-4 text-sm text-slate-500">Loading devices...</p>
            ) : devices.length === 0 ? (
              <p className="mt-4 text-sm leading-6 text-slate-500">
                No paired extensions yet. Download the extension and generate a
                code above.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {devices.map((device) => (
                  <div
                    key={device.id}
                    className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-950/50 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-semibold text-white">
                        {device.device_name || "TradeCoach Sync"}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        {device.browser || "Chrome browser"}
                        {device.extension_version
                          ? ` · v${device.extension_version}`
                          : ""}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Last seen {formatTimestamp(device.last_seen_at)}
                        {device.last_successful_sync_at
                          ? ` · Last sync ${formatTimestamp(device.last_successful_sync_at)}`
                          : ""}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => void revokeDevice(device.id)}
                      disabled={revokingId === device.id}
                      className="rounded-xl border border-rose-500/20 px-4 py-2 text-sm font-semibold text-rose-300 transition hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {revokingId === device.id ? "Revoking..." : "Revoke"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : hasPairedDevice ? (
          <p className="mt-4 text-sm text-emerald-300">
            {devices.length} paired browser{devices.length === 1 ? "" : "s"}{" "}
            connected.
          </p>
        ) : (
          <p className="mt-4 text-sm text-amber-200">
            No paired extension detected yet.
          </p>
        )}
      </div>

      <ExtensionInstallModal
        open={showInstallGuide}
        onClose={closeInstallGuide}
        onStartPairing={() => void generateCode()}
      />
    </>
  );
}
