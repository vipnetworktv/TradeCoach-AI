import type { SupabaseClient } from "@supabase/supabase-js";

import {
  parsePayPalPeriodEnd,
  waitForPayPalSubscriptionActivation,
  type PayPalSubscription,
} from "@/lib/paypal";
import { tryCreateAdminClient } from "@/lib/supabase/admin";

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "canceled"
  | "expired"
  | "past_due";

export type UserSubscription = {
  user_id: string;
  status: SubscriptionStatus;
  plan_name: string;
  trial_started_at: string;
  trial_ends_at: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  trial_used: boolean;
  billing_email: string | null;
  paypal_subscription_id: string | null;
  paypal_payer_id: string | null;
  paypal_plan_id: string | null;
  created_at: string;
  updated_at: string;
};

export type SubscriptionAccess = {
  subscription: UserSubscription | null;
  hasAccess: boolean;
  reason:
    | "trialing"
    | "active"
    | "trial_expired"
    | "canceled"
    | "expired"
    | "past_due"
    | "missing"
    | "setup_required";
  trialDaysRemaining: number;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
};

export const TRIAL_LENGTH_DAYS = 7;
export const PRO_MONTHLY_PRICE = 14.99;
export const PAYPAL_PLAN_NAME = "TradeCoach AI";
export const PAYPAL_PLAN_DESCRIPTION =
  "TradeCoach AI is a subscription-based trading analytics and coaching platform.";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function normalizeBillingEmail(email: string) {
  return email.trim().toLowerCase();
}

export function parseDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function getTrialDaysRemaining(trialEndsAt: Date | null, now = new Date()) {
  if (!trialEndsAt) {
    return 0;
  }

  const diffMs = trialEndsAt.getTime() - now.getTime();

  return Math.max(0, Math.ceil(diffMs / MS_PER_DAY));
}

export function getTrialProgressPercent(
  trialStartedAt: Date | null,
  trialEndsAt: Date | null,
  now = new Date(),
) {
  if (!trialStartedAt || !trialEndsAt) {
    return 0;
  }

  const totalMs = trialEndsAt.getTime() - trialStartedAt.getTime();

  if (totalMs <= 0) {
    return 100;
  }

  const elapsedMs = now.getTime() - trialStartedAt.getTime();

  return Math.min(100, Math.max(0, Math.round((elapsedMs / totalMs) * 100)));
}

export function resolveTrialEndsAt(
  subscription: UserSubscription,
  now = new Date(),
) {
  const storedTrialEndsAt = parseDate(subscription.trial_ends_at);
  const currentPeriodEnd = parseDate(subscription.current_period_end);

  if (storedTrialEndsAt && storedTrialEndsAt.getTime() > now.getTime()) {
    return storedTrialEndsAt;
  }

  if (
    subscription.paypal_subscription_id &&
    currentPeriodEnd &&
    currentPeriodEnd.getTime() > now.getTime()
  ) {
    return currentPeriodEnd;
  }

  return storedTrialEndsAt ?? currentPeriodEnd;
}

export function resolveTrialStartedAt(subscription: UserSubscription) {
  const trialStartedAt = parseDate(subscription.trial_started_at);
  const createdAt = parseDate(subscription.created_at);
  const trialEndsAt = resolveTrialEndsAt(subscription);
  const storedTrialEndsAt = parseDate(subscription.trial_ends_at);

  if (
    trialStartedAt &&
    trialEndsAt &&
    trialEndsAt.getTime() > trialStartedAt.getTime()
  ) {
    return trialStartedAt;
  }

  if (
    trialStartedAt &&
    storedTrialEndsAt &&
    storedTrialEndsAt.getTime() <= trialStartedAt.getTime() &&
    trialEndsAt
  ) {
    return createdAt ?? trialStartedAt;
  }

  return trialStartedAt ?? createdAt;
}

