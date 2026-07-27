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

type CsvFormat =
  | "tradecoach"
  | "tradovate_completed"
  | "tradovate_fills"
  | "tradovate_performance"
  | "tradovate_position_history"
  | "unknown";

type TradovateFill = {
  rowNumber: number;
  contract: string;
  product: string;
  side: "buy" | "sell";
  qty: number;
  price: number;
  time: string;
  account: string;
  orderId: string;
};

type OpenLot = {
  side: "long" | "short";
  qty: number;
  price: number;
  time: string;
  orderId: string;
};

const HEADER_ALIASES: Record<string, string> = {
  date: "date",
  time: "date",
  "exit date": "exit_at",
  "exit time": "exit_at",
  "entry date": "entry_at",
  "entry time": "entry_at",
  "bought timestamp": "entry_at",
  "sold timestamp": "exit_at",
  symbol: "symbol",
  ticker: "symbol",
  contract: "symbol",
  instrument: "symbol",
  "contract name": "symbol",
  market: "symbol",
  product: "product",
  direction: "direction",
  side: "direction",
  action: "direction",
  "b/s": "direction",
  "buy/sell": "direction",
  "buy sell": "direction",
  bs: "direction",
  quantity: "quantity",
  qty: "quantity",
  filledqty: "quantity",
  "filled qty": "quantity",
  bought: "bought_qty",
  sold: "sold_qty",
  size: "quantity",
  "entry price": "entry_price",
  entry: "entry_price",
  "avg entry": "entry_price",
  "avg entry price": "entry_price",
  "avg. entry price": "entry_price",
  "avg buy price": "entry_price",
  "avg. buy price": "entry_price",
  "avg buy": "entry_price",
  "avg. buy": "entry_price",
  "average price in": "entry_price",
  "avg price in": "entry_price",
  "exit price": "exit_price",
  exit: "exit_price",
  "avg exit": "exit_price",
  "avg exit price": "exit_price",
  "avg. exit price": "exit_price",
  "avg sell price": "exit_price",
  "avg. sell price": "exit_price",
  "avg sell": "exit_price",
  "avg. sell": "exit_price",
  "average price out": "exit_price",
  "avg price out": "exit_price",
  avgprice: "avg_price",
  "avg price": "avg_price",
  "avg fill price": "avg_price",
  "average price": "avg_price",
  price: "avg_price",
  "gross points": "gross_points",
  points: "gross_points",
  "p/l": "net_pnl",
  pnl: "net_pnl",
  pl: "net_pnl",
  profit: "net_pnl",
  "net p/l": "net_pnl",
  "net pnl": "net_pnl",
  "net pos": "net_pnl",
  "net position": "net_pnl",
  "realized p/l": "net_pnl",
  "realized pnl": "net_pnl",
  "profit/loss": "net_pnl",
  "profit loss": "net_pnl",
  "closed p/l": "net_pnl",
  "closed pnl": "net_pnl",
  account: "account",
  "account name": "account",
  "account id": "account",
  accountid: "account",
  broker: "broker",
  orderid: "broker_pair_id",
  "order id": "broker_pair_id",
  "fill id": "broker_pair_id",
  "position id": "broker_pair_id",
  "trade id": "broker_pair_id",
  "broker pair id": "broker_pair_id",
  "pair id": "broker_pair_id",
  "buy fill id": "buy_fill_external_id",
  "sell fill id": "sell_fill_external_id",
  "fill time": "date",
  timestamp: "exit_at",
  tradetime: "date",
  "trade time": "date",
  "trade date": "entry_at",
  "close time": "exit_at",
  "open time": "entry_at",
  "opened at": "entry_at",
  "closed at": "exit_at",
  fees: "fees",
  commission: "fees",
  status: "status",
};

const ALLOWED_INSERT_BROKERS = new Set(["tradovate", "ninjatrader"]);

const CSV_IMPORT_SOURCE = "reconciliation";

const FUTURES_POINT_VALUES: Record<string, number> = {
  ES: 50,
  MES: 5,
  NQ: 20,
  MNQ: 2,
  RTY: 50,
  M2K: 5,
  YM: 5,
  MYM: 0.5,
  CL: 1000,
  MCL: 100,
  GC: 100,
  MGC: 10,
  SI: 5000,
  SIL: 1000,
  NG: 10000,
  ZB: 1000,
  ZN: 1000,
  ZF: 1000,
};

