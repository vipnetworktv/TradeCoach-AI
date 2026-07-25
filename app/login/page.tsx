"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

import {
  getVerifiedTotpFactorId,
  isMfaVerificationRequired,
} from "@/lib/auth-mfa";
import { createClient } from "@/lib/supabase/client";

type LoginStep = "credentials" | "mfa";

export default function LoginPage() {
  const supabase = createClient();

  const [step, setStep] = useState<LoginStep>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function checkPendingMfa() {
      const { data: assuranceLevel } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

      if (!isMfaVerificationRequired(assuranceLevel)) {
        return;
      }

      const { data: factors, error } = await supabase.auth.mfa.listFactors();

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      const verifiedFactorId = getVerifiedTotpFactorId(factors);

      if (!verifiedFactorId) {
        return;
      }

      setFactorId(verifiedFactorId);
      setStep("mfa");
    }

    void checkPendingMfa();
  }, []);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setErrorMessage("");
    setIsLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      const { data: assuranceLevel, error: assuranceError } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

      if (assuranceError) {
        setErrorMessage(assuranceError.message);
        return;
      }

      if (!isMfaVerificationRequired(assuranceLevel)) {
        window.location.href = "/dashboard";
        return;
      }

      const { data: factors, error: factorsError } =
        await supabase.auth.mfa.listFactors();

      if (factorsError) {
        setErrorMessage(factorsError.message);
        return;
      }

      const verifiedFactorId = getVerifiedTotpFactorId(factors);

      if (!verifiedFactorId) {
        window.location.href = "/dashboard";
        return;
      }

      setFactorId(verifiedFactorId);
      setStep("mfa");
    } catch {
      setErrorMessage(
        "Something went wrong while logging in. Please try again.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function handleMfaVerification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!factorId) {
      setErrorMessage("Could not find your authenticator setup.");
      return;
    }

    setErrorMessage("");
    setIsLoading(true);

    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId,
        code: mfaCode.trim(),
      });

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      window.location.href = "/dashboard";
    } catch {
      setErrorMessage("Invalid verification code. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSignOut() {
    setErrorMessage("");
    setIsLoading(true);

    try {
      await supabase.auth.signOut();
      setStep("credentials");
      setMfaCode("");
      setFactorId(null);
      setPassword("");
    } catch {
      setErrorMessage("Could not sign out. Please refresh and try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#020617] px-4 py-10 text-white">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-6xl items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/60 shadow-2xl shadow-cyan-500/5 lg:grid-cols-2">
          <section className="hidden border-r border-slate-800 bg-slate-950/70 p-12 lg:flex lg:flex-col lg:justify-between">
            <Link href="/" className="text-2xl font-extrabold">
              TradeCoach <span className="text-cyan-400">AI</span>
            </Link>

            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-400">
                Welcome Back
              </p>

              <h1 className="mt-5 text-4xl font-extrabold leading-tight">
                Learn from every trade you take.
              </h1>

              <p className="mt-5 max-w-md leading-7 text-slate-400">
                Sign in to review your trading performance, AI grades,
                discipline patterns, reports, and connected accounts.
              </p>

              <div className="mt-8 space-y-4 text-sm text-slate-300">
                <p>✓ Automatic trade tracking</p>
                <p>✓ Personalized AI coaching</p>
                <p>✓ Daily and weekly reports</p>
                <p>✓ Multi-account analytics</p>
              </div>
            </div>

            <p className="text-sm text-slate-600">© 2026 TradeCoach AI</p>
          </section>

          <section className="p-6 sm:p-10 lg:p-12">
            <div className="mx-auto max-w-md">
              <Link href="/" className="text-2xl font-extrabold lg:hidden">
                TradeCoach <span className="text-cyan-400">AI</span>
              </Link>

              {step === "credentials" ? (
                <>
                  <p className="mt-8 text-sm font-semibold uppercase tracking-[0.2em] text-cyan-400 lg:mt-0">
                    TradeCoach AI
                  </p>

                  <h2 className="mt-3 text-3xl font-extrabold">
                    Log in to your account
                  </h2>

                  <p className="mt-3 text-slate-400">
                    Enter the email and password you used to sign up.
                  </p>

                  <form onSubmit={handleLogin} className="mt-8 space-y-5">
                    <label className="block">
                      <span className="mb-2 block text-sm font-medium text-slate-300">
                        Email address
                      </span>

                      <input
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        autoComplete="email"
                        required
                        placeholder="you@example.com"
                        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none transition placeholder:text-slate-600 focus:border-cyan-400"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-sm font-medium text-slate-300">
                        Password
                      </span>

                      <input
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        autoComplete="current-password"
                        required
                        placeholder="Enter your password"
                        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none transition placeholder:text-slate-600 focus:border-cyan-400"
                      />
                    </label>

                    <div className="flex items-center justify-between gap-4">
                      <label className="flex items-center gap-2 text-sm text-slate-400">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-cyan-500"
                        />
                        Remember me
                      </label>

                      <button
                        type="button"
                        className="text-sm font-semibold text-cyan-400 hover:text-cyan-300"
                      >
                        Forgot password?
                      </button>
                    </div>

                    {errorMessage && (
                      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
                        {errorMessage}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full rounded-xl bg-cyan-500 px-5 py-3 font-bold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isLoading ? "Logging In..." : "Log In"}
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <p className="mt-8 text-sm font-semibold uppercase tracking-[0.2em] text-cyan-400 lg:mt-0">
                    Two-Factor Authentication
                  </p>

                  <h2 className="mt-3 text-3xl font-extrabold">
                    Enter your authenticator code
                  </h2>

                  <p className="mt-3 text-slate-400">
                    Open your authenticator app and enter the 6-digit code for
                    TradeCoach AI.
                  </p>

                  <form
                    onSubmit={handleMfaVerification}
                    className="mt-8 space-y-5"
                  >
                    <label className="block">
                      <span className="mb-2 block text-sm font-medium text-slate-300">
                        Authentication code
                      </span>

                      <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        pattern="[0-9]*"
                        maxLength={6}
                        value={mfaCode}
                        onChange={(event) =>
                          setMfaCode(event.target.value.replace(/\D/g, ""))
                        }
                        required
                        placeholder="123456"
                        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none transition placeholder:text-slate-600 focus:border-cyan-400"
                      />
                    </label>

                    {errorMessage && (
                      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
                        {errorMessage}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={isLoading || mfaCode.length !== 6}
                      className="w-full rounded-xl bg-cyan-500 px-5 py-3 font-bold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isLoading ? "Verifying..." : "Verify & Continue"}
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleSignOut()}
                      disabled={isLoading}
                      className="w-full rounded-xl border border-slate-700 px-5 py-3 font-semibold text-slate-300 transition hover:border-slate-400"
                    >
                      Use a different account
                    </button>
                  </form>
                </>
              )}

              <p className="mt-6 text-center text-sm text-slate-400">
                Don&apos;t have an account?{" "}
                <Link
                  href="/signup"
                  className="font-semibold text-cyan-400 hover:text-cyan-300"
                >
                  Start your free trial
                </Link>
              </p>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
