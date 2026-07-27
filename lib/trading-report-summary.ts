import {
  getTradeDisplayPnl,
  getTradeOutcomeStats,
} from "@/lib/trade-pnl";

const NEW_YORK_TIME_ZONE = "America/New_York";

export type ReportTrade = {
  symbol?: string | null;
  direction?: string | null;
  net_pnl?: number | string | null;
  gross_pnl?: number | string | null;
  fees?: number | string | null;
  status?: string | null;
  entry_price?: number | string | null;
  exit_price?: number | string | null;
  entry_at?: string | null;
  exit_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type TradingReportSummary = {
  label: string;
  grade: string;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  averageTrade: number;
  highlight: string;
  focus: string;
  recentTrades: Array<{
    symbol: string;
    side: string;
    pnl: number;
    entry: string;
    exit: string;
  }>;
};

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function getPerformanceGrade(score: number): string {
  if (score >= 93) return "A+";
  if (score >= 88) return "A";
  if (score >= 83) return "A-";
  if (score >= 78) return "B+";
  if (score >= 73) return "B";
  if (score >= 68) return "B-";
  if (score >= 63) return "C+";
  if (score >= 58) return "C";
  if (score >= 50) return "C-";
  return "D";
}

function formatMoney(value: number, showPlus = false): string {
  const normalized = Math.abs(value) < 0.005 ? 0 : value;
  const formatted = Math.abs(normalized).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  if (normalized < 0) {
    return `-$${formatted}`;
  }

  if (normalized > 0 && showPlus) {
    return `+$${formatted}`;
  }

  return `$${formatted}`;
}

function formatPrice(value: unknown): string {
  const number = toNumber(value);

  if (number === null) {
    return "—";
  }

  return number.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatSide(direction: string | null | undefined): string {
  const normalized = String(direction || "").toLowerCase();

  if (normalized === "long") {
    return "Long";
  }

  if (normalized === "short") {
    return "Short";
  }

  return direction || "—";
}

function getTradeTimestamp(trade: ReportTrade): string | null {
  return (
    trade.exit_at ||
    trade.entry_at ||
    trade.created_at ||
    trade.updated_at ||
    null
  );
}

export function getNewYorkDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: NEW_YORK_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const values: Record<string, string> = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      values[part.type] = part.value;
    }
  }

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    key: `${values.year}-${values.month}-${values.day}`,
  };
}

export function filterTradesForNewYorkDate(
  trades: ReportTrade[],
  dateKey: string,
) {
  return trades.filter((trade) => {
    const timestamp = getTradeTimestamp(trade);

    if (!timestamp) {
      return false;
    }

    const parts = getNewYorkDateParts(new Date(timestamp));
    return parts.key === dateKey;
  });
}

export function filterTradesForCurrentWeek(trades: ReportTrade[], now = new Date()) {
  const current = getNewYorkDateParts(now);
  const currentDate = new Date(
    Date.UTC(current.year, current.month - 1, current.day),
  );
  const day = currentDate.getUTCDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(currentDate);
  monday.setUTCDate(currentDate.getUTCDate() + diffToMonday);
  const mondayKey = getNewYorkDateParts(monday).key;

  return trades.filter((trade) => {
    const timestamp = getTradeTimestamp(trade);

    if (!timestamp) {
      return false;
    }

    const parts = getNewYorkDateParts(new Date(timestamp));
    return parts.key >= mondayKey;
  });
}

export function filterTradesForMonth(
  trades: ReportTrade[],
  year: number,
  month: number,
) {
  return trades.filter((trade) => {
    const timestamp = getTradeTimestamp(trade);

    if (!timestamp) {
      return false;
    }

    const parts = getNewYorkDateParts(new Date(timestamp));
    return parts.year === year && parts.month === month;
  });
}

export function buildTradingReportSummary(
  trades: ReportTrade[],
  label: string,
): TradingReportSummary {
  const stats = getTradeOutcomeStats(trades);
  let winnerTotal = 0;
  let loserTotal = 0;

  for (const trade of trades) {
    const pnl = getTradeDisplayPnl(trade);

    if (pnl === null) {
      continue;
    }

    if (pnl > 0) {
      winnerTotal += pnl;
    } else if (pnl < 0) {
      loserTotal += Math.abs(pnl);
    }
  }

  const totalTrades = stats.scoredTrades;
  const winRate = stats.winRate;
  const averageWinner =
    stats.winners > 0 ? winnerTotal / stats.winners : 0;
  const averageLoser = stats.losers > 0 ? loserTotal / stats.losers : 0;
  const averageTrade =
    totalTrades > 0 ? stats.totalPnl / totalTrades : 0;

  let performanceScore = 50;

  if (totalTrades === 0) {
    performanceScore = 0;
  } else {
    if (stats.totalPnl > 0) performanceScore += 12;
    else if (stats.totalPnl < 0) performanceScore -= 12;

    if (winRate >= 65) performanceScore += 15;
    else if (winRate >= 55) performanceScore += 10;
    else if (winRate >= 45) performanceScore += 3;
    else performanceScore -= 10;

    if (averageTrade > 0) performanceScore += 5;
  }

  performanceScore = Math.max(0, Math.min(100, Math.round(performanceScore)));

  let highlight =
    "Complete more trades in this period to unlock deeper coaching insights.";

  if (totalTrades > 0) {
    highlight = `You finished ${label.toLowerCase()} at ${formatMoney(
      stats.totalPnl,
      true,
    )} across ${totalTrades} trade${totalTrades === 1 ? "" : "s"}.`;
  }

  let focus =
    "Keep collecting trades before making a major change to your plan.";

  if (averageLoser > averageWinner && stats.losers > 0) {
    focus =
      "Your average loss is larger than your average win. Tighten invalidation and loss size on the next session.";
  } else if (winRate < 45 && totalTrades >= 4) {
    focus =
      "Your win rate is below 45%. Be more selective and wait for clearer location and confirmation.";
  } else if (stats.totalPnl > 0) {
    focus =
      "Protect what is working. Review your best entries and repeat the same decision process tomorrow.";
  } else if (stats.totalPnl < 0) {
    focus =
      "Review your losing trades for repeated mistakes in location, timing, or holding losers too long.";
  }

  const recentTrades = [...trades]
    .sort((first, second) => {
      const firstTime = new Date(getTradeTimestamp(first) || 0).getTime();
      const secondTime = new Date(getTradeTimestamp(second) || 0).getTime();
      return secondTime - firstTime;
    })
    .slice(0, 5)
    .map((trade) => ({
      symbol: trade.symbol || "—",
      side: formatSide(trade.direction),
      pnl: getTradeDisplayPnl(trade) ?? 0,
      entry: formatPrice(trade.entry_price),
      exit: formatPrice(trade.exit_price),
    }));

  return {
    label,
    grade: totalTrades > 0 ? getPerformanceGrade(performanceScore) : "—",
    totalTrades,
    wins: stats.winners,
    losses: stats.losers,
    winRate,
    totalPnl: stats.totalPnl,
    averageTrade,
    highlight,
    focus,
    recentTrades,
  };
}

export function getAppBaseUrl() {
  if (process.env.NEXT_PUBLIC_APP_URL?.trim()) {
    return process.env.NEXT_PUBLIC_APP_URL.trim().replace(/\/$/, "");
  }

  if (process.env.VERCEL_URL?.trim()) {
    const host = process.env.VERCEL_URL.trim().replace(/^https?:\/\//, "");
    return `https://${host}`;
  }

  return "http://localhost:3000";
}
