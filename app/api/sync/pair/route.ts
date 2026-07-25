import { NextResponse } from "next/server";

import {
  createDeviceToken,
  hashDeviceToken,
  hashPairingCode,
  normalizePairingCode,
} from "@/lib/sync-pairing";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type PairExtensionRequest = {
  code?: string;
  device_name?: string;
  browser?: string | null;
  extension_version?: string | null;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as
      PairExtensionRequest;

    if (!body.code || typeof body.code !== "string") {
      return NextResponse.json(
        { detail: "Enter a valid eight-character pairing code." },
        { status: 400 },
      );
    }

    const normalizedCode = normalizePairingCode(body.code);
    const codeHash = hashPairingCode(normalizedCode);
    const admin = createAdminClient();

    const { data: pairingRecords, error: pairingLookupError } = await admin
      .from("sync_pairing_codes")
      .select("id,user_id,expires_at,used_at")
      .eq("code_hash", codeHash)
      .limit(1);

    if (pairingLookupError) {
      return NextResponse.json(
        { detail: pairingLookupError.message },
        { status: 502 },
      );
    }

    const pairingRecord = pairingRecords?.[0];

    if (!pairingRecord) {
      return NextResponse.json(
        { detail: "The pairing code is invalid." },
        { status: 400 },
      );
    }

    if (pairingRecord.used_at) {
      return NextResponse.json(
        { detail: "This pairing code has already been used." },
        { status: 400 },
      );
    }

    if (new Date(pairingRecord.expires_at).getTime() <= Date.now()) {
      return NextResponse.json(
        {
          detail:
            "This pairing code has expired. Generate a new code in TradeCoach.",
        },
        { status: 400 },
      );
    }

    const rawDeviceToken = createDeviceToken();
    const deviceName =
      typeof body.device_name === "string" && body.device_name.trim()
        ? body.device_name.trim().slice(0, 100)
        : "TradeCoach Sync";

    const { data: createdDevices, error: deviceError } = await admin
      .from("sync_devices")
      .insert({
        user_id: pairingRecord.user_id,
        device_name: deviceName,
        browser:
          typeof body.browser === "string"
            ? body.browser.trim().slice(0, 500)
            : null,
        extension_version:
          typeof body.extension_version === "string"
            ? body.extension_version.trim().slice(0, 50)
            : null,
        device_token_hash: hashDeviceToken(rawDeviceToken),
        is_active: true,
        last_seen_at: new Date().toISOString(),
      })
      .select("id")
      .limit(1);

    if (deviceError || !createdDevices?.[0]) {
      return NextResponse.json(
        {
          detail:
            deviceError?.message ||
            "The sync device could not be registered.",
        },
        { status: 502 },
      );
    }

    const device = createdDevices[0];

    await admin
      .from("sync_pairing_codes")
      .update({ used_at: new Date().toISOString() })
      .eq("id", pairingRecord.id)
      .is("used_at", null);

    return NextResponse.json({
      success: true,
      device_id: device.id,
      device_token: rawDeviceToken,
      message: "TradeCoach Sync was paired successfully.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        detail:
          error instanceof Error
            ? error.message
            : "The pairing request could not be completed.",
      },
      { status: 500 },
    );
  }
}
