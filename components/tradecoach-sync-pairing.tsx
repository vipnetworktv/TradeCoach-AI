"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  getBrokerConnectInfo,
  type SupportedBrokerId,
} from "@/lib/brokers";
import {
  scanExtensionBrokers,
  verifyBrokerLiveSync,
} from "@/lib/extension-bridge";

type BrokerStatusResponse = {
  connected: boolean;
  broker_name?: string;
};

type ConnectionPhase =
  | "idle"
  | "watching"
  | "saved_only"
  | "live";

export default function TradeCoachSyncPairing({
  brokerId = "tradovate",
}: {
  brokerId?: SupportedBrokerId;
}) {
  const broker = getBrokerConnectInfo(brokerId);
  const [phase, setPhase] = useState<ConnectionPhase>("idle");
  const [statusMessage, setStatusMessage] = useState(
    `Open ${broker.name} in a new tab, sign in, and keep that tab open.`,
  );
  const [checking, setChecking] = useState(false);

  const verifyConnection = useCallback(async () => {
    setChecking(true);

    try {
      const accountResponse = await fetch(
        `/api/sync/broker-status?broker=${broker.id}`,
        { cache: "no-store" },
      );
      const accountData =
        (await accountResponse.json()) as BrokerStatusResponse;

      const liveCheck = await verifyBrokerLiveSync(broker.id);

      const accountSaved =
        accountResponse.ok && Boolean(accountData.connected);
      const extensionLive = liveCheck.extensionLive;

      if (accountSaved && extensionLive) {
        setPhase("live");
        setStatusMessage(
          `${broker.name} is fully connected. TradeCoach Sync can see your broker tab and trades will sync live.`,
        );
        return;
      }

      if (accountSaved) {
        setPhase("saved_only");
        setStatusMessage(
          liveCheck.extensionAvailable
            ? `${broker.name} is saved in TradeCoach, but the extension still cannot see your broker tab. Switch to your ${broker.shortName} tab, click the TradeCoach Sync extension icon on that tab, then press Check connection.`
            : liveCheck.message,
        );
        return;
      }

      if (extensionLive) {
        setPhase("watching");
        setStatusMessage(
          `TradeCoach Sync sees ${broker.shortName}, but the account is not saved yet. Click verify below.`,
        );
        return;
      }

      setPhase("watching");
      setStatusMessage(liveCheck.message);
    } finally {
      setChecking(false);
    }
  }, [broker.id, broker.name, broker.shortName]);

  const saveAndVerify = useCallback(async () => {
    setChecking(true);
    setPhase("watching");
    setStatusMessage(`Saving ${broker.name} and checking live sync...`);

    try {
      await scanExtensionBrokers();

      const saveResponse = await fetch("/api/sync/broker-status", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          broker: broker.id,
        }),
      });

      const saveData = await saveResponse.json().catch(() => null);

      if (!saveResponse.ok) {
        throw new Error(
          typeof saveData?.error === "string"
            ? saveData.error
            : "Could not save the broker connection.",
        );
      }

      await verifyConnection();
    } catch (error) {
      setPhase("watching");
      setStatusMessage(
        error instanceof Error
          ? error.message
          : "Could not verify the broker connection.",
      );
    } finally {
      setChecking(false);
    }
  }, [broker.id, broker.name, verifyConnection]);

  useEffect(() => {
    if (phase !== "watching" && phase !== "saved_only") {
      return;
    }

    void verifyConnection();

    const interval = window.setInterval(() => {
      void verifyConnection();
    }, 4000);

    return () => {
      window.clearInterval(interval);
    };
  }, [phase, verifyConnection]);

  function handleOpenBroker() {
    setPhase("watching");
    setStatusMessage(
      `Sign in on ${broker.shortName}, keep that tab open, then click Verify connection.`,
    );
  }

  const isLive = phase === "live";

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.05] p-5">
        <p className="text-sm font-semibold text-cyan-100">
          What counts as connected
        </p>

        <ul className="mt-3 space-y-2 text-xs leading-6 text-slate-400">
          <li>TradeCoach account saved for {broker.name}</li>
          <li>TradeCoach Sync extension can see your {broker.shortName} tab</li>
          <li>Broker tab stays open while you trade</li>
        </ul>
      </div>

      <div
        className={`rounded-3xl border p-6 text-center ${
          isLive
            ? "border-emerald-300/20 bg-emerald-300/[0.05]"
            : phase === "saved_only"
              ? "border-amber-300/20 bg-amber-300/[0.05]"
              : "border-white/10 bg-slate-950/50"
        }`}
      >
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-lg font-bold text-cyan-300">
          {isLive ? "✓" : broker.shortName.slice(0, 2).toUpperCase()}
        </div>

        <p className="mt-5 text-sm font-semibold text-white">
          {isLive
            ? `${broker.name} fully connected`
            : phase === "saved_only"
              ? `${broker.name} saved — extension still checking`
              : `Connect ${broker.name}`}
        </p>

        <p className="mt-3 text-xs leading-6 text-slate-400">
          {statusMessage}
        </p>
      </div>

      {phase === "saved_only" ? (
        <div className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.05] p-4 text-left">
          <p className="text-sm font-semibold text-amber-100">
            Extension check required
          </p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs leading-6 text-slate-400">
            <li>Switch to your open {broker.shortName} tab</li>
            <li>Click the TradeCoach Sync icon in Chrome&apos;s toolbar</li>
            <li>Press Check connection in the popup</li>
            <li>Return here — status should turn green within a few seconds</li>
          </ol>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <StatusChip
          label="TradeCoach account"
          ok={phase === "live" || phase === "saved_only"}
        />
        <StatusChip
          label="Extension sees broker tab"
          ok={phase === "live"}
        />
      </div>

      <div className="flex flex-col gap-3">
        <a
          href={broker.openUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleOpenBroker}
          className="inline-flex min-h-12 items-center justify-center rounded-xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
        >
          Open {broker.name} in a new tab
        </a>

        <button
          type="button"
          disabled={checking}
          onClick={() => {
            void saveAndVerify();
          }}
          className="inline-flex min-h-12 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-slate-200 transition hover:border-cyan-300/30 hover:text-cyan-200 disabled:opacity-50"
        >
          {checking ? "Checking connection..." : "Verify connection"}
        </button>

        {isLive ? (
          <Link
            href="/dashboard/accounts"
            className="inline-flex min-h-12 items-center justify-center rounded-xl border border-emerald-300/20 bg-emerald-300/10 px-5 py-3 text-sm font-semibold text-emerald-200 transition hover:border-emerald-300/40"
          >
            View Trading Accounts
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function StatusChip({
  label,
  ok,
}: {
  label: string;
  ok: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border px-4 py-3 text-left ${
        ok
          ? "border-emerald-300/20 bg-emerald-300/10"
          : "border-white/10 bg-white/[0.03]"
      }`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>

      <p
        className={`mt-1 text-sm font-semibold ${
          ok ? "text-emerald-200" : "text-slate-300"
        }`}
      >
        {ok ? "Ready" : "Waiting"}
      </p>
    </div>
  );
}
