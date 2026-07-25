import { NextResponse } from "next/server";

import {
  AI_COACH_VOICE_PREVIEW_TEXT,
  resolveAiCoachVoice,
} from "@/lib/ai-coach-voices";
import { requireActiveSubscription } from "@/lib/require-active-subscription";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type VoicePreviewRequestBody = {
  voice?: string;
};

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "OPENAI_API_KEY is missing from .env.local. Restart Next.js after adding it.",
      },
      { status: 500 },
    );
  }

  const subscriptionCheck = await requireActiveSubscription();

  if (!subscriptionCheck.ok) {
    return subscriptionCheck.response;
  }

  let body: VoicePreviewRequestBody;

  try {
    body = (await request.json()) as VoicePreviewRequestBody;
  } catch {
    return NextResponse.json(
      { error: "The voice preview request was not valid JSON." },
      { status: 400 },
    );
  }

  const voice = resolveAiCoachVoice(body.voice);
  const model =
    process.env.OPENAI_TTS_PREVIEW_MODEL || "gpt-4o-mini-tts";

  let openAiResponse: Response;

  try {
    openAiResponse = await fetch(
      "https://api.openai.com/v1/audio/speech",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          voice,
          input: AI_COACH_VOICE_PREVIEW_TEXT,
          response_format: "mp3",
        }),
      },
    );
  } catch {
    return NextResponse.json(
      { error: "Could not reach the OpenAI speech API." },
      { status: 502 },
    );
  }

  if (!openAiResponse.ok) {
    const errorText = await openAiResponse.text();

    return NextResponse.json(
      {
        error:
          errorText ||
          "The OpenAI speech API could not generate a voice preview.",
      },
      { status: openAiResponse.status },
    );
  }

  const audioBuffer = await openAiResponse.arrayBuffer();

  return new Response(audioBuffer, {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
