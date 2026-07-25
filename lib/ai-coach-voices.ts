import type { AiCoachAvatarGender } from "@/lib/ai-coach-avatars";

export const AI_COACH_VOICE_STORAGE_KEY =
  "tradecoach-ai-coach-voice";

export const AI_COACH_VOICE_PREVIEW_TEXT =
  "Hi, I'm your TradeCoach. I'm here to help you review your trades, tighten your rules, and prepare for the next session.";

export type AiCoachVoiceGender = AiCoachAvatarGender;

export type AiCoachVoiceOption = {
  id: string;
  label: string;
  description: string;
  gender: AiCoachVoiceGender;
  recommended?: boolean;
};

export const AI_COACH_VOICE_OPTIONS: AiCoachVoiceOption[] = [
  {
    id: "marin",
    label: "Marin",
    description: "Warm and natural",
    gender: "female",
    recommended: true,
  },
  {
    id: "cedar",
    label: "Cedar",
    description: "Calm and steady",
    gender: "male",
    recommended: true,
  },
  {
    id: "coral",
    label: "Coral",
    description: "Friendly and upbeat",
    gender: "female",
  },
  {
    id: "shimmer",
    label: "Shimmer",
    description: "Bright and energetic",
    gender: "female",
  },
  {
    id: "ballad",
    label: "Ballad",
    description: "Soft and thoughtful",
    gender: "female",
  },
  {
    id: "sage",
    label: "Sage",
    description: "Reassuring and steady",
    gender: "female",
  },
  {
    id: "alloy",
    label: "Alloy",
    description: "Balanced and clear",
    gender: "male",
  },
  {
    id: "ash",
    label: "Ash",
    description: "Direct and focused",
    gender: "male",
  },
  {
    id: "echo",
    label: "Echo",
    description: "Smooth and professional",
    gender: "male",
  },
  {
    id: "verse",
    label: "Verse",
    description: "Expressive and conversational",
    gender: "male",
  },
];

const voiceIds = new Set(
  AI_COACH_VOICE_OPTIONS.map((voice) => voice.id),
);

export function getAiCoachVoicesForGender(
  gender: AiCoachVoiceGender,
): AiCoachVoiceOption[] {
  return AI_COACH_VOICE_OPTIONS.filter(
    (voice) => voice.gender === gender,
  );
}

export function getDefaultAiCoachVoiceForGender(
  gender: AiCoachVoiceGender,
): string {
  const voices = getAiCoachVoicesForGender(gender);
  const recommended = voices.find((voice) => voice.recommended);

  if (recommended) {
    return recommended.id;
  }

  if (voices[0]) {
    return voices[0].id;
  }

  return getDefaultAiCoachVoice();
}

export function isAiCoachVoiceCompatibleWithGender(
  voiceId: string,
  gender: AiCoachVoiceGender,
): boolean {
  const voice = getAiCoachVoiceOption(voiceId);
  return voice?.gender === gender;
}

export function resolveAiCoachVoiceForGender(
  value: unknown,
  gender: AiCoachVoiceGender,
): string {
  if (
    typeof value === "string" &&
    isAiCoachVoice(value) &&
    isAiCoachVoiceCompatibleWithGender(value, gender)
  ) {
    return value;
  }

  return getDefaultAiCoachVoiceForGender(gender);
}

export function getDefaultAiCoachVoice(): string {
  const configured = process.env.OPENAI_REALTIME_VOICE?.trim();

  if (configured && isAiCoachVoice(configured)) {
    return configured;
  }

  return "marin";
}

export function isAiCoachVoice(value: string): boolean {
  return voiceIds.has(value);
}

export function resolveAiCoachVoice(value: unknown): string {
  if (typeof value === "string" && isAiCoachVoice(value)) {
    return value;
  }

  return getDefaultAiCoachVoice();
}

export function getAiCoachVoiceOption(
  voiceId: string,
): AiCoachVoiceOption | undefined {
  return AI_COACH_VOICE_OPTIONS.find(
    (voice) => voice.id === voiceId,
  );
}

export function readStoredAiCoachVoice(
  gender: AiCoachVoiceGender = "female",
): string {
  if (typeof window === "undefined") {
    return getDefaultAiCoachVoiceForGender(gender);
  }

  try {
    const stored = window.localStorage.getItem(
      AI_COACH_VOICE_STORAGE_KEY,
    );

    if (
      stored &&
      isAiCoachVoice(stored) &&
      isAiCoachVoiceCompatibleWithGender(stored, gender)
    ) {
      return stored;
    }
  } catch {
    // Ignore storage read errors.
  }

  return getDefaultAiCoachVoiceForGender(gender);
}

export function writeStoredAiCoachVoice(voiceId: string): void {
  if (typeof window === "undefined" || !isAiCoachVoice(voiceId)) {
    return;
  }

  try {
    window.localStorage.setItem(
      AI_COACH_VOICE_STORAGE_KEY,
      voiceId,
    );
  } catch {
    // Ignore storage write errors.
  }
}
