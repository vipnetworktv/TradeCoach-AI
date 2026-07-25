"use client";

import Link from "next/link";

import type { PerformanceReportArticle } from "@/lib/performance-report-article";
import {
  buildPerformanceReportCoachContext,
  PERFORMANCE_REPORT_SESSION_KEY,
} from "@/lib/performance-report-article";

type PerformanceReportArticleViewProps = {
  article: PerformanceReportArticle;
  showBackLink?: boolean;
};

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

function getTypeBadge(type: PerformanceReportArticle["type"]): string {
  if (type === "weekly") {
    return "Weekly";
  }

  if (type === "monthly") {
    return "Monthly";
  }

  return "Daily";
}

export default function PerformanceReportArticleView({
  article,
  showBackLink = true,
}: PerformanceReportArticleViewProps) {
  const { summary } = article;

  function handleDiscussWithCoach() {
    sessionStorage.setItem(
      PERFORMANCE_REPORT_SESSION_KEY,
      JSON.stringify(buildPerformanceReportCoachContext(article)),
    );
  }

  return (
    <article className="mx-auto max-w-4xl space-y-8">
      {showBackLink ? (
        <Link
          href="/dashboard/reports"
          className="inline-flex items-center gap-2 text-sm font-semibold text-cyan-400 transition hover:text-cyan-300"
        >
          ← Back to Reports
        </Link>
      ) : null}

      <header className="overflow-hidden rounded-3xl border border-cyan-500/20 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 p-8 shadow-[0_0_60px_rgba(34,211,238,0.08)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-400">
              TradeCoach Report
            </p>

            <h1 className="mt-3 text-3xl font-extrabold text-white sm:text-4xl">
              {article.title}
            </h1>

            <p className="mt-3 text-lg text-slate-400">{article.periodLabel}</p>
          </div>

          <div className="flex items-center gap-3">
            <span className="rounded-full bg-slate-800 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-300">
              {getTypeBadge(article.type)}
            </span>

            <span className="rounded-2xl bg-cyan-500/10 px-5 py-3 text-2xl font-extrabold text-cyan-400">
              {article.grade}
            </span>
          </div>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <p className="text-sm text-slate-400">Net P/L</p>
            <p
              className={`mt-2 text-3xl font-extrabold ${
                summary.totalPnl >= 0 ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {formatMoney(summary.totalPnl, true)}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <p className="text-sm text-slate-400">Win Rate</p>
            <p className="mt-2 text-3xl font-extrabold text-white">
              {summary.winRate.toFixed(0)}%
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <p className="text-sm text-slate-400">Completed Trades</p>
            <p className="mt-2 text-3xl font-extrabold text-white">
              {summary.totalTrades}
            </p>
          </div>
        </div>
      </header>

      <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-400">
          Overview
        </p>

        <p className="mt-4 text-lg leading-8 text-slate-300">{article.intro}</p>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-3xl border border-emerald-500/20 bg-emerald-500/[0.04] p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-400">
            What You Did Well
          </p>

          <div className="mt-6 space-y-5">
            {article.strengths.map((item) => (
              <div
                key={item.title}
                className="rounded-2xl border border-emerald-500/10 bg-slate-950/60 p-5"
              >
                <h2 className="font-bold text-white">{item.title}</h2>
                <p className="mt-2 text-sm leading-7 text-slate-400">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-amber-500/20 bg-amber-500/[0.04] p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-400">
            Where To Improve
          </p>

          <div className="mt-6 space-y-5">
            {article.improvements.map((item) => (
              <div
                key={item.title}
                className="rounded-2xl border border-amber-500/10 bg-slate-950/60 p-5"
              >
                <h2 className="font-bold text-white">{item.title}</h2>
                <p className="mt-2 text-sm leading-7 text-slate-400">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="rounded-3xl border border-cyan-500/20 bg-gradient-to-br from-slate-900 to-slate-950 p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-400">
          {article.type === "weekly"
            ? "Focus For Next Week"
            : article.type === "monthly"
              ? "Focus For Next Month"
              : "Focus For Next Session"}
        </p>

        <p className="mt-4 text-lg leading-8 text-slate-300">
          {article.nextFocus}
        </p>

        <Link
          href={`/dashboard/ai-coach?topic=performance-report&type=${article.type}`}
          onClick={handleDiscussWithCoach}
          className="mt-6 inline-flex rounded-xl bg-cyan-500 px-5 py-4 font-bold text-slate-950 transition hover:bg-cyan-400"
        >
          Discuss With AI Coach
        </Link>
      </section>

      {summary.recentTrades.length > 0 ? (
        <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-400">
            Recent Trades In This Report
          </p>

          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-slate-500">
                  <th className="px-4 py-3 font-semibold">Symbol</th>
                  <th className="px-4 py-3 font-semibold">Side</th>
                  <th className="px-4 py-3 font-semibold">Entry → Exit</th>
                  <th className="px-4 py-3 font-semibold">P/L</th>
                </tr>
              </thead>

              <tbody>
                {summary.recentTrades.map((trade, index) => (
                  <tr
                    key={`${trade.symbol}-${trade.entry}-${index}`}
                    className="border-b border-slate-800/80 last:border-b-0"
                  >
                    <td className="px-4 py-4 font-semibold text-white">
                      {trade.symbol}
                    </td>
                    <td className="px-4 py-4 text-slate-400">{trade.side}</td>
                    <td className="px-4 py-4 text-slate-400">
                      {trade.entry} → {trade.exit}
                    </td>
                    <td
                      className={`px-4 py-4 font-bold ${
                        trade.pnl >= 0 ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {formatMoney(trade.pnl, true)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </article>
  );
}
