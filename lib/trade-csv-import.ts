import { createHash } from "node:crypto";

export const CSV_IMPORT_BROKER = "csv";

export const CSV_IMPORT_HEADERS = [
  "Date",
  "Symbol",
  "Direction",
  "Quantity",
  "Entry Price",
  "Exit Price",
  "Gross Points",
  "P/L",
  "Account",
  "Broker",
  "Broker Pair ID",
  "Buy Fill ID",
  "Sell Fill ID",
] as const;

export type ParsedCsvTrade = {
  rowNumber: number;
  broker: string;
  broker_pair_id: string;
  symbol: string;
  direction: "long" | "short";
  quantity: number;
  entry_price: number;
  exit_price: number;
  entry_at: string;
  exit_at: string;
  gross_points: number | null;
  net_pnl: number;
  fees: number | null;
  account_external_id: string | null;
  account_name: string | null;
  buy_fill_external_id: string | null;
  sell_fill_external_id: string | null;
  fingerprint: string;
};

export type CsvImportRowError = {
  row: number;
  message: string;
};

export type ExistingTradeFingerprint = {
  broker: string | null;
  broker_pair_id: string | null;
  symbol: string | null;
  entry_at: string | null;
  exit_at: string | null;
  quantity: number | string | null;
  entry_price: number | string | null;
  exit_price: number | string | null;
};

const HEADER_ALIASES: Record<string, string> = {
  date: "date",
  "exit date": "exit_at",
  "entry date": "entry_at",
  symbol: "symbol",
  ticker: "symbol",
  direction: "direction",
  side: "direction",
  quantity: "quantity",
  qty: "quantity",
  "entry price": "entry_price",
  entry: "entry_price",
  "exit price": "exit_price",
  exit: "exit_price",
  "gross points": "gross_points",
  points: "gross_points",
  "p/l": "net_pnl",
  pnl: "net_pnl",
  pl: "net_pnl",
  profit: "net_pnl",
  account: "account",
  broker: "broker",
  "broker pair id": "broker_pair_id",
  "pair id": "broker_pair_id",
  "buy fill id": "buy_fill_external_id",
  "sell fill id": "sell_fill_external_id",
  fees: "fees",
};

const ALLOWED_BROKERS = new Set(["tradovate", "ninjatrader", CSV_IMPORT_BROKER]);

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function parseNumber(value: string | undefined): number | null {
  if (!value?.trim()) {
    return null;
  }

  const cleaned = value.trim().replace(/[$,+]/g, "");
  const number = Number(cleaned);

  return Number.isFinite(number) ? number : null;
}

function parseDirection(value: string | undefined): "long" | "short" | null {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();

  if (!normalized) {
    return null;
  }

  if (["long", "l", "buy"].includes(normalized)) {
    return "long";
  }

  if (["short", "s", "sell"].includes(normalized)) {
    return "short";
  }

  return null;
}

function parseBroker(value: string | undefined) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();

  if (!normalized) {
    return CSV_IMPORT_BROKER;
  }

  if (normalized === "manual") {
    return CSV_IMPORT_BROKER;
  }

  if (ALLOWED_BROKERS.has(normalized)) {
    return normalized;
  }

  return null;
}

function parseTimestamp(value: string | undefined): string | null {
  if (!value?.trim()) {
    return null;
  }

  const trimmed = value.trim();
  const parsed = new Date(trimmed);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function normalizeTimestampForFingerprint(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value.trim();
  }

  return parsed.toISOString().slice(0, 16);
}

function roundPrice(value: number) {
  return value.toFixed(4);
}

export function buildTradeFingerprint(input: {
  symbol: string;
  entry_at: string;
  exit_at: string;
  quantity: number;
  entry_price: number;
  exit_price: number;
}) {
  return [
    input.symbol.trim().toUpperCase(),
    normalizeTimestampForFingerprint(input.entry_at),
    normalizeTimestampForFingerprint(input.exit_at),
    input.quantity.toFixed(4),
    roundPrice(input.entry_price),
    roundPrice(input.exit_price),
  ].join("|");
}

export function buildCsvBrokerPairId(
  fingerprint: string,
  brokerPairId?: string | null,
) {
  const trimmed = String(brokerPairId || "").trim();

  if (trimmed) {
    return trimmed;
  }

  const hash = createHash("sha256").update(fingerprint).digest("hex").slice(0, 32);
  return `csv:${hash}`;
}

