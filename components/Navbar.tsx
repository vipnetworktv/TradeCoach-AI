import Link from "next/link";

import TradeCoachLogo from "@/components/tradecoach-logo";

type NavbarProps = {
  isAuthenticated?: boolean;
  hasSubscriptionAccess?: boolean;
};

export default function Navbar({
  isAuthenticated = false,
  hasSubscriptionAccess = false,
}: NavbarProps) {
  return (
    <nav className="border-b border-slate-800/80">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
        <TradeCoachLogo size="nav" priority />

        <div className="hidden items-center gap-8 text-sm text-slate-300 md:flex">
          <a className="transition hover:text-cyan-400" href="#features">
            Features
          </a>

          <a
            className="transition hover:text-cyan-400"
            href="#how-it-works"
          >
            How It Works
          </a>

          <a className="transition hover:text-cyan-400" href="#pricing">
            Pricing
          </a>
        </div>

        <div className="flex items-center gap-3">
          {isAuthenticated && hasSubscriptionAccess ? (
            <Link
              href="/dashboard"
              className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
            >
              Open Dashboard
            </Link>
          ) : isAuthenticated ? (
            <span className="hidden rounded-lg border border-slate-800 px-4 py-2 text-sm font-semibold text-slate-400 sm:block">
              Complete subscription to unlock
            </span>
          ) : (
            <>
              <Link
                href="/login"
                className="hidden rounded-lg px-4 py-2 text-sm font-semibold text-slate-300 transition hover:text-white sm:block"
              >
                Log In
              </Link>

              <Link
                href="/signup"
                className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
              >
                Start Free Trial
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
