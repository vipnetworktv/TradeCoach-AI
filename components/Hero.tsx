import Link from "next/link";

import TradeCoachLogo from "@/components/tradecoach-logo";

type HeroProps = {
  isAuthenticated?: boolean;
};

export default function Hero({ isAuthenticated = false }: HeroProps) {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(34,211,238,0.18),transparent)]"
      />
      <div
        aria-hidden
        className="hero-glow-cyan pointer-events-none absolute -left-24 top-20 h-72 w-72 rounded-full bg-cyan-500/20 blur-3xl"
      />
      <div
        aria-hidden
        className="hero-glow-violet pointer-events-none absolute -right-16 top-32 h-80 w-80 rounded-full bg-sky-600/15 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.04)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_78%)]"
      />

      <div className="relative mx-auto grid min-h-[calc(100vh-81px)] max-w-7xl items-center gap-10 px-6 py-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14 lg:py-16">
        <div className="max-w-xl">
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <TradeCoachLogo size="hero" priority />

            {!isAuthenticated ? (
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300">
                <span className="hero-live-dot inline-block h-2 w-2 rounded-full bg-emerald-400" />
                Live AI coach
              </span>
            ) : null}
          </div>

          {isAuthenticated ? (
            <h1 className="text-5xl font-extrabold leading-[1.02] tracking-tight md:text-6xl lg:text-7xl">
              Become the trader
              <br />
              <span className="hero-gradient-text">you were meant to be.</span>
            </h1>
          ) : (
            <>
              <h1 className="text-[2.75rem] font-extrabold leading-[0.98] tracking-tight sm:text-6xl lg:text-7xl xl:text-[5.25rem]">
                Stop guessing.
                <br />
                <span className="hero-gradient-text">Start coaching.</span>
              </h1>

              <p className="mt-5 max-w-md text-base font-medium text-slate-300 sm:text-lg">
                The TradingView sync + live AI coach built for futures traders.
              </p>
            </>
          )}

          {isAuthenticated ? (
            <p className="mt-7 max-w-lg text-lg text-slate-400">
              Your dashboard, trades, and AI coach are ready.
            </p>
          ) : null}

          <div className="mt-9 flex flex-wrap gap-3 sm:mt-10">
            <Link
              href="/signup"
              className="hero-cta-glow rounded-2xl bg-cyan-400 px-8 py-4 text-base font-bold text-slate-950 transition hover:bg-cyan-300"
            >
              Start free trial
            </Link>

            <Link
              href="/login"
              className="rounded-2xl border border-slate-600/80 bg-slate-950/40 px-8 py-4 text-base font-semibold text-white backdrop-blur transition hover:border-cyan-400/60 hover:text-cyan-200"
            >
              Log in
            </Link>
          </div>

          {!isAuthenticated ? (
            <p className="mt-4 text-sm text-slate-500">
              7 days free · TradingView sync · Cancel anytime
            </p>
          ) : (
            <p className="mt-4 text-sm text-slate-500">
              No contracts. Cancel anytime.
            </p>
          )}
        </div>

        <div className="relative mx-auto w-full max-w-md lg:max-w-none lg:justify-self-end">
          <div
            aria-hidden
            className="absolute -inset-1 rounded-[2rem] bg-gradient-to-br from-cyan-400/40 via-sky-500/10 to-transparent blur-sm"
          />

          <div className="relative overflow-hidden rounded-[1.75rem] border border-cyan-400/20 bg-slate-950/80 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-7">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/70 to-transparent" />

            <div className="mb-5 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-slate-300">
                Today&apos;s edge
              </p>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-emerald-400">
                <span className="hero-live-dot h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Synced
              </span>
            </div>

            <div className="rounded-2xl border border-cyan-400/15 bg-gradient-to-br from-cyan-500/10 to-slate-900 p-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-200/80">
                Win rate
              </p>
              <p className="mt-1 text-6xl font-black tabular-nums leading-none text-cyan-300 sm:text-7xl">
                74%
              </p>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-slate-900/90 p-3 text-center">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  PF
                </p>
                <p className="mt-1 text-2xl font-extrabold tabular-nums text-white">
                  2.6
                </p>
              </div>

              <div className="rounded-xl bg-slate-900/90 p-3 text-center">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Grade
                </p>
                <p className="mt-1 text-2xl font-extrabold tabular-nums text-cyan-300">
                  A
                </p>
              </div>

              <div className="rounded-xl bg-emerald-500/10 p-3 text-center ring-1 ring-emerald-500/20">
                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400/80">
                  Longs
                </p>
                <p className="mt-1 text-2xl font-extrabold tabular-nums text-emerald-300">
                  78%
                </p>
              </div>
            </div>

            <p className="mt-4 text-center text-xs font-medium text-slate-500">
              Real stats. Real coaching. Right after you trade.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
