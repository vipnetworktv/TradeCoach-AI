"use client";

import { useRef, useState } from "react";

import { CSV_IMPORT_HEADERS } from "@/lib/trade-csv-import";

type ImportResult = {
  inserted?: number;
  updated?: number;
  skipped_duplicates?: number;
  skipped_invalid?: number;
  message?: string;
  error?: string;
  format?: string;
  errors?: Array<{ row: number; message: string }>;
};

export default function TradeCsvImportPanel({
  onImported,
}: {
  onImported?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function handleImport(file: File) {
    setImporting(true);
    setResult(null);

    try {
      if (file.size === 0) {
        setResult({
          error:
            "The selected file is 0 bytes. Re-export from TradingView and choose Order history or Balance history.",
        });
        return;
      }

      const csvText = await file.text();

      if (!csvText.trim()) {
        setResult({
          error:
            "The selected file has no readable CSV text. Make sure you exported Order history or Balance history from TradingView, not an Excel file.",
        });
        return;
      }

      const response = await fetch("/api/trades/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          csv: csvText,
          fileName: file.name,
        }),
      });

      const data = (await response.json()) as ImportResult;

      if (!response.ok) {
        setResult({
          error: data.error || "Could not import trades.",
          errors: data.errors,
          format: data.format,
        });
        return;
      }

      setResult(data);
      onImported?.();
    } catch (error) {
      setResult({
        error:
          error instanceof Error
            ? error.message
            : "Could not import trades.",
      });
    } finally {
      setImporting(false);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  }

  function downloadTemplate() {
    const csv = [
      CSV_IMPORT_HEADERS.map((header) => `"${header}"`).join(","),
      [
        "2026-07-24T14:30:00.000Z",
        "ES",
        "Long",
        "1",
        "5500.25",
        "5502.00",
        "1.75",
        "87.50",
        "Demo Account",
        "csv",
        "",
        "",
        "",
      ]
        .map((value) => `"${value}"`)
        .join(","),
    ].join("\n");

    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "tradecoach-import-template.csv";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-400">
            Manual Import
          </p>

          <h3 className="mt-2 text-2xl font-bold text-white">
            Import trades from CSV
          </h3>

          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
            Upload missed trades from a spreadsheet, TradeCoach export, or
            TradingView Order History export. Duplicate rows are skipped
            automatically. Re-importing the same Broker Pair ID updates the
            existing row instead of creating a duplicate.
          </p>

          <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-500">
            TradingView: Paper Trading or connected broker → Export data →
            Order History → upload the CSV here.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={downloadTemplate}
            className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-cyan-300/40 hover:text-white"
          >
            Download template
          </button>

          <label className="inline-flex cursor-pointer rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300">
            {importing ? "Importing..." : "Choose CSV file"}
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              disabled={importing}
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];

                if (file) {
                  void handleImport(file);
                }
              }}
            />
          </label>
        </div>
      </div>

      {result?.message ? (
        <p className="mt-4 text-sm text-emerald-300">{result.message}</p>
      ) : null}

      {result?.error ? (
        <p className="mt-4 text-sm text-rose-300">
          {result.error}
          {result.format ? (
            <span className="block mt-1 text-xs text-rose-200/80">
              Detected format: {result.format}
            </span>
          ) : null}
        </p>
      ) : null}

      {result?.errors && result.errors.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4">
          <p className="text-sm font-semibold text-amber-200">
            {result.errors.length} row
            {result.errors.length === 1 ? "" : "s"} skipped
          </p>

          <ul className="mt-2 space-y-1 text-sm text-amber-100/80">
            {result.errors.slice(0, 5).map((item) => (
              <li key={`${item.row}-${item.message}`}>
                Row {item.row}: {item.message}
              </li>
            ))}
          </ul>

          {result.errors.length > 5 ? (
            <p className="mt-2 text-xs text-amber-100/60">
              And {result.errors.length - 5} more row errors.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
