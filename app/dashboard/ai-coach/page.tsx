"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";

import AiCoachAvatarPicker, {
  useAiCoachAvatarPreference,
} from "@/components/ai-coach-avatar-picker";
import AiCoachVoiceButton from "@/components/ai-coach-voice-button";
import AiCoachVoiceCharacter from "@/components/ai-coach-voice-character";
import AiCoachVoicePicker, {
  useAiCoachVoicePreference,
} from "@/components/ai-coach-voice-picker";
import { useAiCoachVoiceSession } from "@/hooks/use-ai-coach-voice-session";
import {
  getAiCoachAvatarGender,
  getAiCoachAvatarOption,
  type AiCoachAvatarId,
} from "@/lib/ai-coach-avatars";
import {
  getDefaultAiCoachVoiceForGender,
  isAiCoachVoiceCompatibleWithGender,
  writeStoredAiCoachVoice,
} from "@/lib/ai-coach-voices";
import {
  buildImprovementPlanCoachPrompt,
  IMPROVEMENT_PLAN_SESSION_KEY,
  type ImprovementPlanContext,
} from "@/lib/improvement-plan";
import {
  buildPerformanceReportCoachPrompt,
  PERFORMANCE_REPORT_SESSION_KEY,
  type PerformanceReportCoachContext,
} from "@/lib/performance-report-article";
import {
  getTradeDisplayPnl,
  getTradeOutcomeStats,
  isAnalyzableTrade,
} from "@/lib/trade-pnl";
import { createBrowserClient } from "@supabase/ssr";

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

  account_external_id?: string | null;
  broker_account_external_id?: string | null;

  [key: string]: unknown;
};

type AnalysisRange = "week" | "30" | "all";

type InsightSeverity =
  | "Strength"
  | "High Priority"
  | "Needs Work"
  | "Watch";

type CoachInsight = {
  title: string;
  severity: InsightSeverity;
  description: string;
  recommendation: string;
};

type FocusTask = {
  title: string;
  description: string;
};

type ChatMessage = {
  role: "user" | "assistant";
  text: string;
};

type SavedCoachMessageRow = {
  role: "user" | "assistant";
  content: string;
  conversation_id: string;
  created_at: string;
};

type NewYorkDateParts = {
  year: number;
  month: number;
  day: number;
  dayNumber: number;
};

type GroupPerformance = {
  label: string;
  trades: number;
  wins: number;
  losses: number;
  netPnl: number;
  grossPnl: number;
  fees: number;
  winRate: number;
};

const NEW_YORK_TIME_ZONE = "America/New_York";
const MILLISECONDS_PER_DAY = 86_400_000;

const DEFAULT_COACH_GREETING =
  "I’m your TradeCoach AI. Ask me anything about trading—your real performance, NQ or MNQ, entries, stops, targets, risk, prop-firm rules, psychology, market structure, support and resistance, VWAP, liquidity, or trading plans.";

function createClient() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const supabasePublishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local",
    );
  }

  return createBrowserClient(
    supabaseUrl,
    supabasePublishableKey,
  );
}

function toNumber(value: unknown): number | null {
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
  const timestamp = getTradeTimestamp(trade);

  if (!timestamp) {
    return 0;
  }

  const value = new Date(timestamp).getTime();

  return Number.isFinite(value)
    ? value
    : 0;
}

function getTradeDurationSeconds(
  trade: BrokerCompletedTrade,
): number | null {
  if (!trade.entry_at || !trade.exit_at) {
    return null;
  }

  const entryTime = new Date(
    trade.entry_at,
  ).getTime();

  const exitTime = new Date(
    trade.exit_at,
  ).getTime();

  if (
    !Number.isFinite(entryTime) ||
    !Number.isFinite(exitTime) ||
    exitTime < entryTime
  ) {
    return null;
  }

  return Math.round(
    (exitTime - entryTime) / 1000,
  );
}

function getNewYorkDateParts(
  value: string | Date,
): NewYorkDateParts | null {
  const date =
    value instanceof Date
      ? value
      : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const formattedParts =
    new Intl.DateTimeFormat("en-US", {
      timeZone: NEW_YORK_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);

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
      Date.UTC(
        year,
        month - 1,
        day,
      ) / MILLISECONDS_PER_DAY,
  };
}

function getCurrentNewYorkDateParts(): NewYorkDateParts {
  const current =
    getNewYorkDateParts(new Date());

  if (current) {
    return current;
  }

  const date = new Date();

  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
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
  const date = new Date(
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

function isProcessedTrade(
  trade: BrokerCompletedTrade,
): boolean {
  return isAnalyzableTrade(trade);
}

function isTradeInsideRange(
  trade: BrokerCompletedTrade,
  range: AnalysisRange,
): boolean {
  if (range === "all") {
    return true;
  }

  const timestamp =
    getTradeTimestamp(trade);

  if (!timestamp) {
    return false;
  }

  const tradeDate =
    getNewYorkDateParts(timestamp);

  if (!tradeDate) {
    return false;
  }

  const currentDate =
    getCurrentNewYorkDateParts();

  if (range === "30") {
    return (
      tradeDate.dayNumber >=
      currentDate.dayNumber - 29
    );
  }

  const weekStart =
    getWeekStartDayNumber(currentDate);

  return (
    tradeDate.dayNumber >= weekStart &&
    tradeDate.dayNumber <=
      currentDate.dayNumber
  );
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
  if (!Number.isFinite(value)) {
    return "—";
  }

  return `${value.toFixed(0)}%`;
}

function formatDuration(
  seconds: number | null,
): string {
  if (
    seconds === null ||
    !Number.isFinite(seconds)
  ) {
    return "—";
  }

  const rounded =
    Math.max(0, Math.round(seconds));

  const hours =
    Math.floor(rounded / 3600);

  const minutes =
    Math.floor(
      (rounded % 3600) / 60,
    );

  const remainingSeconds =
    rounded % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }

  return `${remainingSeconds}s`;
}

function formatTradeDate(
  trade: BrokerCompletedTrade,
): string {
  const timestamp =
    getTradeTimestamp(trade);

  if (!timestamp) {
    return "Unknown date";
  }

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }

  return new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone: NEW_YORK_TIME_ZONE,
      month: "short",
      day: "numeric",
      year: "numeric",
    },
  ).format(date);
}

function getNewYorkHour(
  trade: BrokerCompletedTrade,
): number | null {
  const timestamp =
    getTradeTimestamp(trade);

  if (!timestamp) {
    return null;
  }

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const hourText =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone:
          NEW_YORK_TIME_ZONE,
        hour: "2-digit",
        hourCycle: "h23",
      },
    ).format(date);

  const hour = Number(hourText);

  return Number.isFinite(hour)
    ? hour
    : null;
}

function getTimeBucket(
  trade: BrokerCompletedTrade,
): string {
  const hour =
    getNewYorkHour(trade);

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

function getMoneyClass(
  value: unknown,
): string {
  const number = toNumber(value);

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

function getSeverityClasses(
  severity: InsightSeverity,
): string {
  if (severity === "Strength") {
    return "bg-emerald-500/10 text-emerald-400";
  }

  if (
    severity === "High Priority"
  ) {
    return "bg-rose-500/10 text-rose-400";
  }

  if (
    severity === "Needs Work"
  ) {
    return "bg-amber-500/10 text-amber-400";
  }

  return "bg-cyan-500/10 text-cyan-400";
}

function calculateGroupPerformance(
  label: string,
  trades: BrokerCompletedTrade[],
): GroupPerformance {
  const stats = getTradeOutcomeStats(trades);
  let grossPnl = 0;
  let fees = 0;

  for (const trade of trades) {
    grossPnl +=
      toNumber(trade.gross_pnl) ?? 0;

    fees +=
      Math.abs(
        toNumber(trade.fees) ?? 0,
      );
  }

  return {
    label,
    trades: stats.scoredTrades,
    wins: stats.winners,
    losses: stats.losers,
    netPnl: stats.totalPnl,
    grossPnl,
    fees,
    winRate: stats.winRate,
  };
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
    } else if (net < 0) {
      losingProfit += Math.abs(net);
    }
  }

  if (
    winningProfit === 0 &&
    losingProfit === 0
  ) {
    return null;
  }

  if (losingProfit === 0) {
    return Number.POSITIVE_INFINITY;
  }

  return winningProfit / losingProfit;
}