export function isInPayPalTrialPeriod(
  subscription: UserSubscription,
  now = new Date(),
) {
  if (!subscription.paypal_subscription_id) {
    return false;
  }

  if (subscription.status === "trialing") {
    const trialEndsAt = resolveTrialEndsAt(subscription, now);
    return Boolean(trialEndsAt && trialEndsAt.getTime() > now.getTime());
  }

  const trialEndsAt = resolveTrialEndsAt(subscription, now);
  if (!trialEndsAt || trialEndsAt.getTime() <= now.getTime()) {
    return false;
  }

  const trialStartedAt = resolveTrialStartedAt(subscription);
  if (!trialStartedAt) {
    return getTrialDaysRemaining(trialEndsAt, now) <= TRIAL_LENGTH_DAYS;
  }

  const elapsedDays = (now.getTime() - trialStartedAt.getTime()) / MS_PER_DAY;
  const totalTrialDays =
    (trialEndsAt.getTime() - trialStartedAt.getTime()) / MS_PER_DAY;

  return (
    elapsedDays <= TRIAL_LENGTH_DAYS + 1 &&
    totalTrialDays <= TRIAL_LENGTH_DAYS + 1
  );
}

export function evaluateSubscriptionAccess(
  subscription: UserSubscription | null,
  now = new Date(),
): SubscriptionAccess {
  if (!subscription) {
    return {
      subscription: null,
      hasAccess: false,
      reason: "missing",
      trialDaysRemaining: 0,
      trialEndsAt: null,
      currentPeriodEnd: null,
    };
  }

  const trialEndsAt = resolveTrialEndsAt(subscription, now);
  const currentPeriodEnd = parseDate(subscription.current_period_end);
  const trialDaysRemaining = getTrialDaysRemaining(trialEndsAt, now);

  if (isInPayPalTrialPeriod(subscription, now)) {
    return {
      subscription,
      hasAccess: true,
      reason: "trialing",
      trialDaysRemaining,
      trialEndsAt,
      currentPeriodEnd,
    };
  }

  if (subscription.status === "trialing") {
    if (subscription.paypal_subscription_id) {
      return {
        subscription,
        hasAccess: false,
        reason: "trial_expired",
        trialDaysRemaining: 0,
        trialEndsAt,
        currentPeriodEnd,
      };
    }

    return {
      subscription,
      hasAccess: false,
      reason: "setup_required",
      trialDaysRemaining,
      trialEndsAt,
      currentPeriodEnd,
    };
  }

  if (subscription.status === "active") {
    const hasAccess =
      !subscription.cancel_at_period_end ||
      !currentPeriodEnd ||
      currentPeriodEnd.getTime() > now.getTime();

    return {
      subscription,
      hasAccess,
      reason: hasAccess ? "active" : "expired",
      trialDaysRemaining,
      trialEndsAt,
      currentPeriodEnd,
    };
  }

  if (
    subscription.status === "expired" &&
    !subscription.paypal_subscription_id &&
    !subscription.trial_used
  ) {
    return {
      subscription,
      hasAccess: false,
      reason: "setup_required",
      trialDaysRemaining,
      trialEndsAt,
      currentPeriodEnd,
    };
  }

  const reason =
    subscription.status === "canceled"
      ? "canceled"
      : subscription.status === "past_due"
        ? "past_due"
        : "expired";

  return {
    subscription,
    hasAccess: false,
    reason,
    trialDaysRemaining,
    trialEndsAt,
    currentPeriodEnd,
  };
}

function isMissingSubscriptionTableError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as {
    code?: string;
    message?: string;
    details?: string | null;
    hint?: string | null;
  };

  const message = candidate.message?.toLowerCase() ?? "";
  const details = candidate.details?.toLowerCase() ?? "";

  return (
    candidate.code === "42P01" ||
    candidate.code === "PGRST205" ||
    candidate.code === "PGRST204" ||
    candidate.code === "PGRST202" ||
    message.includes("user_subscriptions") ||
    message.includes("subscription_trial_claims") ||
    message.includes("does not exist") ||
    message.includes("schema cache") ||
    message.includes("could not find the table") ||
    details.includes("user_subscriptions")
  );
}

