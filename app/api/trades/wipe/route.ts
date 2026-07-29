import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const CONFIRM_PHRASE = "DELETE ALL TRADES";

type WipeBody = {
  confirm?: string;
};

function deletePolicyHint(message: string) {
  if (
    message.toLowerCase().includes("policy") ||
    message.toLowerCase().includes("permission")
  ) {
    return " Run supabase/migrations/008_broker_completed_trades_delete_policy.sql in Supabase if delete access is not enabled yet.";
  }

  return "";
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as WipeBody;

  if (body.confirm !== CONFIRM_PHRASE) {
    return NextResponse.json(
      {
        error: `Type ${CONFIRM_PHRASE} to confirm.`,
      },
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
    .eq("user_id", user.id)
    .select("id");

  if (error) {
    return NextResponse.json(
      {
        error: `${error.message}${deletePolicyHint(error.message)}`,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    success: true,
    deletedCount: data?.length ?? 0,
    message: `Deleted ${data?.length ?? 0} trade${data?.length === 1 ? "" : "s"}.`,
  });
}
