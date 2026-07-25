import { NextResponse } from "next/server";

import { isTrialEligibleForEmail } from "@/lib/subscription";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: string };
    const email = body.email?.trim() ?? "";

    if (!email) {
      return NextResponse.json(
        { eligible: false, error: "Email is required." },
        { status: 400 },
      );
    }

    const eligible = await isTrialEligibleForEmail(email);

    return NextResponse.json({
      eligible,
      message: eligible
        ? null
        : "A free trial has already been used for this email address. You can still create an account and subscribe with PayPal.",
    });
  } catch {
    return NextResponse.json(
      { eligible: false, error: "Unable to verify trial eligibility." },
      { status: 500 },
    );
  }
}
