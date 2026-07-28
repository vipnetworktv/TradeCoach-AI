"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  buildPlanKey,
  generateFocusTasks,
  generateMainOpportunity,
  getRangeLabel,
  IMPROVEMENT_PLAN_SESSION_KEY,
  type ReportRange,
} from "@/lib/improvement-plan";
import {
  getTradeDisplayPnl,
  getTradeDisplayPnlOrZero,
  getTradeOutcomeStats,
  toTradeNumber,
} from "@/lib/trade-pnl";

type GradeSessionTrade = {
  net_pnl?: number | string | null;
  gross_pnl?: number | string | null;
  fees?: number | string | null;
  status?: string | null;
  direction?: string | null;
  exit_at?: string | null;
  entry_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type GradeSessionPanelProps = {
  trades: GradeSessionTrade[];
  loading: boolean;
  refreshing: boolean;
  selectedRange: ReportRange;
  onRangeChange: (range: ReportRange) => void;
  onRefresh: () => void;
};

const NEW_YORK_TIME_ZONE = "America/New_York";

function toNumber(value: unknown): number | null {
  return toTradeNumber(value);
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

  const normalized = Math.abs(number) < 0.005 ? 0 : number;
  const formatted = Math.abs(normalized).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  if (options?.fee) {
    return normalized === 0 ? "$0.00" : `-$${formatted}`;
  }

  if (normalized < 0) {
    return `-$${formatted}`;
  }

  if (normalized > 0 && options?.showPlus) {
    return `+$${formatted}`;
  }

  return `$${formatted}`;
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) {
    return "—";
  }

  return `${value.toFixed(0)}%`;
}

function formatProfitFactor(value: number | null): string {
  if (value === null) {
    return "—";
  }

  if (!Number.isFinite(value)) {
    return "∞";
  }

  return value.toFixed(2);
}

function getMoneyClass(value: unknown): string {
  const number = toNumber(value);

  if (number === null || number === 0) {
    return "text-slate-200";
  }

  return number > 0 ? "text-emerald-400" : "text-rose-400";
}

function getTradeTimestamp(trade: GradeSessionTrade): string | null {
  return (
    trade.exit_at ||
    trade.entry_at ||
    trade.created_at ||
    trade.updated_at ||
    null
  );
}

function getNewYorkHour(trade: GradeSessionTrade): number | null {
  const timestamp = getTradeTimestamp(trade);

  if (!timestamp) {
    return null;
  }

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const hourPart = new Intl.DateTimeFormat("en-US", {
    timeZone: NEW_YORK_TIME_ZONE,
    hour: "numeric",
    hour12: false,
  }).formatToParts(date);

  const hour = Number(
    hourPart.find((part) => part.type === "hour")?.value ?? NaN,
  );

  return Number.isFinite(hour) ? hour : null;
}

function getTimeBucket(trade: GradeSessionTrade): string {
  const hour = getNewYorkHour(trade);

  if (hour === null) {
    return "Unknown time";
  }

  if (hour < 9) {
    return "Pre-market";
  }

  if (hour < 12) {
    return "Morning";
  }

  if (hour < 14) {
    return "Midday";
  }

  if (hour < 17) {
    return "Afternoon";
  }

  return "Evening";
}

function calculateProfitFactor(trades: GradeSessionTrade[]): number | null {
  let winningProfit = 0;
  let losingProfit = 0;

  for (const trade of trades) {
    const net = getTradeDisplayPnl(trade);

    if (net === null) {
      continue;
    }

    if (net > 0) {
      winningProfit += net;
    } else if (net < 0) {
      losingProfit += Math.abs(net);
    }
  }

  if (winningProfit === 0 && losingProfit === 0) {
    return null;
  }

  if (losingProfit === 0) {
    return Number.POSITIVE_INFINITY;
  }

  return winningProfit / losingProfit;
}

function getPerformanceGrade(score: number): string {
  if (score >= 93) {
    return "A+";
  }

  if (score >= 88) {
    return "A";
  }

  if (score >= 83) {
    return "A-";
  }

  if (score >= 78) {
    return "B+";
  }

  if (score >= 73) {
    return "B";
  }

  if (score >= 68) {
    return "B-";
  }

  if (score >= 63) {
    return "C+";
  }

  if (score >= 58) {
    return "C";
  }

  if (score >= 50) {
    return "C-";
  }

  return "D";
}

