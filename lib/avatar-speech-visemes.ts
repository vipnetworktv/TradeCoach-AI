function smoothstep(value: number): number {
  const clamped = Math.min(1, Math.max(0, value));
  return clamped * clamped * (3 - 2 * clamped);
}

function hashInteger(value: number): number {
  let hash = value | 0;
  hash = ((hash >> 16) ^ hash) * 0x45d9f3b;
  hash = ((hash >> 16) ^ hash) * 0x45d9f3b;
  hash = (hash >> 16) ^ hash;
  return Math.abs(hash);
}

export type SpeechVisemeSample = {
  envelope: number;
  jaw: number;
  stretch: number;
};

export function sampleSpeechVisemes(elapsed: number): SpeechVisemeSample {
  const tempo = 4.2 + Math.sin(elapsed * 0.25) * 0.8;
  const phase = elapsed * tempo;
  const syllableIndex = Math.floor(phase);
  const syllableTime = phase - syllableIndex;
  const seed = hashInteger(syllableIndex * 97 + 13);

  const attack = 0.1 + (seed % 30) / 400;
  const sustainEnd = 0.32 + (seed % 50) / 280;
  const releaseEnd = 0.78 + (seed % 40) / 350;

  let envelope = 0;

  if (syllableTime < attack) {
    envelope = smoothstep(syllableTime / attack);
  } else if (syllableTime < sustainEnd) {
    envelope = 0.82 + (seed % 18) / 100;
  } else if (syllableTime < releaseEnd) {
    envelope =
      (0.82 + (seed % 18) / 100) *
      (1 -
        smoothstep(
          (syllableTime - sustainEnd) / (releaseEnd - sustainEnd),
        ));
  }

  const visemeKind = syllableIndex % 4;
  const jaw =
    0.42 +
    (seed % 60) / 200 +
    (visemeKind === 0 ? 0.12 : visemeKind === 2 ? 0.18 : 0.06);
  const stretch =
    visemeKind === 1 ? 0.22 + (seed % 20) / 100 : 0.08 + (seed % 12) / 100;

  return {
    envelope: Math.min(1, Math.max(0, envelope)),
    jaw,
    stretch,
  };
}
