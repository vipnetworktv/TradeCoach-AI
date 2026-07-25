const PAYPAL_SANDBOX_API = "https://api-m.sandbox.paypal.com";
const PAYPAL_LIVE_API = "https://api-m.paypal.com";

export type PayPalSubscriptionStatus =
  | "APPROVAL_PENDING"
  | "APPROVED"
  | "ACTIVE"
  | "SUSPENDED"
  | "CANCELLED"
  | "EXPIRED";

export type PayPalSubscription = {
  id: string;
  status: PayPalSubscriptionStatus;
  plan_id?: string;
  custom_id?: string;
  subscriber?: {
    email_address?: string;
    payer_id?: string;
  };
  billing_info?: {
    next_billing_time?: string;
    last_payment?: {
      time?: string;
    };
  };
};

function getPayPalApiBase() {
  return process.env.PAYPAL_MODE === "live"
    ? PAYPAL_LIVE_API
    : PAYPAL_SANDBOX_API;
}

function getPayPalCredentials() {
  const clientId = process.env.PAYPAL_CLIENT_ID?.trim();
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET in environment variables.",
    );
  }

  return { clientId, clientSecret };
}

function getPayPalModeLabel() {
  return process.env.PAYPAL_MODE === "live" ? "live" : "sandbox";
}

function getAppBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.FRONTEND_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

export async function getPayPalAccessToken() {
  const { clientId, clientSecret } = getPayPalCredentials();
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString(
    "base64",
  );

  const response = await fetch(`${getPayPalApiBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });

  const payload = (await response.json()) as {
    access_token?: string;
    error_description?: string;
  };

  if (!response.ok || !payload.access_token) {
    const mode = getPayPalModeLabel();
    const description =
      payload.error_description || "Unable to authenticate with PayPal.";

    throw new Error(
      `${description} Check that PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET come from the ${mode} app in the PayPal Developer Dashboard and match PAYPAL_MODE=${mode}.`,
    );
  }

  return payload.access_token;
}

export async function createPayPalSubscription({
  userId,
  userEmail,
}: {
  userId: string;
  userEmail: string;
}) {
  const planId = process.env.PAYPAL_PLAN_ID;

  if (!planId) {
    throw new Error("Missing PAYPAL_PLAN_ID in environment variables.");
  }

  const accessToken = await getPayPalAccessToken();
  const baseUrl = getAppBaseUrl();

  const response = await fetch(`${getPayPalApiBase()}/v1/billing/subscriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      plan_id: planId,
      custom_id: userId,
      subscriber: {
        email_address: userEmail,
      },
      application_context: {
        brand_name: "TradeCoach AI",
        locale: "en-US",
        shipping_preference: "NO_SHIPPING",
        user_action: "SUBSCRIBE_NOW",
        payment_method: {
          payer_selected: "PAYPAL",
          payee_preferred: "IMMEDIATE_PAYMENT_REQUIRED",
        },
        return_url: `${baseUrl}/api/paypal/subscription/return`,
        cancel_url: `${baseUrl}/?subscribe=required&paypal=canceled`,
      },
    }),
    cache: "no-store",
  });

  const payload = (await response.json()) as PayPalSubscription & {
    links?: Array<{ rel: string; href: string }>;
    message?: string;
    details?: Array<{ description?: string }>;
  };

  if (!response.ok) {
    const detail =
      payload.details?.[0]?.description ||
      payload.message ||
      "Unable to create PayPal subscription.";

    throw new Error(detail);
  }

  const approvalUrl = payload.links?.find(
    (link) => link.rel === "approve",
  )?.href;

  if (!approvalUrl || !payload.id) {
    throw new Error("PayPal did not return a subscription approval URL.");
  }

  return {
    subscriptionId: payload.id,
    approvalUrl,
    status: payload.status,
  };
}

export async function getPayPalSubscription(subscriptionId: string) {
  const accessToken = await getPayPalAccessToken();

  const response = await fetch(
    `${getPayPalApiBase()}/v1/billing/subscriptions/${subscriptionId}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    },
  );

  const payload = (await response.json()) as PayPalSubscription & {
    message?: string;
  };

  if (!response.ok) {
    throw new Error(payload.message || "Unable to load PayPal subscription.");
  }

  return payload;
}

function isPayPalSubscriptionApproved(
  status: PayPalSubscriptionStatus | undefined,
) {
  return (
    status === "ACTIVE" ||
    status === "APPROVED" ||
    status === "APPROVAL_PENDING"
  );
}

export async function waitForPayPalSubscriptionActivation(
  subscriptionId: string,
  attempts = 6,
) {
  let lastSubscription: PayPalSubscription | null = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const subscription = await getPayPalSubscription(subscriptionId);
    lastSubscription = subscription;

    if (isPayPalSubscriptionApproved(subscription.status)) {
      return subscription;
    }

    if (attempt < attempts - 1) {
      await new Promise((resolve) => {
        setTimeout(resolve, 1000);
      });
    }
  }

  if (!lastSubscription) {
    throw new Error("Unable to load PayPal subscription.");
  }

  return lastSubscription;
}

export async function cancelPayPalSubscription(
  subscriptionId: string,
  reason = "Customer requested cancellation.",
) {
  const accessToken = await getPayPalAccessToken();

  const response = await fetch(
    `${getPayPalApiBase()}/v1/billing/subscriptions/${subscriptionId}/cancel`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reason }),
      cache: "no-store",
    },
  );

  if (response.status === 204) {
    return;
  }

  if (response.ok) {
    return;
  }

  const payload = (await response.json().catch(() => ({}))) as {
    message?: string;
    name?: string;
  };

  if (
    payload.name === "UNPROCESSABLE_ENTITY" &&
    payload.message?.toLowerCase().includes("cancel")
  ) {
    return;
  }

  throw new Error(payload.message || "Unable to cancel PayPal subscription.");
}

export async function verifyPayPalWebhook(
  headers: Headers,
  body: string,
) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;

  if (!webhookId) {
    throw new Error("Missing PAYPAL_WEBHOOK_ID in environment variables.");
  }

  const accessToken = await getPayPalAccessToken();

  const response = await fetch(
    `${getPayPalApiBase()}/v1/notifications/verify-webhook-signature`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        auth_algo: headers.get("paypal-auth-algo"),
        cert_url: headers.get("paypal-cert-url"),
        transmission_id: headers.get("paypal-transmission-id"),
        transmission_sig: headers.get("paypal-transmission-sig"),
        transmission_time: headers.get("paypal-transmission-time"),
        webhook_id: webhookId,
        webhook_event: JSON.parse(body),
      }),
      cache: "no-store",
    },
  );

  const payload = (await response.json()) as {
    verification_status?: string;
  };

  return payload.verification_status === "SUCCESS";
}

export function parsePayPalPeriodEnd(subscription: PayPalSubscription) {
  const nextBillingTime = subscription.billing_info?.next_billing_time;

  if (nextBillingTime) {
    return new Date(nextBillingTime);
  }

  const fallback = new Date();
  fallback.setMonth(fallback.getMonth() + 1);
  return fallback;
}
