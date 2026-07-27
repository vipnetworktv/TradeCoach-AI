import { NextResponse } from "next/server";

import {
  csvTradeToInsertRow,
  parseCsvTrades,
  partitionCsvTradesForImport,
  type ExistingTradeFingerprint,
} from "@/lib/trade-csv-import";
import { createClient } from "@/lib/supabase/server";
import { tryCreateAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const MAX_IMPORT_ROWS = 2000;
const UPSERT_BATCH_SIZE = 100;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json(
      { error: "You must be logged in to import trades." },
      { status: 401 },
    );
  }

  let csvText = "";

  try {
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");

      if (!(file instanceof File)) {
        return NextResponse.json(
          { error: "A CSV file is required." },
          { status: 400 },
        );
      }

      csvText = await file.text();
    } else {
      const body = (await request.json()) as { csv?: string };
      csvText = String(body.csv || "");
    }
  } catch {
    return NextResponse.json(
      { error: "Could not read the CSV upload." },
      { status: 400 },
    );
  }

  if (!csvText.trim()) {
    return NextResponse.json(
      { error: "The CSV file is empty." },
      { status: 400 },
    );
  }

  const { trades: parsedTrades, errors: parseErrors, format } = parseCsvTrades(csvText);

  if (parsedTrades.length === 0) {
    const detail =
      parseErrors[0]?.message ||
      "Check that the file is a Tradovate Orders, Fills, or Position History export.";

    return NextResponse.json(
      {
        error: `No valid trades were found in the CSV file. ${detail}`,
        errors: parseErrors,
        format,
      },
      { status: 400 },
    );
  }

  if (parsedTrades.length > MAX_IMPORT_ROWS) {
    return NextResponse.json(
      {
        error: `CSV imports are limited to ${MAX_IMPORT_ROWS} trades per upload.`,
      },
      { status: 400 },
    );
  }

  const admin = tryCreateAdminClient();
  const db = admin ?? supabase;

  const { data: existingTrades, error: existingError } = await db
    .from("broker_completed_trades")
    .select(
      "broker, broker_pair_id, symbol, entry_at, exit_at, quantity, entry_price, exit_price",
    )
    .eq("user_id", user.id);

  if (existingError) {
    return NextResponse.json(
      { error: existingError.message },
      { status: 502 },
    );
  }

  const { toUpsert, skippedDuplicates, updates } =
    partitionCsvTradesForImport(
      parsedTrades,
      (existingTrades ?? []) as ExistingTradeFingerprint[],
    );

  if (toUpsert.length === 0) {
    return NextResponse.json({
      success: true,
      inserted: 0,
      updated: 0,
      skipped_duplicates: skippedDuplicates,
      skipped_invalid: parseErrors.length,
      errors: parseErrors,
      message: "All rows were skipped because matching trades already exist.",
    });
  }

  const records = toUpsert.map((trade) =>
    csvTradeToInsertRow(trade, user.id),
  );

  let upsertedCount = 0;

  for (let index = 0; index < records.length; index += UPSERT_BATCH_SIZE) {
    const batch = records.slice(index, index + UPSERT_BATCH_SIZE);
    const { error: upsertError } = await db.from("broker_completed_trades").upsert(
      batch,
      {
        onConflict: "user_id,broker,broker_pair_id",
        ignoreDuplicates: false,
      },
    );

    if (upsertError) {
      const message = upsertError.message.toLowerCase();
      const policyHint =
        message.includes("policy") || message.includes("permission")
          ? " Run supabase/migrations/009_broker_completed_trades_import_policy.sql if import access is not enabled yet."
          : "";

      return NextResponse.json(
        {
          error: `${upsertError.message}${policyHint}`,
          inserted: upsertedCount,
          skipped_duplicates: skippedDuplicates,
          skipped_invalid: parseErrors.length,
          errors: parseErrors,
        },
        { status: 502 },
      );
    }

    upsertedCount += batch.length;
  }

  const inserted = Math.max(0, upsertedCount - updates);

  return NextResponse.json({
    success: true,
    inserted,
    updated: updates,
    skipped_duplicates: skippedDuplicates,
    skipped_invalid: parseErrors.length,
    errors: parseErrors,
    format,
    message: `Imported ${inserted} trade${inserted === 1 ? "" : "s"}${updates ? `, updated ${updates}` : ""}${skippedDuplicates ? `, skipped ${skippedDuplicates} duplicate${skippedDuplicates === 1 ? "" : "s"}` : ""}.`,
  });
}