function computeMetrics(trades: GradeSessionTrade[]) {
  const stats = getTradeOutcomeStats(trades);
  let totalFees = 0;
  let winnerTotal = 0;
  let loserTotal = 0;
  let winnerDurationTotal = 0;
  let winnerDurationCount = 0;
  let loserDurationTotal = 0;
  let loserDurationCount = 0;

  for (const trade of trades) {
    const net = getTradeDisplayPnl(trade);
    const fees = toNumber(trade.fees) ?? 0;
    totalFees += fees;

    if (net === null) {
      continue;
    }

    if (net > 0) {
      winnerTotal += net;
    } else if (net < 0) {
      loserTotal += Math.abs(net);
    }

    const entryAt = trade.entry_at ? new Date(trade.entry_at).getTime() : NaN;
    const exitAt = trade.exit_at ? new Date(trade.exit_at).getTime() : NaN;

    if (Number.isFinite(entryAt) && Number.isFinite(exitAt) && exitAt > entryAt) {
      const durationMinutes = (exitAt - entryAt) / 60_000;

      if (net > 0) {
        winnerDurationTotal += durationMinutes;
        winnerDurationCount += 1;
      } else if (net < 0) {
        loserDurationTotal += durationMinutes;
        loserDurationCount += 1;
      }
    }
  }

  const totalTrades = stats.scoredTrades;
  const winRate = stats.winRate;
  const averageWinner =
    stats.winners > 0 ? winnerTotal / stats.winners : 0;
  const averageLoser = stats.losers > 0 ? loserTotal / stats.losers : 0;
  const averageTrade =
    totalTrades > 0 ? stats.totalPnl / totalTrades : 0;
  const averageWinnerDuration =
    winnerDurationCount > 0 ? winnerDurationTotal / winnerDurationCount : null;
  const averageLoserDuration =
    loserDurationCount > 0 ? loserDurationTotal / loserDurationCount : null;
  const riskReward =
    averageLoser > 0
      ? averageWinner / averageLoser
      : averageWinner > 0
        ? Number.POSITIVE_INFINITY
        : null;
  const profitFactor = calculateProfitFactor(trades);

  let performanceScore = 50;

  if (totalTrades === 0) {
    performanceScore = 0;
  } else {
    if (stats.totalPnl > 0) {
      performanceScore += 12;
    } else if (stats.totalPnl < 0) {
      performanceScore -= 12;
    }

    if (winRate >= 65) {
      performanceScore += 15;
    } else if (winRate >= 55) {
      performanceScore += 10;
    } else if (winRate >= 45) {
      performanceScore += 3;
    } else {
      performanceScore -= 10;
    }

    if (profitFactor !== null && !Number.isFinite(profitFactor)) {
      performanceScore += 18;
    } else if (profitFactor !== null && profitFactor >= 2) {
      performanceScore += 18;
    } else if (profitFactor !== null && profitFactor >= 1.5) {
      performanceScore += 12;
    } else if (profitFactor !== null && profitFactor >= 1) {
      performanceScore += 4;
    } else {
      performanceScore -= 10;
    }

    if (riskReward !== null && riskReward >= 1.5) {
      performanceScore += 10;
    } else if (riskReward !== null && riskReward >= 1) {
      performanceScore += 5;
    } else {
      performanceScore -= 5;
    }

    if (averageTrade > 0) {
      performanceScore += 5;
    }
  }

  performanceScore = Math.max(
    0,
    Math.min(100, Math.round(performanceScore)),
  );

  return {
    totalTrades,
    totalNetPnl: stats.totalPnl,
    totalFees,
    winners: stats.winners,
    losers: stats.losers,
    winRate,
    averageWinner,
    averageLoser,
    averageTrade,
    averageWinnerDuration,
    averageLoserDuration,
    profitFactor,
    performanceGrade:
      totalTrades > 0 ? getPerformanceGrade(performanceScore) : "—",
  };
}

