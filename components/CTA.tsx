import Link from "next/link";

export default function CTA() {
  return (
    <section className="border-t border-slate-800/80 bg-slate-900/30 px-6 py-24">
      <div className="mx-auto max-w-5xl">
        <div className="rounded-3xl border border-cyan-500/20 bg-gradient-to-br from-slate-900 to-slate-950 p-10 text-center shadow-[0_0_80px_rgba(34,211,238,0.08)] md:p-16">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-400">
            Start Improving Today
          </p>

          <h2 className="mt-4 text-4xl font-extrabold leading-tight md:text-6xl">
            Ready to Become a
            <br />
            <span className="text-cyan-400">Consistently Profitable Trader?</span>
          </h2>

          <p className="mx-auto mt-8 max-w-3xl text-lg leading-8 text-slate-400">
            TradeCoach AI reviews every trade you take, identifies recurring
            mistakes, uncovers hidden patterns, and gives you personalized AI
            coaching designed to improve your trading over time.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/signup"
              className="rounded-xl bg-cyan-500 px-8 py-4 text-lg font-bold text-slate-950 transition hover:bg-cyan-400"
            >
              Start Your Free 7-Day Trial
            </Link>

            <Link
              href="/login"
              className="rounded-xl border border-slate-700 px-8 py-4 text-lg font-semibold transition hover:border-cyan-400 hover:text-cyan-400"
            >
              Log In
            </Link>
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-8 text-sm text-slate-500">
            <span>✓ 7-Day Free Trial</span>
            <span>✓ Cancel Anytime</span>
            <span>✓ $14.99/month After Trial</span>
          </div>
        </div>
      </div>
    </section>
  );
}