function normalizeHeader(value: string) {
  return value
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[._]+/g, " ")
    .replace(/\s+/g, " ");
}

function stripBom(text: string) {
  if (text.charCodeAt(0) === 0xfeff) {
    return text.slice(1);
  }

  return text.replace(/^\uFEFF/, "");
}

function detectDelimiter(line: string): "," | "\t" | ";" {
  const tabs = (line.match(/\t/g) || []).length;
  const commas = (line.match(/,/g) || []).length;
  const semicolons = (line.match(/;/g) || []).length;

  if (tabs > commas && tabs >= semicolons && tabs > 0) {
    return "\t";
  }

  if (semicolons > commas && semicolons > 0) {
    return ";";
  }

  return ",";
}

function cleanCell(value: string) {
  return value.trim().replace(/^"|"$/g, "").replace(/""/g, '"');
}

function parseSimpleDelimited(text: string, delimiter: "\t" | ";") {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(delimiter).map(cleanCell));
}

function parseCommaDelimited(text: string): string[][] {
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
        rows.push(currentRow.map(cleanCell));
      }

      currentRow = [];
      continue;
    }

    currentValue += char;
  }

  if (currentValue.length > 0 || currentRow.length > 0) {
    currentRow.push(currentValue);

    if (currentRow.some((cell) => cell.trim())) {
      rows.push(currentRow.map(cleanCell));
    }
  }

  return rows;
}

function expandPackedRows(rows: string[][]): string[][] {
  return rows.map((row) => {
    if (row.length !== 1) {
      return row;
    }

    const value = row[0];

    if (value.includes("\t")) {
      return value.split("\t").map(cleanCell);
    }

    if (value.includes(";")) {
      return value.split(";").map(cleanCell);
    }

    return row;
  });
}

function scoreHeaderRow(cells: string[]) {
  let score = 0;

  for (const cell of cells) {
    const normalized = normalizeHeader(cell);
    const canonical = HEADER_ALIASES[normalized];

    if (canonical) {
      score += 2;
    }

    if (
      [
        "contract",
        "symbol",
        "b/s",
        "orderid",
        "avgprice",
        "filledqty",
        "status",
        "timestamp",
        "side",
        "pnl",
        "product",
      ].includes(normalized)
    ) {
      score += 1;
    }
  }

  return score;
}

function findHeaderRowIndex(rows: string[][]) {
  let bestIndex = 0;
  let bestScore = 0;

  for (let index = 0; index < Math.min(rows.length, 20); index += 1) {
    const score = scoreHeaderRow(rows[index]);

    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }

  return bestScore >= 3 ? bestIndex : 0;
}

function formatFoundHeaders(headers: string[]) {
  const labels = headers.map((header) => header.trim()).filter(Boolean);

  if (labels.length === 0) {
    return "none detected";
  }

  return labels.slice(0, 15).join(", ");
}

function getCellByHeaderNames(
  headers: string[],
  cells: string[],
  names: string[],
) {
  for (const name of names) {
    const target = normalizeHeader(name);
    const index = headers.findIndex(
      (header) => normalizeHeader(header) === target,
    );

    if (index >= 0) {
      const value = (cells[index] ?? "").trim();

      if (value) {
        return value;
      }
    }
  }

  return undefined;
}

function inferPositionHistoryDirection(input: {
  symbol: string;
  quantity: number;
  avgBuy: number;
  avgSell: number;
  netPnl: number | null;
}) {
  const pointValue = getFuturesPointValue(input.symbol);
  const longPnl =
    (input.avgSell - input.avgBuy) * input.quantity * pointValue;
  const shortPnl =
    (input.avgBuy - input.avgSell) * input.quantity * pointValue;

  if (input.netPnl !== null) {
    if (Math.abs(longPnl - input.netPnl) <= Math.abs(shortPnl - input.netPnl)) {
      return {
        direction: "long" as const,
        entryPrice: input.avgBuy,
        exitPrice: input.avgSell,
        netPnl: input.netPnl,
      };
    }

    return {
      direction: "short" as const,
      entryPrice: input.avgSell,
      exitPrice: input.avgBuy,
      netPnl: input.netPnl,
    };
  }

  if (longPnl >= shortPnl) {
    return {
      direction: "long" as const,
      entryPrice: input.avgBuy,
      exitPrice: input.avgSell,
      netPnl: longPnl,
    };
  }

  return {
    direction: "short" as const,
    entryPrice: input.avgSell,
    exitPrice: input.avgBuy,
    netPnl: shortPnl,
  };
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

  if (["long", "l", "buy", "b", "1", "bot"].includes(normalized)) {
    return "long";
  }

  if (["short", "s", "sell", "-1", "sld"].includes(normalized)) {
    return "short";
  }

  return null;
}

