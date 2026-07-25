"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import GradeSessionPanel from "@/components/grade-session-panel";
import { buildReportHistoryArticles } from "@/lib/performance-report-article";
import {
  getTradeDisplayPnl,
  getTradeDisplayPnlOrZero,
  getTradeOutcomeStats,
  isAnalyzableTrade,
} from "@/lib/trade-pnl";
import { createBrowserClient } from "@supabase/ssr";

type BrokerCompletedTrade = {
  id?: string | number | null;
  broker_pair_id?: string | null;

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

  entry_at?: string | null;
  exit_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;

  account_external_id?: string | null;
  broker_account_external_id?: string | null;

  [key: string]: unknown;
};

type ReportRange =
  | "today"
  | "week"
  | "month"
  | "30"
  | "all";

type NewYorkDateParts = {
  year: number;
  month: number;
  day: number;
  dayNumber: number;
};

type PerformanceGroup = {
  label: string;
  trades: number;
  wins: number;
  losses: number;
  breakeven: number;
  grossPnl: number;
  fees: number;
  netPnl: number;
  winRate: number;
  averageTrade: number;
  profitFactor: number | null;
};

type DailyPerformance = PerformanceGroup & {
  dateKey: string;
  dateLabel: string;
  dayLabel: string;
  dayNumber: number;
};

const NEW_YORK_TIME_ZONE =
  "America/New_York";

const MILLISECONDS_PER_DAY =
  86_400_000;

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

function getTradeTimestampValue(
  trade: BrokerCompletedTrade,
): number {
  const timestamp =
    getTradeTimestamp(trade);

  if (!timestamp) {
    return 0;
  }

  const value =
    new Date(timestamp).getTime();

  return Number.isFinite(value)
    ? value
    : 0;
}

function getAccountId(
  trade: BrokerCompletedTrade,
): string {
  return String(
    trade.account_external_id ||
      trade
        .broker_account_external_id ||
      "Unknown account",
  );
}

function isProcessedTrade(
  trade: BrokerCompletedTrade,
): boolean {
  return isAnalyzableTrade(trade);
}

function getNewYorkDateParts(
  value: string | Date,
): NewYorkDateParts | null {
  const date =
    value instanceof Date
      ? value
      : new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return null;
  }

  const parts =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone:
          NEW_YORK_TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      },
    ).formatToParts(date);

  const values:
    Record<string, string> = {};

  for (const part of parts) {
    if (
      part.type !== "literal"
    ) {
      values[part.type] =
        part.value;
    }
  }

  const year =
    Number(values.year);

  const month =
    Number(values.month);

  const day =
    Number(values.day);

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
      Date.UTC(
        year,
        month - 1,
        day,
      ) / MILLISECONDS_PER_DAY,
  };
}

function getCurrentNewYorkDateParts(): NewYorkDateParts {
  const current =
    getNewYorkDateParts(
      new Date(),
    );

  if (current) {
    return current;
  }

  const date =
    new Date();

  return {
    year:
      date.getFullYear(),
    month:
      date.getMonth() + 1,
    day:
      date.getDate(),
    dayNumber:
      Date.UTC(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
      ) / MILLISECONDS_PER_DAY,
  };
}

function getWeekStartDayNumber(
  currentDate: NewYorkDateParts,
): number {
  const date =
    new Date(
      Date.UTC(
        currentDate.year,
        currentDate.month - 1,
        currentDate.day,
      ),
    );

  const sundayBasedDay =
    date.getUTCDay();

  const daysSinceMonday =
    sundayBasedDay === 0
      ? 6
      : sundayBasedDay - 1;

  return (
    currentDate.dayNumber -
    daysSinceMonday
  );
}

function getTradeDateParts(
  trade: BrokerCompletedTrade,
): NewYorkDateParts | null {
  const timestamp =
    getTradeTimestamp(trade);

  if (!timestamp) {
    return null;
  }

  return getNewYorkDateParts(
    timestamp,
  );
}

function isTradeInsideRange(
  trade: BrokerCompletedTrade,
  range: ReportRange,
): boolean {
  if (range === "all") {
    return true;
  }

  const tradeDate =
    getTradeDateParts(trade);

  if (!tradeDate) {
    return false;
  }

  const currentDate =
    getCurrentNewYorkDateParts();

  if (range === "today") {
    return (
      tradeDate.dayNumber ===
      currentDate.dayNumber
    );
  }

  if (range === "week") {
    const weekStart =
      getWeekStartDayNumber(
        currentDate,
      );

    return (
      tradeDate.dayNumber >=
        weekStart &&
      tradeDate.dayNumber <=
        currentDate.dayNumber
    );
  }

  if (range === "month") {
    return (
      tradeDate.year ===
        currentDate.year &&
      tradeDate.month ===
        currentDate.month
    );
  }

  return (
    tradeDate.dayNumber >=
    currentDate.dayNumber - 29
  );
}

function getDateKey(
  parts: NewYorkDateParts,
): string {
  return [
    parts.year,
    String(parts.month).padStart(
      2,
      "0",
    ),
    String(parts.day).padStart(
      2,
      "0",
    ),
  ].join("-");
}

