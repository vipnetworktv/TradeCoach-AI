"use client";

import { useEffect, useState } from "react";

import {
  EXTENSION_DOWNLOAD_URL,
  EXTENSION_SETUP_STEPS,
  EXTENSION_STORE_URL,
} from "@/lib/extension-install";

type ExtensionInstallModalProps = {
  open: boolean;
  onClose: () => void;
  onStartPairing?: () => void;
  welcome?: boolean;
};

export default function ExtensionInstallModal({
  open,
  onClose,
  onStartPairing,
  welcome = false,
}: ExtensionInstallModalProps) {
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    if (!open) {
      setActiveStep(0);
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  const step = EXTENSION_SETUP_STEPS[activeStep];
  const isLastStep = activeStep === EXTENSION_SETUP_STEPS.length - 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-slate-700 bg-slate-900 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="extension-install-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-slate-800 p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-400">
                {welcome ? "Welcome to TradeCoach" : "Setup guide"}
              </p>
              <h2
                id="extension-install-title"
                className="mt-2 text-2xl font-bold text-white sm:text-3xl"
              >
                {welcome ? "Install the Chrome extension" : "Install TradeCoach Sync"}
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-400">
                {welcome
                  ? "You're almost set up. Install TradeCoach Sync in Chrome or Edge to automatically import trades from Tradovate and NinjaTrader Web."
                  : "Download the Chrome extension, load it in your browser, then pair it with your TradeCoach account to sync live trades."}
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-700 px-3 py-1 text-sm text-slate-400 transition hover:text-white"
              aria-label="Close setup guide"
            >
              Close
            </button>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            {EXTENSION_STORE_URL ? (
              <a
                href={EXTENSION_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex rounded-xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
              >
                Install from Chrome Web Store
              </a>
            ) : (
              <a
                href={EXTENSION_DOWNLOAD_URL}
                download
                className="inline-flex rounded-xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
              >
                Download extension (.zip)
              </a>
            )}

            {!EXTENSION_STORE_URL ? (
              <a
                href={EXTENSION_DOWNLOAD_URL}
                className="inline-flex rounded-xl border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:border-cyan-300/40 hover:text-white"
              >
                Direct download link
              </a>
            ) : null}
          </div>
        </div>

        <div className="grid gap-6 p-6 sm:grid-cols-[220px_1fr] sm:p-8">
          <ol className="space-y-2">
            {EXTENSION_SETUP_STEPS.map((item, index) => {
              const isActive = index === activeStep;

              return (
                <li key={item.title}>
                  <button
                    type="button"
                    onClick={() => setActiveStep(index)}
                    className={`flex w-full items-start gap-3 rounded-2xl border px-3 py-3 text-left transition ${
                      isActive
                        ? "border-cyan-300/30 bg-cyan-300/10"
                        : "border-transparent hover:border-slate-700 hover:bg-slate-950/60"
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        isActive
                          ? "bg-cyan-400 text-slate-950"
                          : "bg-slate-800 text-slate-300"
                      }`}
                    >
                      {index + 1}
                    </span>
                    <span className="text-sm font-medium text-slate-200">
                      {item.title}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>

          <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Step {activeStep + 1} of {EXTENSION_SETUP_STEPS.length}
            </p>

            <h3 className="mt-3 text-xl font-bold text-white">{step.title}</h3>

            <p className="mt-4 text-sm leading-7 text-slate-300">
              {step.description}
            </p>

            {step.hint ? (
              <div className="mt-5 rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.05] p-4 text-sm leading-6 text-cyan-100">
                {step.hint}
              </div>
            ) : null}

            {activeStep === 1 ? (
              <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-900 p-4 font-mono text-sm text-cyan-200">
                chrome://extensions
              </div>
            ) : null}

            {activeStep === 0 && !EXTENSION_STORE_URL ? (
              <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-900 p-4 text-sm leading-6 text-slate-400">
                After downloading, unzip the file. You should see{" "}
                <span className="font-mono text-slate-200">manifest.json</span>{" "}
                inside the folder you select in Chrome.
              </div>
            ) : null}

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() =>
                  setActiveStep((current) => Math.max(0, current - 1))
                }
                disabled={activeStep === 0}
                className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                Back
              </button>

              {!isLastStep ? (
                <button
                  type="button"
                  onClick={() =>
                    setActiveStep((current) =>
                      Math.min(EXTENSION_SETUP_STEPS.length - 1, current + 1),
                    )
                  }
                  className="rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
                >
                  Next step
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onStartPairing?.();
                  }}
                  className="rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
                >
                  Generate pairing code
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
