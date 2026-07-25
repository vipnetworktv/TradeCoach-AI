export type SearchableTrade = {
  symbol?: string | null;
  direction?: string | null;
  status?: string | null;
  processing_error?: string | null;
  broker_pair_id?: string | null;
  buy_fill_external_id?: string | null;
  sell_fill_external_id?: string | null;
  quantity?: number | string | null;
  entry_price?: number | string | null;
  exit_price?: number | string | null;
  gross_points?: number | string | null;
  gross_pnl?: number | string | null;
  fees?: number | string | null;
  net_pnl?: number | string | null;
  account_name?: string | null;
  broker_account_name?: string | null;
  account_label?: string | null;
  account_external_id?: string | null;
  broker_account_external_id?: string | null;
  account_id?: string | null;
  entry_at?: string | null;
  exit_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: unknown;
};

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function pickString(
  trade: SearchableTrade,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = trade[key];

    if (
      value !== null &&
      value !== undefined &&
      String(value).trim()
    ) {
      return String(value).trim();
    }
  }

  return null;
}

export function getTradeAccountLabel(trade: SearchableTrade): string {
  return (
    pickString(trade, [
      "account_name",
      "broker_account_name",
      "account_label",
      "account_external_id",
      "broker_account_external_id",
      "account_id",
    ]) || "Tradovate"
  );
}

function formatMoney(value: unknown): string {
  const number = toNumber(value);

  if (number === null) {
    return "";
  }

  const normalized = Math.abs(number) < 0.005 ? 0 : number;
  const formatted = Math.abs(normalized).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  if (normalized < 0) {
    return `-$${formatted}`;
  }

  if (normalized > 0) {
    return `$${formatted}`;
  }

  return "$0.00";
}

function parseSearchNumber(query: string): number | null {
  const cleaned = query
    .trim()
    .replace(/,/g, "")
    .replace(/\$/g, "")
    .replace(/\s+/g, "");

  if (!cleaned) {
    return null;
  }

  if (!/^[-+]?\d*\.?\d+$/.test(cleaned)) {
    return null;
  }

  const number = Number(cleaned);

  return Number.isFinite(number) ? number : null;
}

function numberMatchesSearch(
  value: unknown,
  query: string,
  searchNumber: number | null,
): boolean {
  const number = toNumber(value);

  if (number === null) {
    return false;
  }

  const normalizedQuery = query.trim().toLowerCase();
  const formattedValues = [
    formatMoney(number).toLowerCase(),
    number.toFixed(2),
    Math.abs(number).toFixed(2),
    String(number),
    String(Math.abs(number)),
  ];

  if (
    formattedValues.some((entry) => entry.includes(normalizedQuery.replace(/\$/g, "")))
  ) {
    return true;
  }

  if (searchNumber === null) {
    return false;
  }

  if (Math.abs(number - searchNumber) < 0.005) {
    return true;
  }

  if (Math.abs(Math.abs(number) - Math.abs(searchNumber)) < 0.005) {
    return true;
  }

  return false;
}

export function getTradeDisplayPnl(
  trade: SearchableTrade,
): number | null {
  const net = toNumber(trade.net_pnl);
  const gross = toNumber(trade.gross_pnl);
  const status = String(trade.status || "").toLowerCase();

  if (status === "processed" && net !== null) {
    return net;
  }

  return gross ?? net;
}

export function tradeMatchesSearch(
  trade: SearchableTrade,
  query: string,
): boolean {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return true;
  }

  const account = getTradeAccountLabel(trade);
  const searchableText = [
    trade.symbol,
    trade.direction,
    trade.status,
    trade.processing_error,
    trade.broker_pair_id,
    trade.buy_fill_external_id,
    trade.sell_fill_external_id,
    account,
    trade.entry_at,
    trade.exit_at,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (searchableText.includes(normalizedQuery)) {
    return true;
  }

  const searchNumber = parseSearchNumber(query);
  const numericFields = [
    trade.net_pnl,
    trade.gross_pnl,
    trade.fees,
    trade.entry_price,
    trade.exit_price,
    trade.quantity,
    trade.gross_points,
  ];

  return numericFields.some((field) =>
    numberMatchesSearch(field, query, searchNumber),
  );
}

export function filterTradesBySearch<T extends SearchableTrade>(
  trades: T[],
  query: string,
): T[] {
  const normalizedQuery = query.trim();

  if (!normalizedQuery) {
    return trades;
  }

  return trades.filter((trade) => tradeMatchesSearch(trade, normalizedQuery));
}
