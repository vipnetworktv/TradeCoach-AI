"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: "⌂" },
  { name: "Trades", href: "/dashboard/trades", icon: "↗" },
  { name: "Reports", href: "/dashboard/reports", icon: "▥" },
  { name: "Accounts", href: "/dashboard/accounts", icon: "◎" },
  { name: "Billing", href: "/dashboard/billing", icon: "$" },
  { name: "Settings", href: "/dashboard/settings", icon: "⚙" },
];

const aiCoachNav = {
  name: "AI Coach",
  href: "/dashboard/ai-coach",
  icon: "✦",
};

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname === "/dashboard";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

type DashboardNavProps = {
  variant?: "sidebar" | "mobile";
};

export default function DashboardNav({
  variant = "sidebar",
}: DashboardNavProps) {
  const pathname = usePathname();
  const aiCoachActive = isActive(pathname, aiCoachNav.href);

  if (variant === "mobile") {
    return (
      <div className="flex gap-3 overflow-x-auto pb-1">
        <Link
          href={aiCoachNav.href}
          className={`${aiCoachActive ? "" : "coach-ai-pulse"} whitespace-nowrap rounded-xl border px-4 py-3 text-sm font-semibold ${
            aiCoachActive
              ? "border-cyan-400 bg-cyan-500 text-slate-950"
              : "border-cyan-500/30 bg-cyan-500/10 text-cyan-300"
          }`}
        >
          {aiCoachNav.name}
        </Link>

        {navigation.map((item) => {
          const active = isActive(pathname, item.href);

          return (
            <Link
              key={item.name}
              href={item.href}
              className={`whitespace-nowrap rounded-xl px-4 py-3 text-sm font-semibold ${
                active
                  ? "bg-cyan-500 text-slate-950"
                  : "border border-slate-800 bg-slate-900 text-slate-400"
              }`}
            >
              {item.name}
            </Link>
          );
        })}
      </div>
    );
  }

  return (
    <nav className="flex-1 space-y-2 px-4 py-6">
      <Link
        href={aiCoachNav.href}
        className={`${aiCoachActive ? "" : "coach-ai-pulse"} mb-4 block rounded-2xl border px-4 py-4 transition ${
          aiCoachActive
            ? "border-cyan-400 bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/20"
            : "border-cyan-500/30 bg-cyan-500/10 text-white hover:border-cyan-400 hover:bg-cyan-500/15"
        }`}
      >
        <div className="flex items-center gap-4">
          <span
            className={`flex h-11 w-11 items-center justify-center rounded-xl text-xl ${
              aiCoachActive
                ? "bg-slate-950/10 text-slate-950"
                : "bg-cyan-500/15 text-cyan-300"
            }`}
          >
            {aiCoachNav.icon}
          </span>

          <span>
            <span className="block text-base font-bold">{aiCoachNav.name}</span>
            <span
              className={`mt-0.5 block text-xs ${
                aiCoachActive ? "text-slate-900/70" : "text-cyan-100/70"
              }`}
            >
              Full coaching workspace
            </span>
          </span>
        </div>
      </Link>

      {navigation.map((item) => {
        const active = isActive(pathname, item.href);

        return (
          <Link
            key={item.name}
            href={item.href}
            className={`flex items-center gap-4 rounded-xl px-4 py-3 font-medium transition ${
              active
                ? "bg-cyan-500 text-slate-950"
                : "text-slate-400 hover:bg-slate-900 hover:text-white"
            }`}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900/40 text-lg">
              {item.icon}
            </span>

            <span>{item.name}</span>
          </Link>
        );
      })}
    </nav>
  );
}
