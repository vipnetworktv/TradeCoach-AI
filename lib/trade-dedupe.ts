type TradeDedupeFields = {
  account_external_id?: string | null;
  broker_account_external_id?: string | null;
  symbol?: string | null;
  direction?: string | null;
  quantity?: number | string | null;
  entry_price?: number | string | null;
  exit_price?: number | string | null;
  entry_at?: string | null;
  exit_at?: string | null;
};

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function normalizeTimestampBucket(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value.trim().slice(0, 16);
  }

  return String(Math.floor(parsed.getTime() / 30_000));
}

export function normalizeContractSymbol(symbol: string | null | undefined) {
  const raw = String(symbol || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  if (!raw) {
    return "";
  }

  const monthCodeMatch = raw.match(/^([A-Z0-9]+?)[FGHJKMNQUVXZ]\d{1,4}$/);

  if (monthCodeMatch?.[1]) {
    return monthCodeMatch[1];
  }

  return raw;
}

export function buildTradeSemanticKey(trade: TradeDedupeFields) {
  const accountExternalId = String(
    trade.account_external_id ||
      trade.broker_account_external_id ||
      "",
  )
    .trim()
    .replace(/^tv:/, "");

  const direction = String(trade.direction || "")
    .trim()
    .toLowerCase();
  const quantity = toNumber(trade.quantity);
  const entryPrice = toNumber(trade.entry_price);
  const exitPrice = toNumber(trade.exit_price);

  return [
    accountExternalId || "unknown",
    normalizeContractSymbol(trade.symbol),
    direction,
    quantity?.toFixed(4) ?? "",
    entryPrice?.toFixed(4) ?? "",
    exitPrice?.toFixed(4) ?? "",
    normalizeTimestampBucket(trade.entry_at),
    normalizeTimestampBucket(trade.exit_at),
  ].join("|");
}

export function dedupeTradesBySemanticKey<T extends TradeDedupeFields>(
  trades: T[],
): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];

  for (const trade of trades) {
    const key = buildTradeSemanticKey(trade);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(trade);
  }

  return deduped;
}
