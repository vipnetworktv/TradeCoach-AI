import Link from "next/link";

export default function Pricing() {
  const includedFeatures = [
    "Connect multiple broker accounts",
    "Automatic trade imports",
    "Automatic trade syncing",
    "AI trade grading",
    "Performance analytics",
    "Daily coaching reports",
    "Weekly coaching reports",
    "Monthly performance reports",
    "AI trading-history chat",
    "Pattern detection",
    "Multi-account comparison",
    "Future feature updates",
  ];

  return (
    <section
      id="pricing"
      className="border-t border-slate-800/80 px-6 py-24"
    >
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-400">
            Simple Pricing
          </p>

          <h2 className="mt-4 text-4xl font-extrabold md:text-5xl">
            One Plan. Everything Included.
          </h2>

          <p className="mt-6 text-lg leading-8 text-slate-400">
            Start with a free 7-day trial and unlock the complete TradeCoach AI
            experience.
          </p>
        </div>

        <div className="mx-auto mt-16 max-w-2xl">
          <div className="relative rounded-3xl border border-cyan-400/60 bg-slate-900 p-8 shadow-[0_0_60px_rgba(34,211,238,0.12)] md:p-10">
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-cyan-500 px-5 py-1.5 text-sm font-bold text-slate-950">
              7-Day Free Trial
            </div>

            <div className="text-center">
              <p className="text-sm font-semibold uppercase tracking-widest text-cyan-400">
                TradeCoach AI Pro
              </p>

              <div className="mt-6 flex items-end justify-center gap-2">
                <span className="text-6xl font-extrabold">$14.99</span>
                <span className="pb-2 text-slate-400">/month</span>
              </div>

              <p className="mx-auto mt-5 max-w-lg leading-7 text-slate-400">
                Everything you need to track your trades, understand your
                habits, and improve with personalized AI coaching.
              </p>
            </div>

            <div className="mt-10 grid gap-4 text-slate-300 sm:grid-cols-2">
              {includedFeatures.map((feature) => (
                <div key={feature} className="flex items-start gap-3">
                  <span className="mt-0.5 font-bold text-cyan-400">✓</span>
                  <span>{feature}</span>
                </div>
              ))}
            </div>

            <Link
              href="/signup"
              className="mt-10 block w-full rounded-xl bg-cyan-500 px-6 py-4 text-center text-lg font-bold text-slate-950 transition hover:bg-cyan-400"
            >
              Start Your Free 7-Day Trial
            </Link>

            <p className="mt-4 text-center text-sm text-slate-500">
              Then $14.99 per month. Cancel anytime.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}