function parseTradovateSide(value: string | undefined): "buy" | "sell" | null {
  const direction = parseDirection(value);

  if (direction === "long") {
    return "buy";
  }

  if (direction === "short") {
    return "sell";
  }

  return null;
}

function parseBroker(value: string | undefined, defaultBroker = CSV_IMPORT_BROKER) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();

  if (!normalized) {
    return defaultBroker;
  }

  if (normalized === "manual") {
    return CSV_IMPORT_BROKER;
  }

  if (ALLOWED_INSERT_BROKERS.has(normalized)) {
    return normalized;
  }

  return null;
}

function resolveInsertBroker(broker: string) {
  return ALLOWED_INSERT_BROKERS.has(broker) ? broker : "tradovate";
}

function parseTimestamp(value: string | undefined): string | null {
  if (!value?.trim()) {
    return null;
  }

  const trimmed = value.trim();

  const usMatch = trimmed.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
  );

  if (usMatch) {
    const [, month, day, year, hour = "0", minute = "0", second = "0"] = usMatch;
    const local = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    );

    if (!Number.isNaN(local.getTime())) {
      return local.toISOString();
    }
  }

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

function normalizeTradovateSymbol(contract: string, product?: string) {
  const source = (product || contract).trim().toUpperCase();

  if (!source) {
    return "";
  }

  const monthCodeMatch = source.match(/^([A-Z0-9]+?)[FGHJKMNQUVXZ]\d{1,2}$/);
  if (monthCodeMatch?.[1]) {
    return monthCodeMatch[1];
  }

  const trailingDigits = source.replace(/[A-Z]+\d+$/i, "");
  return trailingDigits || source;
}

function getFuturesPointValue(symbol: string) {
  const normalized = symbol.trim().toUpperCase();

  if (FUTURES_POINT_VALUES[normalized]) {
    return FUTURES_POINT_VALUES[normalized];
  }

  for (let length = Math.min(4, normalized.length); length >= 2; length -= 1) {
    const key = normalized.slice(0, length);
    if (FUTURES_POINT_VALUES[key]) {
      return FUTURES_POINT_VALUES[key];
    }
  }

  return 1;
}

function isFilledStatus(value: string | undefined) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();

  if (!normalized) {
    return true;
  }

  return ["filled", "complete", "completed", "closed"].includes(normalized);
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
  const normalizedText = stripBom(text);
  const firstLine =
    normalizedText.split(/\r?\n/).find((line) => line.trim()) || "";
  const delimiter = detectDelimiter(firstLine);

  const rows =
    delimiter === ","
      ? parseCommaDelimited(normalizedText)
      : parseSimpleDelimited(normalizedText, delimiter);

  return expandPackedRows(rows).filter((row) =>
    row.some((cell) => cell.trim()),
  );
}

function mapRow(headers: string[], cells: string[]) {
  const mapped: Record<string, string> = {};

  headers.forEach((header, index) => {
    const canonical = HEADER_ALIASES[normalizeHeader(header)];

    if (!canonical || mapped[canonical]) {
      return;
    }

    mapped[canonical] = (cells[index] ?? "").trim();
  });

  return mapped;
}

