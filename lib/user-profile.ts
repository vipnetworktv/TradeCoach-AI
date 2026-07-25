export type UserProfileMetadata = {
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
};

export function getUserProfileFromMetadata(
  metadata: UserProfileMetadata | null | undefined,
  email?: string | null,
) {
  const firstName =
    metadata?.first_name?.trim() ||
    metadata?.full_name?.trim()?.split(/\s+/)[0] ||
    email?.split("@")[0]?.trim() ||
    "";

  const lastName =
    metadata?.last_name?.trim() ||
    (metadata?.full_name?.trim()?.includes(" ")
      ? metadata.full_name.trim().split(/\s+/).slice(1).join(" ")
      : "") ||
    "";

  const initials = `${firstName.charAt(0) || ""}${lastName.charAt(0) || ""}`
    .trim()
    .toUpperCase();

  return {
    firstName,
    lastName,
    initials: initials || "TC",
  };
}

export function buildProfileMetadata(
  firstName: string,
  lastName: string,
): UserProfileMetadata {
  const normalizedFirst = firstName.trim();
  const normalizedLast = lastName.trim();
  const fullName = [normalizedFirst, normalizedLast]
    .filter(Boolean)
    .join(" ");

  return {
    first_name: normalizedFirst,
    last_name: normalizedLast,
    full_name: fullName,
  };
}
