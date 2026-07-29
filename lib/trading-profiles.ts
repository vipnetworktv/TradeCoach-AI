export type TradingProfile = {
  id: string;
  user_id: string;
  name: string;
  stats_started_at: string;
  is_active: boolean;
  created_at: string;
};

export const DEFAULT_TRADING_PROFILE_NAME = "Default";

export const LEGACY_PROFILE_STATS_START = "1970-01-01T00:00:00.000Z";

type TradeTimestampFields = {
  exit_at?: string | null;
  entry_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export function getTradeTimestampForProfile(
  trade: TradeTimestampFields,
): string | null {
  return (
    trade.exit_at ||
    trade.entry_at ||
    trade.created_at ||
    trade.updated_at ||
    null
  );
}

export function sortTradingProfiles(
  profiles: TradingProfile[],
): TradingProfile[] {
  return [...profiles].sort((first, second) => {
    const firstTime = new Date(first.stats_started_at).getTime();
    const secondTime = new Date(second.stats_started_at).getTime();

    if (firstTime !== secondTime) {
      return firstTime - secondTime;
    }

    return first.created_at.localeCompare(second.created_at);
  });
}

export function getActiveTradingProfile(
  profiles: TradingProfile[],
): TradingProfile | null {
  return profiles.find((profile) => profile.is_active) ?? null;
}

export function getProfileStatsWindow(
  profile: TradingProfile,
  allProfiles: TradingProfile[],
) {
  const sorted = sortTradingProfiles(allProfiles);
  const profileIndex = sorted.findIndex(
    (entry) => entry.id === profile.id,
  );
  const nextProfile =
    profileIndex >= 0 ? sorted[profileIndex + 1] : undefined;

  return {
    startMs: new Date(profile.stats_started_at).getTime(),
    endMs: nextProfile
      ? new Date(nextProfile.stats_started_at).getTime()
      : Number.POSITIVE_INFINITY,
  };
}

export function filterTradesForTradingProfile<
  T extends TradeTimestampFields,
>(
  trades: T[],
  profile: TradingProfile | null,
  allProfiles: TradingProfile[],
): T[] {
  if (!profile) {
    return trades;
  }

  const { startMs, endMs } = getProfileStatsWindow(
    profile,
    allProfiles,
  );

  return trades.filter((trade) => {
    const timestamp = getTradeTimestampForProfile(trade);

    if (!timestamp) {
      return (
        profile.stats_started_at === LEGACY_PROFILE_STATS_START
      );
    }

    const tradeTime = new Date(timestamp).getTime();

    if (!Number.isFinite(tradeTime)) {
      return (
        profile.stats_started_at === LEGACY_PROFILE_STATS_START
      );
    }

    return tradeTime >= startMs && tradeTime < endMs;
  });
}

export function formatTradingProfileStartedAt(
  value: string,
): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown start";
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
