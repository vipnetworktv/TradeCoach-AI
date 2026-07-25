export const AI_COACH_AVATAR_STORAGE_KEY =
  "tradecoach-ai-coach-avatar";

export type AiCoachAvatarGender = "male" | "female";

export type AiCoachAvatarId = "male" | "female";

export type AiCoachAvatarOption = {
  id: AiCoachAvatarId;
  label: string;
  description: string;
  gender: AiCoachAvatarGender;
  modelUrl: string;
  recommended?: boolean;
};

export const AI_COACH_AVATAR_OPTIONS: AiCoachAvatarOption[] = [
  {
    id: "male",
    label: "Male coach",
    description: "Your current male coach avatar",
    gender: "male",
    modelUrl: "/models/coach-avatar.glb",
    recommended: true,
  },
  {
    id: "female",
    label: "Female coach",
    description: "Your female coach avatar",
    gender: "female",
    modelUrl: "/models/coach-avatar-female.glb",
    recommended: true,
  },
];

const avatarIds = new Set(
  AI_COACH_AVATAR_OPTIONS.map((avatar) => avatar.id),
);

export function isAiCoachAvatar(value: string): value is AiCoachAvatarId {
  return avatarIds.has(value as AiCoachAvatarId);
}

export function getDefaultAiCoachAvatar(): AiCoachAvatarId {
  return "male";
}

export function getAiCoachAvatarOption(
  avatarId: string,
): AiCoachAvatarOption | undefined {
  return AI_COACH_AVATAR_OPTIONS.find(
    (avatar) => avatar.id === avatarId,
  );
}

export function resolveAiCoachAvatar(value: unknown): AiCoachAvatarId {
  if (typeof value === "string" && isAiCoachAvatar(value)) {
    return value;
  }

  return getDefaultAiCoachAvatar();
}

export function readStoredAiCoachAvatar(): AiCoachAvatarId {
  if (typeof window === "undefined") {
    return getDefaultAiCoachAvatar();
  }

  try {
    const stored = window.localStorage.getItem(
      AI_COACH_AVATAR_STORAGE_KEY,
    );

    if (stored && isAiCoachAvatar(stored)) {
      return stored;
    }
  } catch {
    // Ignore storage read errors.
  }

  return getDefaultAiCoachAvatar();
}

export function writeStoredAiCoachAvatar(
  avatarId: AiCoachAvatarId,
): void {
  if (typeof window === "undefined" || !isAiCoachAvatar(avatarId)) {
    return;
  }

  try {
    window.localStorage.setItem(
      AI_COACH_AVATAR_STORAGE_KEY,
      avatarId,
    );
  } catch {
    // Ignore storage write errors.
  }
}

export function getAiCoachAvatarGender(
  avatarId: AiCoachAvatarId,
): AiCoachAvatarGender {
  return (
    getAiCoachAvatarOption(avatarId)?.gender ??
    getAiCoachAvatarOption(getDefaultAiCoachAvatar())!.gender
  );
}
