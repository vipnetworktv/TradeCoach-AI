export type SupportedBrokerId = "tradovate" | "ninjatrader";

export type BrokerConnectInfo = {
  id: SupportedBrokerId;
  name: string;
  shortName: string;
  method: string;
  platforms: string;
  syncs: string;
  href: string;
  openUrl: string;
  hostPattern: string;
};

export const BROKER_CONNECT_OPTIONS: BrokerConnectInfo[] = [
  {
    id: "tradovate",
    name: "Tradovate",
    shortName: "Tradovate",
    method: "Chrome extension",
    platforms: "Web",
    syncs: "Live fills, fees, completed trades",
    href: "/dashboard/accounts/connect/tradovate",
    openUrl: "https://trader.tradovate.com/",
    hostPattern: "trader.tradovate.com",
  },
  {
    id: "ninjatrader",
    name: "NinjaTrader Web",
    shortName: "NinjaTrader",
    method: "Chrome extension",
    platforms: "Web",
    syncs: "Executions, commissions, completed trades",
    href: "/dashboard/accounts/connect/ninjatrader",
    openUrl: "https://web-trader.ninjatrader.com/",
    hostPattern: "web-trader.ninjatrader.com",
  },
];

export function getBrokerConnectInfo(id: SupportedBrokerId) {
  const broker = BROKER_CONNECT_OPTIONS.find((option) => option.id === id);

  if (!broker) {
    throw new Error(`Unsupported broker: ${id}`);
  }

  return broker;
}

export function formatBrokerRecordName(value: string | null | undefined) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();

  if (!normalized) {
    return null;
  }

  if (normalized.includes("tradovate")) {
    return "Tradovate";
  }

  if (normalized.includes("ninja")) {
    return "NinjaTrader Web";
  }

  if (normalized.includes("tradestation")) {
    return "TradeStation";
  }

  if (
    normalized.includes("interactive") ||
    normalized === "ibkr" ||
    normalized.includes("ib gateway")
  ) {
    return "Interactive Brokers";
  }

  return String(value).trim();
}

export function getBrokerPlatformIds() {
  return BROKER_CONNECT_OPTIONS.map((broker) => broker.id);
}

export async function upsertBrokerSession(
  userId: string,
  brokerId: SupportedBrokerId,
) {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const broker = getBrokerConnectInfo(brokerId);
  const admin = createAdminClient();
  const now = new Date().toISOString();

  const { data: existingAccounts, error: lookupError } = await admin
    .from("broker_accounts")
    .select("id,status")
    .eq("user_id", userId)
    .eq("broker_name", broker.name)
    .limit(1);

  if (lookupError) {
    throw new Error(lookupError.message);
  }

  const values = {
    status: "connected",
    is_active: true,
    last_synced_at: now,
    account_name: `${broker.name} Web Session`,
  };

  if (existingAccounts?.[0]) {
    const { error } = await admin
      .from("broker_accounts")
      .update(values)
      .eq("id", existingAccounts[0].id);

    if (error) {
      throw new Error(error.message);
    }

    return {
      broker: brokerId,
      broker_name: broker.name,
      account_id: existingAccounts[0].id,
      updated: true,
    };
  }

  const { data: created, error: insertError } = await admin
    .from("broker_accounts")
    .insert({
      user_id: userId,
      broker_name: broker.name,
      account_name: `${broker.name} Web Session`,
      environment: "live",
      currency: "USD",
      ...values,
    })
    .select("id")
    .limit(1);

  if (insertError) {
    throw new Error(insertError.message);
  }

  return {
    broker: brokerId,
    broker_name: broker.name,
    account_id: created?.[0]?.id ?? null,
    updated: false,
  };
}