function computeDirectionPerformance(trades: GradeSessionTrade[]) {
  const longTrades = trades.filter(
    (trade) => String(trade.direction || "").toLowerCase() === "long",
  );
  const shortTrades = trades.filter(
    (trade) => String(trade.direction || "").toLowerCase() === "short",
  );

  function summarize(label: string, group: GradeSessionTrade[]) {
    let netPnl = 0;

    for (const trade of group) {
      netPnl += getTradeDisplayPnlOrZero(trade);
    }

    return {
      label,
      trades: group.length,
      netPnl,
    };
  }

  return {
    long: summarize("Long", longTrades),
    short: summarize("Short", shortTrades),
  };
}

function computeWorstTime(trades: GradeSessionTrade[]) {
  const groups = new Map<string, { label: string; trades: number; netPnl: number }>();

  for (const trade of trades) {
    const bucket = getTimeBucket(trade);
    const existing = groups.get(bucket) || {
      label: bucket,
      trades: 0,
      netPnl: 0,
    };

    existing.trades += 1;
    existing.netPnl += getTradeDisplayPnlOrZero(trade);
    groups.set(bucket, existing);
  }

  const candidates = Array.from(groups.values()).filter(
    (item) => item.trades > 0,
  );

  if (candidates.length === 0) {
    return null;
  }

  return [...candidates].sort((first, second) => first.netPnl - second.netPnl)[0];
}

