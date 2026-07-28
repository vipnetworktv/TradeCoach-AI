import { tryCreateAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  TRADINGVIEW_BROKER_NAME,
  TRADINGVIEW_PAPER_ACCOUNT_NAME,
} from "@/lib/tradingview-accounts";

export async function ensurePaperTradingBrokerAccountForUser(
  userId: string,
) {
  const admin = tryCreateAdminClient();
  const supabase = admin ?? (await createClient());
  const now = new Date().toISOString();

  const { data: existing, error: lookupError } = await supabase
    .from("broker_accounts")
    .select("id")
    .eq("user_id", userId)
    .eq("broker_name", TRADINGVIEW_BROKER_NAME)
    .limit(1);

  if (lookupError) {
    throw new Error(lookupError.message);
  }

  if (existing?.[0]) {
    return existing[0].id;
  }

  const { error: insertError } = await supabase.from("broker_accounts").insert({
    user_id: userId,
    broker_name: TRADINGVIEW_BROKER_NAME,
    account_name: TRADINGVIEW_PAPER_ACCOUNT_NAME,
    account_number_masked: "Paper",
    environment: "demo",
    status: "connected",
    is_active: true,
    last_synced_at: now,
  });

  if (insertError) {
    throw new Error(insertError.message);
  }

  return null;
}
