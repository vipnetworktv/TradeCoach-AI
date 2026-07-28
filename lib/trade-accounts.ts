import { formatBrokerRecordName } from "@/lib/brokers";
import {
  isLegacyTradingViewPaperAccountId,
  resolveTradingViewAccountContext,
  TRADINGVIEW_BROKER,
  TRADINGVIEW_BROKER_NAME,
  TRADINGVIEW_PAPER_ACCOUNT_EXTERNAL_ID,
  TRADINGVIEW_PAPER_ACCOUNT_NAME,
} from "@/lib/tradingview-accounts";

export {
  TRADINGVIEW_BROKER,
  TRADINGVIEW_BROKER_NAME,
  TRADINGVIEW_BROKER as TRADINGVIEW_PAPER_BROKER,
  TRADINGVIEW_PAPER_ACCOUNT_EXTERNAL_ID,
  TRADINGVIEW_PAPER_ACCOUNT_NAME,
  TRADINGVIEW_BROKER_NAME as TRADINGVIEW_PAPER_BROKER_NAME,
} from "@/lib/tradingview-accounts";

export const STATS_ACCOUNT_FILTER_STORAGE_KEY =
  "tradecoach-stats-account-filter";

type TradeAccountFields = {
  broker?: string | null;
  account_external_id?: string | null;
  broker_account_external_id?: string | null;
  account_name?: string | null;
  broker_account_name?: string | null;
  account_label?: string | null;
  account_id?: string | null;
  broker_account_id?: string | null;
  raw_payload?: unknown;
};

