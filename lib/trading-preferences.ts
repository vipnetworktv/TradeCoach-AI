export const TRADING_PREFERENCES_STORAGE_KEY =
  "tradecoach-trading-preferences";

export type TradingTimeZoneLabel =
  | "Eastern Time"
  | "Central Time"
  | "Mountain Time"
  | "Pacific Time"
  | "UTC";

export type TradingPreferences = {
  primaryMarket: string;
  primaryInstrument: string;
  tradingStyle: string;
  experienceLevel: string;
  entryTimeframe: string;
  analysisTimeframe: string;
  dailyProfitGoal: number;
  maxDailyLoss: number;
  maxTradesPerDay: number;
  timeZone: TradingTimeZoneLabel;
  coachingStyle: "encouraging" | "balanced" | "direct";
};

export const DEFAULT_TRADING_PREFERENCES: TradingPreferences =
  {
    primaryMarket: "Futures",
    primaryInstrument: "NQ / MNQ",
    tradingStyle: "Intraday Trader",
    experienceLevel: "Developing Trader",
    entryTimeframe: "1 Minute",
    analysisTimeframe: "5 Minutes",
    dailyProfitGoal: 500,
    maxDailyLoss: 300,
    maxTradesPerDay: 6,
    timeZone: "Eastern Time",
    coachingStyle: "balanced",
  };

export const TRADING_TIME_ZONE_OPTIONS: {
  label: TradingTimeZoneLabel;
  iana: string;
}[] = [
  { label: "Eastern Time", iana: "America/New_York" },
  { label: "Central Time", iana: "America/Chicago" },
  { label: "Mountain Time", iana: "America/Denver" },
  { label: "Pacific Time", iana: "America/Los_Angeles" },
  { label: "UTC", iana: "UTC" },
];

export function getIanaTimeZone(
  label: TradingTimeZoneLabel,
): string {
  return (
    TRADING_TIME_ZONE_OPTIONS.find(
      (option) => option.label === label,
    )?.iana ?? "America/New_York"
  );
}

function sanitizeNumber(
  value: unknown,
  fallback: number,
  minimum = 0,
): number {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.max(minimum, number);
}

export function normalizeTradingPreferences(
  value: Partial<TradingPreferences> | null | undefined,
): TradingPreferences {
  const coachingStyle = value?.coachingStyle;

  return {
    primaryMarket:
      value?.primaryMarket?.trim() ||
      DEFAULT_TRADING_PREFERENCES.primaryMarket,
    primaryInstrument:
      value?.primaryInstrument?.trim() ||
      DEFAULT_TRADING_PREFERENCES.primaryInstrument,
    tradingStyle:
      value?.tradingStyle?.trim() ||
      DEFAULT_TRADING_PREFERENCES.tradingStyle,
    experienceLevel:
      value?.experienceLevel?.trim() ||
      DEFAULT_TRADING_PREFERENCES.experienceLevel,
    entryTimeframe:
      value?.entryTimeframe?.trim() ||
      DEFAULT_TRADING_PREFERENCES.entryTimeframe,
    analysisTimeframe:
      value?.analysisTimeframe?.trim() ||
      DEFAULT_TRADING_PREFERENCES.analysisTimeframe,
    dailyProfitGoal: sanitizeNumber(
      value?.dailyProfitGoal,
      DEFAULT_TRADING_PREFERENCES.dailyProfitGoal,
    ),
    maxDailyLoss: sanitizeNumber(
      value?.maxDailyLoss,
      DEFAULT_TRADING_PREFERENCES.maxDailyLoss,
      1,
    ),
    maxTradesPerDay: sanitizeNumber(
      value?.maxTradesPerDay,
      DEFAULT_TRADING_PREFERENCES.maxTradesPerDay,
      1,
    ),
    timeZone:
      TRADING_TIME_ZONE_OPTIONS.some(
        (option) => option.label === value?.timeZone,
      ) && value?.timeZone
        ? value.timeZone
        : DEFAULT_TRADING_PREFERENCES.timeZone,
    coachingStyle:
      coachingStyle === "encouraging" ||
      coachingStyle === "balanced" ||
      coachingStyle === "direct"
        ? coachingStyle
        : DEFAULT_TRADING_PREFERENCES.coachingStyle,
  };
}

export function readStoredTradingPreferences(): TradingPreferences {
  if (typeof window === "undefined") {
    return DEFAULT_TRADING_PREFERENCES;
  }

  try {
    const stored = window.localStorage.getItem(
      TRADING_PREFERENCES_STORAGE_KEY,
    );

    if (!stored) {
      return DEFAULT_TRADING_PREFERENCES;
    }

    return normalizeTradingPreferences(
      JSON.parse(stored) as Partial<TradingPreferences>,
    );
  } catch {
    return DEFAULT_TRADING_PREFERENCES;
  }
}

export function writeStoredTradingPreferences(
  preferences: TradingPreferences,
): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      TRADING_PREFERENCES_STORAGE_KEY,
      JSON.stringify(normalizeTradingPreferences(preferences)),
    );
    window.dispatchEvent(new Event("tradecoach-trading-preferences-updated"));
  } catch {
    // Ignore storage write errors.
  }
}
