import { NextResponse } from "next/server";

import {
  getBrokerConnectInfo,
  upsertBrokerSession,
  type SupportedBrokerId,
} from "@/lib/brokers";
import { requireActiveSubscription } from "@/lib/require-active-subscription";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const brokerId = searchParams.get("broker");

  if (brokerId !== "tradovate" && brokerId !== "ninjatrader") {
    return NextResponse.json(
      { error: "Unsupported broker." },
      { status: 400 },
    );
  }

  const broker = getBrokerConnectInfo(brokerId as SupportedBrokerId);
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json(
      { error: "You must be logged in." },
      { status: 401 },
    );
  }

  const { data, error } = await supabase
    .from("broker_accounts")
    .select("id,status,last_synced_at,account_name")
    .eq("user_id", user.id)
    .eq("broker_name", broker.name)
    .eq("status", "connected")
    .eq("is_active", true)
    .order("last_synced_at", { ascending: false })
    .limit(1);

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 502 },
    );
  }

  const account = data?.[0] ?? null;

  return NextResponse.json({
    broker: brokerId,
    broker_name: broker.name,
    connected: Boolean(account),
    account,
  });
}

export async function POST(request: Request) {
  try {
    const access = await requireActiveSubscription();

    if (!access.ok) {
      return access.response;
    }

    const body = (await request.json().catch(() => ({}))) as {
      broker?: string;
    };

    if (body.broker !== "tradovate" && body.broker !== "ninjatrader") {
      return NextResponse.json(
        { error: "Unsupported broker." },
        { status: 400 },
      );
    }

    const result = await upsertBrokerSession(
      access.user.id,
      body.broker as SupportedBrokerId,
    );

    return NextResponse.json({
      success: true,
      connected: true,
      ...result,
      message: `${result.broker_name} is now connected in TradeCoach.`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not save the broker connection.",
      },
      { status: 500 },
    );
  }
}
