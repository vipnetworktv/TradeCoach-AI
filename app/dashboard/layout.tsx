import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import CoachAiQuickChat from "@/components/coach-ai-quick-chat";
import TradeCoachLogo from "@/components/tradecoach-logo";
import DailyLossLimitMonitor from "@/components/daily-loss-limit-monitor";
import DashboardNav from "@/components/dashboard-nav";
import ExtensionInstallOnboarding from "@/components/extension-install-onboarding";
import LogoutButton from "./logout-button";
import { createClient } from "@/lib/supabase/server";
import {
  formatShortDate,
  getSubscriptionAccessForUser,
} from "@/lib/subscription";

type DashboardLayoutProps = {
  children: ReactNode;
};

export default async function DashboardLayout({
  children,
}: DashboardLayoutProps) {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  const subscriptionAccess = await getSubscriptionAccessForUser(
    supabase,
    user.id,
    user.email,
  );

  if (!subscriptionAccess.hasAccess) {
    redirect("/?subscribe=required&setup=required");
  }

  const firstName =
    user.user_metadata?.first_name?.trim() ||
    user.user_metadata?.full_name?.trim()?.split(" ")[0] ||
    user.email?.split("@")[0] ||
    "Trader";

  const initial = firstName.charAt(0).toUpperCase();

  const planLabel =
    subscriptionAccess.reason === "trialing"
      ? "Free Trial"
      : subscriptionAccess.reason === "active"
        ? "Pro Active"
        : subscriptionAccess.reason === "setup_required"
          ? "Setup Required"
          : "No Access";

  const sidebarMessage = subscriptionAccess.hasAccess
    ? subscriptionAccess.reason === "trialing" &&
      subscriptionAccess.subscription?.cancel_at_period_end
      ? `Trial canceled in PayPal. Access continues until ${formatShortDate(
          subscriptionAccess.trialEndsAt,
        )} with no charge.`
      : subscriptionAccess.reason === "trialing"
        ? `${subscriptionAccess.trialDaysRemaining} day${
            subscriptionAccess.trialDaysRemaining === 1 ? "" : "s"
          } left in your free trial. Billing starts ${formatShortDate(
            subscriptionAccess.trialEndsAt,
          )}.`
        : subscriptionAccess.currentPeriodEnd
          ? `Your Pro plan renews on ${formatShortDate(
              subscriptionAccess.currentPeriodEnd,
            )}.`
          : "Your PayPal subscription is active."
    : subscriptionAccess.reason === "setup_required"
      ? "Complete PayPal setup to start your 7-day free trial."
      : "Your trial or subscription is inactive. Manage billing to restore access.";

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <ExtensionInstallOnboarding userId={user.id} />
      <div className="flex min-h-screen">
        <aside className="hidden w-72 shrink-0 border-r border-slate-800 bg-slate-950 lg:flex lg:flex-col">
          <div className="border-b border-slate-800 px-8 py-6">
            <TradeCoachLogo size="sidebar" />
          </div>

          <DashboardNav variant="sidebar" />
          <div className="space-y-4 border-t border-slate-800 p-4">
            <div
              className={`rounded-2xl border p-5 ${
                subscriptionAccess.hasAccess
                  ? "border-cyan-500/20 bg-cyan-500/5"
                  : "border-amber-500/20 bg-amber-500/5"
              }`}
            >
              <p
                className={`text-sm font-semibold ${
                  subscriptionAccess.hasAccess
                    ? "text-cyan-400"
                    : "text-amber-300"
                }`}
              >
                {subscriptionAccess.reason === "trialing"
                  ? "Free Trial"
                  : subscriptionAccess.reason === "active"
                    ? "Pro Active"
                    : subscriptionAccess.reason === "setup_required"
                      ? "Setup Required"
                      : "Access Ended"}
              </p>

              <p className="mt-2 text-sm leading-6 text-slate-400">
                {sidebarMessage}
              </p>

              <Link
                href="/dashboard/billing"
                className="mt-4 block rounded-lg bg-cyan-500 px-4 py-2 text-center text-sm font-bold text-slate-950 transition hover:bg-cyan-400"
              >
                Manage Plan
              </Link>
            </div>

            <LogoutButton />
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="border-b border-slate-800 bg-slate-950/95 px-6 py-5 backdrop-blur md:px-8">
            <div className="flex items-center justify-between gap-6">
              <div className="min-w-0 flex-1">
                <div className="lg:hidden">
                  <TradeCoachLogo size="nav" />
                </div>

                <h1 className="mt-3 text-2xl font-bold md:mt-0 md:text-3xl lg:mt-1">
                  Welcome back, {firstName}
                </h1>
              </div>

              <div className="flex items-center gap-3">
                <CoachAiQuickChat firstName={firstName} />
                <Link
                  href="/dashboard/settings"
                  className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 transition hover:border-cyan-400"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-500 font-bold text-slate-950">
                    {initial}
                  </span>

                  <span className="hidden text-left sm:block">
                    <span className="block text-sm font-semibold">
                      {firstName}
                    </span>

                    <span className="block text-xs text-slate-500">
                      {planLabel}
                    </span>
                  </span>
                </Link>
              </div>
            </div>
          </header>

          <DailyLossLimitMonitor />

          <div className="border-b border-slate-800 px-6 py-4 lg:hidden">            <DashboardNav variant="mobile" />

            <div className="mt-3 min-w-28">
              <LogoutButton />
            </div>
          </div>

          <section className="flex-1 px-6 py-8 md:px-8">
            <div className="mx-auto max-w-7xl">{children}</div>
          </section>
        </div>
      </div>
    </main>
  );
}
