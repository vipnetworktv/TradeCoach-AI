import { NextResponse } from "next/server";

import { isEmailConfigured } from "@/lib/email";
import { sendTestReportForUser } from "@/lib/notifications/send-reports";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type ReportType = "daily_report" | "weekly_report" | "monthly_report";

export async function POST(request: Request) {
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

    if (!isEmailConfigured()) {
      return NextResponse.json(
        {
          error:
            "Email is not configured yet. Add RESEND_API_KEY and EMAIL_FROM to your environment.",
        },
        { status: 503 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      reportType?: ReportType;
    };

    const reportType = body.reportType || "daily_report";
    const admin = createAdminClient();
    const result = await sendTestReportForUser(
      admin,
      user.id,
      user.email,
      reportType,
    );

    if (!result.sent) {
      return NextResponse.json(
        { error: result.error || "Could not send test email." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      message: `Test ${reportType.replace("_", " ")} sent to ${user.email}.`,
    });
  } catch (error) {
    console.error("[Notifications] Test send failed:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not send test email.",
      },
      { status: 500 },
    );
  }
}
