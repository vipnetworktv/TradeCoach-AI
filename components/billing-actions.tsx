"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type BillingActionsProps = {
  canActivate: boolean;
  canCancel: boolean;
  activateLabel?: string;
  cancelLabel?: string;
  cancelDescription?: string;
  compact?: boolean;
};

export default function BillingActions({
  canActivate,
  canCancel,
  activateLabel = "Subscribe with PayPal",
  cancelLabel = "Cancel Subscription",
  cancelDescription,
  compact = false,
}: BillingActionsProps) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isActivating, setIsActivating] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);

  async function handleActivate() {
    setIsActivating(true);
    setMessage("");
    setErrorMessage("");

    try {
      const response = await fetch("/api/subscription/activate", {
        method: "POST",
      });

      const payload = (await response.json()) as {
        error?: string;
        message?: string;
        approvalUrl?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Unable to start PayPal checkout.");
      }

      if (payload.approvalUrl) {
        window.location.href = payload.approvalUrl;
        return;
      }

      setMessage(payload.message || "Your Pro subscription is now active.");
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to start PayPal checkout.",
      );
    } finally {
      setIsActivating(false);
    }
  }

  async function handleCancel() {
    const confirmed = window.confirm(
      cancelDescription ||
        "Cancel your PayPal subscription now? You will immediately lose access to TradeCoach AI.",
    );

    if (!confirmed) {
      return;
    }

    setIsCanceling(true);
    setMessage("");
    setErrorMessage("");

    try {
      const response = await fetch("/api/subscription/cancel", {
        method: "POST",
      });

      const payload = (await response.json()) as {
        error?: string;
        message?: string;
        endsAtTrialEnd?: boolean;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Unable to cancel your subscription.");
      }

      if (payload.endsAtTrialEnd) {
        window.location.href = "/dashboard/billing?cancel=trial_end";
        return;
      }

      window.location.href = "/?subscribe=required&access=canceled";
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to cancel your subscription.",
      );
      setIsCanceling(false);
    }
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row">
        {canActivate ? (
          <button
            type="button"
            onClick={handleActivate}
            disabled={isActivating || isCanceling}
            className="rounded-xl bg-cyan-500 px-6 py-4 font-bold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isActivating ? "Redirecting to PayPal..." : activateLabel}
          </button>
        ) : null}

        {canCancel ? (
          <button
            type="button"
            onClick={handleCancel}
            disabled={isActivating || isCanceling}
            className={
              compact
                ? "rounded-xl border border-rose-500/30 px-5 py-3 text-sm font-semibold text-rose-300 transition hover:border-rose-400 hover:bg-rose-500/10 hover:text-rose-200 disabled:cursor-not-allowed disabled:opacity-60"
                : "rounded-xl border border-rose-500/30 px-6 py-4 font-semibold text-rose-300 transition hover:border-rose-400 hover:bg-rose-500/10 hover:text-rose-200 disabled:cursor-not-allowed disabled:opacity-60"
            }
          >
            {isCanceling ? "Canceling..." : cancelLabel}
          </button>
        ) : null}
      </div>

      {message ? (
        <p className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          {message}
        </p>
      ) : null}

      {errorMessage ? (
        <p className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
