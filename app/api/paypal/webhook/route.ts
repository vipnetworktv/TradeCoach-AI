import { NextResponse } from "next/server";

import {
  applyPayPalSubscriptionToUser,
  mapPayPalSubscriptionStatus,
} from "@/lib/subscription";
import { getPayPalSubscription, verifyPayPalWebhook } from "@/lib/paypal";
import { tryCreateAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type PayPalWebhookEvent = {
  event_type?: string;
  resource?: {
    id?: string;
    custom_id?: string;
    status?: string;
  };
};

export async function POST(request: Request) {
  const body = await request.text();

  try {
    const verified = await verifyPayPalWebhook(request.headers, body);

    if (!verified) {
      return NextResponse.json({ error: "Invalid webhook signature." }, { status: 400 });
    }
  } catch {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "Webhook verification failed." },
        { status: 400 },
      );
    }
  }

  const event = JSON.parse(body) as PayPalWebhookEvent;
  const subscriptionId = event.resource?.id;
  const userId = event.resource?.custom_id;

  if (!subscriptionId || !userId) {
    return NextResponse.json({ received: true });
  }

  const admin = tryCreateAdminClient();

  if (!admin) {
    return NextResponse.json(
      { error: "Admin client unavailable." },
      { status: 500 },
    );
  }

  try {
    const paypalSubscription = await getPayPalSubscription(subscriptionId);
    const mappedStatus = mapPayPalSubscriptionStatus(paypalSubscription.status);

    if (
      event.event_type === "BILLING.SUBSCRIPTION.ACTIVATED" ||
      event.event_type === "BILLING.SUBSCRIPTION.RE-ACTIVATED" ||
      mappedStatus === "active"
    ) {
      await applyPayPalSubscriptionToUser({
        userId,
        paypalSubscription,
      });
    } else if (
      event.event_type === "BILLING.SUBSCRIPTION.CANCELLED" ||
      mappedStatus === "canceled"
    ) {
      await admin
        .from("user_subscriptions")
        .update({
          status: "canceled",
          canceled_at: new Date().toISOString(),
          current_period_end: new Date().toISOString(),
        })
        .eq("user_id", userId);
    } else if (
      event.event_type === "BILLING.SUBSCRIPTION.EXPIRED" ||
      mappedStatus === "expired"
    ) {
      await admin
        .from("user_subscriptions")
        .update({
          status: "expired",
        })
        .eq("user_id", userId);
    } else if (
      event.event_type === "BILLING.SUBSCRIPTION.SUSPENDED" ||
      mappedStatus === "past_due"
    ) {
      await admin
        .from("user_subscriptions")
        .update({
          status: "past_due",
        })
        .eq("user_id", userId);
    }
  } catch {
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
