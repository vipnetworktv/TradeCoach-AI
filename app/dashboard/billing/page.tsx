import BillingActions from "@/components/billing-actions";
import BillingPayPalSetup from "@/components/billing-paypal-setup";
import { createClient } from "@/lib/supabase/server";
import {
  formatShortDate,
  getAccessMessage,
  getSubscriptionAccessForUser,
  getTrialProgressPercent,
  PRO_MONTHLY_PRICE,
  PAYPAL_PLAN_DESCRIPTION,
  PAYPAL_PLAN_NAME,
  parseDate,
  resolveTrialStartedAt,
  TRIAL_LENGTH_DAYS,
} from "@/lib/subscription";

const includedFeatures = [
  "Unlimited connected broker accounts",
  "Automatic trade syncing",
  "AI trade grading",
  "Personalized AI coaching",
  "Daily, weekly, and monthly reports",
  "Performance and pattern analytics",
  "AI chat about your trading history",
  "CSV trade exports",
  "All future feature updates",
];

type BillingPageProps = {
  searchParams?: Promise<{
    access?: string;
    paypal?: string;
    setup?: string;
    duplicate?: string;
    cancel?: string;
  }>;
};

function getStatusBadge(
  accessReason: string,
  hasAccess: boolean,
  trialCancelScheduled = false,
) {
  if (hasAccess && accessReason === "trialing" && trialCancelScheduled) {
    return {
      label: "Trial Canceled",
      className: "bg-amber-500/10 text-amber-300",
    };
  }

  if (hasAccess && accessReason === "trialing") {
    return {
      label: "Free Trial Active",
      className: "bg-cyan-500/10 text-cyan-300",
    };
  }

  if (hasAccess && accessReason === "active") {
    return {
      label: "Pro Active",
      className: "bg-emerald-500/10 text-emerald-400",
    };
  }

  if (accessReason === "setup_required") {
    return {
      label: "Setup Required",
      className: "bg-cyan-500/10 text-cyan-300",
    };
  }

  if (accessReason === "canceled") {
    return {
      label: "Canceled",
      className: "bg-rose-500/10 text-rose-300",
    };
  }

  if (accessReason === "trial_expired" || accessReason === "expired") {
    return {
      label: "Access Ended",
      className: "bg-amber-500/10 text-amber-300",
    };
  }

  return {
    label: "Inactive",
    className: "bg-slate-500/10 text-slate-300",
  };
}

