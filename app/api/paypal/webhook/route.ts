import { NextResponse } from "next/server";

import { applyPayPalSubscriptionToUser } from "@/lib/subscription";
import { getPayPalSubscription, verifyPayPalWebhook } from "@/lib/paypal";

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

  try {
    const paypalSubscription = await getPayPalSubscription(subscriptionId);

    await applyPayPalSubscriptionToUser({
      userId,
      paypalSubscription,
    });
  } catch {
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
