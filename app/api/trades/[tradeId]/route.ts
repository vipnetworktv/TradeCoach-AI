import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    tradeId: string;
  }>;
};

export async function DELETE(
  _request: Request,
  context: RouteContext,
) {
  const { tradeId } = await context.params;

  if (!tradeId?.trim()) {
    return NextResponse.json(
      { error: "A trade id is required." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json(
      { error: "You must be logged in to delete trades." },
      { status: 401 },
    );
  }

  const { data, error } = await supabase
    .from("broker_completed_trades")
    .delete()
    .eq("id", tradeId)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();

  if (error) {
    const message = error.message.toLowerCase();
    const policyHint =
      message.includes("policy") || message.includes("permission")
        ? " Run supabase/migrations/008_broker_completed_trades_delete_policy.sql if delete access is not enabled yet."
        : "";

    return NextResponse.json(
      { error: `${error.message}${policyHint}` },
      { status: 502 },
    );
  }

  if (!data) {
    return NextResponse.json(
      { error: "Trade not found or already deleted." },
      { status: 404 },
    );
  }

  return NextResponse.json({
    success: true,
    id: data.id,
  });
}