function isRecoverableSubscriptionError(error: unknown) {
  if (isMissingSubscriptionTableError(error)) {
    return true;
  }

  if (error instanceof Error) {
    return error.message.includes("SUPABASE_SECRET_KEY");
  }

  return false;
}

function createFallbackTrialAccess(): SubscriptionAccess {
  return {
    subscription: null,
    hasAccess: false,
    reason: "setup_required",
    trialDaysRemaining: 0,
    trialEndsAt: null,
    currentPeriodEnd: null,
  };
}

export async function getSubscriptionForUser(
  supabase: SupabaseClient,
  userId: string,
) {
  try {
    const { data, error } = await supabase
      .from("user_subscriptions")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      return null;
    }

    return (data as UserSubscription | null) ?? null;
  } catch {
    return null;
  }
}

export async function isTrialEligibleForEmail(email: string) {
  const admin = tryCreateAdminClient();

  if (!admin) {
    return true;
  }

  const normalizedEmail = normalizeBillingEmail(email);

  if (!normalizedEmail) {
    return false;
  }

  try {
    const { data, error } = await admin
      .from("subscription_trial_claims")
      .select("user_id")
      .eq("normalized_email", normalizedEmail)
      .maybeSingle();

    if (error) {
      if (isRecoverableSubscriptionError(error)) {
        return true;
      }

      return false;
    }

    return !data;
  } catch {
    return true;
  }
}

async function claimTrialForUser(userId: string, email: string) {
  const admin = tryCreateAdminClient();

  if (!admin) {
    return { ok: false as const, reason: "admin_unavailable" as const };
  }

  const normalizedEmail = normalizeBillingEmail(email);

  if (!normalizedEmail) {
    return { ok: false as const, reason: "invalid_email" as const };
  }

  const { data: existingClaim, error: existingClaimError } = await admin
    .from("subscription_trial_claims")
    .select("user_id")
    .eq("normalized_email", normalizedEmail)
    .maybeSingle();

  if (existingClaimError && !isRecoverableSubscriptionError(existingClaimError)) {
    return { ok: false as const, reason: "lookup_failed" as const };
  }

  if (existingClaim && existingClaim.user_id !== userId) {
    return { ok: false as const, reason: "duplicate_trial" as const };
  }

  if (!existingClaim) {
    const { error: insertClaimError } = await admin
      .from("subscription_trial_claims")
      .insert({
        normalized_email: normalizedEmail,
        user_id: userId,
      });

    if (insertClaimError && insertClaimError.code !== "23505") {
      if (isRecoverableSubscriptionError(insertClaimError)) {
        return { ok: false as const, reason: "admin_unavailable" as const };
      }

      return { ok: false as const, reason: "claim_failed" as const };
    }
  }

  return { ok: true as const, normalizedEmail };
}

export function formatSubscriptionError(error: unknown) {
  if (!error || typeof error !== "object") {
    return "Unknown subscription error.";
  }

  const candidate = error as {
    message?: string;
    code?: string;
    hint?: string;
  };

  return [candidate.message, candidate.code, candidate.hint]
    .filter(Boolean)
    .join(" ");
}

export async function insertSubscriptionFallback(
  writer: SupabaseClient,
  userId: string,
  email: string,
) {
  const normalized = normalizeBillingEmail(email);
  const now = new Date().toISOString();
  const payloads = [
    {
      user_id: userId,
      status: "expired" as const,
      trial_used: false,
      billing_email: normalized,
      trial_started_at: now,
      trial_ends_at: now,
    },
    {
      user_id: userId,
      status: "expired" as const,
    },
  ];

  let lastError: unknown = null;

  for (const payload of payloads) {
    const { data, error } = await writer
      .from("user_subscriptions")
      .insert(payload as Record<string, unknown>)
      .select("*")
      .single();

    if (!error && data) {
      return { subscription: data as UserSubscription, error: null };
    }

    lastError = error;
  }

  return { subscription: null, error: lastError };
}

