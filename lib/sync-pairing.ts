import { createHash, randomBytes, randomInt } from "node:crypto";

const PAIRING_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PAIRING_CODE_LIFETIME_MINUTES = 10;

export function createPairingCode() {
  let rawCode = "";

  for (let index = 0; index < 8; index += 1) {
    rawCode += PAIRING_ALPHABET[randomInt(PAIRING_ALPHABET.length)]!;
  }

  return `${rawCode.slice(0, 4)}-${rawCode.slice(4)}`;
}

export function normalizePairingCode(code: string) {
  const normalized = code.toUpperCase().replace(/[^A-Z0-9]/g, "");

  if (normalized.length !== 8) {
    throw new Error("Enter a valid eight-character pairing code.");
  }

  return normalized;
}

export function hashPairingCode(code: string) {
  const normalized = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return createHash("sha256").update(normalized).digest("hex");
}

export function hashDeviceToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createDeviceToken() {
  return randomBytes(36).toString("base64url");
}

export function getPairingCodeExpiry() {
  const expiresAt = new Date(
    Date.now() + PAIRING_CODE_LIFETIME_MINUTES * 60 * 1000,
  );

  return {
    expiresAt,
    expiresInSeconds: PAIRING_CODE_LIFETIME_MINUTES * 60,
  };
}
