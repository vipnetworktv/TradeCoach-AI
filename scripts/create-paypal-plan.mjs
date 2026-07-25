/**
 * Creates a sandbox/live PayPal product + billing plan for TradeCoach AI.
 *
 * Usage:
 *   node scripts/create-paypal-plan.mjs
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  try {
    const contents = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");

    for (const line of contents.split(/\r?\n/)) {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const separator = trimmed.indexOf("=");

      if (separator === -1) {
        continue;
      }

      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim();

      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env.local is optional if vars are already exported
  }
}

loadEnvLocal();

const apiBase =
  process.env.PAYPAL_MODE === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

const clientId = process.env.PAYPAL_CLIENT_ID?.trim();
const clientSecret = process.env.PAYPAL_CLIENT_SECRET?.trim();

if (!clientId || !clientSecret) {
  console.error("Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in .env.local first.");
  process.exit(1);
}

async function getAccessToken() {
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString(
    "base64",
  );

  const response = await fetch(`${apiBase}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  const payload = await response.json();

  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || "PayPal auth failed.");
  }

  return payload.access_token;
}

async function createProduct(accessToken) {
  const response = await fetch(`${apiBase}/v1/catalogs/products`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "TradeCoach AI",
      description:
        "TradeCoach AI is a subscription-based trading analytics and coaching platform.",
      type: "SERVICE",
      category: "SOFTWARE",
    }),
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.message || "Unable to create PayPal product.");
  }

  return payload.id;
}

async function createPlan(accessToken, productId) {
  const response = await fetch(`${apiBase}/v1/billing/plans`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      product_id: productId,
      name: "TradeCoach AI Pro",
      description: "Monthly access to TradeCoach AI Pro",
      billing_cycles: [
        {
          frequency: {
            interval_unit: "DAY",
            interval_count: 7,
          },
          tenure_type: "TRIAL",
          sequence: 1,
          total_cycles: 1,
          pricing_scheme: {
            fixed_price: {
              value: "0",
              currency_code: "USD",
            },
          },
        },
        {
          frequency: {
            interval_unit: "MONTH",
            interval_count: 1,
          },
          tenure_type: "REGULAR",
          sequence: 2,
          total_cycles: 0,
          pricing_scheme: {
            fixed_price: {
              value: "14.99",
              currency_code: "USD",
            },
          },
        },
      ],
      payment_preferences: {
        auto_bill_outstanding: true,
        setup_fee_failure_action: "CONTINUE",
        payment_failure_threshold: 1,
      },
    }),
  });

  const payload = await response.json();

  if (!response.ok) {
    console.error(payload);
    throw new Error(payload.message || "Unable to create PayPal plan.");
  }

  return payload.id;
}

async function main() {
  const accessToken = await getAccessToken();
  const productId = process.env.PAYPAL_PRODUCT_ID?.trim() || (await createProduct(accessToken));
  const planId = await createPlan(accessToken, productId);

  console.log(`Mode: ${process.env.PAYPAL_MODE === "live" ? "live" : "sandbox"}`);
  console.log(`Product ID: ${productId}`);
  console.log(`Plan ID: ${planId}`);
  console.log("\nAdd this to .env.local:");
  console.log(`PAYPAL_PLAN_ID=${planId}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