export async function ensureSubscriptionForUser(
  userId: string,
  email: string,
  supabase?: SupabaseClient,
) {
  if (supabase) {
    const existingForUser = await getSubscriptionForUser(supabase, userId);

    if (existingForUser) {
      return existingForUser;
    }

    const { data: rpcData, error: rpcError } = await supabase.rpc(
      "ensure_user_subscription",
    );

    if (!rpcError && rpcData) {
      return rpcData as UserSubscription;
    }

    const fallback = await insertSubscriptionFallback(
      supabase,
      userId,
      email,
    );

    if (fallback.subscription) {
      return fallback.subscription;
    }

    if (
      rpcError &&
      !isRecoverableSubscriptionError(rpcError) &&
      !isMissingSubscriptionTableError(rpcError)
    ) {
      console.warn(
        "[subscription] ensure_user_subscription RPC failed:",
        formatSubscriptionError(rpcError),
      );
    }
  }

  const admin = tryCreateAdminClient();

  if (!admin) {
    return null;
  }

  try {
    const { data: existing, error: existingError } = await admin
      .from("user_subscriptions")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (existingError) {
      return null;
    }

    if (existing) {
      return existing as UserSubscription;
    }

    const claim = await claimTrialForUser(userId, email);

    if (!claim.ok) {
      const now = new Date().toISOString();
      const { data: blockedSubscription, error: blockedError } = await admin
        .from("user_subscriptions")
        .insert({
          user_id: userId,
          status: "expired",
          trial_used: true,
          billing_email: normalizeBillingEmail(email),
          trial_started_at: now,
          trial_ends_at: now,
        })
        .select("*")
        .single();

      if (blockedError) {
        return null;
      }

      return blockedSubscription as UserSubscription;
    }

    const now = new Date().toISOString();

    const { data, error } = await admin
      .from("user_subscriptions")
      .insert({
        user_id: userId,
        status: "expired",
        trial_used: false,
        billing_email: claim.normalizedEmail,
        trial_started_at: now,
        trial_ends_at: now,
      })
      .select("*")
      .single();

    if (error) {
      return null;
    }

    return data as UserSubscription;
  } catch {
    return null;
  }
}

export async function markTrialExpired(userId: string) {
  const admin = tryCreateAdminClient();

  if (!admin) {
    return;
  }

  await admin
    .from("user_subscriptions")
    .update({
      status: "expired",
      trial_used: true,
    })
    .eq("user_id", userId)
    .eq("status", "trialing");
}

export async function finalizeEndedTrial(userId: string, canceledAtPeriodEnd: boolean) {
  const admin = tryCreateAdminClient();

  if (!admin) {
    return;
  }

  const now = new Date().toISOString();

  await admin
    .from("user_subscriptions")
    .update({
      status: canceledAtPeriodEnd ? "canceled" : "expired",
      trial_used: true,
      canceled_at: canceledAtPeriodEnd ? now : null,
    })
    .eq("user_id", userId)
    .eq("status", "trialing");
}

export function mapPayPalSubscriptionStatus(
  paypalStatus: PayPalSubscription["status"],
): SubscriptionStatus {
  switch (paypalStatus) {
    case "ACTIVE":
    case "APPROVED":
    case "APPROVAL_PENDING":
      return "active";
    case "SUSPENDED":
      return "past_due";
    case "CANCELLED":
      return "canceled";
    case "EXPIRED":
      return "expired";
    default:
      return "past_due";
  }
}

