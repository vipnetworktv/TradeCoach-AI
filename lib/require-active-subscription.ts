import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { getSubscriptionAccessForUser } from "@/lib/subscription";

export async function requireActiveSubscription() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "You must be logged in." },
        { status: 401 },
      ),
    };
  }

  const access = await getSubscriptionAccessForUser(
    supabase,
    user.id,
    user.email,
  );

  if (!access.hasAccess) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          error:
            "Your trial or subscription is inactive. Manage billing to restore access.",
        },
        { status: 403 },
      ),
    };
  }

  return {
    ok: true as const,
    user,
    access,
  };
}
