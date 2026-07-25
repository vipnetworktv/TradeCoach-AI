export type VoiceStatus = "idle" | "connecting" | "live" | "error";

export type VoiceActivity =
  | "idle"
  | "connecting"
  | "listening"
  | "speaking"
  | "thinking";

export type VoiceSessionState = {
  status: VoiceStatus;
  activity: VoiceActivity;
  inputLevel: number;
  outputLevel: number;
  errorMessage: string | null;
};