export default function GradeSessionPanel({
  trades,
  loading,
  refreshing,
  selectedRange,
  onRangeChange,
  onRefresh,
}: GradeSessionPanelProps) {
  const [completedFocusTasks, setCompletedFocusTasks] = useState<Set<number>>(
    new Set(),
  );
  const [progressLoading, setProgressLoading] = useState(false);
  const [progressSaving, setProgressSaving] = useState(false);
  const [progressError, setProgressError] = useState<string | null>(null);

  const metrics = useMemo(() => computeMetrics(trades), [trades]);

  const directionPerformance = useMemo(
    () => computeDirectionPerformance(trades),
    [trades],
  );

  const worstDirection = useMemo(() => {
    const candidates = [directionPerformance.long, directionPerformance.short].filter(
      (item) => item.trades > 0,
    );

    if (candidates.length === 0) {
      return null;
    }

    return [...candidates].sort((first, second) => first.netPnl - second.netPnl)[0];
  }, [directionPerformance]);

  const worstTime = useMemo(() => computeWorstTime(trades), [trades]);

  const planMetrics = useMemo(
    () => ({
      totalTrades: metrics.totalTrades,
      winRate: metrics.winRate,
      averageWinner: metrics.averageWinner,
      averageLoser: metrics.averageLoser,
      averageWinnerDuration: metrics.averageWinnerDuration,
      averageLoserDuration: metrics.averageLoserDuration,
      losers: metrics.losers,
      winners: metrics.winners,
      totalFees: metrics.totalFees,
      totalNetPnl: metrics.totalNetPnl,
    }),
    [metrics],
  );

  const mainOpportunity = useMemo(
    () => generateMainOpportunity(planMetrics, selectedRange),
    [planMetrics, selectedRange],
  );

  const focusTasks = useMemo(
    () => generateFocusTasks(planMetrics, worstDirection, worstTime),
    [planMetrics, worstDirection, worstTime],
  );

  const planKey = useMemo(() => buildPlanKey(focusTasks), [focusTasks]);

  const completedTitles = useMemo(
    () =>
      focusTasks
        .filter((_, index) => completedFocusTasks.has(index))
        .map((task) => task.title),
    [completedFocusTasks, focusTasks],
  );

  const saveProgress = useCallback(
    async (titles: string[]) => {
      setProgressSaving(true);
      setProgressError(null);

      try {
        const response = await fetch("/api/improvement-plan", {
          method: "PUT",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            analysisRange: selectedRange,
            planKey,
            completedTitles: titles,
          }),
        });

        const data = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(
            typeof data?.error === "string"
              ? data.error
              : "Could not save focus progress.",
          );
        }
      } catch (error) {
        setProgressError(
          error instanceof Error
            ? error.message
            : "Could not save focus progress.",
        );
      } finally {
        setProgressSaving(false);
      }
    },
    [planKey, selectedRange],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadProgress() {
      if (focusTasks.length === 0) {
        setCompletedFocusTasks(new Set());
        return;
      }

      setProgressLoading(true);
      setProgressError(null);

      try {
        const response = await fetch(
          `/api/improvement-plan?range=${encodeURIComponent(selectedRange)}&planKey=${encodeURIComponent(planKey)}`,
          { cache: "no-store" },
        );
        const data = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(
            typeof data?.error === "string"
              ? data.error
              : "Could not load focus progress.",
          );
        }

        if (cancelled) {
          return;
        }

        const savedTitles = Array.isArray(data?.completedTitles)
          ? (data.completedTitles as string[])
          : [];
        const nextCompleted = new Set<number>();

        focusTasks.forEach((task, index) => {
          if (savedTitles.includes(task.title)) {
            nextCompleted.add(index);
          }
        });

        setCompletedFocusTasks(nextCompleted);
      } catch (error) {
        if (!cancelled) {
          setProgressError(
            error instanceof Error
              ? error.message
              : "Could not load focus progress.",
          );
          setCompletedFocusTasks(new Set());
        }
      } finally {
        if (!cancelled) {
          setProgressLoading(false);
        }
      }
    }

    void loadProgress();

    return () => {
      cancelled = true;
    };
  }, [focusTasks, planKey, selectedRange]);

  const focusCompletion =
    focusTasks.length > 0
      ? Math.round((completedFocusTasks.size / focusTasks.length) * 100)
      : 0;

  function toggleFocusTask(index: number) {
    setCompletedFocusTasks((current) => {
      const updated = new Set(current);

      if (updated.has(index)) {
        updated.delete(index);
      } else {
        updated.add(index);
      }

      const titles = focusTasks
        .filter((_, taskIndex) => updated.has(taskIndex))
        .map((task) => task.title);

      void saveProgress(titles);

      return updated;
    });
  }

  function handleDiscussWithCoach() {
    const context = {
      range: selectedRange,
      rangeLabel: getRangeLabel(selectedRange),
      focusTasks,
      mainOpportunity,
      completedTitles,
      focusCompletion,
    };

    sessionStorage.setItem(
      IMPROVEMENT_PLAN_SESSION_KEY,
      JSON.stringify(context),
    );
  }

  return (
    <section className="mt-8 rounded-3xl border border-slate-800 bg-slate-900/40 p-6 md:p-8">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-400">
            AI Trading Coach
          </p>

          <h3 className="mt-2 text-3xl font-extrabold text-white">
            Grade Session
          </h3>

          <p className="mt-2 max-w-3xl leading-7 text-slate-400">
            TradeCoach analyzes your processed TradingView trades for the selected
            period and turns them into a letter grade, your biggest opportunity,
            and a focused improvement plan.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label>
            <span className="mb-2 block text-sm font-medium text-slate-400">
              Analysis Period
            </span>

            <select
              value={selectedRange}
              onChange={(event) => {
                onRangeChange(event.target.value as ReportRange);
              }}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400 sm:min-w-[180px]"
            >
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="30">Last 30 Days</option>
              <option value="all">All Time</option>
            </select>
          </label>

          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="rounded-xl bg-cyan-500 px-5 py-3 font-bold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {refreshing ? "Generating..." : "Generate New Analysis"}
          </button>
        </div>
      </div>

      <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
          <p className="text-sm text-slate-400">Performance Grade</p>

          <p className="mt-3 text-5xl font-extrabold text-cyan-400">
            {loading ? "…" : metrics.performanceGrade}
          </p>

          <p className="mt-2 text-sm text-slate-500">
            Based on {loading ? "…" : metrics.totalTrades} real trade
            {metrics.totalTrades === 1 ? "" : "s"}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
          <p className="text-sm text-slate-400">Win Rate</p>

          <p className="mt-3 text-3xl font-extrabold text-white">
            {loading ? "…" : formatPercent(metrics.winRate)}
          </p>

          <p className="mt-2 text-sm text-slate-500">
            {loading
              ? "…"
              : `${metrics.winners} wins · ${metrics.losers} losses`}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
          <p className="text-sm text-slate-400">Profit Factor</p>

          <p className="mt-3 text-3xl font-extrabold text-white">
            {loading ? "…" : formatProfitFactor(metrics.profitFactor)}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
          <p className="text-sm text-slate-400">Average Trade</p>

          <p
            className={`mt-3 text-3xl font-extrabold ${getMoneyClass(
              metrics.averageTrade,
            )}`}
          >
            {loading
              ? "…"
              : formatMoney(metrics.averageTrade, {
                  showPlus: true,
                })}
          </p>
        </div>
      </div>

      <div className="mt-8 grid gap-8 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-400">
            Data-Driven Review
          </p>

          <h4 className="mt-2 text-2xl font-bold text-white">
            Your Biggest Opportunity
          </h4>

          <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
            <p className="text-lg font-semibold text-white">
              {mainOpportunity.title}
            </p>

            <p className="mt-3 text-sm leading-7 text-slate-400">
              {mainOpportunity.description}
            </p>

            {metrics.totalTrades > 0 ? (
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-slate-900/80 p-4">
                  <p className="text-xs uppercase tracking-wider text-slate-500">
                    Average Winner
                  </p>
                  <p className="mt-2 font-bold text-emerald-400">
                    {formatMoney(metrics.averageWinner, {
                      showPlus: true,
                    })}
                  </p>
                </div>

                <div className="rounded-xl bg-slate-900/80 p-4">
                  <p className="text-xs uppercase tracking-wider text-slate-500">
                    Average Loser
                  </p>
                  <p className="mt-2 font-bold text-rose-400">
                    {formatMoney(-metrics.averageLoser)}
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          <div className="mt-5 rounded-2xl border border-cyan-500/15 bg-cyan-500/[0.04] p-5">
            <p className="text-sm font-semibold text-cyan-400">
              Coach Recommendation
            </p>

            <p className="mt-2 text-sm leading-7 text-slate-300">
              {mainOpportunity.recommendation}
            </p>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-400">
            Current Focus
          </p>

          <h4 className="mt-2 text-2xl font-bold text-white">
            Your Improvement Plan
          </h4>

          <p className="mt-2 text-sm text-slate-500">
            Check items off as you apply them in live trading. Progress saves to
            your account.
          </p>

          <div className="mt-6 space-y-4">
            {focusTasks.map((task, index) => {
              const isComplete = completedFocusTasks.has(index);

              return (
                <label
                  key={task.title}
                  className={`flex cursor-pointer gap-4 rounded-2xl border bg-slate-950/70 p-4 transition ${
                    isComplete
                      ? "border-emerald-500/30 bg-emerald-500/[0.04]"
                      : "border-slate-800 hover:border-cyan-500/30"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isComplete}
                    disabled={progressLoading}
                    onChange={() => {
                      toggleFocusTask(index);
                    }}
                    className="mt-1 h-4 w-4 rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-cyan-400"
                  />

                  <span>
                    <span className="block text-sm font-semibold text-white">
                      {task.title}
                    </span>

                    <span className="mt-1 block text-sm leading-6 text-slate-400">
                      {task.description}
                    </span>

                    <span className="mt-2 block text-xs leading-5 text-cyan-300/80">
                      {task.evidence}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>

          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-slate-400">Focus Completion</span>
              <span className="font-semibold text-cyan-400">
                {progressLoading ? "…" : `${focusCompletion}%`}
              </span>
            </div>

            <div className="h-2 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-cyan-500 transition-all duration-300"
                style={{ width: `${focusCompletion}%` }}
              />
            </div>

            {progressSaving ? (
              <p className="mt-2 text-xs text-slate-500">Saving progress…</p>
            ) : null}

            {progressError ? (
              <p className="mt-2 text-xs text-rose-300">{progressError}</p>
            ) : null}

            {focusCompletion === 100 && !progressLoading ? (
              <p className="mt-2 text-xs text-emerald-300">
                All focus items complete for {getRangeLabel(selectedRange).toLowerCase()}.
              </p>
            ) : null}
          </div>

          <Link
            href={`/dashboard/ai-coach?topic=improvement-plan&range=${selectedRange}`}
            onClick={handleDiscussWithCoach}
            className="mt-6 block rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-5 py-4 text-center text-sm font-semibold text-cyan-300 transition hover:border-cyan-400 hover:bg-cyan-500/15"
          >
            Discuss this plan with AI Coach
          </Link>
        </div>
      </div>
    </section>
  );
}
