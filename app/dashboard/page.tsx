"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { createBrowserClient } from "@supabase/ssr";

import TradingProfileSwitcher from "@/components/trading-profile-switcher";
import {
  getTradeDisplayPnl,
  getTradeOutcomeStats,
} from "@/lib/trade-pnl";
import { filterTradesForTradingProfile } from "@/lib/trading-profiles";
import { useTradingProfiles } from "@/lib/use-trading-profiles";

type BrokerCompletedTrade = {
  id?: string | number | null;

  broker_pair_id?: string | null;
  buy_fill_external_id?: string | null;
  sell_fill_external_id?: string | null;

  symbol?: string | null;
  direction?: string | null;
  quantity?: number | string | null;

  entry_price?: number | string | null;
  exit_price?: number | string | null;

  gross_points?: number | string | null;
  gross_pnl?: number | string | null;
  fees?: number | string | null;
  net_pnl?: number | string | null;

  status?: string | null;
  processing_error?: string | null;

  entry_at?: string | null;
  exit_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type NewYorkDateParts = {
  year: number;
  month: number;
  day: number;
  dayNumber: number;
};

const NEW_YORK_TIME_ZONE = "America/New_York";
const MILLISECONDS_PER_DAY = 86_400_000;

function toNumber(value: unknown): number | null {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function getTradeTimestamp(
  trade: BrokerCompletedTrade,
): string | null {
  return (
    trade.exit_at ||
    trade.entry_at ||
    trade.created_at ||
    trade.updated_at ||
    null
  );
}

function getTimestampValue(
  trade: BrokerCompletedTrade,
): number {
  const timestamp = getTradeTimestamp(trade);

  if (!timestamp) {
    return 0;
  }

  const value = new Date(timestamp).getTime();

  return Number.isFinite(value) ? value : 0;
}

function getNewYorkDateParts(
  value: string | Date,
): NewYorkDateParts | null {
  const date =
    value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const formattedParts = new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone: NEW_YORK_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    },
  ).formatToParts(date);

  const values: Record<string, string> = {};

  for (const part of formattedParts) {
    if (part.type !== "literal") {
      values[part.type] = part.value;
    }
  }

  const year = Number(values.year);
  const month = Number(values.month);
  const day = Number(values.day);

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day)
  ) {
    return null;
  }

  return {
    year,
    month,
    day,
    dayNumber:
      Date.UTC(year, month - 1, day) /
      MILLISECONDS_PER_DAY,
  };
}

function getCurrentNewYorkDateParts(): NewYorkDateParts {
  return (
    getNewYorkDateParts(new Date()) || {
      year: new Date().getFullYear(),
      month: new Date().getMonth() + 1,
      day: new Date().getDate(),
      dayNumber:
        Date.UTC(
          new Date().getFullYear(),
          new Date().getMonth(),
          new Date().getDate(),
        ) / MILLISECONDS_PER_DAY,
    }
  );
}

function getWeekStartDayNumber(
  currentDate: NewYorkDateParts,
): number {
  const utcDate = new Date(
    Date.UTC(
      currentDate.year,
      currentDate.month - 1,
      currentDate.day,
    ),
  );

  const sundayBasedDay = utcDate.getUTCDay();

  const daysSinceMonday =
    sundayBasedDay === 0
      ? 6
      : sundayBasedDay - 1;

  return currentDate.dayNumber - daysSinceMonday;
}

function formatMoney(
  value: unknown,
  options?: {
    showPlus?: boolean;
    fee?: boolean;
  },
): string {
  const number = toNumber(value);

  if (number === null) {
    return "—";
  }

  const normalized =
    Math.abs(number) < 0.005 ? 0 : number;

  const formatted = Math.abs(normalized).toLocaleString(
    "en-US",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    },
  );

  if (options?.fee) {
    return normalized === 0
      ? "$0.00"
      : `-$${formatted}`;
  }

  if (normalized < 0) {
    return `-$${formatted}`;
  }

  if (normalized > 0 && options?.showPlus) {
    return `+$${formatted}`;
  }

  return `$${formatted}`;
}

