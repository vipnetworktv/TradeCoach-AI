import { createHash } from "crypto";

import { NextResponse } from "next/server";

import {
  buildAiCoachVoiceInstructions,
  serializeTradingContext,
} from "@/lib/ai-coach-instructions";
import { resolveAiCoachVoice } from "@/lib/ai-coach-voices";
import { requireActiveSubscription } from "@/lib/require-active-subscription";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RealtimeRequestBody = {
  sdp?: string;
  tradingContext?: unknown;
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

  let body: RealtimeRequestBody;

  try {
    body = (await request.json()) as RealtimeRequestBody;
  } catch {
    return NextResponse.json(
      { error: "The voice session request was not valid JSON." },
      { status: 400 },
    );
  }

  if (!body.sdp || typeof body.sdp !== "string") {
    return NextResponse.json(
      { error: "A WebRTC session description (sdp) is required." },
      { status: 400 },
    );
  }

  const model =
    process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-2.1";
  const voice = resolveAiCoachVoice(body.voice);
  const instructions = buildAiCoachVoiceInstructions(
    serializeTradingContext(body.tradingContext),
  );

  const sessionConfig = JSON.stringify({
    type: "realtime",
    model,
    instructions,
    audio: {
      input: {
        turn_detection: {
          type: "server_vad",
        },
        transcription: {
          model: "gpt-4o-mini-transcribe",
        },
      },
      output: {
        voice,
      },
    },
  });

  const formData = new FormData();
  formData.set("sdp", body.sdp);
  formData.set("session", sessionConfig);

  const safetyIdentifier = createHash("sha256")
    .update(subscriptionCheck.user.id)
    .digest("hex");

  let openAiResponse: Response;

  try {
    openAiResponse = await fetch(
      "https://api.openai.com/v1/realtime/calls",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "OpenAI-Safety-Identifier": safetyIdentifier,
        },
        body: formData,
      },
    );
  } catch {
    return NextResponse.json(
      { error: "Could not reach the OpenAI Realtime API." },
      { status: 502 },
    );
  }

  if (!openAiResponse.ok) {
    const errorText = await openAiResponse.text();

    return NextResponse.json(
      {
        error:
          errorText ||
          "The OpenAI Realtime API could not start a voice session.",
      },
      { status: openAiResponse.status },
    );
  }

  const answerSdp = await openAiResponse.text();

  return new Response(answerSdp, {
    status: 200,
    headers: {
      "Content-Type": "application/sdp",
    },
  });
}