function formatDateParts(
  parts: NewYorkDateParts,
  options?: {
    weekday?: boolean;
  },
): string {
  const date =
    new Date(
      Date.UTC(
        parts.year,
        parts.month - 1,
        parts.day,
      ),
    );

  return new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone: "UTC",
      ...(options?.weekday
        ? {
            weekday: "long",
          }
        : {
            month: "short",
            day: "numeric",
            year: "numeric",
          }),
    },
  ).format(date);
}

function formatMoney(
  value: unknown,
  options?: {
    showPlus?: boolean;
    fee?: boolean;
  },
): string {
  const number =
    toNumber(value);

  if (number === null) {
    return "—";
  }

  const normalized =
    Math.abs(number) < 0.005
      ? 0
      : number;

  const formatted =
    Math.abs(
      normalized,
    ).toLocaleString(
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

  if (
    normalized > 0 &&
    options?.showPlus
  ) {
    return `+$${formatted}`;
  }

  return `$${formatted}`;
}

function formatPercent(
  value: number,
): string {
  if (
    !Number.isFinite(value)
  ) {
    return "—";
  }

  return `${value.toFixed(0)}%`;
}

function getMoneyClass(
  value: unknown,
): string {
  const number =
    toNumber(value);

  if (
    number === null ||
    number === 0
  ) {
    return "text-slate-200";
  }

  return number > 0
    ? "text-emerald-400"
    : "text-rose-400";
}

function calculateProfitFactor(
  trades: BrokerCompletedTrade[],
): number | null {
  let winningProfit = 0;
  let losingProfit = 0;

  for (const trade of trades) {
    const net = getTradeDisplayPnl(trade);

    if (net === null) {
      continue;
    }

    if (net > 0) {
      winningProfit += net;
    } else if (
      net < 0
    ) {
      losingProfit +=
        Math.abs(net);
    }
  }

  if (
    winningProfit === 0 &&
    losingProfit === 0
  ) {
    return null;
  }

  if (
    losingProfit === 0
  ) {
    return Number.POSITIVE_INFINITY;
  }

  return (
    winningProfit /
    losingProfit
  );
}

function formatProfitFactor(
  value: number | null,
): string {
  if (value === null) {
    return "—";
  }

  if (
    !Number.isFinite(value)
  ) {
    return "∞";
  }

  return value.toFixed(2);
}

function calculatePerformance(
  label: string,
  trades: BrokerCompletedTrade[],
): PerformanceGroup {
  const stats = getTradeOutcomeStats(trades);
  let grossPnl = 0;
  let fees = 0;

  for (const trade of trades) {
    grossPnl +=
      toNumber(
        trade.gross_pnl,
      ) ?? 0;

    fees +=
      Math.abs(
        toNumber(
          trade.fees,
        ) ?? 0,
      );
  }

  return {
    label,
    trades: stats.scoredTrades,
    wins: stats.winners,
    losses: stats.losers,
    breakeven: stats.breakeven,
    grossPnl,
    fees,
    netPnl: stats.totalPnl,
    winRate: stats.winRate,
    averageTrade:
      stats.scoredTrades > 0
        ? stats.totalPnl / stats.scoredTrades
        : 0,
    profitFactor:
      calculateProfitFactor(
        trades,
      ),
  };
}

function getPerformanceGrade(
  performance: PerformanceGroup,
): string {
  if (
    performance.trades === 0
  ) {
    return "—";
  }

  let score = 50;

  if (
    performance.netPnl > 0
  ) {
    score += 15;
  } else if (
    performance.netPnl < 0
  ) {
    score -= 15;
  }

  if (
    performance.winRate >= 65
  ) {
    score += 15;
  } else if (
    performance.winRate >= 55
  ) {
    score += 10;
  } else if (
    performance.winRate < 40
  ) {
    score -= 10;
  }

  const profitFactor =
    performance.profitFactor;

  if (
    profitFactor !== null &&
    !Number.isFinite(
      profitFactor,
    )
  ) {
    score += 20;
  } else if (
    profitFactor !== null &&
    profitFactor >= 2
  ) {
    score += 20;
  } else if (
    profitFactor !== null &&
    profitFactor >= 1.5
  ) {
    score += 12;
  } else if (
    profitFactor !== null &&
    profitFactor < 1
  ) {
    score -= 12;
  }

  score =
    Math.max(
      0,
      Math.min(
        100,
        score,
      ),
    );

  if (score >= 90) {
    return "A";
  }

  if (score >= 80) {
    return "B+";
  }

  if (score >= 70) {
    return "B";
  }

  if (score >= 60) {
    return "C";
  }

  return "D";
}

function getRangeLabel(
  range: ReportRange,
): string {
  if (range === "today") {
    return "Today";
  }

  if (range === "week") {
    return "This Week";
  }

  if (range === "month") {
    return "This Month";
  }

  if (range === "30") {
    return "Last 30 Days";
  }

  return "All Time";
}

function escapeCsv(
  value: unknown,
): string {
  const text =
    value === null ||
    value === undefined
      ? ""
      : String(value);

  return `"${text.replace(
    /"/g,
    '""',
  )}"`;
}

function formatTimestamp(
  value: string | null | undefined,
): string {
  if (!value) {
    return "";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone:
        NEW_YORK_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      timeZoneName: "short",
    },
  ).format(date);
}