function detectCsvFormat(headers: string[]): CsvFormat {
  const normalized = headers.map((header) => normalizeHeader(header));
  const canonical = normalized.map((header) => HEADER_ALIASES[header]).filter(Boolean);
  const canonicalSet = new Set(canonical);
  const headerSet = new Set(normalized);

  const hasContractHeader = headerSet.has("contract");
  const hasSymbol = canonicalSet.has("symbol");
  const hasSide = canonicalSet.has("direction");
  const hasPnl = canonicalSet.has("net_pnl");
  const hasEntryExit =
    canonicalSet.has("entry_price") && canonicalSet.has("exit_price");
  const hasTradeCoachHeaders =
    hasSymbol &&
    (canonicalSet.has("date") || canonicalSet.has("exit_at")) &&
    hasEntryExit;

  const hasOrderId =
    headerSet.has("orderid") ||
    headerSet.has("order id") ||
    canonicalSet.has("broker_pair_id");
  const hasAvgPrice = canonicalSet.has("avg_price");
  const hasQuantity = canonicalSet.has("quantity");
  const hasPositionHistoryShape =
    headerSet.has("position id") &&
    (headerSet.has("avg buy") || canonicalSet.has("entry_price")) &&
    (headerSet.has("avg sell") || canonicalSet.has("exit_price")) &&
    (headerSet.has("bought") || headerSet.has("sold"));

  if (hasPositionHistoryShape) {
    return "tradovate_position_history";
  }

  if (hasContractHeader && hasSide && hasPnl && hasEntryExit) {
    return "tradovate_completed";
  }

  if (
    hasSide &&
    (hasContractHeader || hasSymbol) &&
    (hasOrderId || hasAvgPrice || hasQuantity)
  ) {
    return "tradovate_fills";
  }

  if (
    hasSymbol &&
    hasSide &&
    canonicalSet.has("quantity") &&
    hasPnl &&
    canonicalSet.has("avg_price") &&
    !hasContractHeader
  ) {
    return "tradovate_performance";
  }

  if (hasTradeCoachHeaders) {
    return "tradecoach";
  }

  return "unknown";
}

function buildParsedTrade(input: {
  rowNumber: number;
  broker: string;
  brokerPairId?: string | null;
  symbol: string;
  direction: "long" | "short";
  quantity: number;
  entryPrice: number;
  exitPrice: number;
  entryAt: string;
  exitAt: string;
  netPnl: number;
  grossPoints?: number | null;
  fees?: number | null;
  account?: string | null;
  buyFillId?: string | null;
  sellFillId?: string | null;
}): ParsedCsvTrade {
  const fingerprint = buildTradeFingerprint({
    symbol: input.symbol,
    entry_at: input.entryAt,
    exit_at: input.exitAt,
    quantity: input.quantity,
    entry_price: input.entryPrice,
    exit_price: input.exitPrice,
  });

  const account = input.account?.trim() || null;
  const accountLooksExternal = account && /^\d+$/.test(account);

  return {
    rowNumber: input.rowNumber,
    broker: input.broker,
    broker_pair_id: buildCsvBrokerPairId(fingerprint, input.brokerPairId),
    symbol: input.symbol,
    direction: input.direction,
    quantity: input.quantity,
    entry_price: input.entryPrice,
    exit_price: input.exitPrice,
    entry_at: input.entryAt,
    exit_at: input.exitAt,
    gross_points:
      input.grossPoints ??
      Number((input.exitPrice - input.entryPrice).toFixed(4)),
    net_pnl: input.netPnl,
    fees: input.fees ?? null,
    account_external_id: accountLooksExternal ? account : null,
    account_name: accountLooksExternal ? null : account,
    buy_fill_external_id: input.buyFillId || null,
    sell_fill_external_id: input.sellFillId || null,
    fingerprint,
  };
}