export function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentValue = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentValue += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === ",") {
      currentRow.push(currentValue);
      currentValue = "";
      continue;
    }

    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }

      currentRow.push(currentValue);
      currentValue = "";

      if (currentRow.some((cell) => cell.trim())) {
        rows.push(currentRow);
      }

      currentRow = [];
      continue;
    }

    currentValue += char;
  }

  if (currentValue.length > 0 || currentRow.length > 0) {
    currentRow.push(currentValue);

    if (currentRow.some((cell) => cell.trim())) {
      rows.push(currentRow);
    }
  }

  return rows;
}

function mapRow(headers: string[], cells: string[]) {
  const mapped: Record<string, string> = {};

  headers.forEach((header, index) => {
    const canonical = HEADER_ALIASES[normalizeHeader(header)];

    if (!canonical) {
      return;
    }

    mapped[canonical] = (cells[index] ?? "").trim();
  });

  return mapped;
}

export function parseCsvTrades(text: string): {
  trades: ParsedCsvTrade[];
  errors: CsvImportRowError[];
} {
  const rows = parseCsvText(text);

  if (rows.length === 0) {
    return {
      trades: [],
      errors: [{ row: 0, message: "The CSV file is empty." }],
    };
  }

  const [headerRow, ...dataRows] = rows;
  const headers = headerRow.map((header) => normalizeHeader(header));
  const hasKnownHeader = headers.some(
    (header) => HEADER_ALIASES[header] === "symbol" || HEADER_ALIASES[header] === "date",
  );

  if (!hasKnownHeader) {
    return {
      trades: [],
      errors: [
        {
          row: 1,
          message:
            "Unrecognized CSV headers. Use TradeCoach export format or include Symbol and Date columns.",
        },
      ],
    };
  }

  const trades: ParsedCsvTrade[] = [];
  const errors: CsvImportRowError[] = [];
  const fileFingerprints = new Set<string>();

  dataRows.forEach((cells, index) => {
    const rowNumber = index + 2;
    const mapped = mapRow(headerRow, cells);

    const symbol = mapped.symbol?.trim().toUpperCase();
    const exitAt =
      parseTimestamp(mapped.exit_at) ?? parseTimestamp(mapped.date);
    const entryAt =
      parseTimestamp(mapped.entry_at) ?? exitAt;
    const quantity = parseNumber(mapped.quantity);
    const entryPrice = parseNumber(mapped.entry_price);
    const exitPrice = parseNumber(mapped.exit_price);
    const netPnl = parseNumber(mapped.net_pnl);
    const broker = parseBroker(mapped.broker);

    if (!symbol) {
      errors.push({ row: rowNumber, message: "Symbol is required." });
      return;
    }

    if (!exitAt || !entryAt) {
      errors.push({ row: rowNumber, message: "A valid Date or Exit Date is required." });
      return;
    }

    if (quantity === null || quantity <= 0) {
      errors.push({ row: rowNumber, message: "Quantity must be greater than 0." });
      return;
    }

    if (entryPrice === null || exitPrice === null) {
      errors.push({
        row: rowNumber,
        message: "Entry Price and Exit Price are required.",
      });
      return;
    }

    if (netPnl === null) {
      errors.push({ row: rowNumber, message: "P/L is required." });
      return;
    }

    if (!broker) {
      errors.push({
        row: rowNumber,
        message: "Broker must be tradovate, ninjatrader, or csv.",
      });
      return;
    }

    const direction =
      parseDirection(mapped.direction) ??
      (entryPrice <= exitPrice ? "long" : "short");

    const fingerprint = buildTradeFingerprint({
      symbol,
      entry_at: entryAt,
      exit_at: exitAt,
      quantity,
      entry_price: entryPrice,
      exit_price: exitPrice,
    });

    if (fileFingerprints.has(fingerprint)) {
      errors.push({
        row: rowNumber,
        message: "Duplicate row in this CSV file (same symbol, times, qty, and prices).",
      });
      return;
    }

    fileFingerprints.add(fingerprint);

    const grossPoints =
      parseNumber(mapped.gross_points) ??
      Number((exitPrice - entryPrice).toFixed(4));

    const account = mapped.account?.trim() || null;
    const accountLooksExternal = account && /^\d+$/.test(account);

    trades.push({
      rowNumber,
      broker,
      broker_pair_id: buildCsvBrokerPairId(
        fingerprint,
        mapped.broker_pair_id,
      ),
      symbol,
      direction,
      quantity,
      entry_price: entryPrice,
      exit_price: exitPrice,
      entry_at: entryAt,
      exit_at: exitAt,
      gross_points: grossPoints,
      net_pnl: netPnl,
      fees: parseNumber(mapped.fees),
      account_external_id: accountLooksExternal ? account : null,
      account_name: accountLooksExternal ? null : account,
      buy_fill_external_id: mapped.buy_fill_external_id || null,
      sell_fill_external_id: mapped.sell_fill_external_id || null,
      fingerprint,
    });
  });

  return { trades, errors };
}

