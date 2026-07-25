"use client";

import { FormEvent, useEffect, useState } from "react";

import TotpQrCode from "@/components/totp-qr-code";
import { buildTotpEnrollmentUri } from "@/lib/auth-mfa";
import { cleanupIncompleteTotpFactors } from "@/lib/auth-mfa-cleanup";
import { createClient } from "@/lib/supabase/client";

type EnrollData = {
  factorId: string;
  enrollmentUri: string;
  secret: string;
};

async function resetIncompleteEnrollment(
  supabase: ReturnType<typeof createClient>,
) {
  await cleanupIncompleteTotpFactors(supabase);
}

export default function TwoFactorSettingsPanel() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [isEnabled, setIsEnabled] = useState(false);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [enrollData, setEnrollData] = useState<EnrollData | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [showDisableForm, setShowDisableForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  async function loadFactorStatus() {
    setLoading(true);
    setErrorMessage("");

    try {
      const { data, error } = await supabase.auth.mfa.listFactors();

      if (error) {
        throw error;
      }

      const verifiedFactor =
        data.totp.find((factor) => factor.status === "verified") ?? null;

      setIsEnabled(Boolean(verifiedFactor));
      setFactorId(verifiedFactor?.id ?? null);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not load two-factor authentication status.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadFactorStatus();
  }, []);

  async function createEnrollment() {
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
    });

    if (error) {
      throw error;
    }

    if (!data.totp?.secret) {
      throw new Error("Could not start authenticator setup.");
    }

    setEnrollData({
      factorId: data.id,
      enrollmentUri: buildTotpEnrollmentUri(data.totp.secret),
      secret: data.totp.secret,
    });
  }

  async function startEnrollment() {
    setBusy(true);
    setMessage("");
    setErrorMessage("");
    setEnrollData(null);
    setVerificationCode("");

    try {
      await resetIncompleteEnrollment(supabase);
      await createEnrollment();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not start two-factor authentication setup.";

      if (message.toLowerCase().includes("already exists")) {
        try {
          await resetIncompleteEnrollment(supabase);
          await createEnrollment();
          return;
        } catch (retryFailure) {
          setErrorMessage(
            retryFailure instanceof Error
              ? retryFailure.message
              : message,
          );
          return;
        }
      }

      setErrorMessage(message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnrollment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!enrollData) {
      return;
    }

    setBusy(true);
    setMessage("");
    setErrorMessage("");

    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId: enrollData.factorId,
        code: verificationCode.trim(),
      });

      if (error) {
        throw error;
      }

      setEnrollData(null);
      setVerificationCode("");
      setMessage("Two-factor authentication is now enabled.");
      await loadFactorStatus();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Invalid verification code. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function disableTwoFactor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!factorId) {
      return;
    }

    setBusy(true);
    setMessage("");
    setErrorMessage("");

    try {
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify(
        {
          factorId,
          code: disableCode.trim(),
        },
      );

      if (verifyError) {
        throw verifyError;
      }

      const { error: unenrollError } = await supabase.auth.mfa.unenroll({
        factorId,
      });

      if (unenrollError) {
        throw unenrollError;
      }

      setShowDisableForm(false);
      setDisableCode("");
      setMessage("Two-factor authentication has been disabled.");
      await loadFactorStatus();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not disable two-factor authentication.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function cancelEnrollment() {
    setBusy(true);
    setErrorMessage("");

    try {
      if (enrollData?.factorId) {
        await supabase.auth.mfa.unenroll({ factorId: enrollData.factorId });
      } else {
        await resetIncompleteEnrollment(supabase);
      }

      setEnrollData(null);
      setVerificationCode("");
      await loadFactorStatus();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not cancel two-factor authentication setup.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-400">
            Two-Factor Authentication
          </p>

          <h3 className="mt-2 text-2xl font-bold">Add Extra Security</h3>
        </div>

        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            isEnabled
              ? "bg-emerald-500/10 text-emerald-400"
              : "bg-amber-500/10 text-amber-400"
          }`}
        >
          {loading ? "Loading..." : isEnabled ? "Enabled" : "Not Enabled"}
        </span>
      </div>

      <p className="mt-4 text-sm leading-6 text-slate-400">
        Use an authenticator app like Google Authenticator, Authy, or 1Password
        to require a 6-digit code when signing in.
      </p>

      {message && (
        <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          {message}
        </div>
      )}

      {errorMessage && (
        <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {errorMessage}
        </div>
      )}

      {!loading && !isEnabled && !enrollData && (
        <button
          type="button"
          onClick={() => void startEnrollment()}
          disabled={busy}
          className="mt-5 w-full rounded-xl bg-cyan-500 px-5 py-3 font-bold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Starting Setup..." : "Enable Two-Factor Authentication"}
        </button>
      )}

      {enrollData && (
        <div className="mt-5 space-y-5 rounded-2xl border border-slate-800 bg-slate-950/50 p-5">
          <div>
            <p className="font-semibold text-white">Step 1: Scan this QR code</p>
            <p className="mt-2 text-sm text-slate-400">
              Open your authenticator app and scan the code below. If scanning
              fails, use the manual entry key instead.
            </p>
          </div>

          <div className="mx-auto w-fit rounded-2xl bg-white p-4">
            <TotpQrCode value={enrollData.enrollmentUri} size={240} />
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
              Manual entry key
            </p>
            <p className="mt-2 break-all font-mono text-sm text-cyan-300">
              {enrollData.secret}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Account name: TradeCoach AI
            </p>
          </div>

          <form onSubmit={confirmEnrollment} className="space-y-4">
            <label>
              <span className="mb-2 block text-sm font-medium text-slate-400">
                Step 2: Enter the 6-digit code
              </span>

              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                value={verificationCode}
                onChange={(event) =>
                  setVerificationCode(event.target.value.replace(/\D/g, ""))
                }
                placeholder="123456"
                required
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-400"
              />
            </label>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="submit"
                disabled={busy || verificationCode.length !== 6}
                className="flex-1 rounded-xl bg-cyan-500 px-5 py-3 font-bold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? "Verifying..." : "Verify & Enable"}
              </button>

              <button
                type="button"
                onClick={() => void cancelEnrollment()}
                disabled={busy}
                className="rounded-xl border border-slate-700 px-5 py-3 font-semibold text-slate-300 transition hover:border-slate-500"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {!loading && isEnabled && !showDisableForm && (
        <div className="mt-5 space-y-4">
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-slate-300">
            Your account requires an authenticator code at sign-in.
          </div>

          <button
            type="button"
            onClick={() => {
              setShowDisableForm(true);
              setMessage("");
              setErrorMessage("");
            }}
            className="w-full rounded-xl border border-slate-700 px-5 py-3 font-semibold text-slate-300 transition hover:border-rose-400 hover:text-rose-400"
          >
            Disable Two-Factor Authentication
          </button>
        </div>
      )}

      {showDisableForm && factorId && (
        <form
          onSubmit={disableTwoFactor}
          className="mt-5 space-y-4 rounded-2xl border border-slate-800 bg-slate-950/50 p-5"
        >
          <p className="text-sm text-slate-400">
            Enter a current authenticator code to confirm disabling 2FA.
          </p>

          <label>
            <span className="mb-2 block text-sm font-medium text-slate-400">
              Authenticator code
            </span>

            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              value={disableCode}
              onChange={(event) =>
                setDisableCode(event.target.value.replace(/\D/g, ""))
              }
              placeholder="123456"
              required
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-400"
            />
          </label>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="submit"
              disabled={busy || disableCode.length !== 6}
              className="flex-1 rounded-xl border border-rose-500/40 px-5 py-3 font-semibold text-rose-400 transition hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? "Disabling..." : "Confirm Disable"}
            </button>

            <button
              type="button"
              onClick={() => {
                setShowDisableForm(false);
                setDisableCode("");
              }}
              disabled={busy}
              className="rounded-xl border border-slate-700 px-5 py-3 font-semibold text-slate-300 transition hover:border-slate-500"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
