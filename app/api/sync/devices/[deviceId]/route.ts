import { NextResponse } from "next/server";

import { requireActiveSubscription } from "@/lib/require-active-subscription";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    deviceId: string;
  }>;
};

export async function DELETE(
  _request: Request,
  context: RouteContext,
) {
  try {
    const { deviceId } = await context.params;

    if (!deviceId?.trim()) {
      return NextResponse.json(
        { error: "A device id is required." },
        { status: 400 },
      );
    }

    const access = await requireActiveSubscription();

    if (!access.ok) {
      return access.response;
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("sync_devices")
      .update({ is_active: false })
      .eq("id", deviceId)
      .eq("user_id", access.user.id)
      .select("id")
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: error.message || "Could not revoke the device." },
        { status: 502 },
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: "Device not found." },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "Extension pairing was revoked.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not revoke the device.",
      },
      { status: 500 },
    );
  }
}