function getMoneyClass(value: unknown): string {
  const number = toNumber(value);

  if (number === null || number === 0) {
    return "text-slate-200";
  }

  return number > 0
    ? "text-emerald-400"
    : "text-rose-400";
}

function formatSide(
  direction: string | null | undefined,
): string {
  const normalized = String(
    direction || "",
  ).toLowerCase();

  if (normalized === "long") {
    return "Long";
  }

  if (normalized === "short") {
    return "Short";
  }

  return direction || "—";
}

function formatTradeTime(
  trade: BrokerCompletedTrade,
): string {
  const timestamp = getTradeTimestamp(trade);

  if (!timestamp) {
    return "—";
  }

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone: NEW_YORK_TIME_ZONE,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function formatLastSynced(
  timestamp: string | null,
): string {
  if (!timestamp) {
    return "No completed trades synced yet";
  }

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return "Last sync time unavailable";
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone: NEW_YORK_TIME_ZONE,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function calculateProfitFactor(
  trades: BrokerCompletedTrade[],
): string {
  let grossWins = 0;
  let grossLosses = 0;

  for (const trade of trades) {
    const netPnl = getTradeDisplayPnl(trade);

    if (netPnl === null) {
      continue;
    }

    if (netPnl > 0) {
      grossWins += netPnl;
    } else if (netPnl < 0) {
      grossLosses += Math.abs(netPnl);
    }
  }

  if (grossWins === 0 && grossLosses === 0) {
    return "—";
  }

  if (grossLosses === 0) {
    return "∞";
  }

  return (grossWins / grossLosses).toFixed(2);
}

function sumTradeValue(
  trades: BrokerCompletedTrade[],
  field: "gross_pnl" | "fees" | "net_pnl",
): number {
  return trades.reduce((total, trade) => {
    const value = toNumber(trade[field]);

    return total + (value ?? 0);
  }, 0);
}

export default function DashboardPage() {
  const supabase = useMemo(() => {
    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL;

    const supabasePublishableKey =
      process.env
        .NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    if (!supabaseUrl || !supabasePublishableKey) {
      return null;
    }

    return createBrowserClient(
      supabaseUrl,
      supabasePublishableKey,
    );
  }, []);

  const [trades, setTrades] = useState<
    BrokerCompletedTrade[]
  >([]);

  const [loading, setLoading] = useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const {
    profiles: tradingProfiles,
    activeProfile,
    loading: tradingProfilesLoading,
    actionLoading: tradingProfileActionLoading,
    error: tradingProfilesError,
    createProfile,
    activateProfile,
  } = useTradingProfiles();

  const profileScopedTrades = useMemo(
    () =>
      filterTradesForTradingProfile(
        trades,
        activeProfile,
        tradingProfiles,
        { profilesLoading: tradingProfilesLoading },
      ),
    [trades, activeProfile, tradingProfiles, tradingProfilesLoading],
  );

  const [errorMessage, setErrorMessage] = useState<
    string | null
  >(null);

  const loadTrades = useCallback(
    async (manualRefresh = false) => {
      if (!supabase) {
        setErrorMessage(
          "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local",
        );

        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (manualRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setErrorMessage(null);

      try {
        const { data, error } = await supabase
          .from("broker_completed_trades")
          .select("*")
          .order("updated_at", {
            ascending: false,
          })
          .limit(1000);

        if (error) {
          throw error;
        }

        const sortedTrades = [
          ...((data || []) as BrokerCompletedTrade[]),
        ].sort(
          (firstTrade, secondTrade) =>
            getTimestampValue(secondTrade) -
            getTimestampValue(firstTrade),
        );

        setTrades(sortedTrades);
      } catch (error) {
        console.error(
          "[TradeCoach] Dashboard trade load failed:",
          error,
        );

        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Could not load trades from Supabase.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [supabase],
  );

  useEffect(() => {
    void loadTrades();

    if (!supabase) {
      return;
    }

    const channel = supabase
      .channel("tradecoach-dashboard-trades")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "broker_completed_trades",
        },
        () => {
          void loadTrades(true);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadTrades, supabase]);

  const dateMetrics = useMemo(() => {
    const currentDate = getCurrentNewYorkDateParts();

    const weekStartDayNumber =
      getWeekStartDayNumber(currentDate);

    const todayTrades: BrokerCompletedTrade[] = [];
    const weekTrades: BrokerCompletedTrade[] = [];
    const monthTrades: BrokerCompletedTrade[] = [];

    for (const trade of profileScopedTrades) {
      const timestamp = getTradeTimestamp(trade);

      if (!timestamp) {
        continue;
      }

      const tradeDate = getNewYorkDateParts(timestamp);

      if (!tradeDate) {
        continue;
      }

      if (tradeDate.dayNumber === currentDate.dayNumber) {
        todayTrades.push(trade);
      }

      if (
        tradeDate.dayNumber >= weekStartDayNumber &&
        tradeDate.dayNumber <= currentDate.dayNumber
      ) {
        weekTrades.push(trade);
      }

      if (
        tradeDate.year === currentDate.year &&
        tradeDate.month === currentDate.month
      ) {
        monthTrades.push(trade);
      }
    }

    return {
      todayTrades,
      weekTrades,
      monthTrades,
    };
  }, [profileScopedTrades]);

  const todayNetPnl = useMemo(
    () =>
      getTradeOutcomeStats(
        dateMetrics.todayTrades,
      ).totalPnl,
    [dateMetrics.todayTrades],
  );

  const weeklyMetrics = useMemo(() => {
    const weekTrades = dateMetrics.weekTrades;
    const stats = getTradeOutcomeStats(weekTrades);
    let longNet = 0;
    let shortNet = 0;
    let longCount = 0;
    let shortCount = 0;

    for (const trade of weekTrades) {
      const netPnl = getTradeDisplayPnl(trade);
      const direction = String(
        trade.direction || "",
      ).toLowerCase();

      if (netPnl === null) {
        continue;
      }

      if (direction === "long") {
        longCount += 1;
        longNet += netPnl;
      }

      if (direction === "short") {
        shortCount += 1;
        shortNet += netPnl;
      }
    }

    return {
      totalTrades: weekTrades.length,
      scoredTrades: stats.scoredTrades,
      pending: stats.pending,
      winners: stats.winners,
      losers: stats.losers,
      winRate: stats.winRate,
      profitFactor: calculateProfitFactor(weekTrades),
      longNet,
      shortNet,
      longCount,
      shortCount,
      weeklyNet: stats.totalPnl,
      weeklyFees: sumTradeValue(
        weekTrades,
        "fees",
      ),
    };
  }, [dateMetrics.weekTrades]);

  const monthlyMetrics = useMemo(() => {
    const stats = getTradeOutcomeStats(
      dateMetrics.monthTrades,
    );

    return {
      netPnl: stats.totalPnl,
      count: dateMetrics.monthTrades.length,
      scoredTrades: stats.scoredTrades,
      pending: stats.pending,
      winners: stats.winners,
      winRate: stats.winRate,
    };
  }, [dateMetrics.monthTrades]);

  const recentTrades = useMemo(
    () => profileScopedTrades.slice(0, 6),
    [profileScopedTrades],
  );

  const latestSyncTimestamp =
    profileScopedTrades[0]?.updated_at ||
    profileScopedTrades[0]?.created_at ||
    null;

  const bestDirection = useMemo(() => {
    if (
      weeklyMetrics.longCount === 0 &&
      weeklyMetrics.shortCount === 0
    ) {
      return null;
    }

    if (weeklyMetrics.longNet >= weeklyMetrics.shortNet) {
      return {
        label: "Long",
        net: weeklyMetrics.longNet,
        count: weeklyMetrics.longCount,
      };
    }

    return {
      label: "Short",
      net: weeklyMetrics.shortNet,
      count: weeklyMetrics.shortCount,
    };
  }, [weeklyMetrics]);

  const coachInsight = useMemo(() => {
    if (weeklyMetrics.scoredTrades === 0) {
      return {
        main:
          "Complete a TradingView trade and your live weekly coaching summary will appear here.",
        positive:
          "TradeCoach is connected to the same completed-trade table used by your Trades page.",
        focus:
          "Your next processed trade will automatically update this dashboard.",
      };
    }

    const main =
      weeklyMetrics.weeklyNet >= 0
        ? `You are net ${formatMoney(
            weeklyMetrics.weeklyNet,
            {
              showPlus: true,
            },
          )} across ${
            weeklyMetrics.scoredTrades
          } scored trade${
            weeklyMetrics.scoredTrades === 1 ? "" : "s"
          } this week.`
        : `You are net ${formatMoney(
            weeklyMetrics.weeklyNet,
          )} across ${
            weeklyMetrics.scoredTrades
          } scored trade${
            weeklyMetrics.scoredTrades === 1 ? "" : "s"
          } this week.`;

    const positive = bestDirection
      ? `${bestDirection.label} trades produced ${formatMoney(
          bestDirection.net,
          {
            showPlus: true,
          },
        )} across ${bestDirection.count} trade${
          bestDirection.count === 1 ? "" : "s"
        }.`
      : "There is not enough direction data yet.";

    const focus =
      weeklyMetrics.winRate < 50
        ? "Focus on fewer, higher-quality setups and avoid forcing entries in choppy conditions."
        : "Keep protecting your winners and avoid increasing risk after a losing trade.";

    return {
      main,
      positive,
      focus,
    };
  }, [bestDirection, weeklyMetrics]);

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-400">
            Live Dashboard
          </p>

          <h1 className="mt-2 text-3xl font-extrabold">
            Trading Overview
          </h1>

          <p className="mt-2 text-sm text-slate-400">
            Real processed trades synchronized from TradingView
            {activeProfile ? ` · ${activeProfile.name}` : ""}.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            void loadTrades(true);
          }}
          disabled={refreshing}
          className="rounded-xl bg-cyan-500 px-5 py-3 font-bold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {refreshing
            ? "Refreshing..."
            : "Refresh Dashboard"}
        </button>
      </div>

      {errorMessage ? (
        <div className="mb-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5">
          <p className="font-bold text-rose-400">
            Could not load live dashboard data
          </p>

          <p className="mt-2 text-sm text-rose-200">
            {errorMessage}
          </p>
        </div>
      ) : null}

      <div className="mb-6">
        <TradingProfileSwitcher
          profiles={tradingProfiles}
          activeProfile={activeProfile}
          loading={tradingProfilesLoading}
          actionLoading={tradingProfileActionLoading}
          error={tradingProfilesError}
          onCreateProfile={createProfile}
          onActivateProfile={activateProfile}
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-400">
              Today&apos;s Net P/L
            </p>

            <span
              className={`rounded-lg px-2 py-1 text-xs font-semibold ${
                todayNetPnl > 0
                  ? "bg-emerald-500/10 text-emerald-400"
                  : todayNetPnl < 0
                    ? "bg-rose-500/10 text-rose-400"
                    : "bg-slate-800 text-slate-300"
              }`}
            >
              {todayNetPnl > 0
                ? "Profit"
                : todayNetPnl < 0
                  ? "Loss"
                  : "Flat"}
            </span>
          </div>

          <p
            className={`mt-4 text-3xl font-extrabold ${getMoneyClass(
              todayNetPnl,
            )}`}
          >
            {formatMoney(todayNetPnl, {
              showPlus: true,
            })}
          </p>

          <p className="mt-2 text-sm text-slate-500">
            Across {dateMetrics.todayTrades.length} completed
            trade
            {dateMetrics.todayTrades.length === 1 ? "" : "s"}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <p className="text-sm font-medium text-slate-400">
            Win Rate
          </p>

          <p className="mt-4 text-3xl font-extrabold">
            {weeklyMetrics.scoredTrades > 0
              ? `${weeklyMetrics.winRate.toFixed(0)}%`
              : "—"}
          </p>

          <p className="mt-2 text-sm text-slate-500">
            {weeklyMetrics.winners} wins · {weeklyMetrics.losers} losses
            {weeklyMetrics.pending > 0
              ? ` · ${weeklyMetrics.pending} pending P/L`
              : ""}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <p className="text-sm font-medium text-slate-400">
            Profit Factor
          </p>

          <p className="mt-4 text-3xl font-extrabold">
            {weeklyMetrics.profitFactor}
          </p>

          <p className="mt-2 text-sm text-slate-500">
            Weekly net winners versus losses
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <p className="text-sm font-medium text-slate-400">
            Trades This Week
          </p>

          <p className="mt-4 text-3xl font-extrabold">
            {weeklyMetrics.totalTrades}
          </p>

          <p className="mt-2 text-sm text-slate-500">
            {weeklyMetrics.winners} wins · {weeklyMetrics.losers} losses
            {weeklyMetrics.pending > 0
              ? ` · ${weeklyMetrics.pending} pending P/L`
              : ""}
          </p>
        </div>
      </div>

      <div className="mt-8 grid gap-8 xl:grid-cols-[1.5fr_1fr]">
        <div className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/60">
          <div className="flex items-center justify-between border-b border-slate-800 px-6 py-5">
            <div>
              <h2 className="text-xl font-bold">
                Recent Trades
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Latest processed TradingView trades
              </p>
            </div>

            <Link
              href="/dashboard/trades"
              className="text-sm font-semibold text-cyan-400 transition hover:text-cyan-300"
            >
              View all
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px]">
              <thead>
                <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wider text-slate-500">
                  <th className="px-6 py-4 font-semibold">
                    Symbol
                  </th>

                  <th className="px-6 py-4 font-semibold">
                    Side
                  </th>

                  <th className="px-6 py-4 font-semibold">
                    P/L
                  </th>

                  <th className="px-6 py-4 font-semibold">
                    Time
                  </th>
                </tr>
              </thead>

              <tbody>
                {loading || tradingProfilesLoading ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-6 py-14 text-center text-slate-400"
                    >
                      Loading real trades...
                    </td>
                  </tr>
                ) : null}

                {!loading &&
                !tradingProfilesLoading &&
                recentTrades.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-6 py-14 text-center"
                    >
                      <p className="font-semibold text-slate-300">
                        No processed trades yet
                      </p>

                      <p className="mt-2 text-sm text-slate-500">
                        Your next completed TradingView trade
                        will appear here.
                      </p>
                    </td>
                  </tr>
                ) : null}

                {!loading && !tradingProfilesLoading
                  ? recentTrades.map((trade, index) => {
                      const side = formatSide(
                        trade.direction,
                      );

                      const rowKey = String(
                        trade.id ||
                          trade.broker_pair_id ||
                          `${getTradeTimestamp(
                            trade,
                          )}-${index}`,
                      );

                      return (
                        <tr
                          key={rowKey}
                          className="border-b border-slate-800/80 last:border-b-0"
                        >
                          <td className="px-6 py-5 font-bold">
                            {trade.symbol || "—"}
                          </td>

                          <td className="px-6 py-5">
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                side === "Long"
                                  ? "bg-emerald-500/10 text-emerald-400"
                                  : side === "Short"
                                    ? "bg-rose-500/10 text-rose-400"
                                    : "bg-slate-800 text-slate-300"
                              }`}
                            >
                              {side}
                            </span>
                          </td>

                          <td
                            className={`px-6 py-5 font-extrabold ${getMoneyClass(
                              getTradeDisplayPnl(trade),
                            )}`}
                          >
                            {formatMoney(
                              getTradeDisplayPnl(trade),
                              {
                                showPlus: true,
                              },
                            )}
                          </td>

                          <td className="px-6 py-5 text-sm text-slate-400">
                            {formatTradeTime(trade)}
                          </td>
                        </tr>
                      );
                    })
                  : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-3xl border border-cyan-500/20 bg-gradient-to-br from-slate-900 to-slate-950 p-6 shadow-[0_0_50px_rgba(34,211,238,0.06)]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-400">
                Trade Summary
              </p>

              <h2 className="mt-2 text-2xl font-bold">
                This Week&apos;s Insight
              </h2>
            </div>

            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-500/10 text-2xl text-cyan-400">
              ✦
            </span>
          </div>

          <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <p className="leading-7 text-slate-300">
              {coachInsight.main}
            </p>
          </div>

          <div className="mt-5 space-y-4">
            <div className="rounded-2xl bg-slate-900/70 p-5">
              <p className="text-sm font-semibold text-white">
                What is working
              </p>

              <p className="mt-2 text-sm leading-6 text-slate-400">
                {coachInsight.positive}
              </p>
            </div>

            <div className="rounded-2xl bg-slate-900/70 p-5">
              <p className="text-sm font-semibold text-white">
                Focus next session
              </p>

              <p className="mt-2 text-sm leading-6 text-slate-400">
                {coachInsight.focus}
              </p>
            </div>
          </div>

          <Link
            href="/dashboard/ai-coach"
            className="mt-6 block rounded-xl bg-cyan-500 px-6 py-4 text-center font-bold text-slate-950 transition hover:bg-cyan-400"
          >
            Open AI Coach
          </Link>
        </div>
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-400">
                Connected Broker
              </p>

              <h3 className="mt-2 text-xl font-bold">
                TradingView
              </h3>
            </div>

            <span
              className={`rounded-full px-3 py-1 text-sm font-semibold ${
                profileScopedTrades.length > 0
                  ? "bg-emerald-500/10 text-emerald-400"
                  : "bg-amber-500/10 text-amber-400"
              }`}
            >
              {profileScopedTrades.length > 0
                ? "Syncing"
                : "Waiting"}
            </span>
          </div>

          <p className="mt-4 text-sm leading-6 text-slate-500">
            Last database update:{" "}
            {formatLastSynced(latestSyncTimestamp)}
          </p>

          <Link
            href="/dashboard/accounts"
            className="mt-5 inline-block text-sm font-semibold text-cyan-400 transition hover:text-cyan-300"
          >
            Manage accounts
          </Link>
        </div>

        <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
          <p className="text-sm font-medium text-slate-400">
            Monthly Summary
          </p>

          <div className="mt-4 flex items-end justify-between gap-4">
            <p
              className={`text-3xl font-extrabold ${getMoneyClass(
                monthlyMetrics.netPnl,
              )}`}
            >
              {formatMoney(monthlyMetrics.netPnl, {
                showPlus: true,
              })}
            </p>

            <p className="text-sm font-semibold text-slate-400">
              {monthlyMetrics.count} trade
              {monthlyMetrics.count === 1 ? "" : "s"}
            </p>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4">
            <div className="rounded-xl bg-slate-950/70 p-4">
              <p className="text-xs uppercase tracking-wider text-slate-500">
                Trades
              </p>

              <p className="mt-2 font-bold text-white">
                {monthlyMetrics.count}
              </p>
            </div>

            <div className="rounded-xl bg-slate-950/70 p-4">
              <p className="text-xs uppercase tracking-wider text-slate-500">
                Win Rate
              </p>

              <p className="mt-2 font-bold text-cyan-400">
                {monthlyMetrics.scoredTrades > 0
                  ? `${Math.round(monthlyMetrics.winRate)}%`
                  : "—"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}