export const TRADINGVIEW_BROKER = "tradingview";
export const TRADINGVIEW_PAPER_ACCOUNT_EXTERNAL_ID = "tv:paper";
export const TRADINGVIEW_PAPER_ACCOUNT_NAME = "TradingView Paper";
export const TRADINGVIEW_BROKER_NAME = "TradingView";
export const LEGACY_TRADINGVIEW_PAPER_ACCOUNT_EXTERNAL_ID =
  "tradingview-paper";

export type TradingViewAccountContext = {
  accountExternalId: string;
  accountName: string;
  isPaper: boolean;
  connectedBroker: string | null;
};

function normalizeSlug(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function inferConnectedBroker(
  ...values: Array<string | null | undefined>
) {
  const haystack = values
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

  for (const value of values) {
    const slug = normalizeSlug(value);

    if (
      slug &&
      ![
        "live",
        "default",
        "paper",
        "demo",
        "simulation",
        "tradingview",
      ].includes(slug)
    ) {
      return slug;
    }
  }

  return null;
}

function connectedBrokerLabel(
  connectedBroker: string | null,
) {
  switch (connectedBroker) {
    case "tradovate":
      return "Tradovate";
    case "ninjatrader":
      return "NinjaTrader";
    case "ibkr":
      return "Interactive Brokers";
    case "tradestation":
      return "TradeStation";
    default:
      if (!connectedBroker) {
        return "Live";
      }

      return connectedBroker
        .split("-")
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
  }
}

export function resolveTradingViewAccountContext(input: {
  accountId?: string | null;
  accountName?: string | null;
  brokerName?: string | null;
  accountType?: string | null;
  isPaper?: boolean | string | null;
}): TradingViewAccountContext {
  const accountId = String(input.accountId || "").trim();
  const accountName = String(input.accountName || "").trim();
  const brokerName = String(input.brokerName || "").trim();
  const accountType = String(input.accountType || "").trim();
  const haystack = [accountName, brokerName, accountType]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const connectedBroker = inferConnectedBroker(
    accountName,
    brokerName,
    accountType,
  );

  const explicitPaper =
    input.isPaper === true ||
    input.isPaper === "true" ||
    input.isPaper === 1;

  const accountType = String(input.accountType || "").trim().toLowerCase();

  const inferredPaper =
    explicitPaper ||
    accountType === "demo" ||
    accountType === "paper" ||
    accountType === "simulation" ||
    haystack.includes("paper") ||
    haystack.includes("demo") ||
    haystack.includes("simulation") ||
    haystack.includes("simulated");

  const inferredLive =
    (accountType === "live" || haystack.includes("live")) &&
    accountType !== "demo";

  const isPaper =
    accountType === "demo" ||
    (inferredPaper && !inferredLive);

  if (isPaper) {
    const paperAccountId = accountId
      ? normalizeSlug(accountId)
      : "default";

    return {
      accountExternalId:
        paperAccountId === "default"
          ? TRADINGVIEW_PAPER_ACCOUNT_EXTERNAL_ID
          : `${TRADINGVIEW_PAPER_ACCOUNT_EXTERNAL_ID}:${paperAccountId}`,
      accountName:
        accountId && accountId !== "default"
          ? `${TRADINGVIEW_PAPER_ACCOUNT_NAME} · ${accountId}`
          : TRADINGVIEW_PAPER_ACCOUNT_NAME,
      isPaper: true,
      connectedBroker: null,
    };
  }

  const slug =
    connectedBroker ||
    normalizeSlug(brokerName) ||
    normalizeSlug(accountType) ||
    "live";
  const idPart =
    normalizeSlug(accountId) ||
    normalizeSlug(accountName) ||
    "default";

  let label = accountName;

  if (!label && accountId) {
    label = `TradingView · ${accountId}`;
  }

  if (!label && connectedBroker) {
    label = connectedBrokerLabel(connectedBroker);

    if (accountId) {
      label += ` · ${accountId}`;
    }
  }

  if (!label) {
    label = "TradingView Live";
  }

  if (!label.toLowerCase().includes("tradingview")) {
    label += " (TradingView)";
  }

  return {
    accountExternalId: `tv:${slug}:${idPart}`,
    accountName: label,
    isPaper: false,
    connectedBroker,
  };
}

export function isLegacyTradingViewPaperAccountId(
  accountExternalId: string | null | undefined,
) {
  const normalized = String(accountExternalId || "")
    .trim()
    .toLowerCase();

  return (
    normalized === LEGACY_TRADINGVIEW_PAPER_ACCOUNT_EXTERNAL_ID ||
    normalized === TRADINGVIEW_PAPER_ACCOUNT_EXTERNAL_ID ||
    normalized.startsWith(`${TRADINGVIEW_PAPER_ACCOUNT_EXTERNAL_ID}:`)
  );
}
