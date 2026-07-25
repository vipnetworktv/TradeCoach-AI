"use client";

import { useEffect, useRef, useState } from "react";

type BillingPayPalSetupProps = {
  shouldAutoStart: boolean;
  hasAccess: boolean;
};

export default function BillingPayPalSetup({
  shouldAutoStart,
  hasAccess,
}: BillingPayPalSetupProps) {
  const [errorMessage, setErrorMessage] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const hasStarted = useRef(false);

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
    if (!shouldAutoStart || hasAccess || hasStarted.current) {
      return;
    }

    hasStarted.current = true;
    void startPayPalCheckout();
  }, [shouldAutoStart, hasAccess]);

  if (!shouldAutoStart || hasAccess) {
    return null;
  }

  return (
    <section className="mt-8 rounded-3xl border border-cyan-500/20 bg-cyan-500/5 p-6">
      <h3 className="text-lg font-semibold text-cyan-100">
        {isStarting ? "Redirecting to PayPal..." : "Complete your subscription setup"}
      </h3>

      <p className="mt-2 max-w-3xl text-sm leading-7 text-cyan-100/80">
        Start your 7-day free trial through PayPal. You will be asked to approve
        billing now, but you will not be charged until the trial ends.
      </p>

      {errorMessage ? (
        <p className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {errorMessage}
        </p>
      ) : null}

      {!isStarting ? (
        <button
          type="button"
          onClick={() => {
            void startPayPalCheckout();
          }}
          className="mt-5 rounded-xl bg-cyan-500 px-6 py-4 font-bold text-slate-950 transition hover:bg-cyan-400"
        >
          Continue to PayPal
        </button>
      ) : null}
    </section>
  );
}
