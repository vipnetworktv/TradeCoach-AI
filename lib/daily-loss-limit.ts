import { getIanaTimeZone } from "@/lib/trading-preferences";
import type { TradingTimeZoneLabel } from "@/lib/trading-preferences";

export type DailyLossTrade = {
  net_pnl?: number | string | null;
  status?: string | null;
  entry_at?: string | null;
  exit_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type DateParts = {
  year: number;
  month: number;
  day: number;
  key: string;
};

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function getTradeTimestamp(trade: DailyLossTrade): string | null {
  return (
    trade.exit_at ||
    trade.entry_at ||
    trade.created_at ||
    trade.updated_at ||
    null
  );
}

function getDatePartsInTimeZone(
  value: string | Date,
  timeZone: string,
): DateParts | null {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const formattedParts = new Intl.DateTimeFormat("en-US", {
    timeZone,
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
    key: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  };
}

export function getCurrentTradingDayKey(
  timeZoneLabel: TradingTimeZoneLabel,
): string {
  const timeZone = getIanaTimeZone(timeZoneLabel);
  const parts = getDatePartsInTimeZone(new Date(), timeZone);

  return parts?.key ?? new Date().toISOString().slice(0, 10);
}

export function getTodayNetPnl(
  trades: DailyLossTrade[],
  timeZoneLabel: TradingTimeZoneLabel,
): number {
  const timeZone = getIanaTimeZone(timeZoneLabel);
  const todayKey = getCurrentTradingDayKey(timeZoneLabel);
  let total = 0;

  for (const trade of trades) {
    const status = String(trade.status || "").toLowerCase();
    const netPnl = toNumber(trade.net_pnl);
    const timestamp = getTradeTimestamp(trade);

    if (status !== "processed" || netPnl === null || !timestamp) {
      continue;
    }

    const tradeDay = getDatePartsInTimeZone(timestamp, timeZone);

    if (tradeDay?.key !== todayKey) {
      continue;
    }

    total += netPnl;
  }

  return total;
}

export type DailyLossLimitStatus = {
  isHit: boolean;
  todayNetPnl: number;
  maxDailyLoss: number;
  amountOverLimit: number;
  tradingDayKey: string;
};

export function evaluateDailyLossLimit(
  trades: DailyLossTrade[],
  maxDailyLoss: number,
  timeZoneLabel: TradingTimeZoneLabel,
): DailyLossLimitStatus {
  const todayNetPnl = getTodayNetPnl(trades, timeZoneLabel);
  const tradingDayKey = getCurrentTradingDayKey(timeZoneLabel);
  const normalizedLimit = Math.max(1, maxDailyLoss);
  const lossAmount = todayNetPnl < 0 ? Math.abs(todayNetPnl) : 0;
  const isHit = lossAmount >= normalizedLimit;

  return {
    isHit,
    todayNetPnl,
    maxDailyLoss: normalizedLimit,
    amountOverLimit: Math.max(0, lossAmount - normalizedLimit),
    tradingDayKey,
  };
}

export function formatDailyPnl(value: number): string {
  const formatted = Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  if (value < 0) {
    return `-$${formatted}`;
  }

  if (value > 0) {
    return `+$${formatted}`;
  }

  return `$${formatted}`;
}

export const DAILY_LOSS_ALERT_DISMISSED_PREFIX =
  "tradecoach-daily-loss-dismissed-";

export const DAILY_LOSS_ALERT_NOTIFIED_PREFIX =
  "tradecoach-daily-loss-notified-";

export function isDailyLossAlertDismissed(
  tradingDayKey: string,
): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return (
      window.sessionStorage.getItem(
        `${DAILY_LOSS_ALERT_DISMISSED_PREFIX}${tradingDayKey}`,
      ) === "1"
    );
  } catch {
    return false;
  }
}

export function dismissDailyLossAlert(tradingDayKey: string): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(
      `${DAILY_LOSS_ALERT_DISMISSED_PREFIX}${tradingDayKey}`,
      "1",
    );
  } catch {
    // Ignore storage errors.
  }
}

export function markDailyLossAlertNotified(
  tradingDayKey: string,
): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(
      `${DAILY_LOSS_ALERT_NOTIFIED_PREFIX}${tradingDayKey}`,
      "1",
    );
  } catch {
    // Ignore storage errors.
  }
}

export function hasDailyLossAlertBeenNotified(
  tradingDayKey: string,
): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return (
      window.sessionStorage.getItem(
        `${DAILY_LOSS_ALERT_NOTIFIED_PREFIX}${tradingDayKey}`,
      ) === "1"
    );
  } catch {
    return false;
  }
}
