import { NextResponse } from "next/server";

import { requireActiveSubscription } from "@/lib/require-active-subscription";
import {
  createPairingCode,
  getPairingCodeExpiry,
  hashPairingCode,
} from "@/lib/sync-pairing";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type CreatePairingCodeRequest = {
  device_name?: string;
};

export async function POST(request: Request) {
  try {
    const access = await requireActiveSubscription();

    if (!access.ok) {
      return access.response;
    }

    const body = (await request.json().catch(() => ({}))) as
      CreatePairingCodeRequest;

    const deviceName =
      typeof body.device_name === "string" && body.device_name.trim()
        ? body.device_name.trim().slice(0, 100)
        : "TradeCoach Sync";

    const admin = createAdminClient();
    const { expiresAt, expiresInSeconds } = getPairingCodeExpiry();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const formattedCode = createPairingCode();
      const codeHash = hashPairingCode(formattedCode);

      const { error } = await admin.from("sync_pairing_codes").insert({
        user_id: access.user.id,
        code_hash: codeHash,
        expires_at: expiresAt.toISOString(),
      });

      if (!error) {
        return NextResponse.json({
          success: true,
          code: formattedCode,
          device_name: deviceName,
          expires_at: expiresAt.toISOString(),
          expires_in_seconds: expiresInSeconds,
        });
      }

      if (error.code !== "23505") {
        return NextResponse.json(
          {
            detail:
              error.message ||
              "The pairing code could not be created.",
          },
          { status: 502 },
        );
      }
    }

    return NextResponse.json(
      { detail: "Could not generate a unique pairing code. Try again." },
      { status: 500 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        detail:
          error instanceof Error
            ? error.message
            : "The pairing code could not be created.",
      },
      { status: 500 },
    );
  }
}
