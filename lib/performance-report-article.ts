import {
  buildTradingReportSummary,
  filterTradesForCurrentWeek,
  filterTradesForMonth,
  filterTradesForNewYorkDate,
  getNewYorkDateParts,
  type ReportTrade,
  type TradingReportSummary,
} from "@/lib/trading-report-summary";

export type PerformanceReportType = "weekly" | "monthly" | "daily";

export type ReportInsight = {
  title: string;
  body: string;
};

export type PerformanceReportArticle = {
  type: PerformanceReportType;
  title: string;
  periodLabel: string;
  periodKey: string;
  grade: string;
  intro: string;
  strengths: ReportInsight[];
  improvements: ReportInsight[];
  nextFocus: string;
  summary: TradingReportSummary;
  viewHref: string;
};

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function getTradePnl(trade: ReportTrade): number | null {
  const net = toNumber(trade.net_pnl);
  const gross = toNumber(trade.gross_pnl);
  const status = String(trade.status || "").toLowerCase();

  if (status === "processed" && net !== null) {
    return net;
  }

  return gross ?? net;
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

function formatPercent(value: number): string {
  return `${value.toFixed(0)}%`;
}

function formatSide(direction: string | null | undefined): string {
  const normalized = String(direction || "").toLowerCase();

  if (normalized === "long") {
    return "Long";
  }

  if (normalized === "short") {
    return "Short";
  }

  return direction || "Mixed";
}

type SymbolBucket = {
  symbol: string;
  trades: number;
  netPnl: number;
  wins: number;
};

type DirectionBucket = {
  direction: string;
  trades: number;
  netPnl: number;
};

type DayBucket = {
  dateKey: string;
  dateLabel: string;
  trades: number;
  netPnl: number;
};

function analyzeTrades(trades: ReportTrade[]) {
  const symbols = new Map<string, SymbolBucket>();
  const directions = new Map<string, DirectionBucket>();
  const days = new Map<string, DayBucket>();

  let totalFees = 0;
  let winners = 0;
  let losers = 0;
  let winnerTotal = 0;
  let loserTotal = 0;

  for (const trade of trades) {
    const pnl = getTradePnl(trade);
    const fees = toNumber(trade.fees) ?? 0;
    totalFees += fees;

    if (pnl !== null) {
      if (pnl > 0) {
        winners += 1;
        winnerTotal += pnl;
      } else if (pnl < 0) {
        losers += 1;
        loserTotal += Math.abs(pnl);
      }
    }

    const symbol = String(trade.symbol || "Unknown").trim() || "Unknown";
    const symbolBucket = symbols.get(symbol) || {
      symbol,
      trades: 0,
      netPnl: 0,
      wins: 0,
    };
    symbolBucket.trades += 1;
    symbolBucket.netPnl += pnl ?? 0;
    if ((pnl ?? 0) > 0) {
      symbolBucket.wins += 1;
    }
    symbols.set(symbol, symbolBucket);

    const direction = formatSide(trade.direction);
    const directionBucket = directions.get(direction) || {
      direction,
      trades: 0,
      netPnl: 0,
    };
    directionBucket.trades += 1;
    directionBucket.netPnl += pnl ?? 0;
    directions.set(direction, directionBucket);

    const timestamp = getTradeTimestamp(trade);

    if (timestamp) {
      const parts = getNewYorkDateParts(new Date(timestamp));
      const dayBucket = days.get(parts.key) || {
        dateKey: parts.key,
        dateLabel: new Intl.DateTimeFormat("en-US", {
          timeZone: "America/New_York",
          month: "short",
          day: "numeric",
          year: "numeric",
        }).format(new Date(timestamp)),
        trades: 0,
        netPnl: 0,
      };
      dayBucket.trades += 1;
      dayBucket.netPnl += pnl ?? 0;
      days.set(parts.key, dayBucket);
    }
  }

  const symbolList = [...symbols.values()].sort((a, b) => b.netPnl - a.netPnl);
  const directionList = [...directions.values()].sort((a, b) => b.netPnl - a.netPnl);
  const dayList = [...days.values()].sort((a, b) => b.netPnl - a.netPnl);
  const greenDays = dayList.filter((day) => day.netPnl > 0).length;
  const redDays = dayList.filter((day) => day.netPnl < 0).length;

  return {
    totalFees,
    winners,
    losers,
    winnerTotal,
    loserTotal,
    averageWinner: winners > 0 ? winnerTotal / winners : 0,
    averageLoser: losers > 0 ? loserTotal / losers : 0,
    symbolList,
    directionList,
    dayList,
    greenDays,
    redDays,
    bestSymbol: symbolList[0] || null,
    worstSymbol:
      symbolList.length > 0 ? symbolList[symbolList.length - 1] : null,
    bestDirection: directionList[0] || null,
    worstDirection:
      directionList.length > 0
        ? directionList[directionList.length - 1]
        : null,
    bestDay: dayList[0] || null,
    worstDay: dayList.length > 0 ? dayList[dayList.length - 1] : null,
  };
}

function getReportTitle(type: PerformanceReportType): string {
  if (type === "weekly") {
    return "Weekly Performance Report";
  }

  if (type === "monthly") {
    return "Monthly Performance Report";
  }

  return "Daily Trading Report";
}

function getPeriodLabel(
  type: PerformanceReportType,
  trades: ReportTrade[],
  now = new Date(),
  dateKey?: string,
): { label: string; key: string } {
  const ny = getNewYorkDateParts(now);

  if (type === "weekly") {
    const monday = getWeekStartDate(now);
    const mondayParts = getNewYorkDateParts(monday);
    const sunday = new Date(monday);
    sunday.setUTCDate(sunday.getUTCDate() + 6);
    const sundayParts = getNewYorkDateParts(sunday);

    return {
      label: `Week of ${mondayParts.month}/${mondayParts.day}–${sundayParts.month}/${sundayParts.day}/${sundayParts.year}`,
      key: `${ny.year}-W${getIsoWeek(now)}`,
    };
  }

  if (type === "monthly") {
    return {
      label: new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        month: "long",
        year: "numeric",
      }).format(now),
      key: `${ny.year}-${String(ny.month).padStart(2, "0")}`,
    };
  }

  const targetKey = dateKey || ny.key;
  const sampleTrade = trades.find((trade) => {
    const timestamp = getTradeTimestamp(trade);

    if (!timestamp) {
      return false;
    }

    return getNewYorkDateParts(new Date(timestamp)).key === targetKey;
  });
  const sampleDate = sampleTrade
    ? new Date(getTradeTimestamp(sampleTrade) || now)
    : now;

  return {
    label: new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(sampleDate),
    key: targetKey,
  };
}

