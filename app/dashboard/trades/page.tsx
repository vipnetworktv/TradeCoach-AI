"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { tradeMatchesSearch } from "@/lib/trade-search";
import {
  buildTradeAccountOptions,
  getTradeAccountKey,
  getTradeAccountLabel,
  STATS_ACCOUNT_FILTER_STORAGE_KEY,
} from "@/lib/trade-accounts";
import {
  getTradeDisplayPnl,
  getTradeOutcomeStats,
  getTradePendingReason,
} from "@/lib/trade-pnl";
import TradeCsvImportPanel from "@/components/trade-csv-import-panel";
import { createBrowserClient } from "@supabase/ssr";

type BrokerCompletedTrade = {
  id?: string | number | null;

  broker?: string | null;
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

  account_id?: string | null;
  account_name?: string | null;
  account_external_id?: string | null;
  broker_account_external_id?: string | null;

  entry_at?: string | null;
  exit_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;

  [key: string]: unknown;
};

type ResultFilter =
  | "all"
  | "winners"
  | "losers";

type DateRange =
  | "7"
  | "30"
  | "month"
  | "all";

const PAGE_SIZE = 25;

function createClient() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const supabasePublishableKey =
    process.env
      .NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (
    !supabaseUrl ||
    !supabasePublishableKey
  ) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local",
    );
  }

  return createBrowserClient(
    supabaseUrl,
    supabasePublishableKey,
  );
}

function toNumber(
  value: unknown,
): number | null {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : null;
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

function formatMoney(
  value: unknown,
  options?: {
    showPlus?: boolean;
    fees?: boolean;
  },
): string {
  const number = toNumber(value);

  if (number === null) {
    return "—";
  }

  const normalized =
    Math.abs(number) < 0.005
      ? 0
      : number;

  const formatted =
    Math.abs(normalized).toLocaleString(
      "en-US",
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      },
    );

  if (options?.fees) {
    if (normalized === 0) {
      return "$0.00";
    }

    return `-$${formatted}`;
  }

  if (normalized < 0) {
    return `-$${formatted}`;
  }

  if (
    normalized > 0 &&
    options?.showPlus
  ) {
    return `+$${formatted}`;
  }

  return `$${formatted}`;
}

function formatPrice(
  value: unknown,
): string {
  const number = toNumber(value);

  if (number === null) {
    return "—";
  }

  return number.toLocaleString(
    "en-US",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    },
  );
}

function formatQuantity(
  value: unknown,
): string {
  const number = toNumber(value);

  if (number === null) {
    return "—";
  }

  return Number.isInteger(number)
    ? String(number)
    : number.toFixed(2);
}