function pairTradovateFills(fills: TradovateFill[]): ParsedCsvTrade[] {
  const byContract = new Map<string, TradovateFill[]>();

  for (const fill of fills) {
    const key = fill.contract.trim().toUpperCase();
    const group = byContract.get(key) ?? [];
    group.push(fill);
    byContract.set(key, group);
  }

  const trades: ParsedCsvTrade[] = [];

  for (const [contract, contractFills] of byContract) {
    const sorted = [...contractFills].sort(
      (left, right) =>
        new Date(left.time).getTime() - new Date(right.time).getTime(),
    );

    const openLots: OpenLot[] = [];

    for (const fill of sorted) {
      let remaining = fill.qty;
      const closingSide = fill.side === "buy" ? "short" : "long";

      while (
        remaining > 0 &&
        openLots.length > 0 &&
        openLots[0].side === closingSide
      ) {
        const lot = openLots[0];
        const matchedQty = Math.min(remaining, lot.qty);
        const symbol = normalizeTradovateSymbol(contract, fill.product);
        const direction = lot.side;
        const entryPrice = lot.price;
        const exitPrice = fill.price;
        const grossPoints =
          direction === "long"
            ? exitPrice - entryPrice
            : entryPrice - exitPrice;
        const pointValue = getFuturesPointValue(symbol);
        const netPnl = grossPoints * pointValue * matchedQty;

        trades.push(
          buildParsedTrade({
            rowNumber: fill.rowNumber,
            broker: "tradovate",
            brokerPairId: `tradovate:${lot.orderId}:${fill.orderId}:${matchedQty}`,
            symbol,
            direction,
            quantity: matchedQty,
            entryPrice,
            exitPrice,
            entryAt: lot.time,
            exitAt: fill.time,
            netPnl,
            grossPoints,
            account: fill.account,
            buyFillId: direction === "long" ? lot.orderId : fill.orderId,
            sellFillId: direction === "long" ? fill.orderId : lot.orderId,
          }),
        );

        lot.qty -= matchedQty;
        remaining -= matchedQty;

        if (lot.qty <= 0) {
          openLots.shift();
        }
      }

      if (remaining > 0) {
        openLots.push({
          side: fill.side === "buy" ? "long" : "short",
          qty: remaining,
          price: fill.price,
          time: fill.time,
          orderId: fill.orderId,
        });
      }
    }
  }

  return trades;
}

function parseTradovateFillRow(
  mapped: Record<string, string>,
  rowNumber: number,
  errors: CsvImportRowError[],
): TradovateFill | null {
  if (!isFilledStatus(mapped.status)) {
    return null;
  }

  const contract = mapped.symbol?.trim();
  const side = parseTradovateSide(mapped.direction);
  const qty =
    parseNumber(mapped.quantity) ??
    parseNumber(mapped.qty) ??
    parseNumber(mapped.size);
  const price =
    parseNumber(mapped.avg_price) ??
    parseNumber(mapped.entry_price) ??
    parseNumber(mapped.exit_price);
  const time =
    parseTimestamp(mapped.date) ??
    parseTimestamp(mapped.exit_at) ??
    parseTimestamp(mapped.entry_at);

  if (!contract) {
    errors.push({ row: rowNumber, message: "Contract is required." });
    return null;
  }

  if (!side) {
    errors.push({ row: rowNumber, message: "B/S side must be Buy or Sell." });
    return null;
  }

  if (qty === null || qty <= 0) {
    errors.push({ row: rowNumber, message: "Filled quantity must be greater than 0." });
    return null;
  }

  if (price === null) {
    errors.push({ row: rowNumber, message: "avgPrice or Avg Fill Price is required." });
    return null;
  }

  if (!time) {
    errors.push({ row: rowNumber, message: "Fill Time or Timestamp is required." });
    return null;
  }

  return {
    rowNumber,
    contract,
    product: mapped.product || "",
    side,
    qty,
    price,
    time,
    account: mapped.account || "",
    orderId: mapped.broker_pair_id || `row-${rowNumber}`,
  };
}