function getWeekStartDate(now = new Date()) {
  const current = getNewYorkDateParts(now);
  const currentDate = new Date(
    Date.UTC(current.year, current.month - 1, current.day),
  );
  const day = currentDate.getUTCDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(currentDate);
  monday.setUTCDate(currentDate.getUTCDate() + diffToMonday);
  return monday;
}

function getIsoWeek(date: Date) {
  const target = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const dayNumber = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function buildIntro(
  type: PerformanceReportType,
  periodLabel: string,
  summary: TradingReportSummary,
): string {
  const periodPhrase =
    type === "weekly"
      ? "this week"
      : type === "monthly"
        ? "this month"
        : "this session";

  if (summary.totalTrades === 0) {
    return `No completed trades were recorded for ${periodLabel.toLowerCase()} yet. Once your broker sync captures fills, this report will break down what worked and what needs attention.`;
  }

  const tone =
    summary.totalPnl > 0
      ? "You finished the period in the green"
      : summary.totalPnl < 0
        ? "The period ended in the red"
        : "You finished the period roughly flat";

  return `${tone} at ${formatMoney(summary.totalPnl, true)} across ${summary.totalTrades} completed trade${summary.totalTrades === 1 ? "" : "s"} during ${periodPhrase}. Your win rate was ${formatPercent(summary.winRate)} with an average result of ${formatMoney(summary.averageTrade, true)} per trade. Below is an honest look at what you did well and where the next improvement lives.`;
}

function buildStrengths(
  summary: TradingReportSummary,
  analysis: ReturnType<typeof analyzeTrades>,
): ReportInsight[] {
  const strengths: ReportInsight[] = [];

  if (summary.totalTrades === 0) {
    return strengths;
  }

  if (summary.totalPnl > 0) {
    strengths.push({
      title: "Profitable period",
      body: `You closed ${formatMoney(summary.totalPnl, true)} net, which means your process produced more reward than damage across the sample.`,
    });
  }

  if (summary.winRate >= 55 && summary.totalTrades >= 3) {
    strengths.push({
      title: "Solid win rate",
      body: `${formatPercent(summary.winRate)} of your trades were winners, which shows you were selective enough to find valid opportunities.`,
    });
  }

  if (
    analysis.averageWinner > analysis.averageLoser &&
    analysis.winners > 0 &&
    analysis.losers > 0
  ) {
    strengths.push({
      title: "Winners outweighed losers",
      body: `Your average winner (${formatMoney(analysis.averageWinner, true)}) was larger than your average loss (${formatMoney(-analysis.averageLoser)}), which is the foundation of sustainable trading.`,
    });
  }

  if (analysis.bestSymbol && analysis.bestSymbol.netPnl > 0) {
    strengths.push({
      title: `${analysis.bestSymbol.symbol} worked for you`,
      body: `${analysis.bestSymbol.symbol} was your strongest symbol at ${formatMoney(analysis.bestSymbol.netPnl, true)} net across ${analysis.bestSymbol.trades} trade${analysis.bestSymbol.trades === 1 ? "" : "s"}.`,
    });
  }

  if (analysis.bestDirection && analysis.bestDirection.netPnl > 0) {
    strengths.push({
      title: `${analysis.bestDirection.direction} bias paid off`,
      body: `${analysis.bestDirection.direction} trades produced ${formatMoney(analysis.bestDirection.netPnl, true)} net and deserve to stay in your playbook.`,
    });
  }

  if (analysis.bestDay && analysis.bestDay.netPnl > 0 && analysis.dayList.length > 1) {
    strengths.push({
      title: `Strong day on ${analysis.bestDay.dateLabel}`,
      body: `${analysis.bestDay.dateLabel} was your best session at ${formatMoney(analysis.bestDay.netPnl, true)} net across ${analysis.bestDay.trades} trade${analysis.bestDay.trades === 1 ? "" : "s"}.`,
    });
  }

  if (analysis.greenDays >= 2 && analysis.dayList.length >= 3) {
    strengths.push({
      title: "Multiple green days",
      body: `${analysis.greenDays} of ${analysis.dayList.length} trading days finished positive, which suggests consistency rather than one lucky trade.`,
    });
  }

  if (strengths.length === 0) {
    strengths.push({
      title: "You showed up and collected data",
      body: "Even a tough period creates useful feedback. Reviewing these trades honestly is how the next improvement starts.",
    });
  }

  return strengths.slice(0, 4);
}

function buildImprovements(
  summary: TradingReportSummary,
  analysis: ReturnType<typeof analyzeTrades>,
): ReportInsight[] {
  const improvements: ReportInsight[] = [];

  if (summary.totalTrades === 0) {
    return improvements;
  }

  if (summary.totalPnl < 0) {
    improvements.push({
      title: "Net result needs repair",
      body: `The period finished at ${formatMoney(summary.totalPnl, true)}. Focus on fewer, higher-quality entries instead of trying to force activity.`,
    });
  }

  if (
    analysis.averageLoser > analysis.averageWinner &&
    analysis.losers > 0 &&
    analysis.winners > 0
  ) {
    improvements.push({
      title: "Losses are too large relative to wins",
      body: `Average loss (${formatMoney(-analysis.averageLoser)}) exceeded average win (${formatMoney(analysis.averageWinner, true)}). Tighten invalidation and exit sooner when the idea is wrong.`,
    });
  }

  if (summary.winRate < 45 && summary.totalTrades >= 4) {
    improvements.push({
      title: "Win rate is below target",
      body: `${formatPercent(summary.winRate)} win rate suggests too many marginal entries. Wait for clearer location and confirmation.`,
    });
  }

  if (
    analysis.totalFees > Math.abs(summary.totalPnl) &&
    analysis.totalFees > 0
  ) {
    improvements.push({
      title: "Fees are overwhelming the edge",
      body: `${formatMoney(analysis.totalFees)} in fees is larger than your absolute net result. Make sure each target can pay for the round trip.`,
    });
  }

  if (analysis.worstSymbol && analysis.worstSymbol.netPnl < 0) {
    improvements.push({
      title: `Review ${analysis.worstSymbol.symbol} setups`,
      body: `${analysis.worstSymbol.symbol} was your weakest symbol at ${formatMoney(analysis.worstSymbol.netPnl, true)} net across ${analysis.worstSymbol.trades} trade${analysis.worstSymbol.trades === 1 ? "" : "s"}.`,
    });
  }

  if (
    analysis.worstDirection &&
    analysis.worstDirection.netPnl < 0 &&
    analysis.directionList.length > 1
  ) {
    improvements.push({
      title: `${analysis.worstDirection.direction} trades underperformed`,
      body: `${analysis.worstDirection.direction} bias lost ${formatMoney(Math.abs(analysis.worstDirection.netPnl))} net. Consider trading smaller size or skipping that direction until the edge returns.`,
    });
  }

  if (analysis.worstDay && analysis.worstDay.netPnl < 0 && analysis.dayList.length > 1) {
    improvements.push({
      title: `Break down ${analysis.worstDay.dateLabel}`,
      body: `${analysis.worstDay.dateLabel} was your toughest session at ${formatMoney(analysis.worstDay.netPnl, true)}. Review whether you over-traded, chased, or ignored your plan.`,
    });
  }

  if (analysis.redDays >= 2 && analysis.greenDays === 0 && analysis.dayList.length >= 2) {
    improvements.push({
      title: "No green days yet",
      body: "Every tracked session in this period closed red. Step back, reduce size, and rebuild one clean green day before scaling back up.",
    });
  }

  if (improvements.length === 0) {
    improvements.push({
      title: "Protect what is working",
      body: summary.totalPnl >= 0
        ? "Your process is working. Keep the same entry checklist and avoid increasing size just because the week felt easy."
        : "Keep reviewing each trade for repeated mistakes in location, timing, or holding losers too long.",
    });
  }

  return improvements.slice(0, 4);
}

function buildNextFocus(
  type: PerformanceReportType,
  summary: TradingReportSummary,
  improvements: ReportInsight[],
): string {
  if (summary.totalTrades === 0) {
    return "Complete at least one fully synced trade so TradeCoach can generate meaningful coaching feedback.";
  }

  if (improvements[0]) {
    const prefix =
      type === "weekly"
        ? "Next week"
        : type === "monthly"
          ? "Next month"
          : "Next session";

    return `${prefix}, start here: ${improvements[0].body}`;
  }

  return summary.focus;
}

export function filterTradesForReport(
  trades: ReportTrade[],
  type: PerformanceReportType,
  now = new Date(),
  dateKey?: string,
): ReportTrade[] {
  if (type === "weekly") {
    return filterTradesForCurrentWeek(trades, now);
  }

  if (type === "monthly") {
    const ny = getNewYorkDateParts(now);
    return filterTradesForMonth(trades, ny.year, ny.month);
  }

  const targetKey = dateKey || getNewYorkDateParts(now).key;
  return filterTradesForNewYorkDate(trades, targetKey);
}

export function buildPerformanceReportArticle(
  trades: ReportTrade[],
  type: PerformanceReportType,
  options?: {
    now?: Date;
    dateKey?: string;
  },
): PerformanceReportArticle {
  const now = options?.now ?? new Date();
  const filtered = filterTradesForReport(
    trades,
    type,
    now,
    options?.dateKey,
  );
  const { label: periodLabel, key: periodKey } = getPeriodLabel(
    type,
    filtered,
    now,
    options?.dateKey,
  );
  const summaryLabel =
    type === "weekly"
      ? `Weekly Report · ${periodLabel}`
      : type === "monthly"
        ? `Monthly Report · ${periodLabel}`
        : `Daily Report · ${periodLabel}`;

  const summary = buildTradingReportSummary(filtered, summaryLabel);
  const analysis = analyzeTrades(filtered);
  const strengths = buildStrengths(summary, analysis);
  const improvements = buildImprovements(summary, analysis);
  const viewHref =
    type === "daily"
      ? `/dashboard/reports/view?type=daily&date=${periodKey}`
      : `/dashboard/reports/view?type=${type}`;

  return {
    type,
    title: getReportTitle(type),
    periodLabel,
    periodKey,
    grade: summary.grade,
    intro: buildIntro(type, periodLabel, summary),
    strengths,
    improvements,
    nextFocus: buildNextFocus(type, summary, improvements),
    summary,
    viewHref,
  };
}

export function buildReportHistoryArticles(
  trades: ReportTrade[],
  now = new Date(),
): PerformanceReportArticle[] {
  const articles: PerformanceReportArticle[] = [];

  const weekTrades = filterTradesForCurrentWeek(trades, now);

  if (weekTrades.length > 0) {
    articles.push(buildPerformanceReportArticle(trades, "weekly", { now }));
  }

  const ny = getNewYorkDateParts(now);
  const monthTrades = filterTradesForMonth(trades, ny.year, ny.month);

  if (monthTrades.length > 0) {
    articles.push(buildPerformanceReportArticle(trades, "monthly", { now }));
  }

  const dayKeys = new Set<string>();

  for (const trade of trades) {
    const timestamp = getTradeTimestamp(trade);

    if (!timestamp) {
      continue;
    }

    dayKeys.add(getNewYorkDateParts(new Date(timestamp)).key);
  }

  const sortedDayKeys = [...dayKeys].sort((a, b) => b.localeCompare(a));

  for (const dateKey of sortedDayKeys.slice(0, 6)) {
    const dayTrades = filterTradesForNewYorkDate(trades, dateKey);

    if (dayTrades.length === 0) {
      continue;
    }

    articles.push(
      buildPerformanceReportArticle(trades, "daily", {
        now,
        dateKey,
      }),
    );
  }

  return articles.slice(0, 8);
}

export type PerformanceReportCoachContext = {
  type: PerformanceReportType;
  title: string;
  periodLabel: string;
  grade: string;
  intro: string;
  strengths: ReportInsight[];
  improvements: ReportInsight[];
  nextFocus: string;
  stats: {
    totalTrades: number;
    winRate: number;
    totalPnl: number;
  };
};

export const PERFORMANCE_REPORT_SESSION_KEY =
  "tradecoach-performance-report-context";

export function buildPerformanceReportCoachContext(
  article: PerformanceReportArticle,
): PerformanceReportCoachContext {
  return {
    type: article.type,
    title: article.title,
    periodLabel: article.periodLabel,
    grade: article.grade,
    intro: article.intro,
    strengths: article.strengths,
    improvements: article.improvements,
    nextFocus: article.nextFocus,
    stats: {
      totalTrades: article.summary.totalTrades,
      winRate: article.summary.winRate,
      totalPnl: article.summary.totalPnl,
    },
  };
}

export function buildPerformanceReportCoachPrompt(
  context: PerformanceReportCoachContext,
): string {
  const strengthLines = context.strengths
    .map((item, index) => `${index + 1}. ${item.title} — ${item.body}`)
    .join("\n");

  const improvementLines = context.improvements
    .map((item, index) => `${index + 1}. ${item.title} — ${item.body}`)
    .join("\n");

  const focusLabel =
    context.type === "weekly"
      ? "next week"
      : context.type === "monthly"
        ? "next month"
        : "my next session";

  return [
    `I just read my ${context.title.toLowerCase()} for ${context.periodLabel}. I received a ${context.grade} grade.`,
    "",
    context.intro,
    "",
    "What I did well:",
    strengthLines,
    "",
    "Where I need to improve:",
    improvementLines,
    "",
    `My focus for ${focusLabel}: ${context.nextFocus}`,
    "",
    `Stats: ${context.stats.totalTrades} trades, ${context.stats.winRate.toFixed(0)}% win rate, ${formatMoney(context.stats.totalPnl, true)} net.`,
    "",
    "Help me turn this into a concrete plan: entry rules, invalidation rules, when to skip, and what to review after each trade.",
  ].join("\n");
}
