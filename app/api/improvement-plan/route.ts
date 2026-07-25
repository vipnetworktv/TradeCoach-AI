import { NextResponse } from "next/server";

import type { ReportRange } from "@/lib/improvement-plan";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const VALID_RANGES = new Set<ReportRange>([
  "today",
  "week",
  "month",
  "30",
  "all",
]);

type ProgressBody = {
  analysisRange?: string;
  planKey?: string;
  completedTitles?: string[];
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const analysisRange = searchParams.get("range");
  const planKey = searchParams.get("planKey");

  if (
    !analysisRange ||
    !VALID_RANGES.has(analysisRange as ReportRange) ||
    !planKey
  ) {
    return NextResponse.json(
      { error: "A valid range and planKey are required." },
      { status: 400 },
    );
  }

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

  const { data, error } = await supabase
    .from("improvement_plan_progress")
    .select("completed_titles, updated_at")
    .eq("user_id", user.id)
    .eq("analysis_range", analysisRange)
    .eq("plan_key", planKey)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }

  return NextResponse.json({
    completedTitles: data?.completed_titles ?? [],
    updatedAt: data?.updated_at ?? null,
  });
}

export async function PUT(request: Request) {
  const body = (await request.json().catch(() => ({}))) as ProgressBody;

  if (
    !body.analysisRange ||
    !VALID_RANGES.has(body.analysisRange as ReportRange) ||
    !body.planKey
  ) {
    return NextResponse.json(
      { error: "A valid analysisRange and planKey are required." },
      { status: 400 },
    );
  }

  const completedTitles = Array.isArray(body.completedTitles)
    ? body.completedTitles.filter(
        (title): title is string =>
          typeof title === "string" && title.trim().length > 0,
      )
    : [];

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

  const { data, error } = await supabase
    .from("improvement_plan_progress")
    .upsert(
      {
        user_id: user.id,
        analysis_range: body.analysisRange,
        plan_key: body.planKey,
        completed_titles: completedTitles,
      },
      {
        onConflict: "user_id,analysis_range,plan_key",
      },
    )
    .select("completed_titles, updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }

  return NextResponse.json({
    success: true,
    completedTitles: data.completed_titles,
    updatedAt: data.updated_at,
  });
}
