export type ReportRange =
  | "today"
  | "week"
  | "month"
  | "30"
  | "all";

export type FocusTask = {
  title: string;
  description: string;
  evidence: string;
};

export type CoachOpportunity = {
  title: string;
  description: string;
  recommendation: string;
};

export type ImprovementPlanMetrics = {
  totalTrades: number;
  winRate: number;
  averageWinner: number;
  averageLoser: number;
  averageWinnerDuration: number | null;
  averageLoserDuration: number | null;
  losers: number;
  winners: number;
  totalFees: number;
  totalNetPnl: number;
};

export type DirectionSummary = {
  label: string;
  trades: number;
  netPnl: number;
};

export type TimeSummary = {
  label: string;
  trades: number;
  netPnl: number;
};

export function getRangeLabel(range: ReportRange): string {
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

export function buildPlanKey(tasks: FocusTask[]): string {
  return tasks.map((task) => task.title).join("|");
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

export function generateMainOpportunity(
  metrics: ImprovementPlanMetrics,
  selectedRange: ReportRange,
): CoachOpportunity {
  if (metrics.totalTrades === 0) {
    return {
      title: "Complete More Trades to Build Your Analysis",
      description:
        "TradeCoach needs processed trades in the selected date range before it can identify a reliable performance pattern.",
      recommendation:
        "Complete a full entry and exit, then refresh this analysis.",
    };
  }

  if (
    metrics.averageLoserDuration !== null &&
    metrics.averageWinnerDuration !== null &&
    metrics.losers >= 2 &&
    metrics.averageLoserDuration > metrics.averageWinnerDuration * 1.25
  ) {
    return {
      title: "Losing Trades Are Being Held Longer",
      description:
        "Your losing trades were held longer than your winning trades during this period.",
      recommendation:
        "Define the invalidation price before entering. Exit when that level is hit instead of waiting for a reversal.",
    };
  }

  if (
    metrics.averageLoser > metrics.averageWinner * 1.25 &&
    metrics.losers > 0
  ) {
    return {
      title: "Your Average Loss Is Larger Than Your Average Win",
      description: `Your average winner was ${formatMoney(metrics.averageWinner, true)}, while your average loser was ${formatMoney(-metrics.averageLoser)}.`,
      recommendation:
        "Cut losers sooner or let winners run long enough that one win covers a normal loss.",
    };
  }

  if (
    metrics.totalFees > Math.abs(metrics.totalNetPnl) &&
    metrics.totalFees > 0
  ) {
    return {
      title: "Fees Are Eating Into Your Results",
      description: `Total fees of ${formatMoney(metrics.totalFees)} are larger than your net result for this period.`,
      recommendation:
        "Only take trades whose target can pay for the full round-trip cost.",
    };
  }

  if (metrics.winRate < 45 && metrics.totalTrades >= 4) {
    return {
      title: "Your Current Win Rate Needs Improvement",
      description: `Your win rate is ${formatPercent(metrics.winRate)} across ${metrics.totalTrades} trades in ${getRangeLabel(selectedRange).toLowerCase()}.`,
      recommendation:
        "Trade fewer, clearer setups. Skip marginal entries during your weakest conditions.",
    };
  }

  return {
    title: "Keep Building Your Sample Size",
    description:
      "Your current trade count is still small, so TradeCoach is prioritizing risk-management habits first.",
    recommendation:
      "Track invalidation, average loss size, and whether you are trading your strongest direction.",
  };
}

export function generateFocusTasks(
  metrics: ImprovementPlanMetrics,
  worstDirection: DirectionSummary | null,
  worstTime: TimeSummary | null,
): FocusTask[] {
  const tasks: FocusTask[] = [
    {
      title: "Know the invalidation price",
      description:
        "Before entering, identify the price that proves the trade idea is wrong.",
      evidence:
        metrics.totalTrades > 0
          ? "Every graded session starts here because unclear exits show up in the data fast."
          : "Start here once you have trades to review.",
    },
  ];

  if (metrics.averageLoser > metrics.averageWinner) {
    tasks.push({
      title: "Reduce average loss size",
      description:
        "Keep one losing trade from erasing multiple winning trades.",
      evidence: `Avg winner ${formatMoney(metrics.averageWinner, true)} vs avg loser ${formatMoney(-metrics.averageLoser)}.`,
    });
  } else {
    tasks.push({
      title: "Protect average winner size",
      description:
        "Avoid closing every good trade before it has room to develop.",
      evidence: `Avg winner ${formatMoney(metrics.averageWinner, true)} vs avg loser ${formatMoney(-metrics.averageLoser)}.`,
    });
  }

  if (worstDirection && worstDirection.netPnl < 0) {
    tasks.push({
      title: `Review ${worstDirection.label.toLowerCase()} entries`,
      description: `${worstDirection.label} trades are currently your weaker direction.`,
      evidence: `${worstDirection.label} net P/L ${formatMoney(worstDirection.netPnl, true)} across ${worstDirection.trades} trade${worstDirection.trades === 1 ? "" : "s"}.`,
    });
  } else if (worstTime && worstTime.netPnl < 0) {
    tasks.push({
      title: `Be selective during the ${worstTime.label.toLowerCase()}`,
      description:
        "This time block is currently producing your weakest results.",
      evidence: `${worstTime.label} net P/L ${formatMoney(worstTime.netPnl, true)} across ${worstTime.trades} trade${worstTime.trades === 1 ? "" : "s"}.`,
    });
  } else {
    tasks.push({
      title: "Wait for your best location",
      description:
        "Avoid entering only because price is moving quickly.",
      evidence:
        metrics.totalTrades > 0
          ? "No single weak bucket stands out, so patience is the edge."
          : "Build the sample first, then tighten location rules.",
    });
  }

  return tasks.slice(0, 3);
}

export type ImprovementPlanContext = {
  range: ReportRange;
  rangeLabel: string;
  focusTasks: FocusTask[];
  mainOpportunity: CoachOpportunity;
  completedTitles: string[];
  focusCompletion: number;
};

export const IMPROVEMENT_PLAN_SESSION_KEY =
  "tradecoach-improvement-plan-context";

export function buildImprovementPlanCoachPrompt(
  context: ImprovementPlanContext,
): string {
  const taskLines = context.focusTasks
    .map((task, index) => {
      const done = context.completedTitles.includes(task.title)
        ? " (already checked off)"
        : "";

      return `${index + 1}. ${task.title}${done} — ${task.description} Data: ${task.evidence}`;
    })
    .join("\n");

  const completedSummary =
    context.completedTitles.length > 0
      ? `I've checked off ${context.completedTitles.length} of ${context.focusTasks.length} focus items (${context.focusCompletion}%).`
      : "I haven't checked any focus items off yet.";

  return [
    `I just reviewed my improvement plan for ${context.rangeLabel.toLowerCase()}.`,
    "",
    "Focus areas:",
    taskLines,
    "",
    completedSummary,
    `Biggest opportunity: ${context.mainOpportunity.title} — ${context.mainOpportunity.recommendation}`,
    "",
    "Help me turn this into a concrete plan for my next session: entry rules, invalidation rules, when to skip, and what to review after each trade.",
  ].join("\n");
}
