/**
 * Checks that production-critical environment variables are present.
 *
 * Usage:
 *   node scripts/verify-env.mjs
 *   node scripts/verify-env.mjs --production
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:process";

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

const production = process.argv.includes("--production");

const groups = [
  {
    title: "Supabase",
    required: [
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "SUPABASE_SECRET_KEY",
    ],
  },
  {
    title: "App URLs",
    required: production
      ? ["NEXT_PUBLIC_APP_URL"]
      : [],
    optional: ["NEXT_PUBLIC_APP_URL", "FRONTEND_URL", "NEXT_PUBLIC_API_URL"],
  },
  {
    title: "OpenAI",
    required: ["OPENAI_API_KEY"],
  },
  {
    title: "PayPal",
    required: production
      ? [
          "PAYPAL_CLIENT_ID",
          "PAYPAL_CLIENT_SECRET",
          "PAYPAL_PLAN_ID",
          "PAYPAL_WEBHOOK_ID",
        ]
      : ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "PAYPAL_PLAN_ID"],
    optional: ["PAYPAL_MODE", "PAYPAL_WEBHOOK_ID"],
  },
  {
    title: "Email",
    required: production ? ["RESEND_API_KEY", "EMAIL_FROM"] : [],
    optional: ["RESEND_API_KEY", "EMAIL_FROM"],
  },
  {
    title: "Cron",
    required: production ? ["CRON_SECRET"] : [],
    optional: ["CRON_SECRET"],
  },
];

function isSet(name) {
  return Boolean(process.env[name]?.trim());
}

let missingRequired = 0;
let missingOptional = 0;

for (const group of groups) {
  console.log(`\n${group.title}`);

  for (const name of group.required || []) {
    if (isSet(name)) {
      console.log(`  OK  ${name}`);
    } else {
      console.log(`  MISSING (required) ${name}`);
      missingRequired += 1;
    }
  }

  for (const name of group.optional || []) {
    if ((group.required || []).includes(name)) {
      continue;
    }

    if (isSet(name)) {
      console.log(`  OK  ${name}`);
    } else {
      console.log(`  optional ${name}`);
      missingOptional += 1;
    }
  }
}

console.log("");

if (missingRequired > 0) {
  console.error(
    `Missing ${missingRequired} required variable(s). Copy .env.example to .env.local and fill in values.`,
  );
  process.exit(1);
}

console.log(
  production
    ? "Production environment check passed."
    : "Local environment check passed.",
);

if (missingOptional > 0 && !production) {
  console.log(`${missingOptional} optional variable(s) are not set yet.`);
}
