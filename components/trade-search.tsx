"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  filterTradesBySearch,
  getTradeAccountLabel,
  getTradeDisplayPnl,
  type SearchableTrade,
} from "@/lib/trade-search";
import { createBrowserClient } from "@supabase/ssr";

function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local",
    );
  }

  return createBrowserClient(supabaseUrl, supabasePublishableKey);
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function formatMoney(
  value: unknown,
  options?: { showPlus?: boolean },
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

  if (normalized < 0) {
    return `-$${formatted}`;
  }

  if (normalized > 0 && options?.showPlus) {
    return `+$${formatted}`;
  }

  return `$${formatted}`;
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

function formatTradeTime(trade: SearchableTrade): string {
  const timestamp =
    trade.exit_at ||
    trade.entry_at ||
    trade.created_at ||
    trade.updated_at;

  if (!timestamp) {
    return "—";
  }

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function getMoneyClass(value: unknown): string {
  const number = toNumber(value);

  if (number === null || number === 0) {
    return "text-slate-200";
  }

  return number > 0 ? "text-emerald-400" : "text-rose-400";
}

export default function TradeSearch() {
  const supabase = useMemo(() => createClient(), []);
  const inputRef = useRef<HTMLInputElement>(null);

  const [isMounted, setIsMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [trades, setTrades] = useState<SearchableTrade[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const loadTrades = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");

    try {
      const { data, error } = await supabase
        .from("broker_completed_trades")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(1000);

      if (error) {
        throw error;
      }

      setTrades((data || []) as SearchableTrade[]);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not load trades for search.",
      );
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    void loadTrades();

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    window.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, loadTrades]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    inputRef.current?.focus();
  }, [isOpen, loading]);

  const filteredTrades = useMemo(
    () => filterTradesBySearch(trades, query),
    [trades, query],
  );

  const previewTrades = filteredTrades.slice(0, 8);
  const trimmedQuery = query.trim();

  const overlay = (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-slate-950/75 p-4 pt-24 backdrop-blur-sm sm:p-6 sm:pt-28">
      <button
        type="button"
        aria-label="Close trade search"
        className="absolute inset-0"
        onClick={() => {
          setIsOpen(false);
        }}
      />

      <div className="relative flex max-h-[min(720px,calc(100vh-7rem))] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-800 bg-[#070b12] shadow-2xl shadow-cyan-500/10">
        <div className="border-b border-slate-800 px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-400">
                Trade Search
              </p>
              <h2 className="mt-1 text-lg font-bold text-white">
                Find a trade
              </h2>
            </div>

            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
              }}
              className="rounded-lg border border-slate-800 px-3 py-2 text-sm text-slate-400 transition hover:border-slate-700 hover:text-white"
            >
              Close
            </button>
          </div>

          <div className="relative mt-4">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">
              ⌕
            </span>

            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && trimmedQuery) {
                  setIsOpen(false);
                }
              }}
              placeholder="Search symbol, P/L, price, account..."
              className="w-full rounded-xl border border-slate-700 bg-slate-950 py-3 pl-11 pr-4 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-400"
            />
          </div>

          <p className="mt-3 text-xs text-slate-500">
            Try `NQ`, `MNQ`, `-1.40`, `$14.99`, `long`, or an account name.
          </p>
        </div>

        {errorMessage ? (
          <div className="border-b border-rose-500/20 bg-rose-500/10 px-5 py-3 text-sm text-rose-200">
            {errorMessage}
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {loading ? (
            <p className="px-3 py-8 text-center text-sm text-slate-500">
              Loading trades...
            </p>
          ) : null}

          {!loading && !trimmedQuery ? (
            <p className="px-3 py-8 text-center text-sm text-slate-500">
              Start typing to search your completed trades.
            </p>
          ) : null}

          {!loading && trimmedQuery && previewTrades.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-slate-500">
              No trades matched &quot;{trimmedQuery}&quot;.
            </p>
          ) : null}

          {!loading && previewTrades.length > 0 ? (
            <div className="space-y-2">
              {previewTrades.map((trade, index) => {
                const rowKey = String(
                  trade.id ||
                    trade.broker_pair_id ||
                    `${trade.symbol}-${index}`,
                );

                return (
                  <Link
                    key={rowKey}
                    href={`/dashboard/trades?q=${encodeURIComponent(trimmedQuery)}`}
                    onClick={() => {
                      setIsOpen(false);
                    }}
                    className="block rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-4 transition hover:border-cyan-500/30 hover:bg-slate-900"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-white">
                            {trade.symbol || "—"}
                          </span>

                          <span className="rounded-full bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-300">
                            {formatSide(trade.direction)}
                          </span>
                        </div>

                        <p className="mt-2 text-sm text-slate-500">
                          {getTradeAccountLabel(trade)} · {formatTradeTime(trade)}
                        </p>
                      </div>

                      <div className="text-right">
                        <p
                          className={`font-bold ${getMoneyClass(getTradeDisplayPnl(trade))}`}
                        >
                          {formatMoney(getTradeDisplayPnl(trade), {
                            showPlus: true,
                          })}
                        </p>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : null}
        </div>

        <div className="border-t border-slate-800 px-5 py-4">
          {trimmedQuery ? (
            <Link
              href={`/dashboard/trades?q=${encodeURIComponent(trimmedQuery)}`}
              onClick={() => {
                setIsOpen(false);
              }}
              className="block rounded-xl bg-cyan-500 px-4 py-3 text-center text-sm font-bold text-slate-950 transition hover:bg-cyan-400"
            >
              View all {filteredTrades.length} result
              {filteredTrades.length === 1 ? "" : "s"} on Trades
            </Link>
          ) : (
            <Link
              href="/dashboard/trades"
              onClick={() => {
                setIsOpen(false);
              }}
              className="block rounded-xl border border-slate-700 px-4 py-3 text-center text-sm font-semibold text-slate-300 transition hover:border-cyan-400 hover:text-cyan-300"
            >
              Open full trade history
            </Link>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setQuery("");
          setIsOpen(true);
        }}
        className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2.5 text-sm text-slate-400 transition hover:border-cyan-400 hover:text-white sm:px-4"
        aria-label="Search trades"
      >
        <span className="text-base">⌕</span>
        <span className="hidden sm:inline">Search trades</span>
      </button>

      {isMounted && isOpen ? createPortal(overlay, document.body) : null}
    </>
  );
}
