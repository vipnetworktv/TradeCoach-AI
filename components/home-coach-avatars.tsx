"use client";

import dynamic from "next/dynamic";
import Link from "next/link";

import {
  AI_COACH_AVATAR_OPTIONS,
  type AiCoachAvatarOption,
} from "@/lib/ai-coach-avatars";

const AiCoachVoiceAvatar3D = dynamic(
  () => import("@/components/ai-coach-voice-avatar-3d"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-[#050910]">
        <span className="text-xs text-slate-500">Loading coach...</span>
      </div>
    ),
  },
);

function CoachAvatarShowcase({
  avatar,
}: {
  avatar: AiCoachAvatarOption;
}) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-b from-slate-900 to-slate-950 p-6">
      <span className="absolute -inset-4 rounded-3xl bg-cyan-400/10 blur-2xl opacity-20" />

      <div className="relative">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">
              {avatar.gender === "male" ? "Male Coach" : "Female Coach"}
            </p>
            <h3 className="mt-1 text-lg font-bold text-white">{avatar.label}</h3>
          </div>

          <span className="rounded-full bg-cyan-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-cyan-300">
            Live Voice
          </span>
        </div>

        <div className="relative mx-auto h-64 w-48 overflow-hidden rounded-2xl bg-[#050910] shadow-[0_0_40px_rgba(34,211,238,0.08)] sm:h-72 sm:w-52">
          <AiCoachVoiceAvatar3D
            key={avatar.modelUrl}
            modelUrl={avatar.modelUrl}
            activity="idle"
            inputLevel={0}
            outputLevel={0}
            isConnecting={false}
          />
        </div>

        <p className="mt-4 text-sm leading-6 text-slate-400">
          {avatar.gender === "male"
            ? "Direct, structured coaching grounded in your trade stats and improvement plan."
            : "Clear, supportive guidance that helps you review entries, exits, and discipline."}
        </p>

        <p className="mt-4 text-xs text-slate-500">
          Real-time voice conversation inside the app
        </p>
      </div>
    </div>
  );
}

export default function HomeCoachAvatars() {
  return (
    <section
      id="coaches"
      className="border-t border-slate-800/80 bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900/40 px-6 py-24"
    >
      <div className="mx-auto max-w-7xl">
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-400">
              Live Voice Coaches
            </p>

            <h2 className="mt-4 text-4xl font-extrabold md:text-5xl">
              Talk to your coach in real time
            </h2>

            <p className="mt-6 text-lg leading-8 text-slate-300">
              Choose a male or female AI coach avatar and have a live voice
              conversation about your trades, your improvement plan, and what to
              fix in your next session. Speak naturally — your coach listens,
              responds out loud, and keeps the discussion grounded in your actual
              performance data.
            </p>

            <ul className="mt-8 space-y-4 text-slate-300">
              <li className="flex gap-3">
                <span className="mt-1 text-cyan-400">✓</span>
                <span>
                  Real-time voice back-and-forth, not just typed chat
                </span>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 text-cyan-400">✓</span>
                <span>
                  Male and female coach avatars with lifelike movement while they
                  speak
                </span>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 text-cyan-400">✓</span>
                <span>
                  Coaching tied to your synced trades, grades, and weekly reports
                </span>
              </li>
            </ul>

            <div className="mt-10 flex flex-wrap gap-4">
              <Link
                href="/signup"
                className="rounded-xl bg-cyan-500 px-8 py-4 font-semibold text-slate-950 transition hover:bg-cyan-400"
              >
                Start Talking To Your Coach
              </Link>

              <Link
                href="/login"
                className="rounded-xl border border-slate-700 px-8 py-4 font-semibold transition hover:border-cyan-400 hover:text-cyan-400"
              >
                Log In
              </Link>
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            {AI_COACH_AVATAR_OPTIONS.map((avatar) => (
              <CoachAvatarShowcase key={avatar.id} avatar={avatar} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
