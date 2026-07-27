import Link from "next/link";
import { redirect } from "next/navigation";

import ConnectBrokerGrid from "@/components/connect-broker-grid";
import ExtensionPairingPanel from "@/components/extension-pairing-panel";
import { BROKER_CONNECT_OPTIONS } from "@/lib/brokers";
import { createClient } from "@/lib/supabase/server";
export default async function ConnectBrokerPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

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

        <h1 className="mt-8 text-3xl font-semibold tracking-tight text-white">
          Connect a Broker
        </h1>

        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400">
          Pair the TradeCoach Sync extension once, then connect as many supported
          brokers as you use. Trades from{" "}
          {BROKER_CONNECT_OPTIONS.map((broker) => broker.name).join(" and ")}{" "}
          sync into the same dashboard, reports, and AI coaching.
        </p>
      </section>

      <ExtensionPairingPanel compact />

      <ConnectBrokerGrid />
    </div>
  );
}
