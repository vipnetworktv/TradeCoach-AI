"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createBrowserClient } from "@supabase/ssr";

import {
  dismissDailyLossAlert,
  evaluateDailyLossLimit,
  formatDailyPnl,
  hasDailyLossAlertBeenNotified,
  isDailyLossAlertDismissed,
  markDailyLossAlertNotified,
  type DailyLossTrade,
} from "@/lib/daily-loss-limit";
import {
  readStoredTradingPreferences,
  type TradingPreferences,
} from "@/lib/trading-preferences";

function showBrowserNotification(
  title: string,
  body: string,
): void {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return;
  }

  if (Notification.permission === "granted") {
    new Notification(title, { body });
    return;
  }

  if (Notification.permission === "default") {
    void Notification.requestPermission().then((permission) => {
      if (permission === "granted") {
        new Notification(title, { body });
      }
    });
  }
}

export default function DailyLossLimitMonitor() {
  const supabase = useMemo(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabasePublishableKey =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    if (!supabaseUrl || !supabasePublishableKey) {
      return null;
    }

    return createBrowserClient(supabaseUrl, supabasePublishableKey);
  }, []);

  const [preferences, setPreferences] = useState<TradingPreferences>(
    readStoredTradingPreferences(),
  );
  const [trades, setTrades] = useState<DailyLossTrade[]>([]);
  const [dismissed, setDismissed] = useState(false);

  const loadPreferences = useCallback(() => {
    setPreferences(readStoredTradingPreferences());
  }, []);

  const loadTrades = useCallback(async () => {
    if (!supabase) {
      return;
    }

    const { data, error } = await supabase
      .from("broker_completed_trades")
      .select(
        "net_pnl, status, entry_at, exit_at, created_at, updated_at",
      )
      .order("updated_at", { ascending: false })
      .limit(1000);

    if (error) {
      return;
    }

    setTrades((data ?? []) as DailyLossTrade[]);
  }, [supabase]);

  useEffect(() => {
    loadPreferences();
    void loadTrades();

    function handlePreferencesUpdated() {
      loadPreferences();
    }

    window.addEventListener(
      "tradecoach-trading-preferences-updated",
      handlePreferencesUpdated,
    );
    window.addEventListener("storage", handlePreferencesUpdated);

    return () => {
      window.removeEventListener(
        "tradecoach-trading-preferences-updated",
        handlePreferencesUpdated,
      );
      window.removeEventListener("storage", handlePreferencesUpdated);
    };
  }, [loadPreferences, loadTrades]);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    const channel = supabase
      .channel("tradecoach-daily-loss-monitor")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "broker_completed_trades",
        },
        () => {
          void loadTrades();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadTrades, supabase]);

  const status = useMemo(
    () =>
      evaluateDailyLossLimit(
        trades,
        preferences.maxDailyLoss,
        preferences.timeZone,
      ),
    [preferences.maxDailyLoss, preferences.timeZone, trades],
  );

  useEffect(() => {
    setDismissed(isDailyLossAlertDismissed(status.tradingDayKey));
  }, [status.tradingDayKey]);

  useEffect(() => {
    if (!status.isHit || hasDailyLossAlertBeenNotified(status.tradingDayKey)) {
      return;
    }

    markDailyLossAlertNotified(status.tradingDayKey);
    showBrowserNotification(
      "Daily loss limit reached",
      `Today's net P/L is ${formatDailyPnl(status.todayNetPnl)}. Your max daily loss is $${status.maxDailyLoss.toLocaleString("en-US")}. Consider stopping for the day.`,
    );
  }, [status]);

  if (!status.isHit || dismissed) {
    return null;
  }

  return (
    <div className="border-b border-rose-500/25 bg-rose-500/10 px-6 py-4 md:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-rose-300">
            Daily Loss Limit Reached
          </p>

          <p className="mt-1 text-base font-semibold text-white">
            You hit your ${status.maxDailyLoss.toLocaleString("en-US")} max
            daily loss.
          </p>

          <p className="mt-1 text-sm leading-6 text-rose-100/85">
            Today&apos;s net P/L is{" "}
            <span className="font-semibold text-white">
              {formatDailyPnl(status.todayNetPnl)}
            </span>
            . TradeCoach recommends stepping away, reviewing what happened,
            and protecting the rest of your day.
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Link
            href="/dashboard/ai-coach"
            className="rounded-lg border border-rose-300/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-100 transition hover:border-rose-200 hover:bg-rose-500/20"
          >
            Talk to AI Coach
          </Link>

          <Link
            href="/dashboard/settings"
            className="rounded-lg border border-rose-300/20 px-3 py-2 text-xs font-semibold text-rose-100/90 transition hover:border-rose-200 hover:text-white"
          >
            Adjust Limit
          </Link>

          <button
            type="button"
            onClick={() => {
              dismissDailyLossAlert(status.tradingDayKey);
              setDismissed(true);
            }}
            className="rounded-lg px-3 py-2 text-xs font-semibold text-rose-100/70 transition hover:text-white"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
