import { NextResponse } from "next/server";

import {
  DEFAULT_TRADING_PROFILE_NAME,
  LEGACY_PROFILE_STATS_START,
  type TradingProfile,
} from "@/lib/trading-profiles";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type CreateProfileBody = {
  name?: string;
};

type ActivateProfileBody = {
  profileId?: string;
};

async function getAuthenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      supabase,
      user: null,
      error: NextResponse.json(
        { error: "You must be logged in." },
        { status: 401 },
      ),
    };
  }

  return { supabase, user, error: null };
}

async function listProfilesForUser(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
) {
  const { data, error } = await supabase
    .from("trading_profiles")
    .select("*")
    .eq("user_id", userId)
    .order("stats_started_at", { ascending: true });

  if (error) {
    throw error;
  }

  let profiles = (data ?? []) as TradingProfile[];

  if (profiles.length === 0) {
    const { data: created, error: createError } = await supabase
      .from("trading_profiles")
      .insert({
        user_id: userId,
        name: DEFAULT_TRADING_PROFILE_NAME,
        stats_started_at: LEGACY_PROFILE_STATS_START,
        is_active: true,
      })
      .select("*")
      .single();

    if (createError) {
      throw createError;
    }

    profiles = [created as TradingProfile];
  }

  return profiles;
}

export async function GET() {
  const auth = await getAuthenticatedUser();

  if (auth.error || !auth.user) {
    return auth.error;
  }

  try {
    const profiles = await listProfilesForUser(
      auth.supabase,
      auth.user.id,
    );

    return NextResponse.json({ profiles });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not load trading profiles.",
      },
      { status: 502 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await getAuthenticatedUser();

  if (auth.error || !auth.user) {
    return auth.error;
  }

  const body = (await request.json().catch(() => ({}))) as CreateProfileBody;
  const name = String(body.name || "").trim();

  if (!name) {
    return NextResponse.json(
      { error: "Profile name is required." },
      { status: 400 },
    );
  }

  if (name.length > 80) {
    return NextResponse.json(
      { error: "Profile name must be 80 characters or fewer." },
      { status: 400 },
    );
  }

  try {
    await auth.supabase
      .from("trading_profiles")
      .update({ is_active: false })
      .eq("user_id", auth.user.id);

    const { data: created, error: createError } = await auth.supabase
      .from("trading_profiles")
      .insert({
        user_id: auth.user.id,
        name,
        stats_started_at: new Date().toISOString(),
        is_active: true,
      })
      .select("*")
      .single();

    if (createError) {
      throw createError;
    }

    const profiles = await listProfilesForUser(
      auth.supabase,
      auth.user.id,
    );

    return NextResponse.json({
      profile: created as TradingProfile,
      profiles,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not create trading profile.",
      },
      { status: 502 },
    );
  }
}

export async function PATCH(request: Request) {
  const auth = await getAuthenticatedUser();

  if (auth.error || !auth.user) {
    return auth.error;
  }

  const body = (await request.json().catch(() => ({}))) as ActivateProfileBody;
  const profileId = String(body.profileId || "").trim();

  if (!profileId) {
    return NextResponse.json(
      { error: "profileId is required." },
      { status: 400 },
    );
  }

  try {
    const { data: target, error: targetError } = await auth.supabase
      .from("trading_profiles")
      .select("id")
      .eq("user_id", auth.user.id)
      .eq("id", profileId)
      .maybeSingle();

    if (targetError) {
      throw targetError;
    }

    if (!target) {
      return NextResponse.json(
        { error: "Trading profile not found." },
        { status: 404 },
      );
    }

    await auth.supabase
      .from("trading_profiles")
      .update({ is_active: false })
      .eq("user_id", auth.user.id);

    const { error: activateError } = await auth.supabase
      .from("trading_profiles")
      .update({ is_active: true })
      .eq("user_id", auth.user.id)
      .eq("id", profileId);

    if (activateError) {
      throw activateError;
    }

    const profiles = await listProfilesForUser(
      auth.supabase,
      auth.user.id,
    );

    return NextResponse.json({ profiles });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not switch trading profile.",
      },
      { status: 502 },
    );
  }
}
