"use client";

import { useEffect, useState } from "react";

import {
  DEFAULT_TRADING_PREFERENCES,
  readStoredTradingPreferences,
  TRADING_TIME_ZONE_OPTIONS,
  writeStoredTradingPreferences,
  type TradingPreferences,
} from "@/lib/trading-preferences";

export default function TradingPreferencesPanel() {
  const [preferences, setPreferences] = useState<TradingPreferences>(
    DEFAULT_TRADING_PREFERENCES,
  );
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    setPreferences(readStoredTradingPreferences());
  }, []);

  function updatePreference<K extends keyof TradingPreferences>(
    key: K,
    value: TradingPreferences[K],
  ) {
    setPreferences((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function savePreferences() {
    setMessage("");
    setErrorMessage("");

    try {
      writeStoredTradingPreferences(preferences);
      setMessage("Trading preferences saved.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not save trading preferences.",
      );
    }
  }

  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 md:p-8">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-400">
          Trading Preferences
        </p>

        <h3 className="mt-2 text-2xl font-bold">
          Personalize Your Analysis
        </h3>

        <p className="mt-2 text-sm leading-6 text-slate-500">
          These preferences help TradeCoach AI understand your trading
          style and provide more relevant coaching.
        </p>
      </div>

      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <label>
          <span className="mb-2 block text-sm font-medium text-slate-400">
            Primary Market
          </span>

          <select
            value={preferences.primaryMarket}
            onChange={(event) => {
              updatePreference("primaryMarket", event.target.value);
            }}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
          >
            <option>Futures</option>
            <option>Stocks</option>
            <option>Options</option>
            <option>Forex</option>
            <option>Cryptocurrency</option>
          </select>
        </label>

        <label>
          <span className="mb-2 block text-sm font-medium text-slate-400">
            Primary Instrument
          </span>

          <select
            value={preferences.primaryInstrument}
            onChange={(event) => {
              updatePreference("primaryInstrument", event.target.value);
            }}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
          >
            <option>NQ / MNQ</option>
            <option>ES / MES</option>
            <option>YM / MYM</option>
            <option>RTY / M2K</option>
            <option>CL / MCL</option>
            <option>GC / MGC</option>
          </select>
        </label>

        <label>
          <span className="mb-2 block text-sm font-medium text-slate-400">
            Trading Style
          </span>

          <select
            value={preferences.tradingStyle}
            onChange={(event) => {
              updatePreference("tradingStyle", event.target.value);
            }}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
          >
            <option>Scalper</option>
            <option>Intraday Trader</option>
            <option>Swing Trader</option>
            <option>Position Trader</option>
          </select>
        </label>

        <label>
          <span className="mb-2 block text-sm font-medium text-slate-400">
            Experience Level
          </span>

          <select
            value={preferences.experienceLevel}
            onChange={(event) => {
              updatePreference("experienceLevel", event.target.value);
            }}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
          >
            <option>New Trader</option>
            <option>Developing Trader</option>
            <option>Experienced Trader</option>
            <option>Professional Trader</option>
          </select>
        </label>

        <label>
          <span className="mb-2 block text-sm font-medium text-slate-400">
            Preferred Entry Timeframe
          </span>

          <select
            value={preferences.entryTimeframe}
            onChange={(event) => {
              updatePreference("entryTimeframe", event.target.value);
            }}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
          >
            <option>1 Minute</option>
            <option>2 Minutes</option>
            <option>3 Minutes</option>
            <option>5 Minutes</option>
            <option>15 Minutes</option>
          </select>
        </label>

        <label>
          <span className="mb-2 block text-sm font-medium text-slate-400">
            Primary Analysis Timeframe
          </span>

          <select
            value={preferences.analysisTimeframe}
            onChange={(event) => {
              updatePreference("analysisTimeframe", event.target.value);
            }}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
          >
            <option>1 Minute</option>
            <option>5 Minutes</option>
            <option>15 Minutes</option>
            <option>30 Minutes</option>
            <option>1 Hour</option>
          </select>
        </label>

        <label>
          <span className="mb-2 block text-sm font-medium text-slate-400">
            Daily Profit Goal
          </span>

          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">
              $
            </span>

            <input
              type="number"
              min="0"
              value={preferences.dailyProfitGoal}
              onChange={(event) => {
                updatePreference(
                  "dailyProfitGoal",
                  Number(event.target.value),
                );
              }}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 py-3 pl-8 pr-4 text-white outline-none transition focus:border-cyan-400"
            />
          </div>
        </label>

        <label>
          <span className="mb-2 block text-sm font-medium text-slate-400">
            Maximum Daily Loss
          </span>

          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">
              $
            </span>

            <input
              type="number"
              min="1"
              value={preferences.maxDailyLoss}
              onChange={(event) => {
                updatePreference(
                  "maxDailyLoss",
                  Number(event.target.value),
                );
              }}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 py-3 pl-8 pr-4 text-white outline-none transition focus:border-cyan-400"
            />
          </div>
        </label>

        <label>
          <span className="mb-2 block text-sm font-medium text-slate-400">
            Maximum Trades Per Day
          </span>

          <input
            type="number"
            min="1"
            value={preferences.maxTradesPerDay}
            onChange={(event) => {
              updatePreference(
                "maxTradesPerDay",
                Number(event.target.value),
              );
            }}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
          />
        </label>

        <label>
          <span className="mb-2 block text-sm font-medium text-slate-400">
            Time Zone
          </span>

          <select
            value={preferences.timeZone}
            onChange={(event) => {
              updatePreference(
                "timeZone",
                event.target.value as TradingPreferences["timeZone"],
              );
            }}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
          >
            {TRADING_TIME_ZONE_OPTIONS.map((option) => (
              <option key={option.label} value={option.label}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-6 rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-5">
        <p className="font-semibold text-cyan-400">
          AI Coaching Preference
        </p>

        <p className="mt-2 text-sm leading-6 text-slate-400">
          Choose how direct you want TradeCoach AI to be when reviewing
          your mistakes.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {(
            [
              ["encouraging", "Encouraging"],
              ["balanced", "Balanced"],
              ["direct", "Direct"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="cursor-pointer">
              <input
                type="radio"
                name="coachingStyle"
                checked={preferences.coachingStyle === value}
                onChange={() => {
                  updatePreference("coachingStyle", value);
                }}
                className="peer sr-only"
              />

              <span className="block rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-center text-sm font-semibold text-slate-400 transition peer-checked:border-cyan-400 peer-checked:bg-cyan-500/10 peer-checked:text-cyan-400">
                {label}
              </span>
            </label>
          ))}
        </div>
      </div>

      {message ? (
        <p className="mt-4 text-sm text-emerald-300">{message}</p>
      ) : null}

      {errorMessage ? (
        <p className="mt-4 text-sm text-rose-300">{errorMessage}</p>
      ) : null}

      <button
        type="button"
        onClick={savePreferences}
        className="mt-6 rounded-xl bg-cyan-500 px-5 py-3 font-bold text-slate-950 transition hover:bg-cyan-400"
      >
        Save Trading Preferences
      </button>
    </div>
  );
}
