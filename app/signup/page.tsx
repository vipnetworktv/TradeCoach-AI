"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

import TradeCoachLogo from "@/components/tradecoach-logo";
import { createClient } from "@/lib/supabase/client";

export default function SignUpPage() {
  const supabase = createClient();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [pendingVerification, setPendingVerification] = useState<{
    email: string;
    duplicateTrial: boolean;
  } | null>(null);
  const [isResending, setIsResending] = useState(false);
  const [resendMessage, setResendMessage] = useState("");

  function getEmailRedirectTo(duplicateTrial: boolean) {
    const params = new URLSearchParams({
      subscribe: "required",
      setup: "required",
    });

    if (duplicateTrial) {
      params.set("duplicate", "1");
    }

    return `${window.location.origin}/auth/callback?next=${encodeURIComponent(`/?${params.toString()}`)}`;
  }

  async function handleSignUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setErrorMessage("");
    setResendMessage("");

    if (pendingVerification) {
      return;
    }

    if (!firstName.trim() || !lastName.trim()) {
      setErrorMessage("Please enter your first and last name.");
      return;
    }

    if (password.length < 8) {
      setErrorMessage("Your password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Your passwords do not match.");
      return;
    }

    setIsLoading(true);

    try {
      const eligibilityResponse = await fetch(
        "/api/subscription/trial-eligibility",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: email.trim(),
          }),
        },
      );

      const eligibility = (await eligibilityResponse.json()) as {
        eligible?: boolean;
        message?: string;
        error?: string;
      };

      if (!eligibilityResponse.ok) {
        setErrorMessage(
          eligibility.error || "Unable to verify trial eligibility.",
        );
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: getEmailRedirectTo(!eligibility.eligible),
          data: {
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            full_name: `${firstName.trim()} ${lastName.trim()}`,
          },
        },
      });

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      if (data.session) {
        await fetch("/api/subscription/ensure", {
          method: "POST",
        });

        const params = new URLSearchParams({
          subscribe: "required",
          setup: "required",
        });

        if (!eligibility.eligible) {
          params.set("duplicate", "1");
        }

        window.location.href = `/?${params.toString()}`;
        return;
      }

      setPendingVerification({
        email: email.trim(),
        duplicateTrial: !eligibility.eligible,
      });

      setFirstName("");
      setLastName("");
      setEmail("");
      setPassword("");
      setConfirmPassword("");
    } catch {
      setErrorMessage(
        "Something went wrong while creating your account. Please try again.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function handleResendConfirmation() {
    if (!pendingVerification) {
      return;
    }

    setIsResending(true);
    setResendMessage("");
    setErrorMessage("");

    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: pendingVerification.email,
        options: {
          emailRedirectTo: getEmailRedirectTo(
            pendingVerification.duplicateTrial,
          ),
        },
      });

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      setResendMessage("Confirmation email sent. Check your inbox and spam folder.");
    } catch {
      setErrorMessage("Unable to resend the confirmation email right now.");
    } finally {
      setIsResending(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#020617] px-4 py-10 text-white">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-6xl items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/60 shadow-2xl shadow-cyan-500/5 lg:grid-cols-2">
          <section className="hidden border-r border-slate-800 bg-slate-950/70 p-12 lg:flex lg:flex-col lg:justify-between">
            <TradeCoachLogo size="auth" className="mx-0 max-w-[240px]" />

            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-400">
                Your AI Trading Coach
              </p>

              <h1 className="mt-5 text-4xl font-extrabold leading-tight">
                Turn every trade into a lesson.
              </h1>

              <p className="mt-5 max-w-md leading-7 text-slate-400">
                Automatically import your trades, identify costly patterns, and
                receive personalized AI coaching based on your real trading
                behavior.
              </p>

              <div className="mt-8 space-y-4 text-sm text-slate-300">
                <p>✓ Unlimited connected trading accounts</p>
                <p>✓ Automatic AI trade grading</p>
                <p>✓ Daily, weekly, and monthly reports</p>
                <p>✓ Seven-day free trial through PayPal</p>
              </div>
            </div>

            <p className="text-sm text-slate-600">
              © 2026 TradeCoach AI
            </p>
          </section>

          <section className="p-6 sm:p-10 lg:p-12">
            <div className="mx-auto max-w-md">
              <div className="lg:hidden">
                <TradeCoachLogo size="auth" />
              </div>

              <p className="mt-8 text-sm font-semibold uppercase tracking-[0.2em] text-cyan-400 lg:mt-0">
                {pendingVerification ? "Almost There" : "Start Your Free Trial"}
              </p>

              {pendingVerification ? (
                <div className="mt-8">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-500/20 bg-cyan-500/10 text-2xl">
                    ✉
                  </div>

                  <h2 className="mt-6 text-3xl font-extrabold">
                    Check your email
                  </h2>

                  <p className="mt-3 leading-7 text-slate-400">
                    We sent a confirmation link to
                  </p>

                  <p className="mt-2 break-all font-semibold text-white">
                    {pendingVerification.email}
                  </p>

                  <div className="mt-8 space-y-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
                    <div className="flex gap-4">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cyan-500/10 text-sm font-bold text-cyan-400">
                        1
                      </span>
                      <p className="text-sm leading-6 text-slate-300">
                        Open the email from TradeCoach AI.
                      </p>
                    </div>

                    <div className="flex gap-4">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cyan-500/10 text-sm font-bold text-cyan-400">
                        2
                      </span>
                      <p className="text-sm leading-6 text-slate-300">
                        Click the confirmation link to verify your account.
                      </p>
                    </div>

                    <div className="flex gap-4">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cyan-500/10 text-sm font-bold text-cyan-400">
                        3
                      </span>
                      <p className="text-sm leading-6 text-slate-300">
                        Come back here and log in to complete PayPal setup and
                        start your 7-day free trial.
                      </p>
                    </div>
                  </div>

                  {pendingVerification.duplicateTrial ? (
                    <p className="mt-5 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm leading-6 text-amber-100/80">
                      This email has already used a free trial. After confirming
                      your email, you can still subscribe with PayPal to unlock
                      access.
                    </p>
                  ) : null}

                  {errorMessage ? (
                    <div className="mt-5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
                      {errorMessage}
                    </div>
                  ) : null}

                  {resendMessage ? (
                    <div className="mt-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
                      {resendMessage}
                    </div>
                  ) : null}

                  <Link
                    href="/login"
                    className="mt-8 block w-full rounded-xl bg-cyan-500 px-5 py-3 text-center font-bold text-slate-950 transition hover:bg-cyan-400"
                  >
                    Go to Log In
                  </Link>

                  <button
                    type="button"
                    onClick={() => {
                      void handleResendConfirmation();
                    }}
                    disabled={isResending}
                    className="mt-4 w-full text-sm font-semibold text-slate-400 transition hover:text-cyan-400 disabled:opacity-60"
                  >
                    {isResending ? "Sending..." : "Resend confirmation email"}
                  </button>

                  <p className="mt-5 text-center text-xs leading-6 text-slate-500">
                    Didn&apos;t get it? Check spam, promotions, or wait a minute
                    before resending.
                  </p>

                  <p className="mt-8 text-center text-sm text-slate-400">
                    Used the wrong email?{" "}
                    <button
                      type="button"
                      onClick={() => {
                        setPendingVerification(null);
                        setResendMessage("");
                        setErrorMessage("");
                      }}
                      className="font-semibold text-cyan-400 hover:text-cyan-300"
                    >
                      Sign up again
                    </button>
                  </p>
                </div>
              ) : (
                <>
                  <h2 className="mt-3 text-3xl font-extrabold">
                    Create your account
                  </h2>

                  <p className="mt-3 text-slate-400">
                    Create your account, then complete PayPal setup to start your
                    7-day free trial.
                  </p>

                  <form onSubmit={handleSignUp} className="mt-8 space-y-5">
                <div className="grid gap-5 sm:grid-cols-2">
                  <label>
                    <span className="mb-2 block text-sm font-medium text-slate-300">
                      First name
                    </span>

                    <input
                      type="text"
                      value={firstName}
                      onChange={(event) => setFirstName(event.target.value)}
                      autoComplete="given-name"
                      required
                      placeholder="Mark"
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none transition placeholder:text-slate-600 focus:border-cyan-400"
                    />
                  </label>

                  <label>
                    <span className="mb-2 block text-sm font-medium text-slate-300">
                      Last name
                    </span>

                    <input
                      type="text"
                      value={lastName}
                      onChange={(event) => setLastName(event.target.value)}
                      autoComplete="family-name"
                      required
                      placeholder="Volkmer"
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none transition placeholder:text-slate-600 focus:border-cyan-400"
                    />
                  </label>
                </div>

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
                    autoComplete="new-password"
                    required
                    minLength={8}
                    placeholder="At least 8 characters"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none transition placeholder:text-slate-600 focus:border-cyan-400"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-300">
                    Confirm password
                  </span>

                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(event) =>
                      setConfirmPassword(event.target.value)
                    }
                    autoComplete="new-password"
                    required
                    minLength={8}
                    placeholder="Enter your password again"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none transition placeholder:text-slate-600 focus:border-cyan-400"
                  />
                </label>

                {errorMessage && (
                  <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
                    {errorMessage}
                  </div>
                )}

                <label className="flex items-start gap-3 text-sm text-slate-400">
                  <input
                    type="checkbox"
                    required
                    className="mt-1 h-4 w-4 accent-cyan-500"
                  />

                  <span>
                    I agree to the Terms of Service and Privacy Policy.
                  </span>
                </label>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full rounded-xl bg-cyan-500 px-5 py-3 font-bold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isLoading
                    ? "Creating Account..."
                    : "Start My Free 7-Day Trial"}
                </button>
              </form>

              <p className="mt-6 text-center text-sm text-slate-400">
                Already have an account?{" "}
                <Link
                  href="/login"
                  className="font-semibold text-cyan-400 hover:text-cyan-300"
                >
                  Log in
                </Link>
              </p>
                </>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}