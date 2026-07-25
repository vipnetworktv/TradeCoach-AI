"use client";

import { useEffect, useRef, useState } from "react";

import {
  AI_COACH_AVATAR_OPTIONS,
  getAiCoachAvatarOption,
  readStoredAiCoachAvatar,
  resolveAiCoachAvatar,
  writeStoredAiCoachAvatar,
  type AiCoachAvatarId,
} from "@/lib/ai-coach-avatars";

type AiCoachAvatarPickerProps = {
  disabled?: boolean;
  avatarLocked?: boolean;
  selectedAvatar: AiCoachAvatarId;
  onAvatarChange: (avatarId: AiCoachAvatarId) => void;
};

export default function AiCoachAvatarPicker({
  disabled = false,
  avatarLocked = false,
  selectedAvatar,
  onAvatarChange,
}: AiCoachAvatarPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const selectedAvatarOption =
    getAiCoachAvatarOption(selectedAvatar);

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
      }
    }

    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [isOpen]);

  function selectAvatar(avatarId: AiCoachAvatarId) {
    if (avatarLocked || disabled) {
      return;
    }

    writeStoredAiCoachAvatar(avatarId);
    onAvatarChange(avatarId);
    setIsOpen(false);
  }

  return (
    <div ref={panelRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setIsOpen((current) => !current);
        }}
        className="rounded-lg border border-slate-800 px-3 py-2 text-xs font-semibold text-slate-400 transition hover:border-cyan-400 hover:text-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Avatar: {selectedAvatarOption?.label ?? "Male coach"}
      </button>

      {isOpen ? (
        <div className="absolute right-0 top-[calc(100%+0.5rem)] z-30 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-slate-800 bg-[#0b111a] p-4 shadow-2xl shadow-black/40">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">
                Coach avatar
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-400">
                Choose who you want guiding you. Voice options will match
                your selection.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
              }}
              className="rounded-md px-2 py-1 text-xs text-slate-500 transition hover:bg-slate-900 hover:text-slate-300"
            >
              Close
            </button>
          </div>

          {avatarLocked ? (
            <p className="mt-3 rounded-xl border border-amber-500/15 bg-amber-500/[0.06] px-3 py-2 text-xs leading-5 text-amber-100/80">
              End the live voice session before changing avatars.
            </p>
          ) : null}

          <div className="mt-4 space-y-2">
            {AI_COACH_AVATAR_OPTIONS.map((avatar) => {
              const isSelected = avatar.id === selectedAvatar;

              return (
                <button
                  key={avatar.id}
                  type="button"
                  disabled={disabled || avatarLocked}
                  onClick={() => {
                    selectAvatar(avatar.id);
                  }}
                  className={`w-full rounded-xl border px-3 py-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
                    isSelected
                      ? "border-cyan-400/40 bg-cyan-500/[0.08]"
                      : "border-slate-800 bg-slate-950/70 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white">
                      {avatar.label}
                    </span>

                    {avatar.recommended ? (
                      <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
                        Recommended
                      </span>
                    ) : null}
                  </div>

                  <p className="mt-0.5 text-xs text-slate-400">
                    {avatar.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function useAiCoachAvatarPreference() {
  const [selectedAvatar, setSelectedAvatar] =
    useState<AiCoachAvatarId>("male");

  useEffect(() => {
    setSelectedAvatar(readStoredAiCoachAvatar());
  }, []);

  return {
    selectedAvatar,
    setSelectedAvatar: (avatarId: AiCoachAvatarId) => {
      setSelectedAvatar(resolveAiCoachAvatar(avatarId));
    },
  };
}
