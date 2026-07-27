"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  getAiCoachVoiceOption,
  getAiCoachVoicesForGender,
  readStoredAiCoachVoice,
  writeStoredAiCoachVoice,
} from "@/lib/ai-coach-voices";
import type { AiCoachAvatarGender } from "@/lib/ai-coach-avatars";
import { normalizeOpenAiError } from "@/lib/openai-errors";

type AiCoachVoicePickerProps = {
  disabled?: boolean;
  voiceLocked?: boolean;
  avatarGender: AiCoachAvatarGender;
  selectedVoice: string;
  onVoiceChange: (voiceId: string) => void;
};

export default function AiCoachVoicePicker({
  disabled = false,
  voiceLocked = false,
  avatarGender,
  selectedVoice,
  onVoiceChange,
}: AiCoachVoicePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [previewingVoice, setPreviewingVoice] =
    useState<string | null>(null);
  const [previewError, setPreviewError] =
    useState<string | null>(null);
  const [previewLoadingVoice, setPreviewLoadingVoice] =
    useState<string | null>(null);

  const panelRef = useRef<HTMLDivElement | null>(null);
  const previewAudioRef =
    useRef<HTMLAudioElement | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  const selectedVoiceOption =
    getAiCoachVoiceOption(selectedVoice);
  const voiceOptions = getAiCoachVoicesForGender(avatarGender);

  const stopPreview = () => {
    previewAudioRef.current?.pause();
    previewAudioRef.current = null;

    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }

    setPreviewingVoice(null);
    setPreviewLoadingVoice(null);
  };

  useEffect(() => {
    return () => {
      stopPreview();
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        stopPreview();
      }
    }

    document.addEventListener(
      "mousedown",
      handlePointerDown,
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        handlePointerDown,
      );
    };
  }, [isOpen]);

  async function previewVoice(voiceId: string) {
    if (previewingVoice === voiceId) {
      stopPreview();
      return;
    }

    stopPreview();
    setPreviewError(null);
    setPreviewLoadingVoice(voiceId);

    try {
      const response = await fetch(
        "/api/ai-coach/voice-preview",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ voice: voiceId }),
        },
      );

      if (!response.ok) {
        let message = "Could not play this voice preview.";

        try {
          const data = (await response.json()) as {
            error?: string;
          };

          if (data.error) {
            message = normalizeOpenAiError(data.error).message;
          }
        } catch {
          // Response was not JSON.
        }

        throw new Error(message);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      previewUrlRef.current = url;

      const audio = new Audio(url);
      previewAudioRef.current = audio;

      audio.onended = () => {
        stopPreview();
      };

      audio.onerror = () => {
        stopPreview();
        setPreviewError("Could not play this voice preview.");
      };

      await audio.play();
      setPreviewingVoice(voiceId);
    } catch (error) {
      stopPreview();
      setPreviewError(
        error instanceof Error
          ? error.message
          : "Could not play this voice preview.",
      );
    } finally {
      setPreviewLoadingVoice(null);
    }
  }

  function selectVoice(voiceId: string) {
    if (voiceLocked || disabled) {
      return;
    }

    writeStoredAiCoachVoice(voiceId);
    onVoiceChange(voiceId);
  }

  return (
    <div ref={panelRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setIsOpen((current) => !current);
          if (isOpen) {
            stopPreview();
          }
        }}
        className="rounded-lg border border-slate-800 px-3 py-2 text-xs font-semibold text-slate-400 transition hover:border-cyan-400 hover:text-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Voice: {selectedVoiceOption?.label ?? "Marin"}
      </button>

      {isOpen ? (
        <div className="absolute right-0 top-[calc(100%+0.5rem)] z-30 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-slate-800 bg-[#0b111a] p-4 shadow-2xl shadow-black/40">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">
                Coach voice
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-400">
                Preview a voice, then select the one you want for live
                coaching. Showing {avatarGender} voices only.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                stopPreview();
              }}
              className="rounded-md px-2 py-1 text-xs text-slate-500 transition hover:bg-slate-900 hover:text-slate-300"
            >
              Close
            </button>
          </div>

          {voiceLocked ? (
            <p className="mt-3 rounded-xl border border-amber-500/15 bg-amber-500/[0.06] px-3 py-2 text-xs leading-5 text-amber-100/80">
              End the live voice session before changing voices.
            </p>
          ) : null}

          {previewError ? (
            <p className="mt-3 rounded-xl border border-rose-500/15 bg-rose-500/[0.06] px-3 py-2 text-xs leading-5 text-rose-200">
              {previewError}
            </p>
          ) : null}

          <div className="mt-4 max-h-80 space-y-2 overflow-y-auto pr-1">
            {voiceOptions.map((voice) => {
              const isSelected = voice.id === selectedVoice;
              const isPreviewing =
                previewingVoice === voice.id;
              const isLoadingPreview =
                previewLoadingVoice === voice.id;

              return (
                <div
                  key={voice.id}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 transition ${
                    isSelected
                      ? "border-cyan-400/40 bg-cyan-500/[0.08]"
                      : "border-slate-800 bg-slate-950/70 hover:border-slate-700"
                  }`}
                >
                  <button
                    type="button"
                    disabled={disabled || voiceLocked}
                    onClick={() => selectVoice(voice.id)}
                    className="min-w-0 flex-1 text-left disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white">
                        {voice.label}
                      </span>

                      {voice.recommended ? (
                        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
                          Recommended
                        </span>
                      ) : null}
                    </div>

                    <p className="mt-0.5 text-xs text-slate-400">
                      {voice.description}
                    </p>
                  </button>

                  <button
                    type="button"
                    aria-label={`Preview ${voice.label} voice`}
                    title={`Preview ${voice.label}`}
                    disabled={disabled || isLoadingPreview}
                    onClick={() => {
                      void previewVoice(voice.id);
                    }}
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-50 ${
                      isPreviewing
                        ? "border-cyan-400/40 bg-cyan-500/15 text-cyan-300"
                        : "border-slate-700 bg-slate-900 text-slate-300 hover:border-cyan-400 hover:text-cyan-300"
                    }`}
                  >
                    {isLoadingPreview ? (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-300/30 border-t-cyan-300" />
                    ) : isPreviewing ? (
                      <svg
                        aria-hidden="true"
                        className="h-4 w-4"
                        viewBox="0 0 16 16"
                        fill="currentColor"
                      >
                        <rect x="4" y="3" width="3" height="10" rx="1" />
                        <rect x="9" y="3" width="3" height="10" rx="1" />
                      </svg>
                    ) : (
                      <svg
                        aria-hidden="true"
                        className="h-4 w-4"
                        viewBox="0 0 16 16"
                        fill="currentColor"
                      >
                        <path d="M4 2.5v11l9-5.5-9-5.5z" />
                      </svg>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function useAiCoachVoicePreference(
  avatarGender: AiCoachAvatarGender = "female",
) {
  const [selectedVoice, setSelectedVoice] = useState("marin");

  useEffect(() => {
    setSelectedVoice(readStoredAiCoachVoice(avatarGender));
  }, [avatarGender]);

  return {
    selectedVoice,
    setSelectedVoice,
  };
}
