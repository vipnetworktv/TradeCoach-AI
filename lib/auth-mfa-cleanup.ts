import type { SupabaseClient } from "@supabase/supabase-js";

type MfaFactor = {
  id: string;
  status?: string;
};

function uniqueFactors(factors: MfaFactor[]) {
  const seen = new Set<string>();

  return factors.filter((factor) => {
    if (seen.has(factor.id)) {
      return false;
    }

    seen.add(factor.id);
    return true;
  });
}

export function collectListedFactors(data: {
  all?: MfaFactor[];
  totp?: MfaFactor[];
  phone?: MfaFactor[];
}) {
  return uniqueFactors([
    ...(data.all ?? []),
    ...(data.totp ?? []),
    ...(data.phone ?? []),
  ]);
}

export async function cleanupIncompleteTotpFactors(
  supabase: SupabaseClient,
) {
  const { data, error } = await supabase.auth.mfa.listFactors();

  if (error) {
    throw error;
  }

  const incompleteFactors = collectListedFactors(data).filter(
    (factor) => factor.status !== "verified",
  );

  for (const factor of incompleteFactors) {
    const { error: unenrollError } = await supabase.auth.mfa.unenroll({
      factorId: factor.id,
    });

    if (unenrollError) {
      throw unenrollError;
    }
  }

  return incompleteFactors.length;
}