export default function ReportsPage() {
  const supabase =
    useMemo(
      () => createClient(),
      [],
    );

  const [
    allTrades,
    setAllTrades,
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
    selectedRange,
    setSelectedRange,
  ] = useState<ReportRange>(
    "month",
  );

  const [
    selectedAccount,
    setSelectedAccount,
  ] = useState("all");

  const loadTrades =
    useCallback(
      async (
        manualRefresh = false,
      ) => {
        if (
          manualRefresh
        ) {
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
            .order(
              "updated_at",
              {
                ascending: false,
              },
            )
            .limit(5000);

          if (error) {
            throw error;
          }

          const sortedTrades = [
            ...((data ||
              []) as BrokerCompletedTrade[]),
          ].sort(
            (
              first,
              second,
            ) =>
              getTradeTimestampValue(
                second,
              ) -
              getTradeTimestampValue(
                first,
              ),
          );

          setAllTrades(
            sortedTrades,
          );
        } catch (error) {
          console.error(
            "[TradeCoach Reports] Could not load trades:",
            error,
          );

          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Could not load completed trades.",
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

    const channel =
      supabase
        .channel(
          "tradecoach-reports",
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

  const processedTrades =
    useMemo(
      () =>
        allTrades.filter(
          isProcessedTrade,
        ),
      [allTrades],
    );

  const accountOptions =
    useMemo(() => {
      return Array.from(
        new Set(
          processedTrades.map(
            getAccountId,
          ),
        ),
      ).sort();
    }, [processedTrades]);

  const accountTrades =
    useMemo(() => {
      if (
        selectedAccount ===
        "all"
      ) {
        return processedTrades;
      }

      return processedTrades.filter(
        (trade) =>
          getAccountId(trade) ===
          selectedAccount,
      );
    }, [
      processedTrades,
      selectedAccount,
    ]);

  const reportTrades =
    useMemo(
      () =>
        accountTrades.filter(
          (trade) =>
            isTradeInsideRange(
              trade,
              selectedRange,
            ),
        ),
      [
        accountTrades,
        selectedRange,
      ],
    );

  const reportPerformance =
    useMemo(
      () =>
        calculatePerformance(
          getRangeLabel(
            selectedRange,
          ),
          reportTrades,
        ),
      [
        reportTrades,
        selectedRange,
      ],
    );

  const dailyPerformance =
    useMemo<DailyPerformance[]>(() => {
      const groups =
        new Map<
          string,
          {
            date:
              NewYorkDateParts;
            trades:
              BrokerCompletedTrade[];
          }
        >();

      for (
        const trade of
        reportTrades
      ) {
        const date =
          getTradeDateParts(
            trade,
          );

        if (!date) {
          continue;
        }

        const key =
          getDateKey(date);

        const existing =
          groups.get(key) || {
            date,
            trades: [],
          };

        existing.trades.push(
          trade,
        );

        groups.set(
          key,
          existing,
        );
      }

      return Array.from(
        groups.entries(),
      )
        .map(
          ([
            dateKey,
            group,
          ]) => {
            const performance =
              calculatePerformance(
                dateKey,
                group.trades,
              );

            return {
              ...performance,
              dateKey,
              dateLabel:
                formatDateParts(
                  group.date,
                ),
              dayLabel:
                formatDateParts(
                  group.date,
                  {
                    weekday:
                      true,
                  },
                ),
              dayNumber:
                group.date
                  .dayNumber,
            };
          },
        )
        .sort(
          (
            first,
            second,
          ) =>
            second.dayNumber -
            first.dayNumber,
        );
    }, [reportTrades]);

  const averageDailyPnl =
    dailyPerformance.length > 0
      ? dailyPerformance.reduce(
          (
            total,
            day,
          ) =>
            total +
            day.netPnl,
          0,
        ) /
        dailyPerformance.length
      : 0;

  const bestDay =
    useMemo(() => {
      if (
        dailyPerformance.length ===
        0
      ) {
        return null;
      }

      return [
        ...dailyPerformance,
      ].sort(
        (
          first,
          second,
        ) =>
          second.netPnl -
          first.netPnl,
      )[0];
    }, [dailyPerformance]);

  const profitableDays =
    dailyPerformance.filter(
      (day) =>
        day.netPnl > 0,
    ).length;

  const profitableDayRate =
    dailyPerformance.length > 0
      ? (profitableDays /
          dailyPerformance.length) *
        100
      : 0;

  const symbolPerformance =
    useMemo(() => {
      const groups =
        new Map<
          string,
          BrokerCompletedTrade[]
        >();

      for (
        const trade of
        reportTrades
      ) {
        const symbol =
          String(
            trade.symbol ||
              "Unknown",
          ).trim() ||
          "Unknown";

        const existing =
          groups.get(symbol) ||
          [];

        existing.push(trade);

        groups.set(
          symbol,
          existing,
        );
      }

      return Array.from(
        groups.entries(),
      )
        .map(
          ([
            symbol,
            trades,
          ]) =>
            calculatePerformance(
              symbol,
              trades,
            ),
        )
        .sort(
          (
            first,
            second,
          ) =>
            second.netPnl -
            first.netPnl,
        );
    }, [reportTrades]);

  const directionPerformance =
    useMemo(() => {
      const longTrades =
        reportTrades.filter(
          (trade) =>
            String(
              trade.direction ||
                "",
            ).toLowerCase() ===
            "long",
        );

      const shortTrades =
        reportTrades.filter(
          (trade) =>
            String(
              trade.direction ||
                "",
            ).toLowerCase() ===
            "short",
        );

      return {
        long:
          calculatePerformance(
            "Long",
            longTrades,
          ),
        short:
          calculatePerformance(
            "Short",
            shortTrades,
          ),
      };
    }, [reportTrades]);

  const reportCards =
    useMemo(() => {
      const ranges:
        Array<{
          title: string;
          range:
            ReportRange;
          description:
            string;
        }> = [
        {
          title:
            "Daily Report",
          range: "today",
          description:
            "Today’s completed trades, net result, fees, and win rate.",
        },
        {
          title:
            "Weekly Report",
          range: "week",
          description:
            "This week’s performance, daily results, and recurring patterns.",
        },
        {
          title:
            "Monthly Report",
          range: "month",
          description:
            "This month’s profitability, consistency, and account progress.",
        },
      ];

      return ranges.map(
        (card) => {
          const trades =
            accountTrades.filter(
              (trade) =>
                isTradeInsideRange(
                  trade,
                  card.range,
                ),
            );

          const performance =
            calculatePerformance(
              card.title,
              trades,
            );

          return {
            ...card,
            performance,
            status:
              trades.length > 0
                ? "Ready"
                : "No Trades",
            viewHref:
              card.range === "today"
                ? "/dashboard/reports/view?type=daily"
                : card.range === "week"
                  ? "/dashboard/reports/view?type=weekly"
                  : "/dashboard/reports/view?type=monthly",
          };
        },
      );
    }, [accountTrades]);

  const coachSummary =
    useMemo(() => {
      if (
        reportPerformance.trades ===
        0
      ) {
        return {
          main:
            "There are no processed trades in the selected report period.",
          strength:
            "Select a wider period or complete another Tradovate trade.",
          focus:
            "Once more trades are recorded, this report will compare symbols, directions, fees, and daily results.",
        };
      }

      const bestSymbol =
        symbolPerformance[0] ||
        null;

      const weakestSymbol =
        symbolPerformance.length > 0
          ? symbolPerformance[
              symbolPerformance.length -
                1
            ]
          : null;

      const directionCandidates =
        [
          directionPerformance.long,
          directionPerformance.short,
        ].filter(
          (item) =>
            item.trades > 0,
        );

      const bestDirection =
        [...directionCandidates].sort(
          (
            first,
            second,
          ) =>
            second.netPnl -
            first.netPnl,
        )[0] || null;

      const weakestDirection =
        [...directionCandidates].sort(
          (
            first,
            second,
          ) =>
            first.netPnl -
            second.netPnl,
        )[0] || null;

      const main =
        `${getRangeLabel(
          selectedRange,
        )} produced ${formatMoney(
          reportPerformance.netPnl,
          {
            showPlus: true,
          },
        )} net across ${reportPerformance.trades} completed trade${
          reportPerformance.trades ===
          1
            ? ""
            : "s"
        }, with a ${formatPercent(
          reportPerformance.winRate,
        )} win rate and ${formatMoney(
          reportPerformance.fees,
          {
            fee: true,
          },
        )} in fees.`;

      const strength =
        bestSymbol &&
        bestSymbol.netPnl > 0
          ? `${bestSymbol.label} was your strongest symbol at ${formatMoney(
              bestSymbol.netPnl,
              {
                showPlus:
                  true,
              },
            )} net. ${
              bestDirection
                ? `${bestDirection.label} trades were the stronger direction at ${formatMoney(
                    bestDirection.netPnl,
                    {
                      showPlus:
                        true,
                    },
                  )}.`
                : ""
            }`
          : bestDirection
            ? `${bestDirection.label} trades were your stronger direction at ${formatMoney(
                bestDirection.netPnl,
                {
                  showPlus:
                    true,
                },
              )}.`
            : "More completed trades are needed before identifying a reliable strength.";

      let focus =
        "Keep collecting trades before making a major change to your plan.";

      if (
        reportPerformance.fees >
        Math.abs(
          reportPerformance.netPnl,
        )
      ) {
        focus =
          "Fees are larger than the absolute value of your net result, so very small targets may not be covering the round-trip cost.";
      } else if (
        weakestSymbol &&
        weakestSymbol.netPnl < 0
      ) {
        focus =
          `${weakestSymbol.label} was your weakest symbol at ${formatMoney(
            weakestSymbol.netPnl,
          )}. Review whether those trades shared the same entry mistake or market condition.`;
      } else if (
        weakestDirection &&
        weakestDirection.netPnl < 0
      ) {
        focus =
          `${weakestDirection.label} trades produced ${formatMoney(
            weakestDirection.netPnl,
          )}. Be more selective before taking that direction again.`;
      } else if (
        reportPerformance.winRate <
          45 &&
        reportPerformance.trades >=
          4
      ) {
        focus =
          "The current win rate is below 45%. Reduce lower-quality entries and wait for clearer trend, location, and confirmation.";
      }

      return {
        main,
        strength,
        focus,
      };
    }, [
      reportPerformance,
      selectedRange,
      symbolPerformance,
      directionPerformance,
    ]);

  const reportHistory = useMemo(
    () => buildReportHistoryArticles(accountTrades),
    [accountTrades],
  );

  function exportTrades(
    trades:
      BrokerCompletedTrade[],
    filename: string,
  ) {
    if (
      trades.length === 0
    ) {
      return;
    }

    const headers = [
      "Exit Time",
      "Entry Time",
      "Account",
      "Symbol",
      "Direction",
      "Quantity",
      "Entry Price",
      "Exit Price",
      "Gross Points",
      "Gross P/L",
      "Fees",
      "Net P/L",
      "Status",
    ];

    const rows =
      trades.map(
        (trade) => [
          formatTimestamp(
            trade.exit_at,
          ),
          formatTimestamp(
            trade.entry_at,
          ),
          getAccountId(
            trade,
          ),
          trade.symbol || "",
          trade.direction ||
            "",
          toNumber(
            trade.quantity,
          ) ?? "",
          toNumber(
            trade.entry_price,
          ) ?? "",
          toNumber(
            trade.exit_price,
          ) ?? "",
          toNumber(
            trade.gross_points,
          ) ?? "",
          toNumber(
            trade.gross_pnl,
          ) ?? "",
          toNumber(
            trade.fees,
          ) ?? "",
          toNumber(
            trade.net_pnl,
          ) ?? "",
          trade.status || "",
        ],
      );

    const csv = [
      headers.map(
        escapeCsv,
      ),
      ...rows.map(
        (row) =>
          row.map(
            escapeCsv,
          ),
      ),
    ]
      .map(
        (row) =>
          row.join(","),
      )
      .join("\n");

    const blob =
      new Blob(
        [csv],
        {
          type:
            "text/csv;charset=utf-8",
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
    anchor.download =
      filename;

    document.body.appendChild(
      anchor,
    );

    anchor.click();
    anchor.remove();

    URL.revokeObjectURL(
      url,
    );
  }

  function exportSelectedReport() {
    const accountName =
      selectedAccount ===
      "all"
        ? "all-accounts"
        : selectedAccount.replace(
            /[^a-zA-Z0-9_-]/g,
            "-",
          );

    exportTrades(
      reportTrades,
      `tradecoach-${selectedRange}-${accountName}.csv`,
    );
  }

  return (
    <>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-400">
            Performance Reports
          </p>

          <h2 className="mt-2 text-3xl font-extrabold">
            Understand Your Trading Progress
          </h2>

          <p className="mt-2 max-w-3xl leading-7 text-slate-400">
            Review real Tradovate results by period
            and account, including net P/L, fees,
            win rate, profit factor, daily
            performance, symbols, and direction.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <label>
            <span className="mb-2 block text-sm font-medium text-slate-400">
              Account
            </span>

            <select
              value={
                selectedAccount
              }
              onChange={(
                event,
              ) =>
                setSelectedAccount(
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
                      account
                    }
                    value={
                      account
                    }
                  >
                    {account}
                  </option>
                ),
              )}
            </select>
          </label>

          <button
            type="button"
            onClick={() => {
              void loadTrades(
                true,
              );
            }}
            disabled={
              refreshing
            }
            className="self-end rounded-xl bg-cyan-500 px-5 py-3 font-bold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {refreshing
              ? "Generating..."
              : "Generate Report"}
          </button>
        </div>
      </div>

      {errorMessage ? (
        <div className="mt-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5">
          <p className="font-bold text-rose-400">
            Could not load reports
          </p>

          <p className="mt-2 text-sm text-rose-200">
            {errorMessage}
          </p>
        </div>
      ) : null}

      <GradeSessionPanel
        trades={reportTrades}
        loading={loading}
        refreshing={refreshing}
        selectedRange={selectedRange}
        onRangeChange={setSelectedRange}
        onRefresh={() => {
          void loadTrades(true);
        }}
      />

      <div className="mt-8 grid gap-5 lg:grid-cols-3">
        {reportCards.map(
          (report) => (
            <div
              key={
                report.title
              }
              className={`rounded-3xl border bg-slate-900/60 p-6 ${
                selectedRange ===
                report.range
                  ? "border-cyan-500/40"
                  : "border-slate-800"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wider text-cyan-400">
                    {
                      report.title
                    }
                  </p>

                  <p className="mt-2 text-sm text-slate-500">
                    {
                      report.performance
                        .trades
                    }{" "}
                    completed trade
                    {report
                      .performance
                      .trades ===
                    1
                      ? ""
                      : "s"}
                  </p>
                </div>

                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    report.status ===
                    "Ready"
                      ? "bg-emerald-500/10 text-emerald-400"
                      : "bg-slate-800 text-slate-400"
                  }`}
                >
                  {
                    report.status
                  }
                </span>
              </div>

              <p className="mt-5 leading-7 text-slate-400">
                {
                  report.description
                }
              </p>

              <div className="mt-5 flex items-end justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-wider text-slate-500">
                    Net P/L
                  </p>

                  <p
                    className={`mt-2 text-2xl font-extrabold ${getMoneyClass(
                      report
                        .performance
                        .netPnl,
                    )}`}
                  >
                    {formatMoney(
                      report
                        .performance
                        .netPnl,
                      {
                        showPlus:
                          true,
                      },
                    )}
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-xs uppercase tracking-wider text-slate-500">
                    Win Rate
                  </p>

                  <p className="mt-2 font-bold">
                    {formatPercent(
                      report
                        .performance
                        .winRate,
                    )}
                  </p>
                </div>
              </div>

              {report.status === "Ready" ? (
                <Link
                  href={report.viewHref}
                  className="mt-6 block w-full rounded-xl border border-slate-700 px-4 py-3 text-center font-semibold text-slate-300 transition hover:border-cyan-400 hover:text-cyan-400"
                >
                  View Report
                </Link>
              ) : (
                <button
                  type="button"
                  disabled
                  className="mt-6 w-full cursor-not-allowed rounded-xl border border-slate-800 px-4 py-3 font-semibold text-slate-500 opacity-60"
                >
                  No Trades Yet
                </button>
              )}
            </div>
          ),
        )}
      </div>

      <div className="mt-8 flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/50 p-5 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold text-white">
            Selected Report
          </p>

          <p className="mt-1 text-sm text-slate-400">
            {getRangeLabel(
              selectedRange,
            )} ·{" "}
            {selectedAccount ===
            "all"
              ? "All accounts"
              : `Account ${selectedAccount}`}
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <select
            value={
              selectedRange
            }
            onChange={(
              event,
            ) =>
              setSelectedRange(
                event.target
                  .value as ReportRange,
              )
            }
            className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400"
          >
            <option value="today">
              Today
            </option>

            <option value="week">
              This Week
            </option>

            <option value="month">
              This Month
            </option>

            <option value="30">
              Last 30 Days
            </option>

            <option value="all">
              All Time
            </option>
          </select>

          <button
            type="button"
            onClick={
              exportSelectedReport
            }
            disabled={
              reportTrades.length ===
              0
            }
            className="rounded-xl border border-slate-700 px-4 py-3 text-sm font-semibold text-slate-300 transition hover:border-cyan-400 hover:text-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Export CSV
          </button>
        </div>
      </div>

      <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <p className="text-sm text-slate-400">
            Net P/L
          </p>

          <p
            className={`mt-3 text-3xl font-extrabold ${getMoneyClass(
              reportPerformance.netPnl,
            )}`}
          >
            {loading
              ? "..."
              : formatMoney(
                  reportPerformance.netPnl,
                  {
                    showPlus:
                      true,
                  },
                )}
          </p>

          <p className="mt-2 text-sm text-slate-500">
            Gross{" "}
            {formatMoney(
              reportPerformance.grossPnl,
              {
                showPlus:
                  true,
              },
            )}{" "}
            · Fees{" "}
            {formatMoney(
              reportPerformance.fees,
              {
                fee: true,
              },
            )}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <p className="text-sm text-slate-400">
            Average Daily P/L
          </p>

          <p
            className={`mt-3 text-3xl font-extrabold ${getMoneyClass(
              averageDailyPnl,
            )}`}
          >
            {dailyPerformance.length >
            0
              ? formatMoney(
                  averageDailyPnl,
                  {
                    showPlus:
                      true,
                  },
                )
              : "—"}
          </p>

          <p className="mt-2 text-sm text-slate-500">
            Across{" "}
            {
              dailyPerformance.length
            }{" "}
            trading day
            {dailyPerformance.length ===
            1
              ? ""
              : "s"}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <p className="text-sm text-slate-400">
            Best Trading Day
          </p>

          <p
            className={`mt-3 text-3xl font-extrabold ${getMoneyClass(
              bestDay?.netPnl ??
                null,
            )}`}
          >
            {bestDay
              ? formatMoney(
                  bestDay.netPnl,
                  {
                    showPlus:
                      true,
                  },
                )
              : "—"}
          </p>

          <p className="mt-2 text-sm text-slate-500">
            {bestDay
              ? bestDay.dateLabel
              : "No completed days"}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <p className="text-sm text-slate-400">
            Profitable Day Rate
          </p>

          <p className="mt-3 text-3xl font-extrabold text-cyan-400">
            {dailyPerformance.length >
            0
              ? formatPercent(
                  profitableDayRate,
                )
              : "—"}
          </p>

          <p className="mt-2 text-sm text-slate-500">
            {profitableDays} profitable day
            {profitableDays ===
            1
              ? ""
              : "s"}{" "}
            of{" "}
            {
              dailyPerformance.length
            }
          </p>
        </div>
      </div>

      <div className="mt-8 grid gap-8 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-400">
                Daily Performance
              </p>

              <h3 className="mt-2 text-2xl font-bold">
                Trading-Day Results
              </h3>
            </div>

            <p className="text-sm text-slate-500">
              New York time
            </p>
          </div>

          <div className="mt-6 overflow-hidden rounded-2xl border border-slate-800">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px]">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/50 text-left text-xs uppercase tracking-wider text-slate-500">
                    <th className="px-5 py-4 font-semibold">
                      Date
                    </th>

                    <th className="px-5 py-4 font-semibold">
                      Net P/L
                    </th>

                    <th className="px-5 py-4 font-semibold">
                      Fees
                    </th>

                    <th className="px-5 py-4 font-semibold">
                      Trades
                    </th>

                    <th className="px-5 py-4 font-semibold">
                      Win Rate
                    </th>

                    <th className="px-5 py-4 font-semibold">
                      Profit Factor
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {loading ? (
                    <tr>
                      <td
                        colSpan={
                          6
                        }
                        className="px-5 py-12 text-center text-slate-400"
                      >
                        Loading real
                        daily results...
                      </td>
                    </tr>
                  ) : null}

                  {!loading &&
                  dailyPerformance.length ===
                    0 ? (
                    <tr>
                      <td
                        colSpan={
                          6
                        }
                        className="px-5 py-12 text-center text-slate-400"
                      >
                        No completed
                        trading days in
                        this report.
                      </td>
                    </tr>
                  ) : null}

                  {!loading
                    ? dailyPerformance.map(
                        (
                          day,
                        ) => (
                          <tr
                            key={
                              day.dateKey
                            }
                            className="border-b border-slate-800/80 last:border-b-0"
                          >
                            <td className="px-5 py-4">
                              <p className="font-semibold">
                                {
                                  day.dayLabel
                                }
                              </p>

                              <p className="mt-1 text-xs text-slate-500">
                                {
                                  day.dateLabel
                                }
                              </p>
                            </td>

                            <td
                              className={`px-5 py-4 font-bold ${getMoneyClass(
                                day.netPnl,
                              )}`}
                            >
                              {formatMoney(
                                day.netPnl,
                                {
                                  showPlus:
                                    true,
                                },
                              )}
                            </td>

                            <td className="px-5 py-4 font-semibold text-rose-400">
                              {formatMoney(
                                day.fees,
                                {
                                  fee: true,
                                },
                              )}
                            </td>

                            <td className="px-5 py-4 text-slate-300">
                              {
                                day.trades
                              }
                            </td>

                            <td className="px-5 py-4 text-slate-300">
                              {formatPercent(
                                day.winRate,
                              )}
                            </td>

                            <td className="px-5 py-4 text-slate-300">
                              {formatProfitFactor(
                                day.profitFactor,
                              )}
                            </td>
                          </tr>
                        ),
                      )
                    : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-cyan-500/20 bg-gradient-to-br from-slate-900 to-slate-950 p-6 shadow-[0_0_50px_rgba(34,211,238,0.06)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-400">
                Coach Summary
              </p>

              <h3 className="mt-2 text-2xl font-bold">
                {getRangeLabel(
                  selectedRange,
                )} Review
              </h3>
            </div>

            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-500/10 text-2xl text-cyan-400">
              ✦
            </span>
          </div>

          <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <p className="leading-7 text-slate-300">
              {
                coachSummary.main
              }
            </p>
          </div>

          <div className="mt-5 space-y-4">
            <div className="rounded-2xl bg-slate-900/70 p-5">
              <p className="text-sm font-semibold text-emerald-400">
                Current Strength
              </p>

              <p className="mt-2 text-sm leading-6 text-slate-400">
                {
                  coachSummary.strength
                }
              </p>
            </div>

            <div className="rounded-2xl bg-slate-900/70 p-5">
              <p className="text-sm font-semibold text-amber-400">
                Main Focus
              </p>

              <p className="mt-2 text-sm leading-6 text-slate-400">
                {
                  coachSummary.focus
                }
              </p>
            </div>
          </div>

          <Link
            href="/dashboard/ai-coach"
            className="mt-6 block w-full rounded-xl bg-cyan-500 px-5 py-4 text-center font-bold text-slate-950 transition hover:bg-cyan-400"
          >
            Discuss With AI Coach
          </Link>

          {reportHistory.some((report) => report.type === "weekly") ? (
            <Link
              href="/dashboard/reports/view?type=weekly"
              className="mt-3 block w-full rounded-xl border border-cyan-400/30 px-5 py-4 text-center font-semibold text-cyan-300 transition hover:border-cyan-400 hover:text-cyan-200"
            >
              Read Weekly Report Article
            </Link>
          ) : null}
        </div>
      </div>

      <div className="mt-8 grid gap-8 xl:grid-cols-2">
        <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-400">
              Symbol Analysis
            </p>

            <h3 className="mt-2 text-2xl font-bold">
              Performance by Symbol
            </h3>

            <p className="mt-2 text-sm leading-6 text-slate-500">
              Broker fills do not include setup names,
              so this replaces the old fake setup table
              with real symbol results.
            </p>
          </div>

          <div className="mt-6 overflow-hidden rounded-2xl border border-slate-800">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px]">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/50 text-left text-xs uppercase tracking-wider text-slate-500">
                    <th className="px-5 py-4 font-semibold">
                      Symbol
                    </th>

                    <th className="px-5 py-4 font-semibold">
                      Trades
                    </th>

                    <th className="px-5 py-4 font-semibold">
                      Win Rate
                    </th>

                    <th className="px-5 py-4 font-semibold">
                      Fees
                    </th>

                    <th className="px-5 py-4 font-semibold">
                      Net P/L
                    </th>

                    <th className="px-5 py-4 font-semibold">
                      Grade
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {symbolPerformance.length ===
                  0 ? (
                    <tr>
                      <td
                        colSpan={
                          6
                        }
                        className="px-5 py-12 text-center text-slate-400"
                      >
                        No symbol
                        performance
                        available.
                      </td>
                    </tr>
                  ) : null}

                  {symbolPerformance.map(
                    (
                      symbol,
                    ) => (
                      <tr
                        key={
                          symbol.label
                        }
                        className="border-b border-slate-800/80 last:border-b-0"
                      >
                        <td className="px-5 py-5 font-semibold">
                          {
                            symbol.label
                          }
                        </td>

                        <td className="px-5 py-5 text-slate-300">
                          {
                            symbol.trades
                          }
                        </td>

                        <td className="px-5 py-5 text-slate-300">
                          {formatPercent(
                            symbol.winRate,
                          )}
                        </td>

                        <td className="px-5 py-5 font-semibold text-rose-400">
                          {formatMoney(
                            symbol.fees,
                            {
                              fee: true,
                            },
                          )}
                        </td>

                        <td
                          className={`px-5 py-5 font-bold ${getMoneyClass(
                            symbol.netPnl,
                          )}`}
                        >
                          {formatMoney(
                            symbol.netPnl,
                            {
                              showPlus:
                                true,
                            },
                          )}
                        </td>

                        <td className="px-5 py-5">
                          <span className="rounded-lg bg-cyan-500/10 px-3 py-1 text-sm font-bold text-cyan-400">
                            {getPerformanceGrade(
                              symbol,
                            )}
                          </span>
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-400">
            Direction Analysis
          </p>

          <h3 className="mt-2 text-2xl font-bold">
            Long vs. Short
          </h3>

          <div className="mt-6 grid gap-5 md:grid-cols-2">
            {[
              directionPerformance.long,
              directionPerformance.short,
            ].map(
              (
                direction,
              ) => (
                <div
                  key={
                    direction.label
                  }
                  className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="text-lg font-bold">
                      {
                        direction.label
                      }
                    </h4>

                    <span className="rounded-lg bg-cyan-500/10 px-3 py-1 text-sm font-bold text-cyan-400">
                      {getPerformanceGrade(
                        direction,
                      )}
                    </span>
                  </div>

                  <p
                    className={`mt-5 text-3xl font-extrabold ${getMoneyClass(
                      direction.netPnl,
                    )}`}
                  >
                    {formatMoney(
                      direction.netPnl,
                      {
                        showPlus:
                          true,
                      },
                    )}
                  </p>

                  <div className="mt-5 space-y-3 text-sm">
                    <div className="flex justify-between gap-4">
                      <span className="text-slate-500">
                        Trades
                      </span>

                      <span className="font-semibold">
                        {
                          direction.trades
                        }
                      </span>
                    </div>

                    <div className="flex justify-between gap-4">
                      <span className="text-slate-500">
                        Win Rate
                      </span>

                      <span className="font-semibold">
                        {formatPercent(
                          direction.winRate,
                        )}
                      </span>
                    </div>

                    <div className="flex justify-between gap-4">
                      <span className="text-slate-500">
                        Profit Factor
                      </span>

                      <span className="font-semibold">
                        {formatProfitFactor(
                          direction.profitFactor,
                        )}
                      </span>
                    </div>

                    <div className="flex justify-between gap-4">
                      <span className="text-slate-500">
                        Fees
                      </span>

                      <span className="font-semibold text-rose-400">
                        {formatMoney(
                          direction.fees,
                          {
                            fee: true,
                          },
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              ),
            )}
          </div>
        </div>
      </div>

      <div className="mt-8 rounded-3xl border border-slate-800 bg-slate-900/60">
        <div className="flex flex-col gap-3 border-b border-slate-800 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-400">
              Report History
            </p>

            <h3 className="mt-2 text-2xl font-bold">
              Generated From Real Trades
            </h3>
          </div>

          <button
            type="button"
            onClick={() =>
              exportTrades(
                accountTrades,
                "tradecoach-all-trades.csv",
              )
            }
            disabled={
              accountTrades.length ===
              0
            }
            className="rounded-xl border border-slate-700 px-4 py-3 text-sm font-semibold text-slate-300 transition hover:border-cyan-400 hover:text-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Export All
          </button>
        </div>

        <div className="divide-y divide-slate-800">
          {reportHistory.length ===
          0 ? (
            <div className="px-6 py-10 text-center text-slate-400">
              No reports are
              available yet.
            </div>
          ) : null}

          {reportHistory.map((report) => (
            <div
              key={`${report.type}-${report.periodKey}`}
              className="flex flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h4 className="font-bold">{report.title}</h4>

                  <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold capitalize text-slate-400">
                    {report.type}
                  </span>
                </div>

                <p className="mt-2 text-sm text-slate-500">
                  {report.periodLabel} · Net{" "}
                  {formatMoney(report.summary.totalPnl, {
                    showPlus: true,
                  })}
                </p>
              </div>

              <div className="flex items-center gap-4">
                <span className="rounded-lg bg-cyan-500/10 px-3 py-2 text-sm font-bold text-cyan-400">
                  Grade {report.grade}
                </span>

                <Link
                  href={report.viewHref}
                  className="text-sm font-semibold text-cyan-400 transition hover:text-cyan-300"
                >
                  Open
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