function formatProfitFactor(
  value: number | null,
): string {
  if (value === null) {
    return "—";
  }

  if (!Number.isFinite(value)) {
    return "∞";
  }

  return value.toFixed(2);
}

function getPerformanceGrade(
  score: number,
): string {
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

function getRangeLabel(
  range: AnalysisRange,
): string {
  if (range === "week") {
    return "This week";
  }

  if (range === "30") {
    return "Last 30 days";
  }

  return "All time";
}

export default function AICoachPage() {
  const searchParams = useSearchParams();
  const supabase = useMemo(
    () => createClient(),
    [],
  );
  const improvementPlanContextRef =
    useRef<ImprovementPlanContext | null>(null);
  const pendingImprovementPlanPromptRef =
    useRef<string | null>(null);
  const improvementPlanStartedRef =
    useRef(false);
  const performanceReportContextRef =
    useRef<PerformanceReportCoachContext | null>(null);
  const pendingPerformanceReportPromptRef =
    useRef<string | null>(null);
  const performanceReportStartedRef =
    useRef(false);

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
    analysisRange,
    setAnalysisRange,
  ] = useState<AnalysisRange>(
    "week",
  );

  const [
    completedFocusTasks,
    setCompletedFocusTasks,
  ] = useState<Set<number>>(
    new Set(),
  );

  const [
    chatInput,
    setChatInput,
  ] = useState("");

  const [
    chatLoading,
    setChatLoading,
  ] = useState(false);

  const [
    chatMessages,
    setChatMessages,
  ] = useState<ChatMessage[]>([]);

  const [
    chatUserId,
    setChatUserId,
  ] = useState<string | null>(null);

  const [
    conversationId,
    setConversationId,
  ] = useState<string | null>(null);

  const [
    chatHistoryLoading,
    setChatHistoryLoading,
  ] = useState(true);

  const [
    chatPersistenceError,
    setChatPersistenceError,
  ] = useState<string | null>(null);

  const chatViewportRef =
    useRef<HTMLDivElement | null>(null);

  const chatContentRef =
    useRef<HTMLDivElement | null>(null);

  const forceChatToBottom =
    useCallback(
      (
        behavior: ScrollBehavior = "auto",
      ) => {
        const viewport =
          chatViewportRef.current;

        if (!viewport) {
          return;
        }

        const scrollNow = () => {
          viewport.scrollTo({
            top:
              viewport.scrollHeight +
              1_000,
            behavior,
          });
        };

        scrollNow();

        requestAnimationFrame(() => {
          scrollNow();

          requestAnimationFrame(() => {
            scrollNow();
          });
        });

        window.setTimeout(
          scrollNow,
          50,
        );

        window.setTimeout(
          scrollNow,
          200,
        );
      },
      [],
    );

  useLayoutEffect(() => {
    forceChatToBottom("auto");
  }, [
    chatMessages.length,
    chatLoading,
    forceChatToBottom,
  ]);

  useEffect(() => {
    const content =
      chatContentRef.current;

    if (!content) {
      return;
    }

    const resizeObserver =
      new ResizeObserver(() => {
        forceChatToBottom("auto");
      });

    resizeObserver.observe(content);

    return () => {
      resizeObserver.disconnect();
    };
  }, [forceChatToBottom]);

  const saveCoachMessage = useCallback(
    async (
      userId: string,
      activeConversationId: string,
      role: "user" | "assistant",
      content: string,
    ): Promise<boolean> => {
      const { error } = await supabase
        .from("ai_coach_messages")
        .insert({
          user_id: userId,
          conversation_id:
            activeConversationId,
          role,
          content,
        });

      if (error) {
        console.error(
          "[TradeCoach AI] Could not save chat message:",
          error,
        );

        setChatPersistenceError(
          `The chat is working, but this message could not be saved: ${error.message}`,
        );

        return false;
      }

      setChatPersistenceError(null);
      return true;
    },
    [supabase],
  );

  const createFreshConversation = useCallback(
    async (
      userId: string,
    ): Promise<string | null> => {
      const newConversationId =
        crypto.randomUUID();

      const saved = await saveCoachMessage(
        userId,
        newConversationId,
        "assistant",
        DEFAULT_COACH_GREETING,
      );

      if (!saved) {
        return null;
      }

      setConversationId(
        newConversationId,
      );

      setChatMessages([
        {
          role: "assistant",
          text: DEFAULT_COACH_GREETING,
        },
      ]);

      setChatInput("");

      requestAnimationFrame(() => {
        forceChatToBottom("auto");
      });

      return newConversationId;
    },
    [
      forceChatToBottom,
      saveCoachMessage,
    ],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadSavedConversation() {
      setChatHistoryLoading(true);
      setChatPersistenceError(null);

      try {
        const {
          data: userData,
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) {
          throw userError;
        }

        const user = userData.user;

        if (!user) {
          throw new Error(
            "You must be signed in to save AI Coach conversations.",
          );
        }

        if (cancelled) {
          return;
        }

        setChatUserId(user.id);

        const {
          data: latestRows,
          error: latestError,
        } = await supabase
          .from("ai_coach_messages")
          .select("conversation_id")
          .eq("user_id", user.id)
          .order("created_at", {
            ascending: false,
          })
          .limit(1);

        if (latestError) {
          throw latestError;
        }

        const latestConversationId =
          latestRows?.[0]
            ?.conversation_id as
            | string
            | undefined;

        if (!latestConversationId) {
          await createFreshConversation(
            user.id,
          );
          return;
        }

        const {
          data: savedRows,
          error: messagesError,
        } = await supabase
          .from("ai_coach_messages")
          .select(
            "role, content, conversation_id, created_at",
          )
          .eq("user_id", user.id)
          .eq(
            "conversation_id",
            latestConversationId,
          )
          .order("created_at", {
            ascending: true,
          });

        if (messagesError) {
          throw messagesError;
        }

        if (cancelled) {
          return;
        }

        const restoredMessages = (
          (savedRows || []) as SavedCoachMessageRow[]
        )
          .filter(
            (row) =>
              (row.role === "user" ||
                row.role === "assistant") &&
              typeof row.content ===
                "string" &&
              row.content.trim().length > 0,
          )
          .map((row) => ({
            role: row.role,
            text: row.content,
          }));

        setConversationId(
          latestConversationId,
        );

        setChatMessages(
          restoredMessages.length > 0
            ? restoredMessages
            : [
                {
                  role: "assistant",
                  text:
                    DEFAULT_COACH_GREETING,
                },
              ],
        );
      } catch (error) {
        console.error(
          "[TradeCoach AI] Could not load saved chat:",
          error,
        );

        if (cancelled) {
          return;
        }

        const message =
          error instanceof Error
            ? error.message
            : "Could not load saved AI Coach messages.";

        setChatPersistenceError(message);

        setChatMessages([
          {
            role: "assistant",
            text: DEFAULT_COACH_GREETING,
          },
        ]);
      } finally {
        if (!cancelled) {
          setChatHistoryLoading(false);

          requestAnimationFrame(() => {
            forceChatToBottom("auto");
          });
        }
      }
    }

    void loadSavedConversation();

    return () => {
      cancelled = true;
    };
  }, [
    createFreshConversation,
    forceChatToBottom,
    supabase,
  ]);

  async function startNewChat() {
    if (
      !chatUserId ||
      chatLoading ||
      chatHistoryLoading
    ) {
      return;
    }

    setChatHistoryLoading(true);

    try {
      await createFreshConversation(
        chatUserId,
      );
    } finally {
      setChatHistoryLoading(false);
    }
  }

  async function clearCurrentChat() {
    if (
      !chatUserId ||
      !conversationId ||
      chatLoading ||
      chatHistoryLoading
    ) {
      return;
    }

    const confirmed = window.confirm(
      "Clear every message in this chat?",
    );

    if (!confirmed) {
      return;
    }

    setChatHistoryLoading(true);
    setChatPersistenceError(null);

    try {
      const { error: deleteError } =
        await supabase
          .from("ai_coach_messages")
          .delete()
          .eq("user_id", chatUserId)
          .eq(
            "conversation_id",
            conversationId,
          );

      if (deleteError) {
        throw deleteError;
      }

      const saved =
        await saveCoachMessage(
          chatUserId,
          conversationId,
          "assistant",
          DEFAULT_COACH_GREETING,
        );

      if (!saved) {
        return;
      }

      setChatMessages([
        {
          role: "assistant",
          text: DEFAULT_COACH_GREETING,
        },
      ]);

      setChatInput("");
    } catch (error) {
      console.error(
        "[TradeCoach AI] Could not clear chat:",
        error,
      );

      setChatPersistenceError(
        error instanceof Error
          ? error.message
          : "Could not clear this chat.",
      );
    } finally {
      setChatHistoryLoading(false);

      requestAnimationFrame(() => {
        forceChatToBottom("auto");
      });
    }
  }

  const loadTrades = useCallback(
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
          .limit(2000);

        if (error) {
          throw error;
        }

        const sortedTrades = [
          ...((data ||
            []) as BrokerCompletedTrade[]),
        ].sort(
          (
            firstTrade,
            secondTrade,
          ) =>
            getTradeTimestampValue(
              secondTrade,
            ) -
            getTradeTimestampValue(
              firstTrade,
            ),
        );

        setAllTrades(sortedTrades);
      } catch (error) {
        console.error(
          "[TradeCoach AI] Could not load trades:",
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

    const channel = supabase
      .channel(
        "tradecoach-ai-trades",
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

  const analyzedTrades =
    useMemo(
      () =>
        processedTrades.filter(
          (trade) =>
            isTradeInsideRange(
              trade,
              analysisRange,
            ),
        ),
      [
        processedTrades,
        analysisRange,
      ],
    );

  const metrics = useMemo(() => {
    const stats = getTradeOutcomeStats(analyzedTrades);
    let totalGrossPnl = 0;
    let totalFees = 0;

    let winnerTotal = 0;
    let loserTotal = 0;

    let winnerDurationTotal = 0;
    let winnerDurationCount = 0;

    let loserDurationTotal = 0;
    let loserDurationCount = 0;

    let largestWin = 0;
    let largestLoss = 0;

    let largestWinTrade:
      | BrokerCompletedTrade
      | null = null;

    let largestLossTrade:
      | BrokerCompletedTrade
      | null = null;

    for (
      const trade of
      analyzedTrades
    ) {
      const net = getTradeDisplayPnl(trade);

      if (net === null) {
        continue;
      }

      const gross =
        toNumber(
          trade.gross_pnl,
        ) ?? 0;

      const fees =
        Math.abs(
          toNumber(
            trade.fees,
          ) ?? 0,
        );

      const duration =
        getTradeDurationSeconds(
          trade,
        );

      totalGrossPnl += gross;
      totalFees += fees;

      if (net > 0) {
        winnerTotal += net;

        if (
          net > largestWin
        ) {
          largestWin = net;
          largestWinTrade =
            trade;
        }

        if (
          duration !== null
        ) {
          winnerDurationTotal +=
            duration;

          winnerDurationCount += 1;
        }
      } else if (net < 0) {
        loserTotal +=
          Math.abs(net);

        if (
          net < largestLoss
        ) {
          largestLoss = net;
          largestLossTrade =
            trade;
        }

        if (
          duration !== null
        ) {
          loserDurationTotal +=
            duration;

          loserDurationCount += 1;
        }
      }
    }

    const totalTrades = stats.scoredTrades;
    const winRate = stats.winRate;

    const averageWinner =
      stats.winners > 0
        ? winnerTotal /
          stats.winners
        : 0;

    const averageLoser =
      stats.losers > 0
        ? loserTotal /
          stats.losers
        : 0;

    const averageTrade =
      totalTrades > 0
        ? stats.totalPnl /
          totalTrades
        : 0;

    const averageWinnerDuration =
      winnerDurationCount > 0
        ? winnerDurationTotal /
          winnerDurationCount
        : null;

    const averageLoserDuration =
      loserDurationCount > 0
        ? loserDurationTotal /
          loserDurationCount
        : null;

    const riskReward =
      averageLoser > 0
        ? averageWinner /
          averageLoser
        : averageWinner > 0
          ? Number.POSITIVE_INFINITY
          : null;

    const profitFactor =
      calculateProfitFactor(
        analyzedTrades,
      );

    let performanceScore = 50;

    if (totalTrades === 0) {
      performanceScore = 0;
    } else {
      if (stats.totalPnl > 0) {
        performanceScore += 12;
      } else if (
        stats.totalPnl < 0
      ) {
        performanceScore -= 12;
      }

      if (winRate >= 65) {
        performanceScore += 15;
      } else if (
        winRate >= 55
      ) {
        performanceScore += 10;
      } else if (
        winRate >= 45
      ) {
        performanceScore += 3;
      } else {
        performanceScore -= 10;
      }

      if (
        profitFactor !== null &&
        !Number.isFinite(
          profitFactor,
        )
      ) {
        performanceScore += 18;
      } else if (
        profitFactor !== null &&
        profitFactor >= 2
      ) {
        performanceScore += 18;
      } else if (
        profitFactor !== null &&
        profitFactor >= 1.5
      ) {
        performanceScore += 12;
      } else if (
        profitFactor !== null &&
        profitFactor >= 1
      ) {
        performanceScore += 4;
      } else {
        performanceScore -= 10;
      }

      if (
        riskReward !== null &&
        riskReward >= 1.5
      ) {
        performanceScore += 10;
      } else if (
        riskReward !== null &&
        riskReward >= 1
      ) {
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
      Math.min(
        100,
        Math.round(
          performanceScore,
        ),
      ),
    );

    return {
      totalTrades,
      totalNetPnl: stats.totalPnl,
      totalGrossPnl,
      totalFees,

      winners: stats.winners,
      losers: stats.losers,
      breakeven: stats.breakeven,

      winRate,
      averageWinner,
      averageLoser,
      averageTrade,

      averageWinnerDuration,
      averageLoserDuration,

      largestWin,
      largestLoss,
      largestWinTrade,
      largestLossTrade,

      riskReward,
      profitFactor,

      performanceScore,
      performanceGrade:
        totalTrades > 0
          ? getPerformanceGrade(
              performanceScore,
            )
          : "—",
    };
  }, [analyzedTrades]);

  const directionPerformance =
    useMemo(() => {
      const longTrades =
        analyzedTrades.filter(
          (trade) =>
            String(
              trade.direction ||
                "",
            ).toLowerCase() ===
            "long",
        );

      const shortTrades =
        analyzedTrades.filter(
          (trade) =>
            String(
              trade.direction ||
                "",
            ).toLowerCase() ===
            "short",
        );

      return {
        long:
          calculateGroupPerformance(
            "Long",
            longTrades,
          ),

        short:
          calculateGroupPerformance(
            "Short",
            shortTrades,
          ),
      };
    }, [analyzedTrades]);

  const symbolPerformance =
    useMemo(() => {
      const groups = new Map<
        string,
        BrokerCompletedTrade[]
      >();

      for (
        const trade of
        analyzedTrades
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
            calculateGroupPerformance(
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
    }, [analyzedTrades]);

  const timePerformance =
    useMemo(() => {
      const groups = new Map<
        string,
        BrokerCompletedTrade[]
      >();

      for (
        const trade of
        analyzedTrades
      ) {
        const bucket =
          getTimeBucket(trade);

        const existing =
          groups.get(bucket) ||
          [];

        existing.push(trade);
        groups.set(
          bucket,
          existing,
        );
      }

      return Array.from(
        groups.entries(),
      )
        .map(
          ([
            bucket,
            trades,
          ]) =>
            calculateGroupPerformance(
              bucket,
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
    }, [analyzedTrades]);

  const bestDirection =
    useMemo(() => {
      const candidates = [
        directionPerformance.long,
        directionPerformance.short,
      ].filter(
        (item) =>
          item.trades > 0,
      );

      if (
        candidates.length === 0
      ) {
        return null;
      }

      return [...candidates].sort(
        (
          first,
          second,
        ) =>
          second.netPnl -
          first.netPnl,
      )[0];
    }, [directionPerformance]);

  const worstDirection =
    useMemo(() => {
      const candidates = [
        directionPerformance.long,
        directionPerformance.short,
      ].filter(
        (item) =>
          item.trades > 0,
      );

      if (
        candidates.length === 0
      ) {
        return null;
      }

      return [...candidates].sort(
        (
          first,
          second,
        ) =>
          first.netPnl -
          second.netPnl,
      )[0];
    }, [directionPerformance]);

  const bestSymbol =
    symbolPerformance[0] ||
    null;

  const worstSymbol =
    symbolPerformance.length > 0
      ? symbolPerformance[
          symbolPerformance.length -
            1
        ]
      : null;

  const bestTime =
    timePerformance[0] ||
    null;

  const worstTime =
    timePerformance.length > 0
      ? timePerformance[
          timePerformance.length -
            1
        ]
      : null;

  const mainOpportunity =
    useMemo(() => {
      if (
        metrics.totalTrades === 0
      ) {
        return {
          title:
            "Complete More Trades to Build Your Analysis",
          description:
            "TradeCoach needs processed Tradovate trades in the selected date range before it can identify a reliable performance pattern.",
          recommendation:
            "Complete a full entry and exit in Tradovate, then refresh this page. The new trade will also update automatically when Supabase realtime is enabled.",
        };
      }

      if (
        metrics.averageLoserDuration !==
          null &&
        metrics.averageWinnerDuration !==
          null &&
        metrics.losers >= 2 &&
        metrics.averageLoserDuration >
          metrics.averageWinnerDuration *
            1.25
      ) {
        const differencePercent =
          Math.round(
            ((metrics.averageLoserDuration -
              metrics.averageWinnerDuration) /
              metrics.averageWinnerDuration) *
              100,
          );

        return {
          title:
            "Losing Trades Are Being Held Longer",
          description:
            `Your losing trades were held about ${differencePercent}% longer than your winning trades during this period. Longer losing trades can allow small mistakes to become larger losses.`,
          recommendation:
            "Define the invalidation price before entering. Do not remain in a trade only because you hope it will reverse.",
        };
      }

      if (
        metrics.averageLoser >
          metrics.averageWinner *
            1.25 &&
        metrics.losers > 0
      ) {
        return {
          title:
            "Your Average Loss Is Larger Than Your Average Win",
          description:
            `Your average winner was ${formatMoney(
              metrics.averageWinner,
              {
                showPlus: true,
              },
            )}, while your average loser was ${formatMoney(
              -metrics.averageLoser,
            )}. Your winners currently need a higher win rate to overcome that difference.`,
          recommendation:
            "Reduce the size of losing trades or allow strong winning trades enough room to reach a larger target.",
        };
      }

      if (
        metrics.totalFees >
          Math.abs(
            metrics.totalNetPnl,
          ) &&
        metrics.totalFees > 0
      ) {
        return {
          title:
            "Trading Fees Are Consuming Your Results",
          description:
            `You paid ${formatMoney(
              metrics.totalFees,
              {
                fee: true,
              },
            )} in fees while producing ${formatMoney(
              metrics.totalNetPnl,
              {
                showPlus: true,
              },
            )} in net results.`,
          recommendation:
            "Avoid repeatedly entering and exiting for very small moves that do not comfortably cover the round-trip fee.",
        };
      }

      if (
        metrics.winRate < 45 &&
        metrics.totalTrades >= 4
      ) {
        return {
          title:
            "Your Current Win Rate Needs Improvement",
          description:
            `You won ${metrics.winners} of ${metrics.totalTrades} trades for a ${formatPercent(
              metrics.winRate,
            )} win rate during this period.`,
          recommendation:
            "Reduce lower-quality trades and wait for setups with clearer trend, location, and confirmation.",
        };
      }

      if (
        worstDirection &&
        bestDirection &&
        worstDirection.label !==
          bestDirection.label &&
        worstDirection.netPnl < 0
      ) {
        return {
          title:
            `${worstDirection.label} Trades Are Underperforming`,
          description:
            `${worstDirection.label} trades produced ${formatMoney(
              worstDirection.netPnl,
            )}, compared with ${formatMoney(
              bestDirection.netPnl,
              {
                showPlus: true,
              },
            )} from ${bestDirection.label.toLowerCase()} trades.`,
          recommendation:
            `Review your ${worstDirection.label.toLowerCase()} entries before taking more of them. Look for a clear location and trend confirmation.`,
        };
      }

      return {
        title:
          "Protect Your Current Trading Edge",
        description:
          `Your current period shows ${formatMoney(
            metrics.totalNetPnl,
            {
              showPlus: true,
            },
          )} in net P/L with a ${formatPercent(
            metrics.winRate,
          )} win rate and a ${formatProfitFactor(
            metrics.profitFactor,
          )} profit factor.`,
        recommendation:
          "Continue using the setups producing your strongest results and avoid increasing risk simply because the recent period is profitable.",
      };
    }, [
      metrics,
      bestDirection,
      worstDirection,
    ]);

  const insights =
    useMemo<CoachInsight[]>(() => {
      if (
        metrics.totalTrades === 0
      ) {
        return [
          {
            title:
              "Waiting for Processed Trades",
            severity: "Watch",
            description:
              "There are no processed trades in the selected date range.",
            recommendation:
              "Select a wider date range or complete another Tradovate trade.",
          },
        ];
      }

      const generatedInsights: CoachInsight[] =
        [];

      if (bestDirection) {
        generatedInsights.push({
          title:
            `${bestDirection.label} Performance`,
          severity:
            bestDirection.netPnl > 0
              ? "Strength"
              : "Needs Work",
          description:
            `${bestDirection.label} trades produced ${formatMoney(
              bestDirection.netPnl,
              {
                showPlus: true,
              },
            )} across ${bestDirection.trades} trade${
              bestDirection.trades === 1
                ? ""
                : "s"
            }, with a ${formatPercent(
              bestDirection.winRate,
            )} win rate.`,
          recommendation:
            bestDirection.netPnl > 0
              ? `Continue reviewing what made your ${bestDirection.label.toLowerCase()} entries successful.`
              : `Use additional confirmation before taking more ${bestDirection.label.toLowerCase()} trades.`,
        });
      }

      if (bestTime) {
        generatedInsights.push({
          title:
            `${bestTime.label} Trading`,
          severity:
            bestTime.netPnl > 0
              ? "Strength"
              : "Watch",
          description:
            `${bestTime.label} was your strongest time block, producing ${formatMoney(
              bestTime.netPnl,
              {
                showPlus: true,
              },
            )} across ${bestTime.trades} trade${
              bestTime.trades === 1
                ? ""
                : "s"
            }.`,
          recommendation:
            bestTime.netPnl > 0
              ? `Give priority to your highest-quality ${bestTime.label.toLowerCase()} setups.`
              : "More trades are needed before relying heavily on this time-of-day pattern.",
        });
      }

      if (
        worstTime &&
        bestTime &&
        worstTime.label !==
          bestTime.label
      ) {
        generatedInsights.push({
          title:
            `${worstTime.label} Needs Review`,
          severity:
            worstTime.netPnl < 0
              ? "High Priority"
              : "Watch",
          description:
            `${worstTime.label} produced ${formatMoney(
              worstTime.netPnl,
              {
                showPlus: true,
              },
            )} across ${worstTime.trades} trade${
              worstTime.trades === 1
                ? ""
                : "s"
            }.`,
          recommendation:
            worstTime.netPnl < 0
              ? `Consider reducing trades during the ${worstTime.label.toLowerCase()} until you identify why they are underperforming.`
              : "Continue collecting data before making a major schedule change.",
        });
      }

      if (metrics.totalFees > 0) {
        const feePerTrade =
          metrics.totalFees /
          metrics.totalTrades;

        generatedInsights.push({
          title:
            "Fee Impact",
          severity:
            metrics.totalFees >
            Math.abs(
              metrics.totalNetPnl,
            )
              ? "High Priority"
              : "Watch",
          description:
            `Fees totaled ${formatMoney(
              metrics.totalFees,
              {
                fee: true,
              },
            )}, averaging ${formatMoney(
              feePerTrade,
              {
                fee: true,
              },
            )} per completed trade.`,
          recommendation:
            "Make sure each planned target offers enough profit potential to cover the full round-trip cost.",
        });
      }

      if (
        metrics.averageWinnerDuration !==
          null &&
        metrics.averageLoserDuration !==
          null
      ) {
        generatedInsights.push({
          title:
            "Trade Duration",
          severity:
            metrics.averageLoserDuration >
            metrics.averageWinnerDuration *
              1.25
              ? "Needs Work"
              : "Strength",
          description:
            `Average winning trades lasted ${formatDuration(
              metrics.averageWinnerDuration,
            )}, while average losing trades lasted ${formatDuration(
              metrics.averageLoserDuration,
            )}.`,
          recommendation:
            metrics.averageLoserDuration >
            metrics.averageWinnerDuration *
              1.25
              ? "Review whether hesitation is keeping you in losing trades after the original idea has failed."
              : "Your trade durations do not currently show a major tendency to hold losers longer.",
        });
      }

      return generatedInsights.slice(
        0,
        3,
      );
    }, [
      metrics,
      bestDirection,
      bestTime,
      worstTime,
    ]);

  const focusTasks =
    useMemo<FocusTask[]>(() => {
      const tasks: FocusTask[] =
        [];

      tasks.push({
        title:
          "Know the invalidation price",
        description:
          "Before entering, identify the price that proves the trade idea is wrong.",
      });

      if (
        metrics.averageLoser >
        metrics.averageWinner
      ) {
        tasks.push({
          title:
            "Reduce average loss size",
          description:
            "Keep one losing trade from erasing multiple winning trades.",
        });
      } else {
        tasks.push({
          title:
            "Protect average winner size",
          description:
            "Avoid closing every good trade before it has room to develop.",
        });
      }

      if (
        worstDirection &&
        worstDirection.netPnl < 0
      ) {
        tasks.push({
          title:
            `Review ${worstDirection.label.toLowerCase()} entries`,
          description:
            `${worstDirection.label} trades are currently your weaker direction.`,
        });
      } else if (
        worstTime &&
        worstTime.netPnl < 0
      ) {
        tasks.push({
          title:
            `Be selective during the ${worstTime.label.toLowerCase()}`,
          description:
            "This time block is currently producing your weakest results.",
        });
      } else {
        tasks.push({
          title:
            "Wait for your best location",
          description:
            "Avoid entering only because price is moving quickly.",
        });
      }

      return tasks.slice(0, 3);
    }, [
      metrics,
      worstDirection,
      worstTime,
    ]);

  const focusTasksKey =
    focusTasks
      .map(
        (task) =>
          task.title,
      )
      .join("|");

  useEffect(() => {
    setCompletedFocusTasks(
      new Set(),
    );
  }, [focusTasksKey]);

  const coachingHistory =
    useMemo(() => {
      const grouped = new Map<
        string,
        BrokerCompletedTrade[]
      >();

      for (
        const trade of
        processedTrades
      ) {
        const date =
          formatTradeDate(trade);

        const existing =
          grouped.get(date) ||
          [];

        existing.push(trade);

        grouped.set(
          date,
          existing,
        );
      }

      return Array.from(
        grouped.entries(),
      )
        .map(
          ([
            date,
            trades,
          ]) => {
            const performance =
              calculateGroupPerformance(
                date,
                trades,
              );

            let title =
              "Mixed Trading Session";

            if (
              performance.netPnl > 0
            ) {
              title =
                "Profitable Trading Session";
            } else if (
              performance.netPnl < 0
            ) {
              title =
                "Losing Trading Session";
            }

            return {
              date,
              title,
              summary:
                `${performance.trades} trade${
                  performance.trades === 1
                    ? ""
                    : "s"
                } · ${performance.wins} win${
                  performance.wins === 1
                    ? ""
                    : "s"
                } · ${performance.losses} loss${
                  performance.losses === 1
                    ? ""
                    : "es"
                } · Net ${formatMoney(
                  performance.netPnl,
                  {
                    showPlus: true,
                  },
                )}`,
              newestTimestamp:
                Math.max(
                  ...trades.map(
                    getTradeTimestampValue,
                  ),
                ),
            };
          },
        )
        .sort(
          (
            first,
            second,
          ) =>
            second.newestTimestamp -
            first.newestTimestamp,
        )
        .slice(0, 6);
    }, [processedTrades]);

  const weeklyCompletion =
    focusTasks.length > 0
      ? Math.round(
          (completedFocusTasks.size /
            focusTasks.length) *
            100,
        )
      : 0;

  const tradingContext = useMemo(() => {
    const recentTrades = analyzedTrades
      .slice(0, 30)
      .map((trade) => ({
        symbol: trade.symbol || null,
        direction: trade.direction || null,
        quantity: toNumber(trade.quantity),
        entryPrice: toNumber(trade.entry_price),
        exitPrice: toNumber(trade.exit_price),
        grossPnl: toNumber(trade.gross_pnl),
        fees: toNumber(trade.fees),
        netPnl: toNumber(trade.net_pnl),
        entryAt: trade.entry_at || null,
        exitAt: trade.exit_at || null,
        duration: formatDuration(
          getTradeDurationSeconds(trade),
        ),
        accountId:
          trade.account_external_id ||
          trade.broker_account_external_id ||
          null,
      }));

    return {
      selectedAnalysisPeriod: getRangeLabel(analysisRange),
      summary: {
        totalTrades: metrics.totalTrades,
        wins: metrics.winners,
        losses: metrics.losers,
        breakeven: metrics.breakeven,
        winRate: formatPercent(metrics.winRate),
        grossPnl: formatMoney(metrics.totalGrossPnl, {
          showPlus: true,
        }),
        totalFees: formatMoney(metrics.totalFees, {
          fee: true,
        }),
        netPnl: formatMoney(metrics.totalNetPnl, {
          showPlus: true,
        }),
        averageWinner: formatMoney(metrics.averageWinner, {
          showPlus: true,
        }),
        averageLoser: formatMoney(-metrics.averageLoser),
        averageTrade: formatMoney(metrics.averageTrade, {
          showPlus: true,
        }),
        profitFactor: formatProfitFactor(metrics.profitFactor),
        averageWinnerDuration: formatDuration(
          metrics.averageWinnerDuration,
        ),
        averageLoserDuration: formatDuration(
          metrics.averageLoserDuration,
        ),
        largestWin: formatMoney(metrics.largestWin, {
          showPlus: true,
        }),
        largestLoss: formatMoney(metrics.largestLoss),
      },
      directionPerformance: {
        long: directionPerformance.long,
        short: directionPerformance.short,
      },
      strongestDirection: bestDirection,
      weakestDirection: worstDirection,
      strongestSymbol: bestSymbol,
      weakestSymbol: worstSymbol,
      strongestTimeOfDay: bestTime,
      weakestTimeOfDay: worstTime,
      currentCoachFinding: mainOpportunity,
      improvementPlan: improvementPlanContextRef.current
        ? {
            analysisPeriod:
              improvementPlanContextRef.current.rangeLabel,
            focusTasks: improvementPlanContextRef.current.focusTasks,
            completedTitles:
              improvementPlanContextRef.current.completedTitles,
            focusCompletion:
              improvementPlanContextRef.current.focusCompletion,
            biggestOpportunity:
              improvementPlanContextRef.current.mainOpportunity,
          }
        : {
            analysisPeriod: getRangeLabel(analysisRange),
            focusTasks,
            completedTitles: focusTasks
              .filter((_, index) => completedFocusTasks.has(index))
              .map((task) => task.title),
            focusCompletion: weeklyCompletion,
            biggestOpportunity: mainOpportunity,
          },
      performanceReport: performanceReportContextRef.current
        ? {
            reportType: performanceReportContextRef.current.type,
            title: performanceReportContextRef.current.title,
            periodLabel: performanceReportContextRef.current.periodLabel,
            grade: performanceReportContextRef.current.grade,
            intro: performanceReportContextRef.current.intro,
            strengths: performanceReportContextRef.current.strengths,
            improvements: performanceReportContextRef.current.improvements,
            nextFocus: performanceReportContextRef.current.nextFocus,
            stats: performanceReportContextRef.current.stats,
          }
        : null,
      recentCompletedTrades: recentTrades,
      limitations: [
        "Broker fills do not contain chart screenshots.",
        "Broker fills do not confirm VWAP location.",
        "Broker fills do not confirm support or resistance.",
        "Broker fills do not identify the trader's intended setup unless separately recorded.",
        "There is no live market feed attached to this chat.",
      ],
    };
  }, [
    analysisRange,
    analyzedTrades,
    bestDirection,
    bestSymbol,
    bestTime,
    completedFocusTasks,
    directionPerformance,
    focusTasks,
    mainOpportunity,
    metrics,
    weeklyCompletion,
    worstDirection,
    worstSymbol,
    worstTime,
  ]);

  const handleVoiceTranscript = useCallback(
    async (role: "user" | "assistant", text: string) => {
      setChatMessages((current) => [
        ...current,
        {
          role,
          text,
        },
      ]);

      if (chatUserId && conversationId) {
        await saveCoachMessage(
          chatUserId,
          conversationId,
          role,
          text,
        );
      }

      requestAnimationFrame(() => {
        forceChatToBottom("auto");
      });
    },
    [
      chatUserId,
      conversationId,
      forceChatToBottom,
      saveCoachMessage,
    ],
  );

  const { selectedAvatar: selectedCoachAvatar, setSelectedAvatar: setSelectedCoachAvatar } =
    useAiCoachAvatarPreference();
  const selectedCoachAvatarOption =
    getAiCoachAvatarOption(selectedCoachAvatar);
  const selectedCoachAvatarGender = getAiCoachAvatarGender(
    selectedCoachAvatar,
  );

  const { selectedVoice: selectedCoachVoice, setSelectedVoice: setSelectedCoachVoice } =
    useAiCoachVoicePreference(selectedCoachAvatarGender);

  function handleCoachAvatarChange(avatarId: AiCoachAvatarId) {
    setSelectedCoachAvatar(avatarId);

    const avatarGender = getAiCoachAvatarGender(avatarId);

    if (
      !isAiCoachVoiceCompatibleWithGender(
        selectedCoachVoice,
        avatarGender,
      )
    ) {
      const nextVoice =
        getDefaultAiCoachVoiceForGender(avatarGender);
      writeStoredAiCoachVoice(nextVoice);
      setSelectedCoachVoice(nextVoice);
    }
  }

  const voiceSession = useAiCoachVoiceSession({
    disabled:
      chatHistoryLoading ||
      !chatUserId ||
      chatLoading,
    tradingContext,
    voice: selectedCoachVoice,
    onTranscript: (role, text) => {
      void handleVoiceTranscript(role, text);
    },
  });

  function toggleFocusTask(
    index: number,
  ) {
    setCompletedFocusTasks(
      (current) => {
        const updated =
          new Set(current);

        if (
          updated.has(index)
        ) {
          updated.delete(index);
        } else {
          updated.add(index);
        }

        return updated;
      },
    );
  }

  function answerCoachQuestion(
    question: string,
  ): string {
    const normalized =
      question
        .trim()
        .toLowerCase();

    if (
      metrics.totalTrades === 0
    ) {
      return `There are no processed trades in ${getRangeLabel(
        analysisRange,
      ).toLowerCase()}. Select a wider date range or complete another trade.`;
    }

    if (
      normalized.includes(
        "setup",
      ) ||
      normalized.includes(
        "vwap",
      ) ||
      normalized.includes(
        "support",
      ) ||
      normalized.includes(
        "resistance",
      )
    ) {
      return "I cannot verify setup type, VWAP position, support, or resistance from broker fills alone. To analyze those accurately, TradeCoach must also save strategy tags or market-context data with each trade.";
    }

    if (
      normalized.includes(
        "win rate",
      ) ||
      normalized.includes(
        "winning percentage",
      )
    ) {
      return `Your win rate for ${getRangeLabel(
        analysisRange,
      ).toLowerCase()} is ${formatPercent(
        metrics.winRate,
      )}: ${metrics.winners} wins from ${metrics.totalTrades} completed trades.`;
    }

    if (
      normalized.includes(
        "fee",
      ) ||
      normalized.includes(
        "commission",
      )
    ) {
      return `You paid ${formatMoney(
        metrics.totalFees,
        {
          fee: true,
        },
      )} in total fees, averaging ${formatMoney(
        metrics.totalFees /
          metrics.totalTrades,
        {
          fee: true,
        },
      )} per completed trade.`;
    }

    if (
      normalized.includes(
        "long",
      ) ||
      normalized.includes(
        "short",
      ) ||
      normalized.includes(
        "direction",
      )
    ) {
      return `Long trades: ${directionPerformance.long.trades} trades, ${formatPercent(
        directionPerformance.long.winRate,
      )} win rate, net ${formatMoney(
        directionPerformance.long.netPnl,
        {
          showPlus: true,
        },
      )}. Short trades: ${directionPerformance.short.trades} trades, ${formatPercent(
        directionPerformance.short.winRate,
      )} win rate, net ${formatMoney(
        directionPerformance.short.netPnl,
        {
          showPlus: true,
        },
      )}.`;
    }

    if (
      normalized.includes(
        "best time",
      ) ||
      normalized.includes(
        "time of day",
      )
    ) {
      if (!bestTime) {
        return "There is not enough time-of-day data yet.";
      }

      return `${bestTime.label} is currently your best time block, producing ${formatMoney(
        bestTime.netPnl,
        {
          showPlus: true,
        },
      )} across ${bestTime.trades} trades with a ${formatPercent(
        bestTime.winRate,
      )} win rate.`;
    }

    if (
      normalized.includes(
        "worst time",
      )
    ) {
      if (!worstTime) {
        return "There is not enough time-of-day data yet.";
      }

      return `${worstTime.label} is currently your weakest time block, producing ${formatMoney(
        worstTime.netPnl,
        {
          showPlus: true,
        },
      )} across ${worstTime.trades} trades.`;
    }

    if (
      normalized.includes(
        "best symbol",
      ) ||
      normalized.includes(
        "best market",
      )
    ) {
      if (!bestSymbol) {
        return "There is not enough symbol data yet.";
      }

      return `${bestSymbol.label} is currently your strongest symbol, producing ${formatMoney(
        bestSymbol.netPnl,
        {
          showPlus: true,
        },
      )} across ${bestSymbol.trades} trades with a ${formatPercent(
        bestSymbol.winRate,
      )} win rate.`;
    }

    if (
      normalized.includes(
        "worst symbol",
      )
    ) {
      if (!worstSymbol) {
        return "There is not enough symbol data yet.";
      }

      return `${worstSymbol.label} is currently your weakest symbol, producing ${formatMoney(
        worstSymbol.netPnl,
        {
          showPlus: true,
        },
      )} across ${worstSymbol.trades} trades.`;
    }

    if (
      normalized.includes(
        "average winner",
      ) ||
      normalized.includes(
        "average win",
      )
    ) {
      return `Your average winning trade is ${formatMoney(
        metrics.averageWinner,
        {
          showPlus: true,
        },
      )}.`;
    }

    if (
      normalized.includes(
        "average loser",
      ) ||
      normalized.includes(
        "average loss",
      )
    ) {
      return `Your average losing trade is ${formatMoney(
        -metrics.averageLoser,
      )}.`;
    }

    if (
      normalized.includes(
        "biggest win",
      ) ||
      normalized.includes(
        "largest win",
      )
    ) {
      if (
        !metrics.largestWinTrade
      ) {
        return "There are no winning trades in the selected period.";
      }

      return `Your largest win was ${formatMoney(
        metrics.largestWin,
        {
          showPlus: true,
        },
      )} on ${metrics.largestWinTrade.symbol || "an unknown symbol"} on ${formatTradeDate(
        metrics.largestWinTrade,
      )}.`;
    }

    if (
      normalized.includes(
        "biggest loss",
      ) ||
      normalized.includes(
        "largest loss",
      )
    ) {
      if (
        !metrics.largestLossTrade
      ) {
        return "There are no losing trades in the selected period.";
      }

      return `Your largest loss was ${formatMoney(
        metrics.largestLoss,
      )} on ${metrics.largestLossTrade.symbol || "an unknown symbol"} on ${formatTradeDate(
        metrics.largestLossTrade,
      )}.`;
    }

    if (
      normalized.includes(
        "duration",
      ) ||
      normalized.includes(
        "hold",
      )
    ) {
      return `Winning trades lasted an average of ${formatDuration(
        metrics.averageWinnerDuration,
      )}. Losing trades lasted an average of ${formatDuration(
        metrics.averageLoserDuration,
      )}.`;
    }

    if (
      normalized.includes(
        "profit factor",
      )
    ) {
      return `Your profit factor is ${formatProfitFactor(
        metrics.profitFactor,
      )} for the selected period.`;
    }

    if (
      normalized.includes(
        "how much",
      ) ||
      normalized.includes(
        "profit",
      ) ||
      normalized.includes(
        "made",
      ) ||
      normalized.includes(
        "p/l",
      )
    ) {
      return `For ${getRangeLabel(
        analysisRange,
      ).toLowerCase()}, your gross P/L is ${formatMoney(
        metrics.totalGrossPnl,
        {
          showPlus: true,
        },
      )}, fees are ${formatMoney(
        metrics.totalFees,
        {
          fee: true,
        },
      )}, and final net P/L is ${formatMoney(
        metrics.totalNetPnl,
        {
          showPlus: true,
        },
      )}.`;
    }

    return `For ${getRangeLabel(
      analysisRange,
    ).toLowerCase()}, you have ${metrics.totalTrades} completed trades, a ${formatPercent(
      metrics.winRate,
    )} win rate, ${formatMoney(
      metrics.totalNetPnl,
      {
        showPlus: true,
      },
    )} net P/L, and a ${formatProfitFactor(
      metrics.profitFactor,
    )} profit factor. Your biggest current opportunity is: ${mainOpportunity.title}.`;
  }

  async function sendChatMessage(
    overrideQuestion?: string,
  ) {
    const question = (
      overrideQuestion ?? chatInput
    ).trim();

    if (
      !question ||
      chatLoading ||
      chatHistoryLoading ||
      !chatUserId ||
      !conversationId
    ) {
      return;
    }

    const activeUserId =
      chatUserId;

    const activeConversationId =
      conversationId;

    const userMessage: ChatMessage = {
      role: "user",
      text: question,
    };

    const outgoingMessages: ChatMessage[] =
      [
        ...chatMessages,
        userMessage,
      ];

    setChatMessages(
      outgoingMessages,
    );

    setChatInput("");

    if (!voiceSession.isLive) {
      setChatLoading(true);
    }

    requestAnimationFrame(() => {
      forceChatToBottom("auto");
    });

    await saveCoachMessage(
      activeUserId,
      activeConversationId,
      "user",
      question,
    );

    if (voiceSession.isLive) {
      requestAnimationFrame(() => {
        forceChatToBottom("auto");
      });

      const sent =
        await voiceSession.sendTextMessage(question);

      if (!sent) {
        setChatLoading(false);
      }

      return;
    }

    try {
      const response =
        await fetch(
          "/api/ai-coach/chat",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              messages:
                outgoingMessages.slice(
                  -16,
                ),

              tradingContext,
            }),
          },
        );

      const data =
        (await response.json()) as {
          reply?: string;
          error?: string;
        };

      if (!response.ok) {
        throw new Error(
          data.error ||
            "TradeCoach AI request failed.",
        );
      }

      if (!data.reply) {
        throw new Error(
          "TradeCoach AI returned an empty response.",
        );
      }

      const assistantReply =
        data.reply;

      setChatMessages(
        (current) => [
          ...current,
          {
            role: "assistant",
            text: assistantReply,
          },
        ],
      );

      await saveCoachMessage(
        activeUserId,
        activeConversationId,
        "assistant",
        assistantReply,
      );

      requestAnimationFrame(() => {
        forceChatToBottom("auto");
      });
    } catch (error) {
      console.error(
        "[TradeCoach AI] Chat failed:",
        error,
      );

      const errorText =
        error instanceof Error
          ? error.message
          : "Unknown AI error.";

      const localFallback =
        answerCoachQuestion(
          question,
        );

      const fallbackText =
        `I could not reach the full AI coach: ${errorText}\n\n` +
        `Here is the local trade-data answer instead:\n\n${localFallback}`;

      setChatMessages(
        (current) => [
          ...current,
          {
            role: "assistant",
            text: fallbackText,
          },
        ],
      );

      await saveCoachMessage(
        activeUserId,
        activeConversationId,
        "assistant",
        fallbackText,
      );

      requestAnimationFrame(() => {
        forceChatToBottom("auto");
      });
    } finally {
      setChatLoading(false);
    }
  }

  useEffect(() => {
    if (searchParams.get("topic") !== "improvement-plan") {
      return;
    }

    const raw = sessionStorage.getItem(
      IMPROVEMENT_PLAN_SESSION_KEY,
    );

    if (!raw) {
      return;
    }

    try {
      const context = JSON.parse(
        raw,
      ) as ImprovementPlanContext;

      improvementPlanContextRef.current =
        context;
      pendingImprovementPlanPromptRef.current =
        buildImprovementPlanCoachPrompt(
          context,
        );

      const range = searchParams.get("range");

      if (
        range === "week" ||
        range === "30" ||
        range === "all"
      ) {
        setAnalysisRange(range);
      }
    } catch {
      sessionStorage.removeItem(
        IMPROVEMENT_PLAN_SESSION_KEY,
      );
    }
  }, [searchParams]);

  useEffect(() => {
    if (searchParams.get("topic") !== "performance-report") {
      return;
    }

    const raw = sessionStorage.getItem(
      PERFORMANCE_REPORT_SESSION_KEY,
    );

    if (!raw) {
      return;
    }

    try {
      const context = JSON.parse(
        raw,
      ) as PerformanceReportCoachContext;

      performanceReportContextRef.current = context;
      pendingPerformanceReportPromptRef.current =
        buildPerformanceReportCoachPrompt(context);

      const reportType = searchParams.get("type");

      if (reportType === "weekly") {
        setAnalysisRange("week");
      }
    } catch {
      sessionStorage.removeItem(
        PERFORMANCE_REPORT_SESSION_KEY,
      );
    }
  }, [searchParams]);

  useEffect(() => {
    if (
      improvementPlanStartedRef.current ||
      chatHistoryLoading ||
      chatLoading ||
      !chatUserId ||
      !conversationId ||
      !pendingImprovementPlanPromptRef.current
    ) {
      return;
    }

    improvementPlanStartedRef.current = true;

    const prompt =
      pendingImprovementPlanPromptRef.current;

    pendingImprovementPlanPromptRef.current =
      null;

    sessionStorage.removeItem(
      IMPROVEMENT_PLAN_SESSION_KEY,
    );

    void sendChatMessage(prompt);
  }, [
    chatHistoryLoading,
    chatLoading,
    chatUserId,
    conversationId,
  ]);

  useEffect(() => {
    if (
      performanceReportStartedRef.current ||
      chatHistoryLoading ||
      chatLoading ||
      !chatUserId ||
      !conversationId ||
      !pendingPerformanceReportPromptRef.current
    ) {
      return;
    }

    performanceReportStartedRef.current = true;

    const prompt =
      pendingPerformanceReportPromptRef.current;

    pendingPerformanceReportPromptRef.current =
      null;

    sessionStorage.removeItem(
      PERFORMANCE_REPORT_SESSION_KEY,
    );

    void sendChatMessage(prompt);
  }, [
    chatHistoryLoading,
    chatLoading,
    chatUserId,
    conversationId,
  ]);

  const hasUserMessages = chatMessages.some(
    (message) => message.role === "user",
  );

  const displayMessages = hasUserMessages
    ? chatMessages
    : [];

  return (
    <div className="flex h-[calc(100vh-8.5rem)] min-h-[640px] flex-col overflow-hidden rounded-2xl border border-slate-800 bg-[#070b12]">
      <div className="flex items-center justify-between gap-4 border-b border-slate-800/80 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400">
            <svg
              aria-hidden="true"
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.8}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.085c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.611L5 14.5"
              />
            </svg>
          </span>

          <h2 className="text-2xl font-semibold text-white">
            AI Coach
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <AiCoachAvatarPicker
            disabled={chatHistoryLoading || !chatUserId}
            avatarLocked={voiceSession.isActive}
            selectedAvatar={selectedCoachAvatar}
            onAvatarChange={handleCoachAvatarChange}
          />

          <AiCoachVoicePicker
            disabled={chatHistoryLoading || !chatUserId}
            voiceLocked={voiceSession.isActive}
            avatarGender={selectedCoachAvatarGender}
            selectedVoice={selectedCoachVoice}
            onVoiceChange={setSelectedCoachVoice}
          />

          <button
            type="button"
            onClick={() => {
              void startNewChat();
            }}
            disabled={
              chatLoading ||
              chatHistoryLoading ||
              !chatUserId
            }
            title="Start a new chat"
            className="rounded-lg border border-slate-800 px-3 py-2 text-xs font-semibold text-slate-400 transition hover:border-cyan-400 hover:text-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            New Chat
          </button>

          <button
            type="button"
            onClick={() => {
              void clearCurrentChat();
            }}
            disabled={
              chatLoading ||
              chatHistoryLoading ||
              !conversationId
            }
            title="Clear current chat"
            className="rounded-lg border border-slate-800 px-3 py-2 text-xs font-semibold text-slate-400 transition hover:border-rose-400 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Clear
          </button>
        </div>
      </div>

      {errorMessage ? (
        <div className="border-b border-rose-500/20 bg-rose-500/10 px-5 py-3 text-sm text-rose-200">
          {errorMessage}
        </div>
      ) : null}

      {chatPersistenceError ? (
        <div className="border-b border-amber-500/20 bg-amber-500/10 px-5 py-3 text-sm text-amber-200">
          {chatPersistenceError}
        </div>
      ) : null}

      {voiceSession.isActive ? (
        <AiCoachVoiceCharacter
          modelUrl={
            selectedCoachAvatarOption?.modelUrl ??
            "/models/coach-avatar.glb"
          }
          status={voiceSession.status}
          activity={voiceSession.activity}
          inputLevel={voiceSession.inputLevel}
          outputLevel={voiceSession.outputLevel}
          micAvailable={voiceSession.micAvailable}
          micNotice={voiceSession.micNotice}
        />
      ) : null}

      <div
        ref={chatViewportRef}
        className="flex-1 overflow-y-auto overscroll-contain px-5 py-6"
      >
        <div ref={chatContentRef} className="mx-auto max-w-4xl space-y-5">
          {chatHistoryLoading ? (
            <p className="text-sm text-slate-500">
              Loading your saved conversation...
            </p>
          ) : null}

          {!chatHistoryLoading &&
          !hasUserMessages &&
          !chatLoading ? (
            <p className="max-w-3xl text-sm leading-7 text-slate-500">
              Ask about your real trading: &apos;Why am I losing money?&apos;,
              &apos;Am I better long or short?&apos;, &apos;Which symbol is
              strongest?&apos;
            </p>
          ) : null}

          {!chatHistoryLoading
            ? displayMessages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={
                    message.role === "assistant"
                      ? "rounded-2xl border border-cyan-500/15 bg-cyan-500/[0.04] px-4 py-4"
                      : "rounded-2xl bg-slate-900/80 px-4 py-4"
                  }
                >
                  <p
                    className={
                      message.role === "assistant"
                        ? "text-sm font-semibold text-cyan-400"
                        : "text-sm text-slate-500"
                    }
                  >
                    {message.role === "assistant"
                      ? "TradeCoach"
                      : "You"}
                  </p>

                  <p className="mt-2 whitespace-pre-wrap leading-7 text-slate-300">
                    {message.text}
                  </p>
                </div>
              ))
            : null}

          {chatLoading ? (
            <div className="rounded-2xl border border-cyan-500/15 bg-cyan-500/[0.04] px-4 py-4">
              <p className="text-sm font-semibold text-cyan-400">
                TradeCoach
              </p>

              <p className="mt-2 text-slate-300">Thinking...</p>
            </div>
          ) : null}

          <div aria-hidden="true" className="h-4 w-full shrink-0" />
        </div>
      </div>

      <div className="border-t border-slate-800/80 px-5 py-4">
        <div className="mx-auto flex max-w-4xl items-center gap-3">
          <div className="relative flex min-w-0 flex-1 items-center rounded-full border border-slate-800 bg-slate-950 transition focus-within:border-cyan-400">
            <input
              type="text"
              value={chatInput}
              disabled={
                chatLoading ||
                chatHistoryLoading ||
                !chatUserId ||
                !conversationId
              }
              onChange={(event) => setChatInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void sendChatMessage();
                }
              }}
              placeholder={
                chatHistoryLoading
                  ? "Loading your saved chat..."
                  : chatLoading
                    ? "TradeCoach is thinking..."
                    : voiceSession.isLive &&
                        !voiceSession.micAvailable
                      ? "Type to talk to your voice coach..."
                      : "Ask your AI coach..."
              }
              className="min-w-0 flex-1 rounded-full bg-transparent py-3.5 pl-5 pr-14 text-white outline-none placeholder:text-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
            />

            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              <AiCoachVoiceButton
                variant="inline"
                disabled={
                  chatHistoryLoading ||
                  !chatUserId ||
                  chatLoading
                }
                status={voiceSession.status}
                errorMessage={voiceSession.errorMessage}
                onToggle={voiceSession.toggleVoiceSession}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              void sendChatMessage();
            }}
            disabled={
              chatLoading ||
              chatHistoryLoading ||
              !chatUserId ||
              !conversationId ||
              !chatInput.trim()
            }
            aria-label="Send message"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-cyan-500 text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg
              aria-hidden="true"
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}