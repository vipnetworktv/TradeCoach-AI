import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import { syncPayPalSubscriptionForUser } from "@/lib/subscription";

export const dynamic = "force-dynamic";

async function resolvePayPalSubscriptionId(
  request: NextRequest,
  userId: string,
) {
  const subscriptionId = request.nextUrl.searchParams.get("subscription_id");

  if (subscriptionId) {
    return subscriptionId;
  }

  const admin = tryCreateAdminClient();
  const supabase = admin ?? (await createClient());

  const { data } = await supabase
    .from("user_subscriptions")
    .select("paypal_subscription_id")
    .eq("user_id", userId)
    .maybeSingle();

  return data?.paypal_subscription_id ?? null;
}

export async function GET(request: NextRequest) {
  let errorMessage = "PayPal could not confirm your subscription. Please try again.";

  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    const subscriptionId = await resolvePayPalSubscriptionId(request, user.id);

    if (!subscriptionId) {
      return NextResponse.redirect(
        new URL("/?subscribe=required&paypal=missing", request.url),
      );
    }

    await syncPayPalSubscriptionForUser(user.id, subscriptionId);

    return NextResponse.redirect(new URL("/dashboard", request.url));
  } catch (error) {
    if (error instanceof Error && error.message) {
      errorMessage = error.message;
    }

    const redirectUrl = new URL("/?subscribe=required&paypal=error", request.url);
    redirectUrl.searchParams.set("message", errorMessage.slice(0, 180));

    return NextResponse.redirect(redirectUrl);
  }
}
