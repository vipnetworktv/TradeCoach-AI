"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type ChatMessage = {
  role: "user" | "assistant";
  text: string;
};

type CoachAiQuickChatProps = {
  firstName: string;
};

export default function CoachAiQuickChat({ firstName }: CoachAiQuickChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      text: `Hey ${firstName}, ask me anything about your trading habits, recent performance, or what to focus on next.`,
    },
  ]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, chatLoading, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    window.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  async function sendMessage() {
    const question = chatInput.trim();

    if (!question || chatLoading) {
      return;
    }

    const outgoingMessages: ChatMessage[] = [
      ...chatMessages,
      { role: "user", text: question },
    ];

    setChatMessages(outgoingMessages);
    setChatInput("");
    setChatLoading(true);
    setErrorMessage("");

    try {
      const response = await fetch("/api/ai-coach/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: outgoingMessages.slice(-16),
        }),
      });

      const data = (await response.json()) as {
        reply?: string;
        error?: string;
      };

      if (!response.ok || !data.reply) {
        throw new Error(data.error || "Coach AI request failed.");
      }

      setChatMessages((current) => [
        ...current,
        { role: "assistant", text: data.reply! },
      ]);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to reach Coach AI right now.",
      );
    } finally {
      setChatLoading(false);
    }
  }

  const overlay = (
    <div className="fixed inset-0 z-[100] flex justify-end">
      <button
        type="button"
        aria-label="Close Coach AI"
        className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm"
        onClick={() => {
          setIsOpen(false);
        }}
      />

      <div className="relative flex h-dvh w-full max-w-md min-h-0 flex-col border-l border-slate-800 bg-[#070b12] shadow-2xl shadow-cyan-500/10">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-800 px-5 py-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-400">
              Coach AI
            </p>
            <h2 className="mt-1 text-lg font-bold text-white">Quick chat</h2>
          </div>

          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
            }}
            className="rounded-lg border border-slate-800 px-3 py-2 text-sm text-slate-400 transition hover:border-slate-700 hover:text-white"
          >
            Close
          </button>
        </div>

        {errorMessage ? (
          <div className="shrink-0 border-b border-rose-500/20 bg-rose-500/10 px-5 py-3 text-sm text-rose-200">
            {errorMessage}
          </div>
        ) : null}

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
          {chatMessages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={
                message.role === "assistant"
                  ? "rounded-2xl border border-cyan-500/15 bg-cyan-500/[0.04] px-4 py-4"
                  : "rounded-2xl bg-slate-900/80 px-4 py-4"
              }
            >
              <p
                className={
                  message.role === "assistant"
                    ? "text-sm font-semibold text-cyan-400"
                    : "text-sm text-slate-500"
                }
              >
                {message.role === "assistant" ? "TradeCoach" : "You"}
              </p>

              <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-300">
                {message.text}
              </p>
            </div>
          ))}

          {chatLoading ? (
            <div className="rounded-2xl border border-cyan-500/15 bg-cyan-500/[0.04] px-4 py-4">
              <p className="text-sm font-semibold text-cyan-400">TradeCoach</p>
              <p className="mt-2 text-sm text-slate-300">Thinking...</p>
            </div>
          ) : null}

          <div ref={messagesEndRef} />
        </div>

        <div className="shrink-0 border-t border-slate-800 px-5 py-4">
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={chatInput}
              disabled={chatLoading}
              onChange={(event) => {
                setChatInput(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void sendMessage();
                }
              }}
              placeholder="Ask Coach AI..."
              className="min-w-0 flex-1 rounded-full border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-400 disabled:opacity-60"
            />

            <button
              type="button"
              onClick={() => {
                void sendMessage();
              }}
              disabled={chatLoading || !chatInput.trim()}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-cyan-500 text-lg font-bold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
              aria-label="Send message"
            >
              ↑
            </button>
          </div>

          <Link
            href="/dashboard/ai-coach"
            onClick={() => {
              setIsOpen(false);
            }}
            className="mt-4 block text-center text-sm font-semibold text-cyan-400 transition hover:text-cyan-300"
          >
            Open full AI Coach workspace
          </Link>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setIsOpen(true);
        }}
        className="coach-ai-pulse flex items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2.5 text-sm font-semibold text-cyan-300 transition hover:border-cyan-400 hover:bg-cyan-500/15 hover:text-cyan-200 sm:px-4"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/15 text-base">
          ✦
        </span>
        <span>Coach AI</span>
      </button>

      {isMounted && isOpen ? createPortal(overlay, document.body) : null}
    </>
  );
}