export async function applyPayPalSubscriptionToUser({
  userId,
  paypalSubscription,
}: {
  userId: string;
  paypalSubscription: PayPalSubscription;
}) {
  const admin = tryCreateAdminClient();

  if (!admin) {
    throw new Error("Supabase admin client is unavailable.");
  }

  const payerId = paypalSubscription.subscriber?.payer_id ?? null;
  const billingEmail = paypalSubscription.subscriber?.email_address
    ? normalizeBillingEmail(paypalSubscription.subscriber.email_address)
    : null;

  if (payerId) {
    const { data: duplicatePayer } = await admin
      .from("user_subscriptions")
      .select("user_id")
      .eq("paypal_payer_id", payerId)
      .neq("user_id", userId)
      .maybeSingle();

    if (duplicatePayer) {
      throw new Error(
        "This PayPal account is already linked to another TradeCoach user.",
      );
    }
  }

  const mappedStatus = mapPayPalSubscriptionStatus(paypalSubscription.status);
  const periodEndDate = parsePayPalPeriodEnd(paypalSubscription);
  const periodEnd = periodEndDate.toISOString();

  const { data: existing } = await admin
    .from("user_subscriptions")
    .select("user_id, trial_started_at, trial_ends_at")
    .eq("user_id", userId)
    .maybeSingle();

  const now = new Date();
  const existingTrialEndsDate = parseDate(existing?.trial_ends_at);
  const hasValidStoredTrialEnd =
    Boolean(existingTrialEndsDate) &&
    existingTrialEndsDate!.getTime() > now.getTime();
  const trialEndsAt = hasValidStoredTrialEnd ? existing!.trial_ends_at! : periodEnd;
  const trialStartedAt = hasValidStoredTrialEnd
    ? existing!.trial_started_at ?? now.toISOString()
    : now.toISOString();
  const trialEndsDate = parseDate(trialEndsAt) ?? periodEndDate;
  const inTrialPeriod =
    mappedStatus !== "canceled" &&
    mappedStatus !== "expired" &&
    mappedStatus !== "past_due" &&
    trialEndsDate.getTime() > now.getTime();
  const status: SubscriptionStatus =
    mappedStatus === "canceled"
      ? "canceled"
      : mappedStatus === "expired"
        ? "expired"
        : mappedStatus === "past_due"
          ? "past_due"
          : inTrialPeriod
            ? "trialing"
            : "active";

  if (!existing) {
    const { error: insertError } = await admin.from("user_subscriptions").insert({
      user_id: userId,
      status,
      trial_used: true,
      billing_email: billingEmail,
      paypal_subscription_id: paypalSubscription.id,
      paypal_payer_id: payerId,
      paypal_plan_id: paypalSubscription.plan_id ?? null,
      current_period_end: inTrialPeriod ? trialEndsAt : periodEnd,
      trial_started_at: trialStartedAt,
      trial_ends_at: trialEndsAt,
    });

    if (insertError) {
      throw insertError;
    }
  }

  const { data, error } = await admin
    .from("user_subscriptions")
    .update({
      status,
      trial_used: true,
      billing_email: billingEmail,
      paypal_subscription_id: paypalSubscription.id,
      paypal_payer_id: payerId,
      paypal_plan_id: paypalSubscription.plan_id ?? null,
      current_period_end: inTrialPeriod ? trialEndsAt : periodEnd,
      trial_started_at: trialStartedAt,
      trial_ends_at: trialEndsAt,
      cancel_at_period_end: false,
      canceled_at: mappedStatus === "canceled" ? now.toISOString() : null,
    })
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as UserSubscription;
}

export async function syncPayPalSubscriptionForUser(
  userId: string,
  paypalSubscriptionId: string,
) {
  const paypalSubscription = await waitForPayPalSubscriptionActivation(
    paypalSubscriptionId,
  );

  if (
    paypalSubscription.custom_id &&
    paypalSubscription.custom_id !== userId
  ) {
    throw new Error("PayPal subscription does not belong to this user.");
  }

  if (!isPayPalSubscriptionApproved(paypalSubscription.status)) {
    throw new Error(
      `PayPal subscription is ${paypalSubscription.status.toLowerCase()} instead of active.`,
    );
  }

  return applyPayPalSubscriptionToUser({
    userId,
    paypalSubscription,
  });
}

