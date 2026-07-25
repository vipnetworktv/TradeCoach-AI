import { NextResponse } from "next/server";

import { isEmailConfigured } from "@/lib/email";
import {
  sendDailyReports,
  sendMonthlyReports,
  sendTradeSyncAlerts,
  sendWeeklyReports,
} from "@/lib/notifications/send-reports";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type CronType = "daily" | "weekly" | "monthly" | "sync" | "all";

function authorizeCron(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();

  if (!cronSecret) {
    return false;
  }

  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${cronSecret}`;
}

export async function POST(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const url = new URL(request.url);
  const type = (url.searchParams.get("type") || "all") as CronType;

  try {
    if (!isEmailConfigured()) {
      return NextResponse.json(
        {
          error:
            "Email is not configured. Set RESEND_API_KEY and EMAIL_FROM before running notification cron.",
        },
        { status: 503 },
      );
    }

    const admin = createAdminClient();
    const results: Record<string, unknown> = {};

    if (type === "daily" || type === "all") {
      results.daily = await sendDailyReports(admin);
    }

    if (type === "weekly" || type === "all") {
      results.weekly = await sendWeeklyReports(admin);
    }

    if (type === "monthly" || type === "all") {
      results.monthly = await sendMonthlyReports(admin);
    }

    if (type === "sync" || type === "all") {
      results.sync = await sendTradeSyncAlerts(admin);
    }

    return NextResponse.json({
      success: true,
      type,
      results,
    });
  } catch (error) {
    console.error("[Notifications] Cron failed:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Notification cron failed.",
      },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  return POST(request);
}
