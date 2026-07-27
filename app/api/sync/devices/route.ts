import { NextResponse } from "next/server";

import { requireActiveSubscription } from "@/lib/require-active-subscription";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const access = await requireActiveSubscription();

    if (!access.ok) {
      return access.response;
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("sync_devices")
      .select(
        "id,device_name,browser,extension_version,last_seen_at,last_successful_sync_at,is_active,created_at",
      )
      .eq("user_id", access.user.id)
      .order("last_seen_at", { ascending: false, nullsFirst: false });

    if (error) {
      return NextResponse.json(
        { error: error.message || "Could not load paired devices." },
        { status: 502 },
      );
    }

    return NextResponse.json({
      devices: data ?? [],
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not load paired devices.",
      },
      { status: 500 },
    );
  }
}
