import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  BROKER_CONNECT_OPTIONS,
} from "@/lib/brokers";
import {
  getTradeAccountFeedName,
  getTradeAccountLabel,
  isTradingViewPaperFeedTrade,
  TRADINGVIEW_PAPER_ACCOUNT_EXTERNAL_ID,
} from "@/lib/trade-accounts";
import {
  getTradeDisplayPnl,
  getTradeOutcomeStats,
} from "@/lib/trade-pnl";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type BrokerAccount = {
  id: string;
  broker_name: string;
  account_name: string | null;
  account_number_masked: string | null;
  environment: "demo" | "live";
  status: "pending" | "connected" | "disconnected" | "error";
  account_type: string | null;
  current_balance: number | null;
  currency: string;
  last_synced_at: string | null;
};

type CompletedTrade = {
  id?: string | number | null;
  broker_name?: string | null;
  broker?: string | null;
  provider?: string | null;
  source_broker?: string | null;
  source_platform?: string | null;

  account_external_id?: string | null;
  broker_account_external_id?: string | null;
  account_id?: string | null;
  broker_account_id?: string | null;
  account_name?: string | null;
  broker_account_name?: string | null;
  account_label?: string | null;

  net_pnl?: number | string | null;
  gross_pnl?: number | string | null;
  fees?: number | string | null;
  status?: string | null;
  exit_at?: string | null;
  entry_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;

  [key: string]: unknown;
};

type DetectedAccount = {
  key: string;
  brokerName: string;
  accountExternalId: string;
  accountName: string;
  isPaper: boolean;
  importedTrades: number;
  netPnl: number;
  fees: number;
  latestTradeAt: string | null;
};

const BROKER_ROADMAP = [
  {
    name: "TradingView",
    method: "Chrome extension + trade bridge",
    status: "Available now",
    statusClass:
      "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
    description:
      "Paper trading and broker-connected accounts (Tradovate, NinjaTrader, etc.) sync live fills, fees, reports, and AI coaching.",
  },
  {
    name: "TradeStation",
    method: "OAuth brokerage connection",
    status: "Planned",
    statusClass:
      "border-amber-400/20 bg-amber-400/10 text-amber-300",
    description:
      "Users will authorize account and execution access directly from TradeStation.",
  },
  {
    name: "Interactive Brokers",
    method: "TWS / IB Gateway connector",
    status: "Planned",
    statusClass:
      "border-amber-400/20 bg-amber-400/10 text-amber-300",
    description:
      "A local connector will read account data, executions, and commissions from TWS or IB Gateway.",
  },
];

