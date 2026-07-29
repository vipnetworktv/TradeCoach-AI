import { NextResponse } from "next/server";

import { buildTradeFingerprint } from "@/lib/trade-csv-import";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type TradeRow = {
  id: string;
  broker: string | null;
  broker_pair_id: string | null;
  symbol: string | null;
  entry_at: string | null;
  exit_at: string | null;
  quantity: number | string | null;
  entry_price: number | string | null;
  exit_price: number | string | null;
  created_at?: string | null;
};

function toNumber(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function pickKeeper(rows: TradeRow[]) {
  return [...rows].sort((left, right) => {
    const leftHasBrokerId = Boolean(
      left.broker_pair_id &&
        !left.broker_pair_id.startsWith("history-entry:") &&
        !left.broker_pair_id.startsWith("tv:unknown"),
    );
    const rightHasBrokerId = Boolean(
      right.broker_pair_id &&
        !right.broker_pair_id.startsWith("history-entry:") &&
        !right.broker_pair_id.startsWith("tv:unknown"),
    );

    if (leftHasBrokerId !== rightHasBrokerId) {
      return leftHasBrokerId ? -1 : 1;
    }

    return String(left.created_at || "").localeCompare(
      String(right.created_at || ""),
    );
  })[0];
}

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json(
      { error: "You must be logged in to clean up trades." },
      { status: 401 },
    );
  }

  const { data: trades, error } = await supabase
    .from("broker_completed_trades")
    .select(
      "id,broker,broker_pair_id,symbol,entry_at,exit_at,quantity,entry_price,exit_price,created_at",
    )
    .eq("user_id", user.id)
    .eq("broker", "tradingview")
    .order("exit_at", { ascending: false })
    .limit(5000);

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 502 },
    );
  }

  const grouped = new Map<string, TradeRow[]>();

  for (const trade of trades || []) {
    const symbol = String(trade.symbol || "").trim();
    const entryAt = String(trade.entry_at || "").trim();
    const exitAt = String(trade.exit_at || "").trim();
    const quantity = toNumber(trade.quantity);
    const entryPrice = toNumber(trade.entry_price);
    const exitPrice = toNumber(trade.exit_price);

    if (
      !symbol ||
      !entryAt ||
      !exitAt ||
      quantity === null ||
      entryPrice === null ||
      exitPrice === null
    ) {
      continue;
    }

    const fingerprint = buildTradeFingerprint({
      symbol,
      entry_at: entryAt,
      exit_at: exitAt,
      quantity,
      entry_price: entryPrice,
      exit_price: exitPrice,
    });

    const bucket = grouped.get(fingerprint) || [];
    bucket.push(trade as TradeRow);
    grouped.set(fingerprint, bucket);
  }

  const deleteIds: string[] = [];

  for (const rows of grouped.values()) {
    if (rows.length <= 1) {
      continue;
    }

    const keeper = pickKeeper(rows);

    for (const row of rows) {
      if (row.id !== keeper.id) {
        deleteIds.push(row.id);
      }
    }
  }

  if (deleteIds.length === 0) {
    return NextResponse.json({
      success: true,
      deletedCount: 0,
      message: "No duplicate TradingView trades were found.",
    });
  }

  const { error: deleteError } = await supabase
    .from("broker_completed_trades")
    .delete()
    .eq("user_id", user.id)
    .in("id", deleteIds);

  if (deleteError) {
    return NextResponse.json(
      { error: deleteError.message },
      { status: 502 },
    );
  }

  return NextResponse.json({
    success: true,
    deletedCount: deleteIds.length,
    message: `Removed ${deleteIds.length} duplicate TradingView trade${deleteIds.length === 1 ? "" : "s"}.`,
  });
}