export default async function BillingPage({ searchParams }: BillingPageProps) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const accessParam = resolvedSearchParams?.access;
  const paypalParam = resolvedSearchParams?.paypal;
  const setupRequired = resolvedSearchParams?.setup === "required";
  const duplicateTrial = resolvedSearchParams?.duplicate === "1";
  const trialCanceled = resolvedSearchParams?.cancel === "trial_end";

  const subscriptionAccess = user
    ? await getSubscriptionAccessForUser(supabase, user.id, user.email)
    : null;

  const access = subscriptionAccess ?? {
    hasAccess: false,
    reason: "missing" as const,
    trialDaysRemaining: 0,
    trialEndsAt: null,
    currentPeriodEnd: null,
    subscription: null,
  };

  const trialCancelScheduled = Boolean(access.subscription?.cancel_at_period_end);
  const statusBadge = getStatusBadge(
    access.reason,
    access.hasAccess,
    trialCancelScheduled,
  );
  const trialStartedAt = access.subscription
    ? resolveTrialStartedAt(access.subscription)
    : null;
  const trialEndsAt = access.trialEndsAt ?? null;
  const isInTrial = access.reason === "trialing";
  const trialProgress = getTrialProgressPercent(
    trialStartedAt,
    trialEndsAt,
  );

  const canActivate = !access.hasAccess;
  const displayAccessReason =
    setupRequired && !access.hasAccess
      ? "setup_required"
      : accessParam === "canceled" ||
          accessParam === "trial_expired" ||
          accessParam === "expired" ||
          accessParam === "past_due" ||
          accessParam === "missing"
        ? accessParam
        : access.reason;
  const canCancel =
    access.hasAccess &&
    !trialCancelScheduled &&
    (access.reason === "active" || access.reason === "trialing");

  const billingHistory = [
    {
      date: formatShortDate(trialStartedAt),
      description: isInTrial
        ? "TradeCoach AI Pro — Free Trial"
        : "TradeCoach AI Pro — Monthly",
      amount: isInTrial ? "$0.00" : `$${PRO_MONTHLY_PRICE.toFixed(2)}`,
      status: access.hasAccess ? (isInTrial ? "Trial" : "Active") : "Ended",
    },
  ];

  return (
    <>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-400">
            Billing & Subscription
          </p>

          <h2 className="mt-2 text-3xl font-extrabold">
            Manage Your TradeCoach AI Plan
          </h2>

          <p className="mt-2 max-w-3xl leading-7 text-slate-400">
            New accounts start with PayPal setup. Your 7-day free trial is
            managed in PayPal and billing begins after the trial ends.
          </p>
        </div>

        <span
          className={`w-fit rounded-full px-4 py-2 text-sm font-semibold ${statusBadge.className}`}
        >
          {statusBadge.label}
        </span>
      </div>

      {!access.hasAccess ? (
        <section className="mt-8 rounded-3xl border border-amber-500/20 bg-amber-500/5 p-6">
          <h3 className="text-lg font-semibold text-amber-100">
            {displayAccessReason === "setup_required"
              ? "Finish setting up your subscription"
              : "Dashboard access is currently disabled"}
          </h3>

          <p className="mt-2 max-w-3xl text-sm leading-7 text-amber-100/80">
            {getAccessMessage(displayAccessReason)}
          </p>
        </section>
      ) : null}

      {trialCanceled || trialCancelScheduled ? (
        <section className="mt-8 rounded-3xl border border-amber-500/20 bg-amber-500/5 p-6">
          <h3 className="text-lg font-semibold text-amber-100">
            Trial canceled — access continues until{" "}
            {formatShortDate(trialEndsAt)}
          </h3>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-amber-100/80">
            PayPal will not charge you. You can keep using TradeCoach AI until
            your free trial ends, then you will need to subscribe again for
            access.
          </p>
        </section>
      ) : null}

      {duplicateTrial ? (
        <section className="mt-8 rounded-3xl border border-rose-500/20 bg-rose-500/5 p-6">
          <p className="text-sm leading-7 text-rose-100/80">
            This email has already used a TradeCoach free trial. PayPal may
            charge immediately if no trial is available on your PayPal account.
          </p>
        </section>
      ) : null}

      <BillingPayPalSetup
        shouldAutoStart={setupRequired}
        hasAccess={access.hasAccess}
      />

      {paypalParam === "success" ? (
        <section className="mt-8 rounded-3xl border border-emerald-500/20 bg-emerald-500/5 p-6">
          <h3 className="text-lg font-semibold text-emerald-100">
            PayPal subscription connected
          </h3>
          <p className="mt-2 text-sm leading-7 text-emerald-100/80">
            Your TradeCoach AI Pro subscription is active through PayPal.
          </p>
        </section>
      ) : null}

      {paypalParam === "canceled" ? (
        <section className="mt-8 rounded-3xl border border-amber-500/20 bg-amber-500/5 p-6">
          <p className="text-sm leading-7 text-amber-100/80">
            PayPal checkout was canceled. You can try again whenever you are
            ready.
          </p>
        </section>
      ) : null}

      {paypalParam === "error" ? (
        <section className="mt-8 rounded-3xl border border-rose-500/20 bg-rose-500/5 p-6">
          <p className="text-sm leading-7 text-rose-100/80">
            PayPal could not confirm your subscription. Please try again or
            contact support if the issue continues.
          </p>
        </section>
      ) : null}

      <div className="mt-8 grid gap-8 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-3xl border border-cyan-500/30 bg-gradient-to-br from-slate-900 to-slate-950 p-6 shadow-[0_0_60px_rgba(34,211,238,0.08)] md:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-400">
                Current Plan
              </p>

              <h3 className="mt-3 text-3xl font-extrabold">
                {access.subscription?.plan_name ?? PAYPAL_PLAN_NAME}
              </h3>

              <p className="mt-3 leading-7 text-slate-400">
                {PAYPAL_PLAN_DESCRIPTION}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-5 py-4 text-center">
              {isInTrial ? (
                <>
                  <p className="text-3xl font-extrabold">$0.00</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {TRIAL_LENGTH_DAYS}-day trial
                  </p>
                </>
              ) : (
                <>
                  <p className="text-3xl font-extrabold">
                    ${PRO_MONTHLY_PRICE.toFixed(2)}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">per month</p>
                </>
              )}
            </div>
          </div>

          {isInTrial ? (
            <div className="mt-8 rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold text-cyan-300">
                    {trialCancelScheduled
                      ? `${access.trialDaysRemaining} day${
                          access.trialDaysRemaining === 1 ? "" : "s"
                        } of access remaining`
                      : `${access.trialDaysRemaining} day${
                          access.trialDaysRemaining === 1 ? "" : "s"
                        } left in your free trial`}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    {trialCancelScheduled
                      ? `PayPal is canceled. Your access ends on ${formatShortDate(trialEndsAt)} with no charge.`
                      : `PayPal billing starts on ${formatShortDate(trialEndsAt)} at $${PRO_MONTHLY_PRICE.toFixed(2)}/month unless you cancel.`}
                  </p>
                </div>

                <div className="rounded-2xl border border-cyan-500/20 bg-slate-950/70 px-5 py-4 text-center">
                  <p className="text-3xl font-extrabold text-cyan-300">
                    {access.trialDaysRemaining}
                  </p>
                  <p className="mt-1 text-xs uppercase tracking-wider text-slate-500">
                    Days left
                  </p>
                </div>
              </div>

              <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-cyan-400 transition-all"
                  style={{ width: `${trialProgress}%` }}
                />
              </div>

              <div className="mt-6 flex flex-col gap-3 border-t border-cyan-500/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm leading-6 text-slate-400">
                  {trialCancelScheduled
                    ? "Your trial is already scheduled to end with no charge."
                    : "Changed your mind? Cancel anytime before billing starts."}
                </p>

                {!trialCancelScheduled ? (
                  <BillingActions
                    canActivate={false}
                    canCancel={canCancel}
                    compact
                    cancelLabel="Cancel Free Trial"
                    cancelDescription="Cancel your free trial in PayPal now? You will keep dashboard access until the trial ends, and you will not be charged."
                  />
                ) : null}
              </div>
            </div>
          ) : null}

          {access.reason === "active" ? (
            <div className="mt-8 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5">
              <p className="font-semibold text-emerald-300">
                PayPal subscription active
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Your Pro plan renews on{" "}
                {formatShortDate(access.currentPeriodEnd)} via PayPal.
              </p>
            </div>
          ) : null}

          <div className="mt-8">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
              Everything Included
            </p>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {includedFeatures.map((feature) => (
                <div key={feature} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cyan-500/10 text-sm font-bold text-cyan-400">
                    ✓
                  </span>

                  <span className="text-sm leading-6 text-slate-300">
                    {feature}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-8">
            <BillingActions
              canActivate={canActivate}
              canCancel={canCancel && !isInTrial}
              activateLabel="Subscribe with PayPal"
              cancelLabel="Cancel Subscription"
              cancelDescription={
            isInTrial
              ? "Cancel your free trial in PayPal now? You will keep dashboard access until the trial ends, and you will not be charged."
              : "Cancel your Pro subscription now? PayPal billing will stop and you will lose dashboard access immediately."
          }
            />
          </div>
        </div>

        <div className="space-y-8">
          <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-400">
                  Payment Method
                </p>

                <h3 className="mt-2 text-2xl font-bold">PayPal</h3>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
              {isInTrial ? (
                <div>
                  <p className="font-semibold">PayPal trial approved</p>
                  <p className="mt-2 text-sm text-slate-400">
                    Your payment method is on file with PayPal. You will not be
                    charged until your free trial ends.
                  </p>
                </div>
              ) : access.reason === "active" ? (
                <div>
                  <p className="font-semibold">PayPal billing on file</p>
                  <p className="mt-2 text-sm text-slate-400">
                    Your monthly billing is managed through PayPal.
                  </p>
                </div>
              ) : (
                <p className="text-sm leading-6 text-slate-400">
                  Complete PayPal setup to start your 7-day free trial. PayPal
                  will store your payment method now and charge after the trial
                  ends.
                </p>
              )}
            </div>

            <p className="mt-4 text-sm leading-6 text-slate-500">
              {isInTrial
                ? "Your trial and future renewals are managed through PayPal."
                : access.reason === "active"
                  ? "Your subscription renewals are billed through PayPal."
                  : "You will be redirected to PayPal to approve your free trial."}
            </p>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-400">
              Next Payment
            </p>

            <div className="mt-5 flex items-end justify-between gap-4">
              <div>
                <p className="text-3xl font-extrabold">
                  {isInTrial
                    ? "$0.00"
                    : access.hasAccess && access.reason === "active"
                      ? `$${PRO_MONTHLY_PRICE.toFixed(2)}`
                      : "$0.00"}
                </p>

                <p className="mt-2 text-sm text-slate-500">
                  {isInTrial
                    ? `First charge of $${PRO_MONTHLY_PRICE.toFixed(2)} due ${formatShortDate(trialEndsAt)} via PayPal`
                    : access.reason === "active"
                      ? `Next charge due ${formatShortDate(access.currentPeriodEnd)} via PayPal`
                      : "Complete PayPal setup to start your trial"}
                </p>
              </div>

              <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-400">
                Monthly
              </span>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-400">
              Billing Email
            </p>

            <p className="mt-4 font-semibold">{user?.email ?? "—"}</p>
          </div>
        </div>
      </div>

      <div className="mt-8 overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/60">
        <div className="flex flex-col gap-4 border-b border-slate-800 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-400">
              Billing History
            </p>

            <h3 className="mt-2 text-2xl font-bold">Invoices & Payments</h3>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wider text-slate-500">
                <th className="px-6 py-4 font-semibold">Date</th>
                <th className="px-6 py-4 font-semibold">Description</th>
                <th className="px-6 py-4 font-semibold">Amount</th>
                <th className="px-6 py-4 font-semibold">Status</th>
              </tr>
            </thead>

            <tbody>
              {billingHistory.map((invoice) => (
                <tr
                  key={`${invoice.date}-${invoice.description}`}
                  className="border-b border-slate-800/80 last:border-b-0"
                >
                  <td className="px-6 py-5 text-slate-300">{invoice.date}</td>
                  <td className="px-6 py-5 font-semibold">{invoice.description}</td>
                  <td className="px-6 py-5 font-bold">{invoice.amount}</td>
                  <td className="px-6 py-5">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        invoice.status === "Active"
                          ? "bg-emerald-500/10 text-emerald-400"
                          : invoice.status === "Trial"
                            ? "bg-cyan-500/10 text-cyan-300"
                            : "bg-slate-500/10 text-slate-300"
                      }`}
                    >
                      {invoice.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