function parseTradovatePositionHistoryRow(
  headers: string[],
  cells: string[],
  rowNumber: number,
  errors: CsvImportRowError[],
): ParsedCsvTrade | null {
  const mapped = mapRow(headers, cells);
  const contract =
    getCellByHeaderNames(headers, cells, [
      "Contract",
      "Product",
      "Market",
      "Symbol",
    ]) ||
    mapped.symbol ||
    mapped.product;
  const symbol = normalizeTradovateSymbol(contract || "", mapped.product);
  const bought =
    parseNumber(mapped.bought_qty) ??
    parseNumber(getCellByHeaderNames(headers, cells, ["Bought"]));
  const sold =
    parseNumber(mapped.sold_qty) ??
    parseNumber(getCellByHeaderNames(headers, cells, ["Sold"]));
  const avgBuy =
    parseNumber(mapped.entry_price) ??
    parseNumber(getCellByHeaderNames(headers, cells, ["Avg. Buy", "Avg Buy"]));
  const avgSell =
    parseNumber(mapped.exit_price) ??
    parseNumber(getCellByHeaderNames(headers, cells, ["Avg. Sell", "Avg Sell"]));
  const netPnl =
    parseNumber(mapped.net_pnl) ??
    parseNumber(getCellByHeaderNames(headers, cells, ["Net Pos", "Net P/L", "P/L"]));
  const exitAt =
    parseTimestamp(mapped.exit_at) ??
    parseTimestamp(getCellByHeaderNames(headers, cells, ["Timestamp"]));
  const entryAt =
    parseTimestamp(mapped.entry_at) ??
    parseTimestamp(getCellByHeaderNames(headers, cells, ["Trade Date"])) ??
    exitAt;
  const account =
    mapped.account ||
    getCellByHeaderNames(headers, cells, ["Account", "Account Name"]);
  const positionId =
    mapped.broker_pair_id ||
    getCellByHeaderNames(headers, cells, ["Position ID", "Position Id"]);

  if (!symbol) {
    errors.push({
      row: rowNumber,
      message:
        "Contract/Product/Symbol column is required for Tradovate Position History rows.",
    });
    return null;
  }

  if (avgBuy === null || avgSell === null) {
    errors.push({
      row: rowNumber,
      message: "Avg. Buy and Avg. Sell are required.",
    });
    return null;
  }

  const quantity =
    bought !== null && sold !== null
      ? Math.min(bought, sold)
      : bought ?? sold;

  if (quantity === null || quantity <= 0) {
    errors.push({
      row: rowNumber,
      message: "Bought/Sold quantity must be greater than 0.",
    });
    return null;
  }

  if (!exitAt || !entryAt) {
    errors.push({
      row: rowNumber,
      message: "Timestamp or Trade Date is required.",
    });
    return null;
  }

  const resolved = inferPositionHistoryDirection({
    symbol,
    quantity,
    avgBuy,
    avgSell,
    netPnl,
  });

  return buildParsedTrade({
    rowNumber,
    broker: "tradovate",
    brokerPairId: positionId,
    symbol,
    direction: resolved.direction,
    quantity,
    entryPrice: resolved.entryPrice,
    exitPrice: resolved.exitPrice,
    entryAt,
    exitAt,
    netPnl: resolved.netPnl,
    grossPoints:
      resolved.direction === "long"
        ? resolved.exitPrice - resolved.entryPrice
        : resolved.entryPrice - resolved.exitPrice,
    account,
  });
}

function parseTradovatePerformanceRow(
  mapped: Record<string, string>,
  rowNumber: number,
  errors: CsvImportRowError[],
): ParsedCsvTrade | null {
  const symbol = normalizeTradovateSymbol(
    mapped.symbol || "",
    mapped.product,
  );
  const direction = parseDirection(mapped.direction);
  const quantity = parseNumber(mapped.quantity);
  const avgPrice = parseNumber(mapped.avg_price);
  const netPnl = parseNumber(mapped.net_pnl);
  const exitAt =
    parseTimestamp(mapped.exit_at) ?? parseTimestamp(mapped.date);
  const entryAt =
    parseTimestamp(mapped.entry_at) ?? exitAt;

  if (!symbol) {
    errors.push({ row: rowNumber, message: "Symbol is required." });
    return null;
  }

  if (!direction) {
    errors.push({ row: rowNumber, message: "Side must be Long or Short." });
    return null;
  }

  if (quantity === null || quantity <= 0) {
    errors.push({ row: rowNumber, message: "Qty must be greater than 0." });
    return null;
  }

  if (avgPrice === null) {
    errors.push({ row: rowNumber, message: "AvgPrice is required." });
    return null;
  }

  if (netPnl === null) {
    errors.push({ row: rowNumber, message: "P&L is required." });
    return null;
  }

  if (!exitAt || !entryAt) {
    errors.push({ row: rowNumber, message: "Time or Date is required." });
    return null;
  }

  const pointValue = getFuturesPointValue(symbol);
  const pointsMoved = netPnl / (quantity * pointValue);
  const entryPrice =
    parseNumber(mapped.entry_price) ??
    (direction === "long" ? avgPrice : avgPrice + pointsMoved);
  const exitPrice =
    parseNumber(mapped.exit_price) ??
    (direction === "long" ? avgPrice + pointsMoved : avgPrice);

  return buildParsedTrade({
    rowNumber,
    broker: "tradovate",
    brokerPairId: mapped.broker_pair_id,
    symbol,
    direction,
    quantity,
    entryPrice,
    exitPrice,
    entryAt,
    exitAt,
    netPnl,
    grossPoints: pointsMoved,
    account: mapped.account,
  });
}