function isPayPalSubscriptionApproved(
  status: PayPalSubscription["status"] | undefined,
) {
  return (
    status === "ACTIVE" ||
    status === "APPROVED" ||
    status === "APPROVAL_PENDING"
  );
}

async function repairStalePayPalTrialRecord(subscription: UserSubscription) {
  if (subscription.cancel_at_period_end) {
    return subscription;
  }

  if (!isInPayPalTrialPeriod(subscription)) {
    return subscription;
  }

  const trialEndsAt = resolveTrialEndsAt(subscription);
  const trialStartedAt = resolveTrialStartedAt(subscription);
  const storedTrialEndsAt = parseDate(subscription.trial_ends_at);

  if (
    subscription.status === "trialing" &&
    storedTrialEndsAt &&
    storedTrialEndsAt.getTime() > Date.now()
  ) {
    return subscription;
  }

  const admin = tryCreateAdminClient();

  if (!admin || !trialEndsAt || !trialStartedAt) {
    return subscription;
  }

  const { data, error } = await admin
    .from("user_subscriptions")
    .update({
      status: "trialing",
      trial_started_at: trialStartedAt.toISOString(),
      trial_ends_at: trialEndsAt.toISOString(),
      current_period_end: trialEndsAt.toISOString(),
    })
    .eq("user_id", subscription.user_id)
    .select("*")
    .maybeSingle();

  if (error || !data) {
    return subscription;
  }

  return data as UserSubscription;
}

export async function getSubscriptionAccessForUser(
  supabase: SupabaseClient,
  userId: string,
  email?: string | null,
) {
  try {
    let subscription = await getSubscriptionForUser(supabase, userId);

    if (!subscription && email) {
      subscription = await ensureSubscriptionForUser(userId, email, supabase);

      if (!subscription) {
        return createFallbackTrialAccess();
      }
    }

    if (!subscription) {
      return evaluateSubscriptionAccess(null);
    }

    subscription = await repairStalePayPalTrialRecord(subscription);

    const access = evaluateSubscriptionAccess(subscription);

    if (
      subscription.status === "trialing" &&
      !access.hasAccess &&
      access.reason === "trial_expired"
    ) {
      await finalizeEndedTrial(userId, subscription.cancel_at_period_end);

      subscription = {
        ...subscription,
        status: subscription.cancel_at_period_end ? "canceled" : "expired",
        trial_used: true,
      };
    }

    return evaluateSubscriptionAccess(subscription);
  } catch {
    return createFallbackTrialAccess();
  }
}

export function formatShortDate(value: Date | null) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(value);
}

export function getAccessMessage(reason: SubscriptionAccess["reason"]) {
  switch (reason) {
    case "setup_required":
      return "Complete PayPal setup to start your 7-day free trial. You will not be charged until the trial ends.";
    case "trial_expired":
      return "Your free trial has ended. Subscribe with PayPal to continue using TradeCoach AI.";
    case "canceled":
      return "Your subscription was canceled. Resubscribe with PayPal to restore access.";
    case "expired":
      return "Your subscription is no longer active. Subscribe with PayPal to restore access.";
    case "past_due":
      return "Your PayPal payment is past due. Update billing to restore access.";
    case "missing":
      return "We could not find an active subscription for your account.";
    default:
      return "Subscribe with PayPal to continue using TradeCoach AI.";
  }
}

export const DASHBOARD_ACCESS_EXEMPT_PATHS = [] as const;

export function isDashboardAccessExempt(_pathname: string) {
  return false;
}

export function getSubscribeRequiredPath(
  reason: SubscriptionAccess["reason"],
  options?: { setup?: boolean },
) {
  const params = new URLSearchParams({
    subscribe: "required",
  });

  if (
    options?.setup ||
    reason === "setup_required" ||
    reason === "missing"
  ) {
    params.set("setup", "required");
  }

  if (reason !== "setup_required" && reason !== "missing") {
    params.set("access", reason);
  }

  return `/?${params.toString()}`;
}