function formatSide(
  direction:
    | string
    | null
    | undefined,
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

function getMoneyClasses(
  value: unknown,
): string {
  const number = toNumber(value);

  if (
    number === null ||
    number === 0
  ) {
    return "text-slate-300";
  }

  return number > 0
    ? "text-emerald-400"
    : "text-rose-400";
}

function formatTradeDate(
  trade: BrokerCompletedTrade,
): {
  date: string;
  time: string;
} {
  const timestamp =
    getTradeTimestamp(trade);

  if (!timestamp) {
    return {
      date: "Unknown",
      time: "—",
    };
  }

  const date = new Date(timestamp);

  if (
    Number.isNaN(date.getTime())
  ) {
    return {
      date: "Unknown",
      time: "—",
    };
  }

  return {
    date: new Intl.DateTimeFormat(
      "en-US",
      {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone:
          "America/New_York",
      },
    ).format(date),

    time: new Intl.DateTimeFormat(
      "en-US",
      {
        hour: "numeric",
        minute: "2-digit",
        timeZone:
          "America/New_York",
        timeZoneName: "short",
      },
    ).format(date),
  };
}

function isInsideDateRange(
  trade: BrokerCompletedTrade,
  dateRange: DateRange,
): boolean {
  if (dateRange === "all") {
    return true;
  }

  const timestamp =
    getTradeTimestamp(trade);

  if (!timestamp) {
    return false;
  }

  const tradeDate =
    new Date(timestamp);

  if (
    Number.isNaN(
      tradeDate.getTime(),
    )
  ) {
    return false;
  }

  const now = new Date();

  if (dateRange === "7") {
    const start = new Date(
      now.getTime() -
        7 *
          24 *
          60 *
          60 *
          1000,
    );

    return tradeDate >= start;
  }

  if (dateRange === "30") {
    const start = new Date(
      now.getTime() -
        30 *
          24 *
          60 *
          60 *
          1000,
    );

    return tradeDate >= start;
  }

  if (
    dateRange === "month"
  ) {
    return (
      tradeDate.getFullYear() ===
        now.getFullYear() &&
      tradeDate.getMonth() ===
        now.getMonth()
    );
  }

  return true;
}

function getDateRangeLabel(
  dateRange: DateRange,
): string {
  if (dateRange === "7") {
    return "Last 7 days";
  }

  if (dateRange === "30") {
    return "Last 30 days";
  }

  if (
    dateRange === "month"
  ) {
    return "This month";
  }

  return "All time";
}

function escapeCsvValue(
  value: unknown,
): string {
  return `"${String(
    value ?? "",
  ).replaceAll('"', '""')}"`;
}

export default function TradesPage() {
  const supabase = useMemo(
    () => createClient(),
    [],
  );

  const [
    trades,
    setTrades,
  ] = useState<
    BrokerCompletedTrade[]
  >([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    refreshing,
    setRefreshing,
  ] = useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState<
    string | null
  >(null);

  const [
    deletingTradeId,
    setDeletingTradeId,
  ] = useState<string | null>(null);

  const [
    actionMessage,
    setActionMessage,
  ] = useState<string | null>(null);

  const [
    actionError,
    setActionError,
  ] = useState<string | null>(null);

  const [
    statsAccountKeys,
    setStatsAccountKeys,
  ] = useState<Set<string>>(
    () => new Set(),
  );

  const [
    statsAccountsReady,
    setStatsAccountsReady,
  ] = useState(false);

  const [
    search,
    setSearch,
  ] = useState("");

  const [
    accountFilter,
    setAccountFilter,
  ] = useState("all");

  const [
    resultFilter,
    setResultFilter,
  ] = useState<ResultFilter>(
    "all",
  );

  const [
    dateRange,
    setDateRange,
  ] = useState<DateRange>(
    "7",
  );

  const [
    page,
    setPage,
  ] = useState(1);

  const loadTrades =
    useCallback(
      async (
        manualRefresh = false,
      ) => {
        if (manualRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        setErrorMessage(null);

        try {
          const {
            data,
            error,
          } = await supabase
            .from(
              "broker_completed_trades",
            )
            .select("*")
            .order("updated_at", {
              ascending: false,
            })
            .limit(1000);

          if (error) {
            throw error;
          }

          setTrades(
            (data ||
              []) as BrokerCompletedTrade[],
          );
        } catch (error) {
          console.error(
            "[TradeCoach] Could not load completed trades:",
            error,
          );

          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Unknown Supabase error.",
          );
        } finally {
          setLoading(false);
          setRefreshing(false);
        }
      },
      [supabase],
    );

  useEffect(() => {
    const query = new URLSearchParams(window.location.search).get("q");

    if (query) {
      setSearch(query);
    }
  }, []);

  useEffect(() => {
    void loadTrades();

    const channel = supabase
      .channel(
        "tradecoach-completed-trades",
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table:
            "broker_completed_trades",
        },
        () => {
          void loadTrades(true);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(
        channel,
      );
    };
  }, [
    loadTrades,
    supabase,
  ]);

  useEffect(() => {
    setPage(1);
  }, [
    search,
    accountFilter,
    resultFilter,
    dateRange,
  ]);

  const accountOptions =
    useMemo(
      () =>
        buildTradeAccountOptions(
          trades,
        ),
      [trades],
    );

  useEffect(() => {
    if (accountOptions.length === 0) {
      setStatsAccountsReady(true);
      return;
    }

    const allKeys = accountOptions.map(
      (account) => account.key,
    );

    try {
      const stored = localStorage.getItem(
        STATS_ACCOUNT_FILTER_STORAGE_KEY,
      );

      if (stored) {
        const parsed = JSON.parse(
          stored,
        ) as string[];
        const next = new Set(
          parsed.filter((key) =>
            allKeys.includes(key),
          ),
        );

        for (const key of allKeys) {
          if (!parsed.includes(key)) {
            next.add(key);
          }
        }

        setStatsAccountKeys(next);
      } else {
        setStatsAccountKeys(
          new Set(allKeys),
        );
      }
    } catch {
      setStatsAccountKeys(
        new Set(allKeys),
      );
    }

    setStatsAccountsReady(true);
  }, [accountOptions]);

  useEffect(() => {
    if (
      !statsAccountsReady ||
      statsAccountKeys.size === 0
    ) {
      return;
    }

    localStorage.setItem(
      STATS_ACCOUNT_FILTER_STORAGE_KEY,
      JSON.stringify([
        ...statsAccountKeys,
      ]),
    );
  }, [
    statsAccountKeys,
    statsAccountsReady,
  ]);

  const tradesInDateRange =
    useMemo(() => {
      return trades.filter(
        (trade) =>
          isInsideDateRange(
            trade,
            dateRange,
          ),
      );
    }, [
      trades,
      dateRange,
    ]);

  const statsTrades =
    useMemo(() => {
      if (
        !statsAccountsReady ||
        statsAccountKeys.size === 0
      ) {
        return [];
      }

      return tradesInDateRange.filter(
        (trade) =>
          statsAccountKeys.has(
            getTradeAccountKey(
              trade,
            ),
          ),
      );
    }, [
      tradesInDateRange,
      statsAccountKeys,
      statsAccountsReady,
    ]);

  const filteredTrades =
    useMemo(() => {
      return tradesInDateRange.filter(
        (trade) => {
          const accountKey =
            getTradeAccountKey(
              trade,
            );

          if (
            accountFilter !==
              "all" &&
            accountKey !==
              accountFilter
          ) {
            return false;
          }

          const netPnl =
            getTradeDisplayPnl(
              trade,
            );

          if (
            resultFilter ===
              "winners" &&
            (netPnl === null ||
              netPnl <= 0)
          ) {
            return false;
          }

          if (
            resultFilter ===
              "losers" &&
            (netPnl === null ||
              netPnl >= 0)
          ) {
            return false;
          }

          if (
            !tradeMatchesSearch(
              trade,
              search,
            )
          ) {
            return false;
          }

          return true;
        },
      );
    }, [
      tradesInDateRange,
      search,
      accountFilter,
      resultFilter,
    ]);

  const totals =
    useMemo(() => {
      const stats = getTradeOutcomeStats(statsTrades);
      const accounts = new Set(
        statsTrades.map((trade) => getTradeAccountKey(trade)),
      ).size;

      return {
        ...stats,
        accounts,
      };
    }, [statsTrades]);

  function toggleStatsAccount(
    accountKey: string,
  ) {
    setStatsAccountKeys((current) => {
      const next = new Set(current);

      if (next.has(accountKey)) {
        next.delete(accountKey);
      } else {
        next.add(accountKey);
      }

      return next;
    });
  }

  function selectAllStatsAccounts() {
    setStatsAccountKeys(
      new Set(
        accountOptions.map(
          (account) => account.key,
        ),
      ),
    );
  }

  function clearStatsAccounts() {
    setStatsAccountKeys(new Set());
  }

  const totalPages =
    Math.max(
      1,
      Math.ceil(
        filteredTrades.length /
          PAGE_SIZE,
      ),
    );

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [
    page,
    totalPages,
  ]);

  const paginatedTrades =
    useMemo(() => {
      const start =
        (page - 1) *
        PAGE_SIZE;

      return filteredTrades.slice(
        start,
        start + PAGE_SIZE,
      );
    }, [
      filteredTrades,
      page,
    ]);

  async function deleteTrade(trade: BrokerCompletedTrade) {
    const tradeId = trade.id ? String(trade.id) : "";

    if (!tradeId) {
      setActionError("This trade cannot be deleted because it has no id.");
      return;
    }

    const pendingReason = getTradePendingReason(trade);
    const symbol = trade.symbol || "this trade";
    const confirmMessage = pendingReason
      ? `Delete ${symbol}? It is still pending P/L (${pendingReason}). This cannot be undone.`
      : `Delete ${symbol}? This trade will be removed from TradeCoach and cannot be undone.`;

    if (!window.confirm(confirmMessage)) {
      return;
    }

    setDeletingTradeId(tradeId);
    setActionMessage(null);
    setActionError(null);

    try {
      const response = await fetch(
        `/api/trades/${encodeURIComponent(tradeId)}`,
        {
          method: "DELETE",
        },
      );

      const data = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;

      if (!response.ok) {
        throw new Error(
          data?.error || "Could not delete trade.",
        );
      }

      setTrades((current) =>
        current.filter(
          (item) => String(item.id) !== tradeId,
        ),
      );
      setActionMessage(`${symbol} deleted.`);
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Could not delete trade.",
      );
    } finally {
      setDeletingTradeId(null);
    }
  }

  function exportTradesToCsv() {
    if (
      filteredTrades.length ===
      0
    ) {
      return;
    }

    const headers = [
      "Date",
      "Symbol",
      "Direction",
      "Quantity",
      "Entry Price",
      "Exit Price",
      "Gross Points",
      "P/L",
      "Account",
      "Broker",
      "Broker Pair ID",
      "Buy Fill ID",
      "Sell Fill ID",
    ];

    const rows =
      filteredTrades.map(
        (trade) => [
          getTradeTimestamp(
            trade,
          ),
          trade.symbol,
          formatSide(
            trade.direction,
          ),
          trade.quantity,
          trade.entry_price,
          trade.exit_price,
          trade.gross_points,
          getTradeDisplayPnl(trade),
          getTradeAccountLabel(
            trade,
          ),
          trade.broker || "csv",
          trade.broker_pair_id,
          trade.buy_fill_external_id,
          trade.sell_fill_external_id,
        ],
      );

    const csv = [
      headers
        .map(
          escapeCsvValue,
        )
        .join(","),
      ...rows.map((row) =>
        row
          .map(
            escapeCsvValue,
          )
          .join(","),
      ),
    ].join("\n");

    const blob = new Blob(
      [csv],
      {
        type: "text/csv;charset=utf-8;",
      },
    );

    const url =
      URL.createObjectURL(
        blob,
      );

    const anchor =
      document.createElement(
        "a",
      );

    anchor.href = url;

    anchor.download = `tradecoach-trades-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;

    document.body.appendChild(
      anchor,
    );

    anchor.click();

    document.body.removeChild(
      anchor,
    );

    URL.revokeObjectURL(url);
  }

  const dateRangeLabel =
    getDateRangeLabel(
      dateRange,
    );

  return (
    <>
      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-400">
            Trade History
          </p>

          <h2 className="mt-2 text-3xl font-extrabold">
            Live Trades
          </h2>

          <p className="mt-2 max-w-2xl text-slate-400">
            Completed trades synchronized from your broker, plus any trades you
            import manually from CSV.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            void loadTrades(
              true,
            );
          }}
          disabled={refreshing}
          className="rounded-xl bg-cyan-500 px-5 py-3 font-bold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {refreshing
            ? "Refreshing..."
            : "Refresh Trades"}
        </button>
      </div>

      {errorMessage ? (
        <div className="mt-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5">
          <p className="font-bold text-rose-400">
            Could not load
            live trades
          </p>

          <p className="mt-2 text-sm text-rose-200">
            {errorMessage}
          </p>

          <p className="mt-2 text-sm text-slate-400">
            Confirm your
            Supabase environment
            variables and SELECT
            policy for
            broker_completed_trades.
          </p>
        </div>
      ) : null}

      <div className="mt-6">
        <TradeCsvImportPanel
          onImported={() => {
            void loadTrades(true);
          }}
        />
      </div>

      {totals.pending > 0 ? (
        <div className="mt-6 rounded-2xl border border-amber-400/20 bg-amber-400/10 p-5">
          <p className="font-semibold text-amber-200">
            {totals.pending} trade{totals.pending === 1 ? "" : "s"} still
            pending P/L
          </p>

          <p className="mt-2 text-sm leading-6 text-amber-100/80">
            These trades were imported before contract metadata or fill fees
            finished syncing. They usually update automatically on the next
            broker sync. You can delete duplicates or bad rows from the trade
            log if needed.
          </p>
        </div>
      ) : null}

      {actionMessage ? (
        <div className="mt-6 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-200">
          {actionMessage}
        </div>
      ) : null}

      {actionError ? (
        <div className="mt-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
          {actionError}
        </div>
      ) : null}

      <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <p className="text-sm text-slate-400">
            Total P/L
          </p>

          <p
            className={`mt-3 text-3xl font-extrabold ${getMoneyClasses(
              totals.totalPnl,
            )}`}
          >
            {formatMoney(
              totals.totalPnl,
              {
                showPlus:
                  true,
              },
            )}
          </p>

          <p className="mt-2 text-sm text-slate-500">
            {dateRangeLabel}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <p className="text-sm text-slate-400">
            Win Rate
          </p>

          <p className="mt-3 text-3xl font-extrabold text-white">
            {totals.scoredTrades > 0
              ? `${Math.round(totals.winRate)}%`
              : "—"}
          </p>

          <p className="mt-2 text-sm text-slate-500">
            {totals.winners} wins · {totals.losers} losses
            {totals.pending > 0
              ? ` · ${totals.pending} pending P/L`
              : totals.breakeven > 0
                ? ` · ${totals.breakeven} breakeven`
                : ""}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 sm:col-span-2 xl:col-span-1">
          <p className="text-sm text-slate-400">
            Total Trades
          </p>

          <p className="mt-3 text-3xl font-extrabold">
            {
              statsTrades.length
            }
          </p>

          <p className="mt-2 text-sm text-slate-500">
            {totals.winners} wins · {totals.losers} losses
            {totals.pending > 0 ? ` · ${totals.pending} pending P/L` : ""}
            {totals.accounts > 0 ? (
              <>
                {" · "}
                {totals.accounts} account
                {totals.accounts === 1 ? "" : "s"}
              </>
            ) : null}
          </p>
        </div>
      </div>

      {accountOptions.length > 0 ? (
        <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-300">
                Stats include
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Choose which accounts count toward P/L, win rate, and trade totals. The trade log below can still show all accounts.
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={selectAllStatsAccounts}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-slate-300 transition hover:border-cyan-400 hover:text-white"
              >
                Select all
              </button>

              <button
                type="button"
                onClick={clearStatsAccounts}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-slate-300 transition hover:border-cyan-400 hover:text-white"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {accountOptions.map((account) => {
              const checked = statsAccountKeys.has(
                account.key,
              );

              return (
                <label
                  key={account.key}
                  className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition ${
                    checked
                      ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-100"
                      : "border-slate-700 bg-slate-950 text-slate-400"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      toggleStatsAccount(
                        account.key,
                      )
                    }
                    className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-cyan-400 focus:ring-cyan-400"
                  />

                  <span>{account.label}</span>

                  {account.isPaper ? (
                    <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
                      Paper
                    </span>
                  ) : null}
                </label>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="mt-8 rounded-3xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <label className="xl:col-span-2">
            <span className="mb-2 block text-sm font-medium text-slate-400">
              Search
            </span>

            <input
              type="text"
              value={search}
              onChange={(
                event,
              ) =>
                setSearch(
                  event.target
                    .value,
                )
              }
              placeholder="Search symbol, P/L, price, account, or fill ID..."
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-400"
            />
          </label>

          <label>
            <span className="mb-2 block text-sm font-medium text-slate-400">
              Account
            </span>

            <select
              value={
                accountFilter
              }
              onChange={(
                event,
              ) =>
                setAccountFilter(
                  event.target
                    .value,
                )
              }
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
            >
              <option value="all">
                All Accounts
              </option>

              {accountOptions.map(
                (account) => (
                  <option
                    key={
                      account.key
                    }
                    value={
                      account.key
                    }
                  >
                    {account.label}
                    {account.isPaper
                      ? " (Paper)"
                      : ""}
                  </option>
                ),
              )}
            </select>
          </label>

          <label>
            <span className="mb-2 block text-sm font-medium text-slate-400">
              Result
            </span>

            <select
              value={
                resultFilter
              }
              onChange={(
                event,
              ) =>
                setResultFilter(
                  event.target
                    .value as ResultFilter,
                )
              }
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
            >
              <option value="all">
                All Results
              </option>

              <option value="winners">
                Winners
              </option>

              <option value="losers">
                Losers
              </option>
            </select>
          </label>

          <label>
            <span className="mb-2 block text-sm font-medium text-slate-400">
              Date Range
            </span>

            <select
              value={
                dateRange
              }
              onChange={(
                event,
              ) =>
                setDateRange(
                  event.target
                    .value as DateRange,
                )
              }
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
            >
              <option value="7">
                Last 7 Days
              </option>

              <option value="30">
                Last 30 Days
              </option>

              <option value="month">
                This Month
              </option>

              <option value="all">
                All Time
              </option>
            </select>
          </label>
        </div>
      </div>

      <div className="mt-8 overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/60">
        <div className="flex flex-col gap-3 border-b border-slate-800 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-xl font-bold">
              Trade Log
            </h3>

            <p className="mt-1 text-sm text-slate-500">
              Showing{" "}
              {
                paginatedTrades.length
              }{" "}
              of{" "}
              {
                filteredTrades.length
              }{" "}
              real trades
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={
              exportTradesToCsv
            }
            disabled={
              filteredTrades.length ===
              0
            }
            className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:border-cyan-400 hover:text-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Export CSV
          </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px]">
            <thead>
              <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wider text-slate-500">
                <th className="px-6 py-4 font-semibold">
                  Date
                </th>

                <th className="px-6 py-4 font-semibold">
                  Symbol
                </th>

                <th className="px-6 py-4 font-semibold">
                  Side
                </th>

                <th className="px-6 py-4 font-semibold">
                  Qty
                </th>

                <th className="px-6 py-4 font-semibold">
                  Entry
                </th>

                <th className="px-6 py-4 font-semibold">
                  Exit
                </th>

                <th className="px-6 py-4 font-semibold">
                  P/L
                </th>

                <th className="px-6 py-4 font-semibold">
                  Account
                </th>

                <th className="px-6 py-4 font-semibold">
                  Pair ID
                </th>

                <th className="px-6 py-4 font-semibold">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={10}
                    className="px-6 py-16 text-center text-slate-400"
                  >
                    Loading live
                    trades...
                  </td>
                </tr>
              ) : null}

              {!loading &&
              paginatedTrades.length ===
                0 ? (
                <tr>
                  <td
                    colSpan={10}
                    className="px-6 py-16 text-center"
                  >
                    <p className="font-semibold text-slate-300">
                      No live
                      trades found
                    </p>

                    <p className="mt-2 text-sm text-slate-500">
                      Check your
                      selected
                      filters or
                      Supabase
                      access.
                    </p>
                  </td>
                </tr>
              ) : null}

              {!loading
                ? paginatedTrades.map(
                    (
                      trade,
                      index,
                    ) => {
                      const tradeDate =
                        formatTradeDate(
                          trade,
                        );

                      const side =
                        formatSide(
                          trade.direction,
                        );

                      const rowKey =
                        String(
                          trade.id ||
                            trade.broker_pair_id ||
                            `${getTradeTimestamp(
                              trade,
                            )}-${index}`,
                        );

                      const pendingReason =
                        getTradePendingReason(
                          trade,
                        );
                      const displayPnl =
                        getTradeDisplayPnl(
                          trade,
                        );
                      const tradeId = trade.id
                        ? String(trade.id)
                        : null;
                      const isDeleting =
                        tradeId !== null &&
                        deletingTradeId === tradeId;

                      return (
                        <tr
                          key={
                            rowKey
                          }
                          className="border-b border-slate-800/80 last:border-b-0 hover:bg-slate-800/30"
                        >
                          <td className="px-6 py-5">
                            <p className="font-semibold">
                              {
                                tradeDate.date
                              }
                            </p>

                            <p className="mt-1 text-sm text-slate-500">
                              {
                                tradeDate.time
                              }
                            </p>
                          </td>

                          <td className="px-6 py-5 text-lg font-bold">
                            {trade.symbol ||
                              "—"}
                          </td>

                          <td className="px-6 py-5">
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                side ===
                                "Long"
                                  ? "bg-emerald-500/10 text-emerald-400"
                                  : side ===
                                      "Short"
                                    ? "bg-rose-500/10 text-rose-400"
                                    : "bg-slate-800 text-slate-300"
                              }`}
                            >
                              {side}
                            </span>
                          </td>

                          <td className="px-6 py-5 text-slate-300">
                            {formatQuantity(
                              trade.quantity,
                            )}
                          </td>

                          <td className="px-6 py-5 text-slate-300">
                            {formatPrice(
                              trade.entry_price,
                            )}
                          </td>

                          <td className="px-6 py-5 text-slate-300">
                            {formatPrice(
                              trade.exit_price,
                            )}
                          </td>

                          <td className="px-6 py-5">
                            {displayPnl !== null ? (
                              <span
                                className={`font-extrabold ${getMoneyClasses(
                                  displayPnl,
                                )}`}
                              >
                                {formatMoney(displayPnl, {
                                  showPlus: true,
                                })}
                              </span>
                            ) : (
                              <div>
                                <span
                                  className="rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-300"
                                  title={pendingReason || undefined}
                                >
                                  Pending
                                </span>

                                {pendingReason ? (
                                  <p
                                    className="mt-2 max-w-xs text-xs leading-5 text-slate-500"
                                    title={pendingReason}
                                  >
                                    {pendingReason}
                                  </p>
                                ) : null}
                              </div>
                            )}
                          </td>

                          <td className="px-6 py-5">
                            <span className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-300">
                              {getTradeAccountLabel(
                                trade,
                              )}
                            </span>
                          </td>

                          <td className="px-6 py-5 font-mono text-xs text-slate-400">
                            {trade.broker_pair_id ||
                              "—"}
                          </td>

                          <td className="px-6 py-5">
                            <button
                              type="button"
                              disabled={!tradeId || isDeleting}
                              onClick={() => {
                                void deleteTrade(trade);
                              }}
                              className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-rose-400 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              {isDeleting ? "Deleting..." : "Delete"}
                            </button>
                          </td>
                        </tr>
                      );
                    },
                  )
                : null}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-4 border-t border-slate-800 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500">
            Page {page} of{" "}
            {totalPages}
          </p>

          <div className="flex gap-2">
            <button
              type="button"
              disabled={
                page <= 1
              }
              onClick={() =>
                setPage(
                  (
                    current,
                  ) =>
                    Math.max(
                      1,
                      current -
                        1,
                    ),
                )
              }
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:border-cyan-400 hover:text-cyan-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>

            <button
              type="button"
              disabled={
                page >=
                totalPages
              }
              onClick={() =>
                setPage(
                  (
                    current,
                  ) =>
                    Math.min(
                      totalPages,
                      current +
                        1,
                    ),
                )
              }
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:border-cyan-400 hover:text-cyan-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </>
  );
}