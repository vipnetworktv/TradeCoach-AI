type OpenAiErrorPayload = {
  error?: {
    message?: string;
    type?: string;
    code?: string;
    param?: string | null;
  };
};

export type NormalizedOpenAiError = {
  message: string;
  code: string | null;
  status: number;
};

function tryParseJson(value: string): OpenAiErrorPayload | null {
  try {
    return JSON.parse(value) as OpenAiErrorPayload;
  } catch {
    return null;
  }
}

function extractNestedOpenAiMessage(value: unknown): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const nestedError = record.error;

  if (nestedError && typeof nestedError === "object") {
    const message = (nestedError as Record<string, unknown>).message;

    if (typeof message === "string" && message.trim()) {
      return message.trim();
    }
  }

  if (typeof record.message === "string" && record.message.trim()) {
    return record.message.trim();
  }

  return null;
}

export function normalizeOpenAiError(
  error: unknown,
  fallback = "TradeCoach AI could not answer right now.",
): NormalizedOpenAiError {
  if (typeof error === "string") {
    const parsed = tryParseJson(error.trim());

    if (parsed?.error?.message) {
      return normalizeOpenAiError(parsed, fallback);
    }

    return {
      message: error.trim() || fallback,
      code: null,
      status: 500,
    };
  }

  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const status =
      typeof record.status === "number"
        ? record.status
        : 500;
    const nestedMessage = extractNestedOpenAiMessage(error);
    const code =
      typeof (record.error as Record<string, unknown> | undefined)?.code ===
      "string"
        ? String((record.error as Record<string, unknown>).code)
        : typeof record.code === "string"
          ? record.code
          : null;

    if (nestedMessage) {
      return {
        message: humanizeOpenAiMessage(nestedMessage, code),
        code,
        status,
      };
    }

    if (error instanceof Error && error.message.trim()) {
      const parsedFromMessage = tryParseJson(error.message.trim());

      if (parsedFromMessage?.error?.message) {
        return normalizeOpenAiError(parsedFromMessage, fallback);
      }

      return {
        message: humanizeOpenAiMessage(error.message.trim(), code),
        code,
        status,
      };
    }
  }

  return {
    message: fallback,
    code: null,
    status: 500,
  };
}

export function humanizeOpenAiMessage(
  message: string,
  code?: string | null,
) {
  const normalizedCode = String(code || "").toLowerCase();
  const normalizedMessage = message.toLowerCase();

  if (
    normalizedCode === "insufficient_quota" ||
    normalizedMessage.includes("exceeded your current quota")
  ) {
    return "AI Coach is temporarily unavailable because the OpenAI billing quota was exceeded. Add credits or upgrade billing at platform.openai.com/settings/billing, then try again.";
  }

  if (
    normalizedCode === "invalid_api_key" ||
    normalizedMessage.includes("incorrect api key")
  ) {
    return "AI Coach is misconfigured: the OpenAI API key on the server is invalid. Update OPENAI_API_KEY in the server environment and restart the app.";
  }

  if (
    normalizedCode === "rate_limit_exceeded" ||
    normalizedMessage.includes("rate limit")
  ) {
    return "AI Coach is receiving too many requests right now. Please wait a moment and try again.";
  }

  return message.trim();
}

export function looksLikeOpenAiErrorPayload(text: string) {
  const trimmed = text.trim();

  if (!trimmed.startsWith("{")) {
    return false;
  }

  const parsed = tryParseJson(trimmed);

  return Boolean(parsed?.error?.message);
}

export function sanitizeAssistantText(text: string) {
  if (looksLikeOpenAiErrorPayload(text)) {
    return normalizeOpenAiError(text).message;
  }

  return text.trim();
}
