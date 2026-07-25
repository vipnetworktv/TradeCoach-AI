import { NextResponse } from "next/server";

import { createPayPalSubscription } from "@/lib/paypal";
import { createClient } from "@/lib/supabase/server";
import {
  ensureSubscriptionForUser,
  evaluateSubscriptionAccess,
  formatSubscriptionError,
  getSubscriptionForUser,
  insertSubscriptionFallback,
} from "@/lib/subscription";
import { tryCreateAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "You must be logged in to manage billing." },
        { status: 401 },
      );
    }

    if (!user.email) {
      return NextResponse.json(
        { error: "Your account must have an email address before subscribing." },
        { status: 400 },
      );
    }

    if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
      return NextResponse.json(
        {
          error:
            "PayPal is not configured yet. Add PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET to .env.local and restart the app.",
        },
        { status: 503 },
      );
    }

    if (!process.env.PAYPAL_PLAN_ID) {
      return NextResponse.json(
        {
          error:
            "PayPal plan is not configured. Add PAYPAL_PLAN_ID to .env.local and restart the app.",
        },
        { status: 503 },
      );
    }

    let subscription = await getSubscriptionForUser(supabase, user.id);

    if (!subscription) {
      const { data: rpcData, error: rpcError } = await supabase.rpc(
        "ensure_user_subscription",
      );

      if (rpcData) {
        subscription = rpcData as typeof subscription;
      } else {
        const fallback = await insertSubscriptionFallback(
          supabase,
          user.id,
          user.email,
        );
        subscription = fallback.subscription;
      }

      if (!subscription) {
        return NextResponse.json(
          {
            error:
              "Could not create your subscription record. Open Supabase → SQL Editor and run the file supabase/setup_billing.sql, then try again.",
            details: rpcError
              ? formatSubscriptionError(rpcError)
              : undefined,
          },
          { status: 500 },
        );
      }
    }

    const access = evaluateSubscriptionAccess(subscription);

    if (access.hasAccess && (access.reason === "active" || access.reason === "trialing")) {
      return NextResponse.json(
        { error: "Your Pro subscription is already active." },
        { status: 400 },
      );
    }

    const paypalSubscription = await createPayPalSubscription({
      userId: user.id,
      userEmail: user.email,
    });

    const admin = tryCreateAdminClient();
    const writer = admin ?? supabase;

    await writer
      .from("user_subscriptions")
      .update({
        paypal_subscription_id: paypalSubscription.subscriptionId,
        paypal_plan_id: process.env.PAYPAL_PLAN_ID ?? null,
        billing_email: user.email.trim().toLowerCase(),
      })
      .eq("user_id", user.id);

    return NextResponse.json({
      success: true,
      approvalUrl: paypalSubscription.approvalUrl,
      subscriptionId: paypalSubscription.subscriptionId,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to start PayPal checkout right now.",
      },
      { status: 500 },
    );
  }
}