function parseTradovateCompletedRow(
  mapped: Record<string, string>,
  rowNumber: number,
  errors: CsvImportRowError[],
): ParsedCsvTrade | null {
  const symbol = normalizeTradovateSymbol(
    mapped.symbol || "",
    mapped.product,
  );
  const exitAt =
    parseTimestamp(mapped.exit_at) ?? parseTimestamp(mapped.date);
  const entryAt =
    parseTimestamp(mapped.entry_at) ?? exitAt;
  const quantity = parseNumber(mapped.quantity);
  const entryPrice = parseNumber(mapped.entry_price);
  const exitPrice = parseNumber(mapped.exit_price);
  let netPnl = parseNumber(mapped.net_pnl);
  const direction = parseDirection(mapped.direction);

  if (!symbol) {
    errors.push({ row: rowNumber, message: "Contract or Product is required." });
    return null;
  }

  if (!exitAt || !entryAt) {
    errors.push({ row: rowNumber, message: "A valid trade date/time is required." });
    return null;
  }

  if (quantity === null || quantity <= 0) {
    errors.push({ row: rowNumber, message: "Quantity must be greater than 0." });
    return null;
  }

  if (entryPrice === null || exitPrice === null) {
    errors.push({
      row: rowNumber,
      message: "Entry and exit prices are required.",
    });
    return null;
  }

  const resolvedDirection =
    direction ??
    (entryPrice <= exitPrice ? "long" : "short");

  if (netPnl === null) {
    const grossPoints =
      resolvedDirection === "long"
        ? exitPrice - entryPrice
        : entryPrice - exitPrice;
    netPnl = grossPoints * getFuturesPointValue(symbol) * quantity;
  }

  return buildParsedTrade({
    rowNumber,
    broker: "tradovate",
    brokerPairId: mapped.broker_pair_id,
    symbol,
    direction: resolvedDirection,
    quantity,
    entryPrice,
    exitPrice,
    entryAt,
    exitAt,
    netPnl,
    grossPoints: parseNumber(mapped.gross_points),
    fees: parseNumber(mapped.fees),
    account: mapped.account,
    buyFillId: mapped.buy_fill_external_id,
    sellFillId: mapped.sell_fill_external_id,
  });
}

function parseGenericRow(
  mapped: Record<string, string>,
  rowNumber: number,
  errors: CsvImportRowError[],
): ParsedCsvTrade | null {
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
    return null;
  }

  if (!exitAt || !entryAt) {
    errors.push({ row: rowNumber, message: "A valid Date or Exit Date is required." });
    return null;
  }

  if (quantity === null || quantity <= 0) {
    errors.push({ row: rowNumber, message: "Quantity must be greater than 0." });
    return null;
  }

  if (entryPrice === null || exitPrice === null) {
    errors.push({
      row: rowNumber,
      message: "Entry Price and Exit Price are required.",
    });
    return null;
  }

  if (netPnl === null) {
    errors.push({ row: rowNumber, message: "P/L is required." });
    return null;
  }

  if (!broker) {
    errors.push({
      row: rowNumber,
      message: "Broker must be tradovate, ninjatrader, or csv.",
    });
    return null;
  }

  const direction =
    parseDirection(mapped.direction) ??
    (entryPrice <= exitPrice ? "long" : "short");

  return buildParsedTrade({
    rowNumber,
    broker,
    brokerPairId: mapped.broker_pair_id,
    symbol,
    direction,
    quantity,
    entryPrice,
    exitPrice,
    entryAt,
    exitAt,
    netPnl,
    grossPoints: parseNumber(mapped.gross_points),
    fees: parseNumber(mapped.fees),
    account: mapped.account,
    buyFillId: mapped.buy_fill_external_id,
    sellFillId: mapped.sell_fill_external_id,
  });
}

function dedupeParsedTrades(trades: ParsedCsvTrade[]) {
  const unique: ParsedCsvTrade[] = [];
  const fingerprints = new Set<string>();
  const pairKeys = new Set<string>();

  for (const trade of trades) {
    const pairKey = `${trade.broker}|${trade.broker_pair_id}`;

    if (pairKeys.has(pairKey) || fingerprints.has(trade.fingerprint)) {
      continue;
    }

    pairKeys.add(pairKey);
    fingerprints.add(trade.fingerprint);
    unique.push(trade);
  }

  return unique;
}

