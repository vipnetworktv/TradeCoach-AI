"use client";

import type { VoiceStatus } from "@/lib/ai-coach-voice-types";

type AiCoachVoiceButtonProps = {
  disabled?: boolean;
  variant?: "default" | "inline";
  status: VoiceStatus;
  errorMessage: string | null;
  onToggle: () => void;
};

function VoiceWaveformIcon({
  className = "h-4 w-4",
}: {
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 16 16"
      fill="currentColor"
    >
      <rect x="1.5" y="5.5" width="2" height="5" rx="1" />
      <rect x="5" y="3.5" width="2" height="9" rx="1" />
      <rect x="8.5" y="2" width="2" height="12" rx="1" />
      <rect x="12" y="6.5" width="2" height="3" rx="1" />
    </svg>
  );
}

function VoiceStopIcon({
  className = "h-3.5 w-3.5",
}: {
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 16 16"
      fill="currentColor"
    >
      <rect x="4" y="4" width="8" height="8" rx="1.5" />
    </svg>
  );
}

export default function AiCoachVoiceButton({
  disabled = false,
  variant = "default",
  status,
  errorMessage,
  onToggle,
}: AiCoachVoiceButtonProps) {
  const isLive = status === "live";
  const isConnecting = status === "connecting";
  const isInline = variant === "inline";

  return (
    <div
      className={
        isInline
          ? "relative flex shrink-0 items-center"
          : "flex shrink-0 flex-col items-end gap-1"
      }
    >
      <button
        type="button"
        aria-label={
          isLive
            ? "End voice conversation"
            : "Start voice conversation"
        }
        title={
          isLive
            ? "End voice"
            : isConnecting
              ? "Connecting voice..."
              : "Talk to AI Coach"
        }
        disabled={disabled || isConnecting}
        onClick={onToggle}
        className={`flex items-center justify-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-50 ${
          isInline
            ? `h-8 w-8 ${
                isLive
                  ? "bg-white text-slate-950 hover:bg-slate-100"
                  : isConnecting
                    ? "bg-white/90 text-slate-950"
                    : "bg-white text-slate-950 hover:bg-slate-100"
              }`
            : `h-12 w-12 border ${
                isLive
                  ? "border-rose-400/40 bg-rose-500/15 text-rose-300 hover:bg-rose-500/25"
                  : isConnecting
                    ? "border-cyan-400/30 bg-cyan-500/10 text-cyan-300"
                    : "border-slate-700 bg-slate-900 text-slate-300 hover:border-cyan-400 hover:text-cyan-300"
              }`
        }`}
      >
        {isLive ? (
          isInline ? (
            <VoiceStopIcon />
          ) : (
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-60" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-rose-400" />
            </span>
          )
        ) : isConnecting && isInline ? (
          <VoiceWaveformIcon className="h-4 w-4 animate-pulse" />
        ) : isInline ? (
          <VoiceWaveformIcon />
        ) : (
          <VoiceWaveformIcon className="h-5 w-5" />
        )}
      </button>

      {isLive && !isInline ? (
        <span className="text-[10px] font-medium text-emerald-300">
          Voice live
        </span>
      ) : null}

      {errorMessage ? (
        <span
          className={
            isInline
              ? "absolute bottom-full right-0 z-10 mb-2 max-w-56 rounded-lg border border-rose-500/20 bg-slate-950 px-2 py-1 text-right text-[10px] leading-4 text-rose-300 shadow-lg"
              : "max-w-40 text-right text-[10px] leading-4 text-rose-300"
          }
        >
          {errorMessage}
        </span>
      ) : null}
    </div>
  );
}