function pickString(
  trade: TradeAccountFields,
  keys: Array<keyof TradeAccountFields | string>,
): string | null {
  for (const key of keys) {
    const value = trade[key as keyof TradeAccountFields];

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

function getRawPayload(trade: TradeAccountFields) {
  if (!trade.raw_payload || typeof trade.raw_payload !== "object") {
    return null;
  }

  return trade.raw_payload as Record<string, unknown>;
}

export function isPaperTradingTrade(trade: TradeAccountFields): boolean {
  const payload = getRawPayload(trade);

  const accountExternalId = pickString(trade, [
    "account_external_id",
    "broker_account_external_id",
  ]);
  const connectedBroker = getConnectedBrokerFromTrade(trade);

  if (payload?.is_paper === true) {
    return true;
  }

  // Extension sometimes marks paper fills as live; only trust is_paper:false
  // when a prop broker is actually connected.
  if (payload?.is_paper === false && connectedBroker) {
    return false;
  }

  if (isLegacyTradingViewPaperAccountId(accountExternalId)) {
    return true;
  }

  if (accountExternalId?.startsWith("tv:paper")) {
    return true;
  }

  const broker = String(trade.broker || "")
    .trim()
    .toLowerCase();

  if (
    broker === TRADINGVIEW_BROKER ||
    accountExternalId?.startsWith("tv:")
  ) {
    if (connectedBroker) {
      return false;
    }

    if (isGenericTradingViewAccountId(accountExternalId)) {
      return true;
    }

    if (accountExternalId?.match(/^tv:(?:live|market)(?::|$)/i)) {
      return true;
    }
  }

  const explicitName = pickString(trade, [
    "account_name",
    "broker_account_name",
    "account_label",
  ]);

  const payloadName =
    typeof payload?.account_name === "string"
      ? payload.account_name
      : typeof payload?.account_label === "string"
        ? payload.account_label
        : null;

  const accountName = explicitName || payloadName;

  if (accountName?.toLowerCase().includes("paper")) {
    return true;
  }

  const importBroker = String(payload?.import_broker || "")
    .trim()
    .toLowerCase();

  if (
    (broker === TRADINGVIEW_BROKER ||
      importBroker === TRADINGVIEW_BROKER) &&
    !accountExternalId &&
    !accountName
  ) {
    return true;
  }

  return false;
}

export function isTradingViewPaperFeedTrade(
  trade: TradeAccountFields,
): boolean {
  if (!isPaperTradingTrade(trade)) {
    return false;
  }

  const broker = String(trade.broker || "")
    .trim()
    .toLowerCase();
  const accountExternalId = pickString(trade, [
    "account_external_id",
    "broker_account_external_id",
  ]);
  const payload = getRawPayload(trade);
  const importBroker = String(payload?.import_broker || "")
    .trim()
    .toLowerCase();

  if (broker === TRADINGVIEW_BROKER || importBroker === TRADINGVIEW_BROKER) {
    return true;
  }

  if (accountExternalId?.startsWith("tv:")) {
    return true;
  }

  if (isLegacyTradingViewPaperAccountId(accountExternalId)) {
    return true;
  }

  return false;
}

export function formatConnectedBrokerName(
  connectedBroker: string | null | undefined,
) {
  switch (String(connectedBroker || "").trim().toLowerCase()) {
    case "tradovate":
      return "Tradovate";
    case "ninjatrader":
      return "NinjaTrader";
    case "ibkr":
      return "Interactive Brokers";
    case "tradestation":
      return "TradeStation";
    default: {
      const slug = String(connectedBroker || "")
        .trim()
        .toLowerCase();

      if (!slug) {
        return "Live";
      }

      return slug
        .split("-")
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
    }
  }
}

function isGenericTradingViewAccountId(
  accountExternalId: string | null,
) {
  if (!accountExternalId) {
    return true;
  }

  return (
    accountExternalId === "tv:live:default" ||
    accountExternalId === "tv:market:default" ||
    accountExternalId.endsWith(":default")
  );
}

function getConnectedBrokerFromTrade(
  trade: TradeAccountFields,
) {
  const payload = getRawPayload(trade);
  const connectedBroker = payload?.connected_broker;

  if (
    typeof connectedBroker === "string" &&
    connectedBroker.trim()
  ) {
    return connectedBroker.trim().toLowerCase();
  }

  const haystack = [
    pickString(trade, [
      "account_name",
      "broker_account_name",
      "account_label",
    ]),
    typeof payload?.account_name === "string"
      ? payload.account_name
      : null,
    typeof payload?.account_label === "string"
      ? payload.account_label
      : null,
    trade.broker,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (haystack.includes("tradovate")) {
    return "tradovate";
  }

  if (haystack.includes("ninja")) {
    return "ninjatrader";
  }

  if (
    haystack.includes("interactive") ||
    haystack.includes("ibkr") ||
    haystack.includes("ib gateway")
  ) {
    return "ibkr";
  }

  if (haystack.includes("tradestation")) {
    return "tradestation";
  }

  return null;
}

export function isTradingViewPropFeedTrade(
  trade: TradeAccountFields,
): boolean {
  if (isPaperTradingTrade(trade)) {
    return false;
  }

  const connectedBroker = getConnectedBrokerFromTrade(trade);

  if (!connectedBroker) {
    return false;
  }

  const broker = String(trade.broker || "")
    .trim()
    .toLowerCase();
  const accountExternalId = pickString(trade, [
    "account_external_id",
    "broker_account_external_id",
  ]);
  const payload = getRawPayload(trade);
  const importSource = String(payload?.import_source || "")
    .trim()
    .toLowerCase();

  if (
    broker === TRADINGVIEW_BROKER ||
    accountExternalId?.startsWith("tv:")
  ) {
    return true;
  }

  return importSource === "extension";
}

export function isTradeCoachTradingViewFeedTrade(
  trade: TradeAccountFields,
): boolean {
  return (
    isTradingViewPaperFeedTrade(trade) ||
    isTradingViewPropFeedTrade(trade)
  );
}

export function getTradeAccountKey(trade: TradeAccountFields): string {
  const broker = String(trade.broker || "")
    .trim()
    .toLowerCase();
  const accountExternalId = pickString(trade, [
    "account_external_id",
    "broker_account_external_id",
    "account_id",
    "broker_account_id",
  ]);

  if (
    broker === TRADINGVIEW_BROKER ||
    accountExternalId?.startsWith("tv:")
  ) {
    return TRADINGVIEW_PAPER_ACCOUNT_EXTERNAL_ID;
  }

  if (accountExternalId) {
    if (
      isLegacyTradingViewPaperAccountId(accountExternalId)
    ) {
      return TRADINGVIEW_PAPER_ACCOUNT_EXTERNAL_ID;
    }

    return accountExternalId;
  }

  if (isPaperTradingTrade(trade)) {
    return TRADINGVIEW_PAPER_ACCOUNT_EXTERNAL_ID;
  }

  return `broker:${broker || "unknown"}`;
}

export function getTradeAccountLabelFromKey(
  accountKey: string,
) {
  if (
    accountKey.startsWith("tv:prop:") ||
    accountKey.startsWith("tv:")
  ) {
    return TRADINGVIEW_BROKER_NAME;
  }

  if (
    accountKey.startsWith(
      `${TRADINGVIEW_PAPER_ACCOUNT_EXTERNAL_ID}:`,
    ) ||
    accountKey === TRADINGVIEW_PAPER_ACCOUNT_EXTERNAL_ID ||
    isLegacyTradingViewPaperAccountId(accountKey)
  ) {
    return TRADINGVIEW_BROKER_NAME;
  }

  return accountKey;
}

export function getTradeAccountFeedName(
  trade: TradeAccountFields,
) {
  if (isTradeCoachTradingViewFeedTrade(trade)) {
    return TRADINGVIEW_BROKER_NAME;
  }

  return formatBrokerRecordName(trade.broker) || "Unknown";
}

export function getTradeAccountLabel(trade: TradeAccountFields): string {
  if (isTradeCoachTradingViewFeedTrade(trade)) {
    return TRADINGVIEW_BROKER_NAME;
  }

  const key = getTradeAccountKey(trade);
  const labelFromKey = getTradeAccountLabelFromKey(key);

  if (labelFromKey !== key) {
    return labelFromKey;
  }

  const explicitName = pickString(trade, [
    "account_name",
    "broker_account_name",
    "account_label",
  ]);

  if (explicitName) {
    if (
      isPaperTradingTrade(trade) &&
      explicitName.toLowerCase().includes("tradingview")
    ) {
      return TRADINGVIEW_BROKER_NAME;
    }

    return explicitName;
  }

  const payload = getRawPayload(trade);
  const payloadLabel = payload?.account_name ?? payload?.account_label;

  if (
    typeof payloadLabel === "string" &&
    payloadLabel.trim()
  ) {
    return payloadLabel.trim();
  }

  return formatBrokerRecordName(trade.broker) || "Unknown Account";
}

export type TradeAccountOption = {
  key: string;
  label: string;
  isPaper: boolean;
  isProp: boolean;
};

export function buildTradeAccountOptions(
  trades: TradeAccountFields[],
): TradeAccountOption[] {
  const accountMap = new Map<string, TradeAccountOption>();

  for (const trade of trades) {
    const key = getTradeAccountKey(trade);

    if (accountMap.has(key)) {
      continue;
    }

    accountMap.set(key, {
      key,
      label: getTradeAccountLabel(trade),
      isPaper: isPaperTradingTrade(trade),
      isProp: isTradingViewPropFeedTrade(trade),
    });
  }

  return Array.from(accountMap.values()).sort((first, second) => {
    if (first.isPaper !== second.isPaper) {
      return first.isPaper ? -1 : 1;
    }

    if (first.isProp !== second.isProp) {
      return first.isProp ? -1 : 1;
    }

    return first.label.localeCompare(second.label);
  });
}

export function applyPaperTradingAccountDefaults<
  T extends {
    broker: string;
    account_external_id: string | null;
    account_name: string | null;
  },
>(trade: T): T {
  if (trade.broker !== TRADINGVIEW_BROKER) {
    return trade;
  }

  if (trade.account_external_id || trade.account_name) {
    return trade;
  }

  const resolved = resolveTradingViewAccountContext({});

  return {
    ...trade,
    account_external_id: resolved.accountExternalId,
    account_name: resolved.accountName,
  };
}
