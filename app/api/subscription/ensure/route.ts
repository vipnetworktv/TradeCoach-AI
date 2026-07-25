import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { ensureSubscriptionForUser } from "@/lib/subscription";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "You must be logged in." },
        { status: 401 },
      );
    }

    if (!user.email) {
      return NextResponse.json(
        { error: "Your account must have an email address." },
        { status: 400 },
      );
    }

    const subscription = await ensureSubscriptionForUser(
      user.id,
      user.email,
      supabase,
    );

    return NextResponse.json({
      success: true,
      subscription,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Unable to initialize your free trial." },
      { status: 500 },
    );
  }
}