export function parseCsvTrades(text: string): {
  trades: ParsedCsvTrade[];
  errors: CsvImportRowError[];
  format: CsvFormat;
} {
  const rows = parseCsvText(text);

  if (rows.length === 0) {
    return {
      trades: [],
      errors: [{ row: 0, message: "The CSV file is empty." }],
      format: "unknown",
    };
  }

  const headerRowIndex = findHeaderRowIndex(rows);
  const headerRow = rows[headerRowIndex];
  const dataRows = rows.slice(headerRowIndex + 1);
  const format = detectCsvFormat(headerRow);
  const headerLineNumber = headerRowIndex + 1;

  if (format === "unknown") {
    return {
      trades: [],
      errors: [
        {
          row: headerLineNumber,
          message: `Unrecognized CSV headers (${formatFoundHeaders(headerRow)}). Export from Tradovate Account Reports → Orders, Fills, or Position History.`,
        },
      ],
      format,
    };
  }

  const errors: CsvImportRowError[] = [];
  let trades: ParsedCsvTrade[] = [];

  if (format === "tradovate_fills") {
    const fills: TradovateFill[] = [];

    dataRows.forEach((cells, index) => {
      const rowNumber = headerLineNumber + index + 1;
      const mapped = mapRow(headerRow, cells);
      const fill = parseTradovateFillRow(mapped, rowNumber, errors);

      if (fill) {
        fills.push(fill);
      }
    });

    if (fills.length === 0 && errors.length === 0) {
      errors.push({
        row: 0,
        message:
          "No filled Tradovate rows found. Export Orders or Fills with Status = Filled.",
      });
    }

    trades = pairTradovateFills(fills);

    if (fills.length > 0 && trades.length === 0) {
      errors.push({
        row: 0,
        message:
          "Tradovate fills were found, but none could be paired into completed trades yet. Make sure the export includes both entry and exit fills.",
      });
    }
  } else {
    dataRows.forEach((cells, index) => {
      const rowNumber = headerLineNumber + index + 1;
      const mapped = mapRow(headerRow, cells);
      const trade =
        format === "tradovate_position_history"
          ? parseTradovatePositionHistoryRow(
              headerRow,
              cells,
              rowNumber,
              errors,
            )
          : format === "tradovate_completed"
            ? parseTradovateCompletedRow(mapped, rowNumber, errors)
            : format === "tradovate_performance"
              ? parseTradovatePerformanceRow(mapped, rowNumber, errors)
              : parseGenericRow(mapped, rowNumber, errors);

      if (trade) {
        trades.push(trade);
      }
    });
  }

  const fileFingerprints = new Set<string>();
  const dedupedTrades: ParsedCsvTrade[] = [];

  for (const trade of dedupeParsedTrades(trades)) {
    if (fileFingerprints.has(trade.fingerprint)) {
      errors.push({
        row: trade.rowNumber,
        message:
          "Duplicate row in this CSV file (same symbol, times, qty, and prices).",
      });
      continue;
    }

    fileFingerprints.add(trade.fingerprint);
    dedupedTrades.push(trade);
  }

  return {
    trades: dedupedTrades,
    errors,
    format,
  };
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
  const pointValue = getFuturesPointValue(trade.symbol);
  const buyFillExternalId =
    trade.buy_fill_external_id?.trim() ||
    `csv-buy:${trade.broker_pair_id}`;
  const sellFillExternalId =
    trade.sell_fill_external_id?.trim() ||
    `csv-sell:${trade.broker_pair_id}`;

  return {
    user_id: userId,
    broker: resolveInsertBroker(trade.broker),
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
    point_value: pointValue,
    gross_pnl: trade.net_pnl,
    fees: trade.fees ?? 0,
    net_pnl: trade.net_pnl,
    account_external_id:
      trade.account_external_id ?? trade.account_name ?? null,
    buy_fill_external_id: buyFillExternalId,
    sell_fill_external_id: sellFillExternalId,
    source: CSV_IMPORT_SOURCE,
    status: "processed",
    processing_error: null,
    processed_at: now,
    updated_at: now,
    raw_payload: {
      import_source: "csv",
      import_broker: trade.broker,
      imported_at: now,
      account_label: trade.account_name ?? trade.account_external_id ?? null,
    },
  };
}