export function buildExistingFingerprintSet(
  existingTrades: ExistingTradeFingerprint[],
) {
  const fingerprints = new Set<string>();
  const pairKeys = new Set<string>();

  for (const trade of existingTrades) {
    const symbol = String(trade.symbol || "").trim().toUpperCase();
    const entryAt = trade.entry_at ? parseTimestamp(trade.entry_at) : null;
    const exitAt = trade.exit_at ? parseTimestamp(trade.exit_at) : null;
    const quantity = parseNumber(String(trade.quantity ?? ""));
    const entryPrice = parseNumber(String(trade.entry_price ?? ""));
    const exitPrice = parseNumber(String(trade.exit_price ?? ""));

    if (
      symbol &&
      entryAt &&
      exitAt &&
      quantity !== null &&
      entryPrice !== null &&
      exitPrice !== null
    ) {
      fingerprints.add(
        buildTradeFingerprint({
          symbol,
          entry_at: entryAt,
          exit_at: exitAt,
          quantity,
          entry_price: entryPrice,
          exit_price: exitPrice,
        }),
      );
    }

    const broker = String(trade.broker || "").trim().toLowerCase();
    const pairId = String(trade.broker_pair_id || "").trim();

    if (broker && pairId) {
      pairKeys.add(`${broker}|${pairId}`);
    }
  }

  return { fingerprints, pairKeys };
}

export function partitionCsvTradesForImport(
  parsedTrades: ParsedCsvTrade[],
  existingTrades: ExistingTradeFingerprint[],
) {
  const { fingerprints, pairKeys } =
    buildExistingFingerprintSet(existingTrades);

  const toUpsert: ParsedCsvTrade[] = [];
  let skippedDuplicates = 0;
  let updates = 0;

  for (const trade of parsedTrades) {
    const pairKey = `${trade.broker}|${trade.broker_pair_id}`;

    if (pairKeys.has(pairKey)) {
      toUpsert.push(trade);
      updates += 1;
      continue;
    }

    if (fingerprints.has(trade.fingerprint)) {
      skippedDuplicates += 1;
      continue;
    }

    toUpsert.push(trade);
    fingerprints.add(trade.fingerprint);
    pairKeys.add(pairKey);
  }

  return {
    toUpsert,
    skippedDuplicates,
    updates,
  };
}

export function csvTradeToInsertRow(
  trade: ParsedCsvTrade,
  userId: string,
) {
  const now = new Date().toISOString();
  const buyPrice =
    trade.direction === "long" ? trade.entry_price : trade.exit_price;
  const sellPrice =
    trade.direction === "long" ? trade.exit_price : trade.entry_price;
  const durationSeconds = Math.max(
    0,
    Math.floor(
      (new Date(trade.exit_at).getTime() -
        new Date(trade.entry_at).getTime()) /
        1000,
    ),
  );

  return {
    user_id: userId,
    broker: trade.broker,
    broker_pair_id: trade.broker_pair_id,
    symbol: trade.symbol,
    direction: trade.direction,
    quantity: trade.quantity,
    buy_price: buyPrice,
    sell_price: sellPrice,
    entry_price: trade.entry_price,
    exit_price: trade.exit_price,
    entry_at: trade.entry_at,
    exit_at: trade.exit_at,
    duration_seconds: durationSeconds,
    gross_points: trade.gross_points,
    gross_pnl: trade.net_pnl,
    fees: trade.fees ?? 0,
    net_pnl: trade.net_pnl,
    account_external_id: trade.account_external_id,
    account_name: trade.account_name,
    buy_fill_external_id: trade.buy_fill_external_id,
    sell_fill_external_id: trade.sell_fill_external_id,
    source: "csv_import",
    status: "processed",
    processing_error: null,
    processed_at: now,
    updated_at: now,
    raw_payload: {
      import_source: "csv",
      imported_at: now,
    },
  };
}
