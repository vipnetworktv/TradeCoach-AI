"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import PerformanceReportArticleView from "@/components/performance-report-article-view";
import {
  buildPerformanceReportArticle,
  type PerformanceReportType,
} from "@/lib/performance-report-article";
import type { ReportTrade } from "@/lib/trading-report-summary";
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

function parseReportType(value: string | null): PerformanceReportType | null {
  if (value === "weekly" || value === "monthly" || value === "daily") {
    return value;
  }

  return null;
}

export default function ReportArticlePage() {
  const searchParams = useSearchParams();
  const reportType = parseReportType(searchParams.get("type"));
  const dateKey = searchParams.get("date");

  const supabase = useMemo(() => createClient(), []);
  const [trades, setTrades] = useState<ReportTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadTrades = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const { data, error } = await supabase
        .from("broker_completed_trades")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(5000);

      if (error) {
        throw error;
      }

      setTrades((data || []) as ReportTrade[]);
    } catch (error) {
      console.error("[TradeCoach Report Article] Could not load trades:", error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not load trades for this report.",
      );
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void loadTrades();
  }, [loadTrades]);

  const article = useMemo(() => {
    if (!reportType) {
      return null;
    }

    return buildPerformanceReportArticle(trades, reportType, {
      dateKey: dateKey || undefined,
    });
  }, [dateKey, reportType, trades]);

  return (
    <div className="space-y-6">
      {!reportType ? (
        <div className="rounded-3xl border border-rose-500/30 bg-rose-500/10 p-8 text-center">
          <p className="font-bold text-rose-300">Invalid report link</p>
          <p className="mt-2 text-sm text-rose-200">
            Choose a report from your history to open the full article.
          </p>
          <Link
            href="/dashboard/reports"
            className="mt-6 inline-flex rounded-xl bg-cyan-500 px-5 py-3 font-bold text-slate-950 transition hover:bg-cyan-400"
          >
            Back to Reports
          </Link>
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-12 text-center text-slate-400">
          Building your report article...
        </div>
      ) : null}

      {errorMessage ? (
        <div className="rounded-3xl border border-rose-500/30 bg-rose-500/10 p-8">
          <p className="font-bold text-rose-300">Could not load report</p>
          <p className="mt-2 text-sm text-rose-200">{errorMessage}</p>
        </div>
      ) : null}

      {!loading && !errorMessage && article && reportType ? (
        article.summary.totalTrades === 0 ? (
          <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-12 text-center">
            <p className="text-lg font-semibold text-white">
              No trades found for this report period
            </p>
            <p className="mt-2 text-sm text-slate-400">
              Sync more trades from your broker, then open this report again.
            </p>
            <Link
              href="/dashboard/reports"
              className="mt-6 inline-flex rounded-xl bg-cyan-500 px-5 py-3 font-bold text-slate-950 transition hover:bg-cyan-400"
            >
              Back to Reports
            </Link>
          </div>
        ) : (
          <PerformanceReportArticleView article={article} />
        )
      ) : null}
    </div>
  );
}
