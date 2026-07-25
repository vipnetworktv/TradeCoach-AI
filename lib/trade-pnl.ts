export type TradePnlFields = {
  net_pnl?: number | string | null;
  gross_pnl?: number | string | null;
  status?: string | null;
  processing_error?: string | null;
};

export function toTradeNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

export function getTradeDisplayPnl(trade: TradePnlFields): number | null {
  const net = toTradeNumber(trade.net_pnl);
  const gross = toTradeNumber(trade.gross_pnl);
  const status = String(trade.status || "").toLowerCase();

  if (status === "processed" && net !== null) {
    return net;
  }

  return gross ?? net;
}

export function getTradeDisplayPnlOrZero(trade: TradePnlFields): number {
  return getTradeDisplayPnl(trade) ?? 0;
}

export function isAnalyzableTrade(trade: TradePnlFields): boolean {
  return getTradeDisplayPnl(trade) !== null;
}

export function isProcessedTrade(trade: TradePnlFields): boolean {
  const status = String(trade.status || "").toLowerCase();

  return status === "processed" && toTradeNumber(trade.net_pnl) !== null;
}

export type TradeOutcomeStats = {
  totalTrades: number;
  scoredTrades: number;
  winners: number;
  losers: number;
  breakeven: number;
  pending: number;
  totalPnl: number;
  winRate: number;
};

export function getTradeOutcomeStats(
  trades: TradePnlFields[],
): TradeOutcomeStats {
  let winners = 0;
  let losers = 0;
  let breakeven = 0;
  let pending = 0;
  let totalPnl = 0;

  for (const trade of trades) {
    const pnl = getTradeDisplayPnl(trade);

    if (pnl === null) {
      pending += 1;
      continue;
    }

    totalPnl += pnl;

    if (pnl > 0) {
      winners += 1;
    } else if (pnl < 0) {
      losers += 1;
    } else {
      breakeven += 1;
    }
  }

  const scoredTrades = winners + losers + breakeven;
  const winRate =
    scoredTrades > 0 ? (winners / scoredTrades) * 100 : 0;

  return {
    totalTrades: trades.length,
    scoredTrades,
    winners,
    losers,
    breakeven,
    pending,
    totalPnl,
    winRate,
  };
}

export function getTradePendingReason(
  trade: TradePnlFields,
): string | null {
  if (getTradeDisplayPnl(trade) !== null) {
    return null;
  }

  const processingError = String(trade.processing_error || "").trim();

  if (processingError) {
    return processingError;
  }

  const status = String(trade.status || "").trim().toLowerCase();

  if (status && status !== "processed") {
    return `Sync status: ${status.replace(/_/g, " ")}`;
  }

  return "Waiting for broker sync to finish calculating P/L.";
}
