import { NextResponse } from "next/server";

import { isEmailConfigured } from "@/lib/email";
import { formatNotificationError } from "@/lib/notifications/errors";
import {
  getNotificationSettingsForUser,
  saveNotificationSettingsForUser,
} from "@/lib/notifications/settings";
import type { NotificationSettings } from "@/lib/notifications/types";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user?.email) {
      return NextResponse.json(
        { error: "You must be logged in." },
        { status: 401 },
      );
    }

    const result = await getNotificationSettingsForUser(
      supabase,
      user.id,
      user.email,
    );

    return NextResponse.json({
      settings: result.settings,
      email: result.email,
      updatedAt: result.updatedAt,
      setupRequired: result.setupRequired,
      emailConfigured: isEmailConfigured(),
    });
  } catch (error) {
    console.error("[Notifications] GET settings failed:", error);

    return NextResponse.json(
      {
        error: formatNotificationError(error),
      },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user?.email) {
      return NextResponse.json(
        { error: "You must be logged in." },
        { status: 401 },
      );
    }

    const body = (await request.json()) as {
      settings?: NotificationSettings;
    };

    if (!body.settings) {
      return NextResponse.json(
        { error: "Notification settings are required." },
        { status: 400 },
      );
    }

    const result = await saveNotificationSettingsForUser(
      supabase,
      user.id,
      user.email,
      body.settings,
    );

    return NextResponse.json({
      settings: result.settings,
      email: result.email,
      updatedAt: result.updatedAt,
      setupRequired: false,
      emailConfigured: isEmailConfigured(),
    });
  } catch (error) {
    console.error("[Notifications] PUT settings failed:", error);

    return NextResponse.json(
      {
        error: formatNotificationError(error),
      },
      { status: 500 },
    );
  }
}
