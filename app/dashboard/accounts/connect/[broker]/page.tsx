import Link from "next/link";
import { redirect } from "next/navigation";

import ExtensionPairingPanel from "@/components/extension-pairing-panel";
import TradeCoachSyncPairing from "@/components/tradecoach-sync-pairing";
import { getBrokerConnectInfo } from "@/lib/brokers";
import { createClient } from "@/lib/supabase/server";

type ConnectBrokerPageProps = {
  params: Promise<{ broker: string }>;
};

export default async function ConnectBrokerPage({
  params,
}: ConnectBrokerPageProps) {
  const { broker: brokerId } = await params;

  if (brokerId !== "tradingview") {
    redirect("/dashboard/accounts/connect/tradingview");
  }

  const broker = getBrokerConnectInfo("tradingview");
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const highlights = [
    {
      title: "TradingView detection",
      description:
        "The extension recognizes your signed-in TradingView chart and connected trading accounts.",
    },
    {
      title: "All account types",
      description:
        "Syncs paper trading and live broker accounts connected inside TradingView (Tradovate, NinjaTrader, etc.).",
    },
    {
      title: "Separate accounts in stats",
      description:
        "Each TradingView account appears separately so you can filter paper vs live performance.",
    },
    {
      title: "AI coaching",
      description:
        "Completed trades feed your dashboard, reports, and AI coach.",
    },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <section>
        <Link
          href="/dashboard/accounts"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-400 transition hover:text-cyan-300"
        >
          <span aria-hidden="true">←</span>
          Back to accounts
        </Link>

        <p className="mt-8 text-sm font-medium uppercase tracking-[0.24em] text-cyan-300">
          Broker connection
        </p>

        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
          Connect {broker.name}
        </h1>

        <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-400">
          Open TradingView in Chrome, sign in, and connect your broker or paper
          account there. TradeCoach watches that browser tab through the Chrome
          extension and syncs your trades automatically.
        </p>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">
                Connect your broker
              </p>

              <h2 className="mt-2 text-xl font-semibold text-white">
                Sign in on {broker.name}
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-400">
                Open {broker.name}, sign in there in a new tab, and keep that tab
                open. The TradeCoach Sync extension handles the rest — you stay
                on this page.
              </p>
            </div>

            <div className="hidden shrink-0 rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-center sm:block">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Broker
              </p>

              <p className="mt-1 text-sm font-semibold text-white">
                {broker.shortName}
              </p>
            </div>
          </div>

          <div className="my-8 h-px bg-white/10" />

          <ExtensionPairingPanel compact autoOpenInstallGuide userId={user.id} />

          <div className="my-8 h-px bg-white/10" />

          <TradeCoachSyncPairing brokerId={broker.id} />
        </div>

        <aside className="space-y-5">
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-6">
            <h2 className="text-sm font-semibold text-white">
              What happens after pairing?
            </h2>

            <div className="mt-5 space-y-4">
              {highlights.map((item) => (
                <div
                  key={item.title}
                  className="border-b border-white/10 pb-4 last:border-0 last:pb-0"
                >
                  <p className="text-sm font-medium text-slate-200">
                    {item.title}
                  </p>

                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    {item.description}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-6">
            <p className="text-sm font-semibold text-white">
              Missed-trade protection
            </p>

            <p className="mt-3 text-xs leading-6 text-slate-400">
              When the extension reconnects, it will scan recent execution
              history and recover fills that occurred while it was disconnected.
            </p>
          </div>

          <div className="rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.05] p-5">
            <p className="text-sm font-semibold text-emerald-100">
              Private connection
            </p>

            <p className="mt-2 text-xs leading-6 text-slate-400">
              {broker.name} credentials and browser-session information are not
              stored in the TradeCoach database.
            </p>
          </div>
        </aside>
      </section>
    </div>
  );
}
