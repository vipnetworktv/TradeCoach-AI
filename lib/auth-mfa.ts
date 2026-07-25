type AuthenticatorAssuranceLevel = {
  currentLevel: string | null;
  nextLevel: string | null;
};

export function isMfaVerificationRequired(
  assuranceLevel: AuthenticatorAssuranceLevel | null | undefined,
) {
  return (
    assuranceLevel?.currentLevel === "aal1" &&
    assuranceLevel?.nextLevel === "aal2"
  );
}

export function getVerifiedTotpFactorId(
  factors:
    | {
        all?: Array<{ id: string; status: string }>;
        totp?: Array<{ id: string; status: string }>;
        phone?: Array<{ id: string; status: string }>;
      }
    | undefined,
) {
  const allFactors = [
    ...(factors?.all ?? []),
    ...(factors?.totp ?? []),
    ...(factors?.phone ?? []),
  ];

  return (
    allFactors.find(
      (factor) =>
        factor.status === "verified" &&
        (factors?.totp ?? []).some((totpFactor) => totpFactor.id === factor.id),
    )?.id ??
    factors?.totp.find((factor) => factor.status === "verified")?.id ??
    null
  );
}

export function buildTotpEnrollmentUri(secret: string) {
  const accountLabel = "TradeCoach AI";

  return `otpauth://totp/${encodeURIComponent(accountLabel)}?secret=${secret}&algorithm=SHA1&digits=6&period=30`;
}
