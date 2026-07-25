"use client";

import Link from "next/link";
import { useState } from "react";

import { BROKER_CONNECT_OPTIONS } from "@/lib/brokers";

type BrokerStatus = "available" | "coming-next" | "planned";

type BrokerOption = {
  name: string;
  method: string;
  status: BrokerStatus;
  statusLabel: string;
  platforms: string;
  syncs: string;
  href?: string;
  actionLabel: string;
  primary?: boolean;
  waitlist?: boolean;
};

const BROKER_OPTIONS: BrokerOption[] = [
  ...BROKER_CONNECT_OPTIONS.map((broker, index) => ({
    name: broker.name,
    method: broker.method,
    status: "available" as const,
    statusLabel: "Available",
    platforms: broker.platforms,
    syncs: broker.syncs,
    href: broker.href,
    actionLabel:
      broker.id === "tradovate"
        ? "Connect Tradovate"
        : "Connect NinjaTrader Web",
    primary: index === 0,
  })),
  {
    name: "TradeStation",
    method: "API / OAuth",
    status: "planned",
    statusLabel: "Planned",
    platforms: "Desktop, Web",
    syncs: "Fills, positions",
    actionLabel: "Join Waitlist",
    waitlist: true,
  },
  {
    name: "Interactive Brokers",
    method: "API / OAuth",
    status: "planned",
    statusLabel: "Planned",
    platforms: "Desktop, Web",
    syncs: "Fills, commissions",
    actionLabel: "Join Waitlist",
    waitlist: true,
  },
];

function StatusBadge({
  status,
  label,
}: {
  status: BrokerStatus;
  label: string;
}) {
  const styles = {
    available:
      "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
    "coming-next":
      "border-amber-400/20 bg-amber-400/10 text-amber-300",
    planned: "border-slate-600/40 bg-slate-800/60 text-slate-400",
  }[status];

  const icon = {
    available: (
      <svg
        aria-hidden="true"
        className="h-3.5 w-3.5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2.5}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    ),
    "coming-next": (
      <svg
        aria-hidden="true"
        className="h-3.5 w-3.5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z"
        />
      </svg>
    ),
    planned: (
      <svg
        aria-hidden="true"
        className="h-3.5 w-3.5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M6 18L18 6M6 6l12 12"
        />
      </svg>
    ),
  }[status];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${styles}`}
    >
      {icon}
      {label}
    </span>
  );
}

function BrokerActionButton({ broker }: { broker: BrokerOption }) {
  const [joined, setJoined] = useState(false);

  const baseClass =
    "inline-flex min-h-11 w-full items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold transition";

  if (broker.href) {
    return (
      <Link
        href={broker.href}
        className={`${baseClass} bg-cyan-500 text-slate-950 hover:bg-cyan-300`}
      >
        {broker.actionLabel}
      </Link>
    );
  }

  if (broker.waitlist) {
    return (
      <button
        type="button"
        onClick={() => setJoined(true)}
        disabled={joined}
        className={`${baseClass} border border-slate-700 text-slate-300 hover:border-cyan-300 hover:text-cyan-300 disabled:cursor-default disabled:border-emerald-400/20 disabled:text-emerald-300`}
      >
        {joined ? "On the waitlist" : broker.actionLabel}
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled
      className={`${baseClass} border border-slate-700 text-cyan-300 opacity-70`}
    >
      {broker.actionLabel}
    </button>
  );
}

export default function ConnectBrokerGrid() {
  return (
    <div className="grid gap-5 md:grid-cols-2">
      {BROKER_OPTIONS.map((broker) => (
        <article
          key={broker.name}
          className="flex flex-col rounded-2xl border border-white/10 bg-slate-950/50 p-5"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-white">{broker.name}</h2>

              <p className="mt-1 text-sm text-slate-500">{broker.method}</p>
            </div>

            <StatusBadge status={broker.status} label={broker.statusLabel} />
          </div>

          <dl className="mt-6 space-y-3 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-slate-500">Platforms</dt>
              <dd className="text-right font-medium text-slate-200">
                {broker.platforms}
              </dd>
            </div>

            <div className="flex items-start justify-between gap-4">
              <dt className="text-slate-500">Syncs</dt>
              <dd className="max-w-[14rem] text-right font-medium text-slate-200">
                {broker.syncs}
              </dd>
            </div>
          </dl>

          <div className="mt-6 pt-2">
            <BrokerActionButton broker={broker} />
          </div>
        </article>
      ))}
    </div>
  );
}
