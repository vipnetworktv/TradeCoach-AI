import { NextResponse } from "next/server";

import { cancelPayPalSubscription } from "@/lib/paypal";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  evaluateSubscriptionAccess,
  formatShortDate,
  getSubscriptionForUser,
  isInPayPalTrialPeriod,
  resolveTrialEndsAt,
} from "@/lib/subscription";

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

    const subscription = await getSubscriptionForUser(supabase, user.id);

    if (!subscription) {
      return NextResponse.json(
        { error: "No subscription record was found for this account." },
        { status: 404 },
      );
    }

    const access = evaluateSubscriptionAccess(subscription);
    const inTrial = isInPayPalTrialPeriod(subscription);

    if (!access.hasAccess && access.reason === "canceled") {
      return NextResponse.json(
        { error: "Your subscription is already canceled." },
        { status: 400 },
      );
    }

    if (!access.hasAccess) {
      return NextResponse.json(
        { error: "You do not have an active subscription to cancel." },
        { status: 400 },
      );
    }

    if (!subscription.paypal_subscription_id) {
      return NextResponse.json(
        { error: "No PayPal subscription is linked to this account." },
        { status: 400 },
      );
    }

    if (subscription.cancel_at_period_end && inTrial) {
      const trialEndsAt = resolveTrialEndsAt(subscription);

      return NextResponse.json(
        {
          error: `Your trial is already set to end on ${formatShortDate(trialEndsAt)} with no charge.`,
        },
        { status: 400 },
      );
    }

    await cancelPayPalSubscription(subscription.paypal_subscription_id);

    const admin = tryCreateAdminClient();

    if (!admin) {
      return NextResponse.json(
        { error: "Unable to update your subscription right now." },
        { status: 500 },
      );
    }

    const now = new Date().toISOString();

    if (inTrial) {
      const trialEndsAt = resolveTrialEndsAt(subscription);

      const { data, error } = await admin
        .from("user_subscriptions")
        .update({
          status: "trialing",
          cancel_at_period_end: true,
          canceled_at: now,
        })
        .eq("user_id", user.id)
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      return NextResponse.json({
        success: true,
        endsAtTrialEnd: true,
        subscription: data,
        accessEndsAt: trialEndsAt?.toISOString() ?? null,
        message: `Your PayPal subscription was canceled. You keep full access until ${formatShortDate(trialEndsAt)}, and you will not be charged.`,
      });
    }

    const { data, error } = await admin
      .from("user_subscriptions")
      .update({
        status: "canceled",
        cancel_at_period_end: false,
        canceled_at: now,
        current_period_end: now,
        trial_ends_at: now,
      })
      .eq("user_id", user.id)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      endsAtTrialEnd: false,
      subscription: data,
      message:
        "Your PayPal subscription was canceled and dashboard access has ended.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to cancel your subscription right now.",
      },
      { status: 500 },
    );
  }
}