function toNumber(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function pickString(
  value: CompletedTrade,
  keys: Array<keyof CompletedTrade | string>,
) {
  for (const key of keys) {
    const candidate = value[String(key)];

    if (
      candidate !== null &&
      candidate !== undefined &&
      String(candidate).trim()
    ) {
      return String(candidate).trim();
    }
  }

  return null;
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function isTradingViewManagedBrokerAccount(account: BrokerAccount) {
  const broker = normalizeKey(account.broker_name);
  const accountName = normalizeKey(account.account_name || "");

  return (
    broker.includes("tradingview") ||
    accountName.includes("tradingview")
  );
}

function dedupeBrokerAccounts(accounts: BrokerAccount[]) {
  const seen = new Map<string, BrokerAccount>();

  for (const account of accounts) {
    const key = `${normalizeKey(account.broker_name)}::${normalizeKey(
      account.account_name || "default",
    )}`;
    const existing = seen.get(key);
    const accountSyncedAt = account.last_synced_at || "";
    const existingSyncedAt = existing?.last_synced_at || "";

    if (!existing || accountSyncedAt > existingSyncedAt) {
      seen.set(key, account);
    }
  }

  return Array.from(seen.values()).sort(
    (first, second) =>
      new Date(second.last_synced_at || 0).getTime() -
      new Date(first.last_synced_at || 0).getTime(),
  );
}

function getTradeTimestamp(trade: CompletedTrade) {
  return (
    trade.exit_at ||
    trade.entry_at ||
    trade.updated_at ||
    trade.created_at ||
    null
  );
}

function normalizeTradeForAccounts(trade: CompletedTrade) {
  return {
    broker:
      pickString(trade, [
        "broker",
        "broker_name",
        "provider",
        "source_broker",
        "source_platform",
      ]) || null,
    account_external_id: pickString(trade, [
      "account_external_id",
      "broker_account_external_id",
    ]),
    broker_account_external_id: pickString(trade, [
      "broker_account_external_id",
    ]),
    account_id: pickString(trade, [
      "account_id",
      "broker_account_id",
    ]),
    broker_account_id: pickString(trade, ["broker_account_id"]),
    account_name: pickString(trade, [
      "account_name",
      "broker_account_name",
      "account_label",
    ]),
    broker_account_name: pickString(trade, ["broker_account_name"]),
    account_label: pickString(trade, ["account_label"]),
    raw_payload: trade.raw_payload,
  };
}

function buildDetectedAccounts(trades: CompletedTrade[]) {
  const accountMap = new Map<string, DetectedAccount>();

  for (const trade of trades) {
    const normalized = normalizeTradeForAccounts(trade);

    if (!isTradingViewPaperFeedTrade(normalized)) {
      continue;
    }

    const key = TRADINGVIEW_PAPER_ACCOUNT_EXTERNAL_ID;
    const brokerName = getTradeAccountFeedName(normalized);
    const accountName = getTradeAccountLabel({
      ...normalized,
      account_external_id: key,
      broker: "tradingview",
    });
    const isPaper = true;

    const current = accountMap.get(key) || {
      key,
      brokerName,
      accountExternalId: key,
      accountName,
      isPaper,
      importedTrades: 0,
      netPnl: 0,
      fees: 0,
      latestTradeAt: null,
    };

    current.importedTrades += 1;

    const displayPnl = getTradeDisplayPnl(trade);

    if (displayPnl !== null) {
      current.netPnl += displayPnl;
    }

    current.fees += Math.abs(toNumber(trade.fees) ?? 0);

    const tradeTimestamp = getTradeTimestamp(trade);

    if (tradeTimestamp) {
      const currentTime = current.latestTradeAt
        ? new Date(current.latestTradeAt).getTime()
        : 0;

      const tradeTime = new Date(tradeTimestamp).getTime();

      if (Number.isFinite(tradeTime) && tradeTime > currentTime) {
        current.latestTradeAt = tradeTimestamp;
      }
    }

    accountMap.set(key, current);
  }

  return Array.from(accountMap.values()).sort(
    (first, second) => {
      if (first.isPaper !== second.isPaper) {
        return first.isPaper ? -1 : 1;
      }

      return (
        new Date(second.latestTradeAt || 0).getTime() -
        new Date(first.latestTradeAt || 0).getTime()
      );
    },
  );
}

function formatCurrency(value: number | null, currency = "USD") {
  if (value === null) {
    return "Not available";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatSignedCurrency(value: number | null, currency = "USD") {
  if (value === null) {
    return "—";
  }

  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(value));

  if (value > 0) {
    return `+${formatted}`;
  }

  if (value < 0) {
    return `-${formatted}`;
  }

  return formatted;
}

function formatDate(value: string | null) {
  if (!value) {
    return "Never synced";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Date unavailable";
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getMostRecentTimestamp(trades: CompletedTrade[]) {
  const timestamps = trades
    .map(getTradeTimestamp)
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite);

  if (timestamps.length === 0) {
    return null;
  }

  return new Date(Math.max(...timestamps)).toISOString();
}

function getMostRecentSync(accounts: BrokerAccount[]) {
  const timestamps = accounts
    .map((account) => account.last_synced_at)
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite);

  if (timestamps.length === 0) {
    return null;
  }

  return new Date(Math.max(...timestamps)).toISOString();
}

function isSyncStale(value: string | null) {
  if (!value) {
    return true;
  }

  const timestamp = new Date(value).getTime();

  if (!Number.isFinite(timestamp)) {
    return true;
  }

  return Date.now() - timestamp > 24 * 60 * 60 * 1000;
}

function getStatusClasses(status: BrokerAccount["status"]) {
  switch (status) {
    case "connected":
      return "border-emerald-400/20 bg-emerald-400/10 text-emerald-300";

    case "pending":
      return "border-amber-400/20 bg-amber-400/10 text-amber-300";

    case "error":
      return "border-red-400/20 bg-red-400/10 text-red-300";

    default:
      return "border-slate-400/20 bg-slate-400/10 text-slate-300";
  }
}

function getMoneyClass(value: number) {
  if (value > 0) {
    return "text-emerald-400";
  }

  if (value < 0) {
    return "text-rose-400";
  }

  return "text-white";
}

function accountMatchesDetectedTrade(
  account: BrokerAccount,
  detected: DetectedAccount,
) {
  const accountBroker = normalizeKey(account.broker_name);
  const detectedBroker = normalizeKey(detected.brokerName);

  const brokerMatches =
    accountBroker === detectedBroker ||
    (detected.isPaper &&
      (accountBroker === "tradingview" ||
        accountBroker === "tradingview-paper")) ||
    (detected.brokerName.toLowerCase().includes("tradingview") &&
      accountBroker.includes("tradingview"));

  if (!brokerMatches) {
    return false;
  }

  const candidates = [
    account.account_name,
    account.account_number_masked,
  ]
    .filter((value): value is string => Boolean(value))
    .map(normalizeKey);

  const detectedCandidates = [
    detected.accountExternalId,
    detected.accountName,
    detected.key,
  ].map(normalizeKey);

  if (detected.isPaper && account.environment === "demo") {
    return true;
  }

  return candidates.some((candidate) =>
    detectedCandidates.some(
      (detectedCandidate) =>
        candidate.includes(detectedCandidate) ||
        detectedCandidate.includes(candidate),
    ),
  );
}

function DetectedAccountCard({
  account,
}: {
  account: DetectedAccount;
}) {
  return (
    <article
      key={account.key}
      className="rounded-3xl border border-cyan-400/20 bg-cyan-400/[0.035] p-6"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-cyan-300">
            {account.brokerName}
          </p>

          <h3 className="mt-2 text-xl font-semibold text-white">
            {account.accountName}
          </h3>
        </div>

        <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300">
          Trade feed active
        </span>
      </div>

      <div className="mt-7 grid grid-cols-2 gap-4">
        <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
            Imported Trades
          </p>

          <p className="mt-2 text-lg font-semibold text-white">
            {account.importedTrades}
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
            Net P/L
          </p>

          <p
            className={`mt-2 text-lg font-semibold ${getMoneyClass(
              account.netPnl,
            )}`}
          >
            {formatSignedCurrency(account.netPnl)}
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
            Fees
          </p>

          <p className="mt-2 text-lg font-semibold text-rose-300">
            -{formatCurrency(account.fees)}
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
            Latest Trade
          </p>

          <p className="mt-2 text-sm font-semibold leading-6 text-white">
            {formatDate(account.latestTradeAt)}
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row">
        <Link
          href="/dashboard/trades"
          className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:border-cyan-300 hover:text-cyan-300"
        >
          View Trades
        </Link>

        <Link
          href="/dashboard/reports"
          className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:border-cyan-300 hover:text-cyan-300"
        >
          View Reports
        </Link>
      </div>
    </article>
  );
}

async function disconnectAccount(formData: FormData) {
  "use server";

  const accountId = String(formData.get("accountId") || "").trim();

  if (!accountId) {
    return;
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { error } = await supabase
    .from("broker_accounts")
    .update({
      status: "disconnected",
    })
    .eq("id", accountId)
    .eq("user_id", user.id);

  if (error) {
    console.error(
      "[TradeCoach Accounts] Could not disconnect account:",
      error,
    );
  }

  revalidatePath("/dashboard/accounts");
}

async function refreshAccountData() {
  "use server";

  revalidatePath("/dashboard/accounts");
}

export default async function AccountsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [accountsResult, tradesResult] = await Promise.all([
    supabase
      .from("broker_accounts")
      .select(
        `
          id,
          broker_name,
          account_name,
          account_number_masked,
          environment,
          status,
          account_type,
          current_balance,
          currency,
          last_synced_at
        `,
      )
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("created_at", { ascending: false }),

    supabase
      .from("broker_completed_trades")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(5000),
  ]);

  const allAccounts = (accountsResult.data ?? []) as BrokerAccount[];
  const accounts = dedupeBrokerAccounts(
    allAccounts.filter(isTradingViewManagedBrokerAccount),
  );
  const completedTrades = (tradesResult.data ?? []) as CompletedTrade[];
  const tradeStats = getTradeOutcomeStats(completedTrades);

  const detectedAccounts = buildDetectedAccounts(completedTrades);

  const activeBrokerNames = detectedAccounts.some((account) => account.isPaper)
    ? ["TradingView Paper"]
    : [];

  const unmatchedDetectedAccounts = detectedAccounts.filter(
    (detected) =>
      !accounts.some((account) =>
        accountMatchesDetectedTrade(account, detected),
      ),
  );

  const paperDetectedAccounts = unmatchedDetectedAccounts;

  const totalAccountCount =
    accounts.length + paperDetectedAccounts.length;

  const connectedAccountCount =
    accounts.filter((account) => account.status === "connected").length +
    paperDetectedAccounts.length;

  const totalNetPnl = tradeStats.totalPnl;

  const totalFees = completedTrades.reduce(
    (total, trade) => total + Math.abs(toNumber(trade.fees) ?? 0),
    0,
  );

  const balances = accounts
    .map((account) => account.current_balance)
    .filter((value): value is number => value !== null);

  const totalKnownBalance =
    balances.length > 0
      ? balances.reduce((total, balance) => total + balance, 0)
      : null;

  const primaryCurrency = accounts[0]?.currency || "USD";
  const mostRecentSync = getMostRecentSync(accounts);
  const mostRecentTrade = getMostRecentTimestamp(completedTrades);

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-cyan-300">
            Broker Connections
          </p>

          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
            Trading Accounts
          </h1>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            Manage TradingView and synced trading accounts TradeCoach uses to
            import executions, build completed trades, and create reports and AI
            coaching.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <form action={refreshAccountData}>
            <button
              type="submit"
              className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-300 transition hover:border-cyan-300 hover:text-cyan-300"
            >
              Refresh Data
            </button>
          </form>

          <Link
            href="/dashboard/accounts/connect"
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
          >
            Connect Broker
          </Link>
        </div>
      </section>

      {accountsResult.error ? (
        <section className="rounded-2xl border border-red-400/20 bg-red-400/10 p-5">
          <h2 className="font-semibold text-red-200">
            Saved broker accounts could not be loaded
          </h2>

          <p className="mt-2 text-sm text-red-200/70">
            {accountsResult.error.message}
          </p>
        </section>
      ) : null}

      {tradesResult.error ? (
        <section className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-5">
          <h2 className="font-semibold text-amber-200">
            Imported trade accounts could not be detected
          </h2>

          <p className="mt-2 text-sm text-amber-200/70">
            {tradesResult.error.message}
          </p>
        </section>
      ) : null}

      {activeBrokerNames.length > 0 ? (
        <section className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-5">
          <h2 className="font-semibold text-emerald-200">
            Live broker feeds
          </h2>

          <p className="mt-2 text-sm leading-6 text-emerald-100/75">
            TradeCoach is currently tracking imported trades from{" "}
            {activeBrokerNames.join(", ")}. Reconnect or manage your feed from{" "}
            <Link
              href="/dashboard/accounts/connect"
              className="font-semibold text-emerald-200 underline decoration-emerald-300/40 underline-offset-4"
            >
              Connect Broker
            </Link>
            .
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            {activeBrokerNames.map((brokerName) => (
              <span
                key={brokerName}
                className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-200"
              >
                {brokerName}
              </span>
            ))}
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="font-semibold text-white">
            Connect your first broker feed
          </h2>

          <p className="mt-2 text-sm leading-6 text-slate-400">
            Connect {BROKER_CONNECT_OPTIONS[0].name} with the TradeCoach Sync
            extension. Paper and broker-connected accounts inside TradingView
            will sync automatically.
          </p>
        </section>
      )}

      {paperDetectedAccounts.length > 0 ? (
        <section className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-5">
          <h2 className="font-semibold text-cyan-200">
            TradingView paper feed detected
          </h2>

          <p className="mt-2 text-sm leading-6 text-cyan-100/75">
            TradeCoach is syncing your TradingView paper trades automatically.
            Prop firm and CSV-imported broker accounts stay available on Trades
            and Reports, but are not listed here.
          </p>
        </section>
      ) : null}

      <section className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
          <p className="text-sm text-slate-400">Connected Accounts</p>

          <p className="mt-3 text-3xl font-extrabold text-cyan-300">
            {connectedAccountCount}
          </p>

          <p className="mt-2 text-sm text-slate-500">
            {totalAccountCount} detected or saved broker account
            {totalAccountCount === 1 ? "" : "s"}
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
          <p className="text-sm text-slate-400">Imported Trades</p>

          <p className="mt-3 text-3xl font-extrabold text-white">
            {tradeStats.totalTrades}
          </p>

          <p className="mt-2 text-sm text-slate-500">
            {tradeStats.scoredTrades} scored
            {tradeStats.pending > 0
              ? ` · ${tradeStats.pending} pending P/L`
              : ""}
            {" · "}
            Latest trade: {formatDate(mostRecentTrade)}
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
          <p className="text-sm text-slate-400">Imported Net P/L</p>

          <p
            className={`mt-3 text-3xl font-extrabold ${getMoneyClass(
              totalNetPnl,
            )}`}
          >
            {formatSignedCurrency(totalNetPnl, primaryCurrency)}
          </p>

          <p className="mt-2 text-sm text-slate-500">
            Fees: -{formatCurrency(totalFees, primaryCurrency)}
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
          <p className="text-sm text-slate-400">Known Account Balance</p>

          <p className="mt-3 text-3xl font-extrabold text-white">
            {formatCurrency(totalKnownBalance, primaryCurrency)}
          </p>

          <p className="mt-2 text-sm text-slate-500">
            Saved-account sync: {formatDate(mostRecentSync)}
          </p>
        </div>
      </section>

      {accounts.length === 0 && paperDetectedAccounts.length === 0 ? (
        <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035]">
          <div className="grid gap-8 p-7 lg:grid-cols-[1fr_300px] lg:p-10">
            <div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-xl text-cyan-300">
                ◎
              </div>

              <h2 className="mt-6 text-2xl font-semibold text-white">
                Connect your first broker account
              </h2>

              <p className="mt-3 max-w-xl text-sm leading-7 text-slate-400">
                Once connected, TradeCoach AI can receive broker executions,
                group them into completed trades, calculate fees and net P/L,
                and use the results throughout your dashboard.
              </p>

              <Link
                href="/dashboard/accounts/connect"
                className="mt-7 inline-flex min-h-11 items-center justify-center rounded-xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
              >
                Connect Broker
              </Link>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-5">
              <p className="text-sm font-semibold text-white">
                What happens next
              </p>

              <div className="mt-5 space-y-5">
                {[
                  "Connect a supported broker",
                  "Capture executions and commissions",
                  "Group entries and exits",
                  "Update reports and AI coaching",
                ].map((item, index) => (
                  <div key={item} className="flex gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-cyan-300/20 bg-cyan-300/10 text-xs font-semibold text-cyan-300">
                      {index + 1}
                    </div>

                    <p className="pt-1 text-sm text-slate-300">{item}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {paperDetectedAccounts.length > 0 ? (
        <section>
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-cyan-300">
              Detected From Imported Trades
            </p>

            <h2 className="mt-2 text-2xl font-semibold text-white">
              Active Trade Feeds
            </h2>
          </div>

          <div className="mt-8">
            <h3 className="text-lg font-semibold text-white">
              Paper Trading
            </h3>

            <p className="mt-1 text-sm text-slate-400">
              Simulated TradingView paper account trades.
            </p>

            <div className="mt-5 grid gap-5 xl:grid-cols-2">
              {paperDetectedAccounts.map((account) => (
                <DetectedAccountCard
                  key={account.key}
                  account={account}
                />
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {accounts.length > 0 ? (
        <section>
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-cyan-300">
              Saved Connections
            </p>

            <h2 className="mt-2 text-2xl font-semibold text-white">
              Broker Account Records
            </h2>
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            {accounts.map((account) => {
              const stale = isSyncStale(account.last_synced_at);

              return (
                <article
                  key={account.id}
                  className="rounded-3xl border border-white/10 bg-white/[0.035] p-6"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium uppercase tracking-[0.2em] text-cyan-300">
                        {account.broker_name}
                      </p>

                      <h3 className="mt-2 text-xl font-semibold text-white">
                        {account.account_name || "Trading Account"}
                      </h3>

                      <p className="mt-1 text-sm text-slate-500">
                        {account.account_number_masked ||
                          "Account number hidden"}
                      </p>
                    </div>

                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-semibold capitalize ${getStatusClasses(
                        account.status,
                      )}`}
                    >
                      {account.status}
                    </span>
                  </div>

                  {account.status === "connected" && stale ? (
                    <div className="mt-5 rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4">
                      <p className="text-sm font-semibold text-amber-200">
                        Sync may be out of date
                      </p>

                      <p className="mt-1 text-sm leading-6 text-amber-100/70">
                        Open the broker connector and then refresh this page
                        after it sends the newest account update.
                      </p>
                    </div>
                  ) : null}

                  <div className="mt-7 grid grid-cols-2 gap-4">
                    <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
                        Balance
                      </p>

                      <p className="mt-2 text-lg font-semibold text-white">
                        {formatCurrency(
                          account.current_balance,
                          account.currency,
                        )}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
                        Environment
                      </p>

                      <p className="mt-2 text-lg font-semibold capitalize text-white">
                        {account.environment}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
                        Account Type
                      </p>

                      <p className="mt-2 text-lg font-semibold capitalize text-white">
                        {account.account_type || "Not provided"}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
                        Last Synchronized
                      </p>

                      <p className="mt-2 text-sm font-semibold leading-6 text-white">
                        {formatDate(account.last_synced_at)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row sm:flex-wrap sm:items-center">
                    <Link
                      href={`/dashboard/accounts/${account.id}`}
                      className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:border-cyan-300 hover:text-cyan-300"
                    >
                      Manage Account
                    </Link>

                    <Link
                      href="/dashboard/reports"
                      className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:border-cyan-300 hover:text-cyan-300"
                    >
                      View Reports
                    </Link>

                    {account.status === "connected" ? (
                      <form action={disconnectAccount} className="sm:ml-auto">
                        <input
                          type="hidden"
                          name="accountId"
                          value={account.id}
                        />

                        <button
                          type="submit"
                          className="inline-flex min-h-10 w-full items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold text-rose-300 transition hover:bg-rose-400/10 hover:text-rose-200"
                        >
                          Disconnect
                        </button>
                      </form>
                    ) : (
                      <Link
                        href="/dashboard/accounts/connect"
                        className="inline-flex min-h-10 items-center justify-center rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 sm:ml-auto"
                      >
                        Reconnect
                      </Link>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-6">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-cyan-300">
            Multi-Broker Roadmap
          </p>

          <h2 className="mt-2 text-2xl font-semibold text-white">
            Built for TradingView and beyond
          </h2>

          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400">
            Connect through TradingView to sync paper and live broker accounts.
            Additional direct broker connectors may follow, but all feeds use the
            same normalized trade format in TradeCoach.
          </p>
        </div>

        <div className="mt-6 grid gap-5 md:grid-cols-2">
          {BROKER_ROADMAP.map((broker) => (
            <article
              key={broker.name}
              className="rounded-2xl border border-white/10 bg-slate-950/50 p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-white">
                    {broker.name}
                  </h3>

                  <p className="mt-1 text-sm text-slate-500">
                    {broker.method}
                  </p>
                </div>

                <span
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${broker.statusClass}`}
                >
                  {broker.status}
                </span>
              </div>

              <p className="mt-4 text-sm leading-6 text-slate-400">
                {broker.description}
              </p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
