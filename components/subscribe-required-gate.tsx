"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import {
  PAYPAL_PLAN_DESCRIPTION,
  PAYPAL_PLAN_NAME,
  PRO_MONTHLY_PRICE,
  TRIAL_LENGTH_DAYS,
} from "@/lib/subscription";

type SubscribeRequiredGateProps = {
  userEmail: string;
  autoStart?: boolean;
  accessReason?: string;
  paypalStatus?: string;
  duplicateTrial?: boolean;
  errorMessage?: string;
};

export default function SubscribeRequiredGate({
  userEmail,
  autoStart = false,
  accessReason,
  paypalStatus,
  duplicateTrial = false,
  errorMessage: initialErrorMessage,
}: SubscribeRequiredGateProps) {
  const [errorMessage, setErrorMessage] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const hasStarted = useRef(false);
  const router = useRouter();

  async function startPayPalCheckout() {
    setIsStarting(true);
    setErrorMessage("");

    try {
      const response = await fetch("/api/subscription/activate", {
        method: "POST",
      });

      const payload = (await response.json()) as {
        error?: string;
        approvalUrl?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Unable to start PayPal checkout.");
      }

      if (!payload.approvalUrl) {
        throw new Error("PayPal did not return a checkout URL.");
      }

      window.location.href = payload.approvalUrl;
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to start PayPal checkout.",
      );
      setIsStarting(false);
    }
  }

  useEffect(() => {
    if (!autoStart || hasStarted.current || paypalStatus) {
      return;
    }

    hasStarted.current = true;
    void startPayPalCheckout();
  }, [autoStart, paypalStatus]);

  async function handleLogout() {
    setIsLoggingOut(true);
    setErrorMessage("");

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signOut();

      if (error) {
        throw new Error(error.message);
      }

      router.replace("/login");
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to log out.",
      );
      setIsLoggingOut(false);
    }
  }

  const title =
    accessReason === "canceled" || accessReason === "expired"
      ? "Subscribe to restore access"
      : "Start your 7-day free trial";

  const description =
    accessReason === "canceled" || accessReason === "expired"
      ? "Your TradeCoach AI subscription is inactive. Complete PayPal setup to unlock the dashboard, AI coach, reports, and connected accounts."
      : "Complete PayPal setup to unlock TradeCoach AI. You will approve billing in PayPal now, but you will not be charged until your free trial ends.";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 px-4 py-8 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="subscribe-gate-title"
        className="w-full max-w-xl rounded-3xl border border-cyan-500/20 bg-slate-900 p-6 shadow-2xl shadow-cyan-500/10 sm:p-8"
      >
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-400">
          Subscription Required
        </p>

        <h2 id="subscribe-gate-title" className="mt-3 text-3xl font-extrabold">
          {title}
        </h2>

        <p className="mt-3 text-sm leading-7 text-slate-400">{description}</p>

        <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-semibold">{PAYPAL_PLAN_NAME}</p>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {PAYPAL_PLAN_DESCRIPTION}
              </p>
            </div>

            <div className="text-right">
              <p className="text-2xl font-extrabold">
                ${PRO_MONTHLY_PRICE.toFixed(2)}
              </p>
              <p className="mt-1 text-xs text-slate-500">per month</p>
            </div>
          </div>

          <p className="mt-4 text-sm text-slate-300">
            {TRIAL_LENGTH_DAYS}-day free trial through PayPal for{" "}
            <span className="font-semibold text-white">{userEmail}</span>
          </p>
        </div>

        {accessReason === "canceled" ? (
          <p className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            Your subscription was canceled. You can subscribe again anytime to
            restore access.
          </p>
        ) : null}

        {duplicateTrial ? (
          <p className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
            This email has already used a TradeCoach free trial. PayPal may
            charge immediately if no trial is available on your PayPal account.
          </p>
        ) : null}

        {paypalStatus === "canceled" ? (
          <p className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            PayPal checkout was canceled. You can try again when you are ready.
          </p>
        ) : null}

        {paypalStatus === "error" ? (
          <p className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
            {initialErrorMessage ||
              "PayPal could not confirm your subscription. Please try again."}
          </p>
        ) : null}

        {errorMessage ? (
          <p className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
            {errorMessage}
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => {
            void startPayPalCheckout();
          }}
          disabled={isStarting}
          className="mt-6 w-full rounded-xl bg-cyan-500 px-6 py-4 font-bold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isStarting ? "Redirecting to PayPal..." : "Subscribe with PayPal"}
        </button>

        <p className="mt-4 text-center text-xs leading-6 text-slate-500">
          You can browse the home page, but dashboard access stays locked until
          PayPal setup is complete.
        </p>

        <div className="mt-5 text-center">
          <button
            type="button"
            onClick={() => {
              void handleLogout();
            }}
            disabled={isLoggingOut || isStarting}
            className="text-sm font-semibold text-slate-400 transition hover:text-white disabled:opacity-60"
          >
            {isLoggingOut ? "Logging out..." : "Log out"}
          </button>
        </div>
      </div>
    </div>
  );
}
