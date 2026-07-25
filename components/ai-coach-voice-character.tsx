"use client";

import dynamic from "next/dynamic";

import type {
  VoiceActivity,
  VoiceStatus,
} from "@/lib/ai-coach-voice-types";

const AiCoachVoiceAvatar3D = dynamic(
  () => import("@/components/ai-coach-voice-avatar-3d"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center">
        <span className="text-xs text-slate-500">
          Loading coach...
        </span>
      </div>
    ),
  },
);

type AiCoachVoiceCharacterProps = {
  modelUrl: string;
  status: VoiceStatus;
  activity: VoiceActivity;
  inputLevel: number;
  outputLevel: number;
  micAvailable: boolean;
  micNotice: string | null;
};

function activityLabel(
  status: VoiceStatus,
  activity: VoiceActivity,
  micAvailable: boolean,
): string {
  if (status === "connecting") {
    return "Connecting voice coach...";
  }

  if (!micAvailable && activity === "idle") {
    return "Voice coach ready — type below";
  }

  switch (activity) {
    case "listening":
      return "Listening to you...";
    case "speaking":
      return "Coach is speaking...";
    case "thinking":
      return "Thinking...";
    default:
      return "Voice coach is live";
  }
}

export default function AiCoachVoiceCharacter({
  modelUrl,
  status,
  activity,
  inputLevel,
  outputLevel,
  micAvailable,
  micNotice,
}: AiCoachVoiceCharacterProps) {
  const isConnecting = status === "connecting";
  const isListening = activity === "listening";
  const isSpeaking = activity === "speaking";
  const isThinking = activity === "thinking";

  const glowOpacity =
    0.2 +
    (isSpeaking
      ? outputLevel * 0.45
      : isListening
        ? inputLevel * 0.35
        : 0.08);

  return (
    <div className="border-b border-cyan-500/10 bg-gradient-to-b from-cyan-500/[0.08] to-transparent px-5 py-4">
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-3 sm:flex-row sm:items-start sm:gap-5">
        <div className="relative shrink-0">
          <span
            className={`absolute -inset-3 rounded-2xl bg-cyan-400/15 blur-xl transition-opacity duration-300 ${
              isConnecting ? "animate-pulse" : ""
            }`}
            style={{ opacity: glowOpacity }}
          />

          {isListening ? (
            <span className="absolute inset-0 rounded-2xl border border-cyan-400/20 animate-pulse" />
          ) : null}

          {isSpeaking ? (
            <span className="absolute inset-0 rounded-2xl border border-emerald-400/25" />
          ) : null}

          <div className="relative h-52 w-40 overflow-hidden rounded-2xl bg-[#050910] shadow-[0_0_40px_rgba(34,211,238,0.1)] sm:h-56 sm:w-44">
            <AiCoachVoiceAvatar3D
              key={modelUrl}
              modelUrl={modelUrl}
              activity={activity}
              inputLevel={inputLevel}
              outputLevel={outputLevel}
              isConnecting={isConnecting}
            />
          </div>
        </div>

        <div className="min-w-0 flex-1 text-center sm:text-left">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-400/80">
            Live Voice Coach
          </p>

          <p className="mt-1.5 text-base font-semibold text-white sm:text-lg">
            {activityLabel(status, activity, micAvailable)}
          </p>

          <p className="mt-1.5 max-w-xl text-sm leading-6 text-slate-400">
            {micNotice
              ? micNotice
              : isListening
                ? "Speak naturally about your trades, setups, or improvement plan."
                : isSpeaking
                  ? "Your coach is responding with personalized guidance from your stats."
                  : isThinking
                    ? "Processing what you said and preparing a coaching response."
                    : micAvailable
                      ? "Say something to start the conversation."
                      : "Send a message in the box below and your coach will reply out loud."}
          </p>

          {!micAvailable ? (
            <div className="mt-2 rounded-lg border border-amber-500/15 bg-amber-500/[0.06] px-3 py-2 text-left">
              <p className="text-xs font-semibold text-amber-200">
                No mic right now
              </p>
              <p className="mt-1 text-xs leading-5 text-amber-100/75">
                Plug in a mic or type below. Check Settings → Sound → Input,
                then restart voice after connecting a device.
              </p>
            </div>
          ) : null}

          <div className="mt-3 flex items-center justify-center gap-1 sm:justify-start">
            {Array.from({ length: 5 }).map((_, index) => {
              const level = isSpeaking
                ? outputLevel
                : isListening
                  ? inputLevel
                  : isThinking
                    ? 0.25
                    : 0.08;
              const barHeight =
                8 +
                level *
                  18 *
                  (0.55 + ((index + 2) % 4) * 0.15);

              return (
                <span
                  key={index}
                  className={`w-1.5 rounded-full transition-all duration-100 ${
                    isSpeaking
                      ? "bg-emerald-400"
                      : isListening
                        ? "bg-cyan-400"
                        : "bg-slate-600"
                  }`}
                  style={{
                    height: `${barHeight}px`,
                    opacity: 0.35 + level * 0.65,
                  }}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
