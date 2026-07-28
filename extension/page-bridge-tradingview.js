(() => {
  if (window.__TRADECOACH_TV_BRIDGE_V1__) {
    return;
  }

  window.__TRADECOACH_TV_BRIDGE_V1__ = true;

  const emittedTradeKeys = new Set();
  const emittedSemanticKeys = new Set();
  const seenFillKeys = new Set();
  const openLotsBySymbol = new Map();
  const accountContextById = new Map();
  let defaultAccountContext = null;

  window.__TRADECOACH_TV_STATS__ = {
    wsMessages: 0,
    payloadsScanned: 0,
    fillsSeen: 0,
    tradesEmitted: 0,
    brokersHooked: 0,
  };

  const FUTURES_POINT_VALUES = {
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

  function safeString(value) {
    if (value === null || value === undefined) {
      return null;
    }

    const cleaned = String(value).trim();
    return cleaned || null;
  }

  function safeNumber(value) {
    if (value === null || value === undefined || value === "") {
      return null;
    }

    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function pickObjectValue(object, keys) {
    if (!object || typeof object !== "object") {
      return null;
    }

    for (const key of keys) {
      if (object[key] !== null && object[key] !== undefined) {
        const value = object[key];

        if (typeof value === "string" && !value.trim()) {
          continue;
        }

        return value;
      }
    }

    return null;
  }

  function normalizeSymbol(value) {
    const raw = safeString(value);

    if (!raw) {
      return null;
    }

    const withoutPrefix = raw.includes(":")
      ? raw.split(":").pop()
      : raw;

    return withoutPrefix.replace(/[^A-Za-z0-9]/g, "").toUpperCase() || null;
  }

  function normalizeSide(value) {
    const numericSide = safeNumber(value);

    if (numericSide === 1) {
      return "long";
    }

    if (numericSide === -1) {
      return "short";
    }

    const normalized = safeString(value)?.toLowerCase();

    if (!normalized) {
      return null;
    }

    if (
      normalized === "buy" ||
      normalized === "long" ||
      normalized === "b" ||
      normalized === "l" ||
      normalized === "1"
    ) {
      return "long";
    }

    if (
      normalized === "sell" ||
      normalized === "short" ||
      normalized === "s" ||
      normalized === "sh" ||
      normalized === "-1"
    ) {
      return "short";
    }

    return null;
  }

  function isSkippedStatus(value) {
    const numericStatus = safeNumber(value);

    if (
      numericStatus === 1 ||
      numericStatus === 3 ||
      numericStatus === 4 ||
      numericStatus === 5 ||
      numericStatus === 6
    ) {
      return true;
    }

    const normalized = safeString(value)?.toLowerCase();

    if (!normalized) {
      return false;
    }

    return (
      normalized.includes("reject") ||
      normalized.includes("cancel") ||
      normalized.includes("inactive") ||
      normalized.includes("working") ||
      normalized.includes("pending") ||
      normalized.includes("open") ||
      normalized.includes("placing")
    );
  }

  function isFilledStatus(value) {
    const numericStatus = safeNumber(value);

    if (numericStatus === 2) {
      return true;
    }

    const normalized = safeString(value)?.toLowerCase();

    if (!normalized) {
      return true;
    }

    if (isSkippedStatus(normalized)) {
      return false;
    }

    return (
      normalized.includes("fill") ||
      normalized.includes("complete") ||
      normalized.includes("closed") ||
      normalized.includes("executed") ||
      normalized === "2"
    );
  }

  function parseTimestamp(value) {
    const numeric = safeNumber(value);

    if (numeric !== null && numeric > 1_000_000_000_000) {
      return new Date(numeric).toISOString();
    }

    if (numeric !== null && numeric > 1_000_000_000) {
      return new Date(numeric * 1000).toISOString();
    }

    const raw = safeString(value);

    if (!raw) {
      return new Date().toISOString();
    }

    const parsed = new Date(raw);

    if (Number.isNaN(parsed.getTime())) {
      return new Date().toISOString();
    }

    return parsed.toISOString();
  }

  function getFuturesPointValue(symbol) {
    const normalized = safeString(symbol)?.toUpperCase();

    if (!normalized) {
      return 1;
    }

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

  function normalizeSlug(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function inferConnectedBroker(...values) {
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
      haystack.includes("ibkr")
    ) {
      return "ibkr";
    }

    if (haystack.includes("tradestation")) {
      return "tradestation";
    }

    if (haystack.includes("alpaca")) {
      return "alpaca";
    }

    if (haystack.includes("coinbase")) {
      return "coinbase";
    }

    if (haystack.includes("webull")) {
      return "webull";
    }

    if (haystack.includes("robinhood")) {
      return "robinhood";
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

  function connectedBrokerLabel(connectedBroker) {
    switch (connectedBroker) {
      case "tradovate":
        return "Tradovate";
      case "ninjatrader":
        return "NinjaTrader";
      case "ibkr":
        return "Interactive Brokers";
      case "tradestation":
        return "TradeStation";
      case "alpaca":
        return "Alpaca";
      case "coinbase":
        return "Coinbase";
      case "webull":
        return "Webull";
      case "robinhood":
        return "Robinhood";
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

  function resolveAccountContext(object) {
    const accountId = safeString(
      pickObjectValue(object, [
        "accountId",
        "account_id",
        "accountExternalId",
        "account_external_id",
        "tradingAccountId",
        "trading_account_id",
      ]),
    );

    const accountName = safeString(
      pickObjectValue(object, [
        "accountName",
        "account_name",
        "accountLabel",
        "account_label",
        "accountTitle",
        "account_title",
      ]),
    );

    const brokerName = safeString(
      pickObjectValue(object, [
        "broker",
        "brokerName",
        "broker_name",
        "provider",
        "source",
        "brokerage",
        "brokerId",
        "broker_id",
      ]),
    );

    const accountType = safeString(
      pickObjectValue(object, [
        "accountType",
        "account_type",
        "environment",
      ]),
    );

    const accountTypeNormalized = accountType?.toLowerCase() || "";

    const isPaperRaw = pickObjectValue(object, [
      "isPaper",
      "is_paper",
      "paper",
      "simulation",
      "demo",
    ]);

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
      isPaperRaw === true ||
      isPaperRaw === "true" ||
      isPaperRaw === 1;

    const inferredPaper =
      explicitPaper ||
      accountTypeNormalized === "demo" ||
      accountTypeNormalized === "paper" ||
      accountTypeNormalized === "simulation" ||
      haystack.includes("paper") ||
      haystack.includes("demo") ||
      haystack.includes("simulation") ||
      haystack.includes("simulated");

    const inferredLive =
      (accountTypeNormalized === "live" || haystack.includes("live")) &&
      accountTypeNormalized !== "demo";

    const isPaper =
      accountTypeNormalized === "demo" ||
      (inferredPaper && !inferredLive);

    if (isPaper) {
      const paperAccountId = accountId
        ? normalizeSlug(accountId)
        : "default";

      return {
        accountExternalId:
          paperAccountId === "default"
            ? "tv:paper"
            : `tv:paper:${paperAccountId}`,
        accountName:
          accountId && accountId !== "default"
            ? `TradingView Paper · ${accountId}`
            : "TradingView Paper",
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

  function isPaperAccountType(accountType) {
    if (accountType === null || accountType === undefined || accountType === "") {
      return false;
    }

    if (typeof accountType === "number") {
      return accountType === 0;
    }

    const normalized = safeString(accountType)?.toLowerCase() || "";

    return (
      normalized === "demo" ||
      normalized === "paper" ||
      normalized === "simulation" ||
      normalized === "simulated" ||
      normalized === "0"
    );
  }

  function isPaperAccountMeta(account) {
    const accountType = account?.type;
    const accountName = safeString(account?.name)?.toLowerCase() || "";

    if (isPaperAccountType(accountType)) {
      return true;
    }

    return (
      accountName.includes("paper") ||
      accountName.includes("demo") ||
      accountName.includes("simulation") ||
      accountName.includes("simulated")
    );
  }

  function buildAccountContextFromMeta(account) {
    const accountId = safeString(account?.id);

    if (!accountId) {
      return null;
    }

    const accountName = safeString(account?.name);
    const isPaper = isPaperAccountMeta(account);

    if (isPaper) {
      return {
        accountExternalId: `tv:paper:${normalizeSlug(accountId)}`,
        accountName: accountName
          ? `TradingView Paper · ${accountName}`
          : `TradingView Paper · ${accountId}`,
        isPaper: true,
        connectedBroker: null,
      };
    }

    return {
      accountExternalId: `tv:live:${normalizeSlug(accountId)}`,
      accountName: accountName
        ? `${accountName} (TradingView)`
        : `TradingView · ${accountId}`,
      isPaper: false,
      connectedBroker: inferConnectedBroker(accountName),
    };
  }

  function shouldReplaceAccountContext(existing, next) {
    if (!existing) {
      return true;
    }

    if (existing.isPaper && !next.isPaper) {
      return false;
    }

    if (!isGenericAccountContext(existing) && isGenericAccountContext(next)) {
      return false;
    }

    return true;
  }

  function rememberAccountContext(object) {
    const accountId = safeString(
      pickObjectValue(object, [
        "id",
        "accountId",
        "account_id",
      ]),
    );

    if (!accountId) {
      return null;
    }

    const existing = accountContextById.get(accountId);
    const context = resolveAccountContext(object);

    if (!shouldReplaceAccountContext(existing, context)) {
      return existing;
    }

    accountContextById.set(accountId, context);

    if (!isGenericAccountContext(context)) {
      defaultAccountContext = context;
    } else if (!defaultAccountContext) {
      defaultAccountContext = context;
    }

    return context;
  }

  function looksLikeAccountSummary(object) {
    if (!object || typeof object !== "object" || Array.isArray(object)) {
      return false;
    }

    const hasAccountIdentity = Boolean(
      pickObjectValue(object, [
        "accountId",
        "account_id",
        "accountName",
        "account_name",
      ]),
    );

    const hasBalanceFields = [
      "balance",
      "equity",
      "buyingPower",
      "buying_power",
      "availableFunds",
      "available_funds",
    ].some((key) => object[key] !== undefined && object[key] !== null);

    return hasAccountIdentity && hasBalanceFields;
  }

  function isGenericAccountContext(context) {
    if (!context) {
      return true;
    }

    const accountExternalId = String(
      context.accountExternalId || "",
    );

    return (
      accountExternalId === "tv:live:default" ||
      accountExternalId === "tv:paper" ||
      accountExternalId.endsWith(":default") ||
      context.accountName === "TradingView Live" ||
      context.accountName === "TradingView Paper"
    );
  }

  function normalizeAccountExternalId(accountExternalId) {
    if (
      isGenericAccountContext({
        accountExternalId,
        accountName: null,
      }) &&
      defaultAccountContext
    ) {
      return defaultAccountContext.accountExternalId;
    }

    return accountExternalId || "tv:unknown";
  }

  function resolveContextForObject(object) {
    const linkedAccountId = safeString(
      pickObjectValue(object, [
        "accountId",
        "account_id",
        "tradingAccountId",
        "trading_account_id",
      ]),
    );

    if (
      linkedAccountId &&
      accountContextById.has(linkedAccountId)
    ) {
      return accountContextById.get(linkedAccountId);
    }

    const inlineContext = resolveAccountContext(object);

    if (!isGenericAccountContext(inlineContext)) {
      return inlineContext;
    }

    return defaultAccountContext || inlineContext;
  }

  function enrichTradeAccount(trade) {
    if (!defaultAccountContext || !isGenericAccountContext(trade)) {
      return trade;
    }

    const pairId = buildPairId(
      defaultAccountContext.accountExternalId,
      trade.buyFillId,
      trade.sellFillId,
      trade.quantity,
    );

    return {
      ...trade,
      id: pairId,
      brokerPairId: pairId,
      accountExternalId: defaultAccountContext.accountExternalId,
      accountName: defaultAccountContext.accountName,
      isPaper: defaultAccountContext.isPaper,
      connectedBroker: defaultAccountContext.connectedBroker,
    };
  }

  function buildSemanticTradeKey(trade) {
    const entryMs = new Date(trade.entryAt).getTime();
    const exitMs = new Date(trade.exitAt).getTime();

    return [
      trade.symbol,
      trade.direction,
      trade.quantity,
      trade.entryPrice.toFixed(2),
      trade.exitPrice.toFixed(2),
      Number.isFinite(entryMs)
        ? Math.floor(entryMs / 30000)
        : trade.entryAt.slice(0, 16),
      Number.isFinite(exitMs)
        ? Math.floor(exitMs / 30000)
        : trade.exitAt.slice(0, 16),
    ].join("|");
  }

  function buildTradeFingerprint(trade) {
    return String(trade.brokerPairId || trade.id || [
      trade.symbol,
      trade.entryAt.slice(0, 16),
      trade.exitAt.slice(0, 16),
      trade.quantity,
      trade.entryPrice.toFixed(4),
      trade.exitPrice.toFixed(4),
    ].join("|"));
  }

  function normalizeTradeTimes(entryAt, exitAt) {
    const entryMs = new Date(entryAt).getTime();
    const exitMs = new Date(exitAt).getTime();

    if (!Number.isFinite(entryMs) || !Number.isFinite(exitMs)) {
      return { entryAt, exitAt };
    }

    if (entryMs <= exitMs) {
      return { entryAt, exitAt };
    }

    return {
      entryAt: exitAt,
      exitAt: entryAt,
    };
  }

  function buildPairId(accountExternalId, buyFillId, sellFillId, quantity) {
    const accountKey = String(accountExternalId || "unknown").replace(
      /^tv:/,
      "",
    );

    return `tv:${accountKey}:${buyFillId}:${sellFillId}:${quantity}`;
  }

  function postCompletedTrade(trade) {
    const enrichedTrade = enrichTradeAccount(trade);
    const tradeKey = buildTradeFingerprint(enrichedTrade);
    const semanticKey = buildSemanticTradeKey(enrichedTrade);

    if (
      emittedTradeKeys.has(tradeKey) ||
      emittedSemanticKeys.has(semanticKey)
    ) {
      return false;
    }

    emittedTradeKeys.add(tradeKey);
    emittedSemanticKeys.add(semanticKey);
    window.__TRADECOACH_TV_STATS__.tradesEmitted += 1;

    const message = {
      source: "tradecoach-page-bridge",
      type: "TRADECOACH_BROKER_EVENT",
      payload: {
        kind: "completed_trade",
        data: enrichedTrade,
        detectedAt: new Date().toISOString(),
      },
    };

    window.postMessage(message, window.location.origin);

    try {
      document.dispatchEvent(
        new CustomEvent("tradecoach-broker-event", {
          detail: message.payload,
        }),
      );
    } catch {
      // Ignore custom event dispatch errors.
    }

    try {
      if (window.top && window.top !== window) {
        window.top.postMessage(message, window.location.origin);
      }
    } catch {
      // Ignore cross-origin top window access errors.
    }

    console.info(
      "[TradeCoach] TradingView completed trade detected.",
      enrichedTrade,
    );
    return true;
  }

  function buildCompletedTrade({
    symbol,
    direction,
    quantity,
    entryPrice,
    exitPrice,
    entryAt,
    exitAt,
    buyFillId,
    sellFillId,
    accountContext,
  }) {
    const grossPoints =
      direction === "long"
        ? exitPrice - entryPrice
        : entryPrice - exitPrice;
    const pointValue = getFuturesPointValue(symbol);
    const netPnl = grossPoints * pointValue * quantity;
    const account = accountContext || resolveAccountContext({});
    const normalizedTimes = normalizeTradeTimes(entryAt, exitAt);
    const pairId = buildPairId(
      account.accountExternalId,
      buyFillId,
      sellFillId,
      quantity,
    );

    return {
      id: pairId,
      brokerPairId: pairId,
      symbol,
      direction,
      quantity,
      entryPrice,
      exitPrice,
      entryAt: normalizedTimes.entryAt,
      exitAt: normalizedTimes.exitAt,
      grossPoints,
      pointValue,
      netPnl,
      fees: 0,
      accountExternalId: account.accountExternalId,
      accountName: account.accountName,
      isPaper: account.isPaper,
      connectedBroker: account.connectedBroker,
      buyFillId,
      sellFillId,
    };
  }

  function getOpenLotsKey(symbol, accountContext) {
    const accountExternalId = normalizeAccountExternalId(
      accountContext?.accountExternalId,
    );

    return `${accountExternalId}::${symbol}`;
  }

  function rememberFill(fill) {
    const fillKey = `${fill.accountExternalId}:${fill.symbol}:${fill.side}:${fill.orderId}:${fill.time}:${fill.qty}:${fill.price}`;

    if (seenFillKeys.has(fillKey)) {
      return;
    }

    seenFillKeys.add(fillKey);
    window.__TRADECOACH_TV_STATS__.fillsSeen += 1;

    const symbolKey = getOpenLotsKey(
      fill.symbol,
      fill.accountContext,
    );
    const openLots = openLotsBySymbol.get(symbolKey) ?? [];

    let remaining = fill.qty;
    const closingSide = fill.side === "long" ? "short" : "long";

    while (
      remaining > 0 &&
      openLots.length > 0 &&
      openLots[0].side === closingSide
    ) {
      const lot = openLots[0];
      const matchedQty = Math.min(remaining, lot.qty);
      const direction = lot.side;
      const entryPrice = lot.price;
      const exitPrice = fill.price;
      const entryAt = lot.time;
      const exitAt = fill.time;
      const buyFillId =
        direction === "long" ? lot.orderId : fill.orderId;
      const sellFillId =
        direction === "long" ? fill.orderId : lot.orderId;

      postCompletedTrade(
        buildCompletedTrade({
          symbol: fill.symbol,
          direction,
          quantity: matchedQty,
          entryPrice,
          exitPrice,
          entryAt,
          exitAt,
          buyFillId,
          sellFillId,
          accountContext: fill.accountContext,
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
        side: fill.side,
        qty: remaining,
        price: fill.price,
        time: fill.time,
        orderId: fill.orderId,
        accountContext: fill.accountContext,
      });
    }

    openLotsBySymbol.set(symbolKey, openLots);
  }

  function extractTradingViewOrderFill(object) {
    if (!object || typeof object !== "object" || Array.isArray(object)) {
      return null;
    }

    const symbol = normalizeSymbol(object.symbol);
    const side = normalizeSide(object.side);
    const orderId = safeString(object.id ?? object.orderId);
    const qty = safeNumber(object.filledQty ?? object.qty);
    const price = safeNumber(
      object.avgPrice ?? object.price ?? object.fillPrice,
    );
    const status = object.status;

    if (!symbol || !side || !orderId || !qty || qty <= 0 || price === null) {
      return null;
    }

    if (isSkippedStatus(status) || !isFilledStatus(status)) {
      return null;
    }

    const accountContext = resolveContextForObject(object);

    return {
      symbol,
      side,
      qty,
      price,
      orderId,
      time: parseTimestamp(
        object.updateTime ?? object.time ?? object.filledAt,
      ),
      accountExternalId: accountContext.accountExternalId,
      accountContext,
    };
  }

  function extractFillCandidate(object) {
    if (!object || typeof object !== "object" || Array.isArray(object)) {
      return null;
    }

    const symbol = normalizeSymbol(
      pickObjectValue(object, [
        "symbol",
        "ticker",
        "instrument",
        "contract",
        "fullSymbol",
        "product",
        "name",
      ]),
    );

    const side = normalizeSide(
      pickObjectValue(object, [
        "side",
        "action",
        "direction",
        "buySell",
        "tradeSide",
        "bs",
        "b/s",
      ]),
    );

    const qty = safeNumber(
      pickObjectValue(object, [
        "qty",
        "quantity",
        "filledQty",
        "filled_qty",
        "filledQuantity",
        "filled_quantity",
        "size",
        "amount",
        "filled",
      ]),
    );

    const price = safeNumber(
      pickObjectValue(object, [
        "fillPrice",
        "fill_price",
        "Fill Price",
        "filledPrice",
        "avgFillPrice",
        "avg_fill_price",
        "averageFillPrice",
        "avgPrice",
        "avg_price",
        "price",
        "executionPrice",
      ]),
    );

    const status = pickObjectValue(object, [
      "status",
      "state",
      "orderStatus",
      "executionStatus",
    ]);

    let orderId = safeString(
      pickObjectValue(object, [
        "id",
        "orderId",
        "order_id",
        "orderID",
        "fillId",
        "fill_id",
        "executionId",
        "execution_id",
        "levelId",
        "level_id",
      ]),
    );

    const time = parseTimestamp(
      pickObjectValue(object, [
        "closingTime",
        "Closing Time",
        "closeTime",
        "filledAt",
        "filled_at",
        "executionTime",
        "placingTime",
        "Placing Time",
        "updatedAt",
        "updateTime",
        "timestamp",
        "time",
        "date",
        "Fill Time",
      ]),
    );

    if (!symbol || !side || !qty || qty <= 0 || price === null) {
      return null;
    }

    if (!orderId) {
      orderId = `tv-fill:${symbol}:${time}:${qty}:${price.toFixed(4)}`;
    }

    if (!isFilledStatus(status)) {
      return null;
    }

    const accountContext = resolveContextForObject(object);

    return {
      symbol,
      side,
      qty,
      price,
      orderId,
      time,
      accountExternalId: accountContext.accountExternalId,
      accountContext,
    };
  }

  function extractCompletedTradeCandidate(object) {
    if (!object || typeof object !== "object" || Array.isArray(object)) {
      return null;
    }

    const symbol = normalizeSymbol(
      pickObjectValue(object, [
        "symbol",
        "ticker",
        "instrument",
        "contract",
        "fullSymbol",
        "product",
        "name",
      ]),
    );

    const direction = normalizeSide(
      pickObjectValue(object, [
        "side",
        "direction",
        "positionSide",
        "action",
        "type",
      ]),
    );

    const quantity = safeNumber(
      pickObjectValue(object, [
        "qty",
        "quantity",
        "size",
        "filledQty",
        "filledQuantity",
      ]),
    );

    const entryPrice = safeNumber(
      pickObjectValue(object, [
        "entryPrice",
        "entry_price",
        "Entry Price",
        "openPrice",
        "avgEntryPrice",
        "avgBuy",
        "Avg Entry",
        "avg buy",
        "Avg Buy",
      ]),
    );

    const exitPrice = safeNumber(
      pickObjectValue(object, [
        "exitPrice",
        "exit_price",
        "Exit Price",
        "closePrice",
        "avgExitPrice",
        "avgSell",
        "Avg Exit",
        "avg sell",
        "Avg Sell",
        "fillPrice",
        "fill_price",
        "Fill Price",
      ]),
    );

    const entryAt = parseTimestamp(
      pickObjectValue(object, [
        "entryAt",
        "entry_at",
        "Entry Time",
        "openTime",
        "openedAt",
        "Placing Time",
        "placingTime",
      ]),
    );

    const exitAt = parseTimestamp(
      pickObjectValue(object, [
        "exitAt",
        "exit_at",
        "Exit Time",
        "closeTime",
        "closedAt",
        "closingTime",
        "Closing Time",
        "Closing time",
        "time",
      ]),
    );

    const netPnl = safeNumber(
      pickObjectValue(object, [
        "netPnl",
        "net_pnl",
        "profit",
        "pl",
        "pnl",
        "realizedPnl",
        "realized_pnl",
      ]),
    );

    const tradeId = safeString(
      pickObjectValue(object, [
        "id",
        "tradeId",
        "trade_id",
        "positionId",
      ]),
    );

    if (
      !symbol ||
      !direction ||
      !quantity ||
      quantity <= 0 ||
      entryPrice === null ||
      exitPrice === null
    ) {
      return null;
    }

    const grossPoints =
      direction === "long"
        ? exitPrice - entryPrice
        : entryPrice - exitPrice;
    const pointValue = getFuturesPointValue(symbol);
    const accountContext = resolveContextForObject(object);
    const normalizedTimes = normalizeTradeTimes(entryAt, exitAt);
    const pairId =
      tradeId ||
      buildPairId(
        accountContext.accountExternalId,
        `history-entry:${symbol}:${normalizedTimes.entryAt.slice(0, 16)}`,
        `history-exit:${symbol}:${normalizedTimes.exitAt.slice(0, 16)}`,
        quantity,
      );

    return {
      id: pairId,
      brokerPairId: pairId,
      symbol,
      direction,
      quantity,
      entryPrice,
      exitPrice,
      entryAt: normalizedTimes.entryAt,
      exitAt: normalizedTimes.exitAt,
      grossPoints,
      pointValue,
      netPnl: netPnl ?? grossPoints * pointValue * quantity,
      fees: 0,
      accountExternalId: accountContext.accountExternalId,
      accountName: accountContext.accountName,
      isPaper: accountContext.isPaper,
      connectedBroker: accountContext.connectedBroker,
      buyFillId: tradeId ? `${tradeId}-entry` : `tv-buy:${pairId}`,
      sellFillId: tradeId ? `${tradeId}-exit` : `tv-sell:${pairId}`,
    };
  }

  function walkJson(value, visitor, depth = 0) {
    if (depth > 12 || value === null || value === undefined) {
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        walkJson(item, visitor, depth + 1);
      }

      return;
    }

    if (typeof value !== "object") {
      return;
    }

    visitor(value);

    for (const nestedValue of Object.values(value)) {
      walkJson(nestedValue, visitor, depth + 1);
    }
  }

  function extractPayloadsFromSocketData(raw) {
    if (raw === null || raw === undefined) {
      return [];
    }

    let text = raw;

    if (typeof ArrayBuffer !== "undefined" && text instanceof ArrayBuffer) {
      text = new TextDecoder().decode(text);
    } else if (typeof Blob !== "undefined" && text instanceof Blob) {
      return null;
    } else if (typeof text !== "string") {
      return [text];
    }

    const trimmed = text.trim();

    if (!trimmed.includes("~m~")) {
      return [trimmed];
    }

    const payloads = [];
    const parts = trimmed.split("~m~");

    for (let index = 1; index < parts.length; index += 2) {
      const chunk = parts[index + 1]?.trim();

      if (
        chunk &&
        (chunk.startsWith("{") ||
          chunk.startsWith("[") ||
          chunk.startsWith('"'))
      ) {
        payloads.push(chunk);
      }
    }

    return payloads.length > 0 ? payloads : [trimmed];
  }

  function processPayload(payload, sourceUrl) {
    if (payload === null || payload === undefined) {
      return;
    }

    window.__TRADECOACH_TV_STATS__.payloadsScanned += 1;

    let parsed = payload;

    if (typeof payload === "string") {
      const trimmed = payload.trim();

      if (
        !trimmed.startsWith("{") &&
        !trimmed.startsWith("[")
      ) {
        return;
      }

      try {
        parsed = JSON.parse(trimmed);
      } catch {
        return;
      }
    }

    walkJson(parsed, (object) => {
      if (looksLikeAccountSummary(object)) {
        rememberAccountContext(object);
      }

      const completedTrade =
        extractCompletedTradeCandidate(object);

      if (completedTrade) {
        postCompletedTrade(completedTrade);
        return;
      }

      const tradingViewOrderFill =
        extractTradingViewOrderFill(object);

      if (tradingViewOrderFill) {
        rememberFill(tradingViewOrderFill);
        return;
      }

      const fill = extractFillCandidate(object);

      if (fill) {
        rememberFill(fill);
      }
    });

    if (sourceUrl) {
      console.debug(
        "[TradeCoach] Scanned TradingView response.",
        sourceUrl,
      );
    }
  }

  async function inspectFetchResponse(response, requestUrl) {
    try {
      const contentType =
        response.headers.get("content-type") || "";

      if (
        !contentType.includes("json") &&
        !contentType.includes("text")
      ) {
        return;
      }

      const clone = response.clone();
      const text = await clone.text();
      processPayload(text, requestUrl);
    } catch (error) {
      console.debug(
        "[TradeCoach] Could not inspect TradingView fetch response.",
        error,
      );
    }
  }

  async function handleSocketMessage(raw, sourceUrl) {
    let data = raw;

    if (typeof Blob !== "undefined" && data instanceof Blob) {
      try {
        data = await data.text();
      } catch {
        return;
      }
    }

    for (const chunk of extractPayloadsFromSocketData(data)) {
      if (chunk === null || chunk === undefined) {
        continue;
      }

      processPayload(chunk, sourceUrl);
    }
  }

  const nativeFetch = window.fetch.bind(window);

  const NativeWebSocket = window.WebSocket;

  if (NativeWebSocket) {
    const PatchedWebSocket = new Proxy(NativeWebSocket, {
      construct(Target, args) {
        const socket = Reflect.construct(Target, args);

        socket.addEventListener("message", (event) => {
          window.__TRADECOACH_TV_STATS__.wsMessages += 1;

          void handleSocketMessage(
            event.data,
            socket.url || String(args[0] || ""),
          );
        });

        return socket;
      },
    });

    window.WebSocket = PatchedWebSocket;
  }

  window.fetch = async function patchedFetch(input, init) {
    const response = await nativeFetch(input, init);
    const requestUrl =
      typeof input === "string"
        ? input
        : input?.url || "";

    if (
      requestUrl.includes("tradingview.com") ||
      window.location.hostname.includes("tradingview")
    ) {
      void inspectFetchResponse(response, requestUrl);
    }

    return response;
  };

  const NativeXHR = window.XMLHttpRequest;

  function PatchedXHR() {
    const xhr = new NativeXHR();
    let requestUrl = "";

    const nativeOpen = xhr.open;

    xhr.open = function open(method, url, ...rest) {
      requestUrl = String(url || "");
      return nativeOpen.call(xhr, method, url, ...rest);
    };

    xhr.addEventListener("load", function onLoad() {
      if (
        !requestUrl.includes("tradingview.com") &&
        !window.location.hostname.includes("tradingview")
      ) {
        return;
      }

      processPayload(xhr.responseText, requestUrl);
    });

    return xhr;
  }

  PatchedXHR.prototype = NativeXHR.prototype;
  window.XMLHttpRequest = PatchedXHR;

  const hookedBrokers = new WeakSet();
  const hookedBrokerList = [];
  let brokerHistoryBootstrapped = false;

  function findBrokerCandidates(root, depth = 0, seen = new WeakSet()) {
    const matches = [];

    if (!root || typeof root !== "object" || depth > 7 || seen.has(root)) {
      return matches;
    }

    seen.add(root);

    if (
      typeof root.orders === "function" &&
      typeof root.ordersHistory === "function"
    ) {
      matches.push(root);
    }

    for (const value of Object.values(root)) {
      if (value && typeof value === "object") {
        matches.push(...findBrokerCandidates(value, depth + 1, seen));
      }
    }

    return matches;
  }

  async function syncBrokerOrders(broker, includeHistory = false) {
    const batches = [];

    if (includeHistory) {
      try {
        if (typeof broker.ordersHistory === "function") {
          batches.push(await broker.ordersHistory());
        }
      } catch {
        // Ignore broker history errors.
      }
    }

    try {
      if (typeof broker.orders === "function") {
        batches.push(await broker.orders());
      }
    } catch {
      // Ignore broker order errors.
    }

    for (const batch of batches) {
      if (!Array.isArray(batch)) {
        continue;
      }

      for (const order of batch) {
        processPayload(order, "broker-api");
      }
    }
  }

  async function bootstrapBrokerAccounts(broker) {
    if (typeof broker.accountsMetainfo !== "function") {
      return;
    }

    try {
      const accounts = await broker.accountsMetainfo();

      for (const account of accounts || []) {
        const context = buildAccountContextFromMeta(account);

        if (!context) {
          continue;
        }

        accountContextById.set(safeString(account?.id), context);
      }

      window.__TRADECOACH_TV_STATS__.accountsBootstrapped =
        accountContextById.size;

      if (
        accountContextById.size === 1 &&
        [...accountContextById.values()][0]?.isPaper === false &&
        !inferConnectedBroker(
          safeString([...accountContextById.values()][0]?.accountName),
        )
      ) {
        const [accountId, liveContext] = [
          ...accountContextById.entries(),
        ][0];
        const paperContext = {
          accountExternalId: `tv:paper:${normalizeSlug(accountId)}`,
          accountName: liveContext.accountName.includes("Paper")
            ? liveContext.accountName
            : `TradingView Paper · ${accountId}`,
          isPaper: true,
          connectedBroker: null,
        };

        accountContextById.set(accountId, paperContext);
      }

      if (typeof broker.currentAccount === "function") {
        const currentAccountId = safeString(
          await broker.currentAccount(),
        );

        if (
          currentAccountId &&
          accountContextById.has(currentAccountId)
        ) {
          defaultAccountContext =
            accountContextById.get(currentAccountId);
        }
      }
    } catch {
      // Ignore account metadata bootstrap errors.
    }
  }

  function hookBrokerInstance(broker) {
    if (!broker || hookedBrokers.has(broker)) {
      return;
    }

    hookedBrokers.add(broker);
    hookedBrokerList.push(broker);
    window.__TRADECOACH_TV_STATS__.brokersHooked =
      (window.__TRADECOACH_TV_STATS__.brokersHooked || 0) + 1;

    void bootstrapBrokerAccounts(broker);

    for (const methodName of [
      "placeOrder",
      "modifyOrder",
      "cancelOrder",
    ]) {
      if (typeof broker[methodName] !== "function") {
        continue;
      }

      const nativeMethod = broker[methodName].bind(broker);

      broker[methodName] = async (...args) => {
        const result = await nativeMethod(...args);
        window.setTimeout(() => {
          void syncBrokerOrders(broker, false);
        }, 750);
        return result;
      };
    }

    const host = broker._host || broker.host;

    if (
      host &&
      typeof host.orderUpdate === "function" &&
      !host.__tradecoachTvPatched__
    ) {
      host.__tradecoachTvPatched__ = true;
      const nativeOrderUpdate = host.orderUpdate.bind(host);

      host.orderUpdate = (order) => {
        processPayload(order, "broker-order-update");
        return nativeOrderUpdate(order);
      };
    }

    if (
      host &&
      typeof host.executionUpdate === "function" &&
      !host.__tradecoachTvExecutionPatched__
    ) {
      host.__tradecoachTvExecutionPatched__ = true;
      const nativeExecutionUpdate = host.executionUpdate.bind(host);

      host.executionUpdate = (symbol, execution) => {
        processPayload(
          {
            ...execution,
            symbol: execution?.symbol || symbol,
          },
          "broker-execution-update",
        );
        return nativeExecutionUpdate(symbol, execution);
      };
    }

    void syncBrokerOrders(broker, !brokerHistoryBootstrapped);
    brokerHistoryBootstrapped = true;
  }

  function discoverAndHookBrokers() {
    const candidates = findBrokerCandidates(window);

    for (const broker of candidates) {
      hookBrokerInstance(broker);
    }
  }

  window.setInterval(discoverAndHookBrokers, 5000);
  window.setInterval(() => {
    for (const broker of hookedBrokerList) {
      void syncBrokerOrders(broker, false);
    }
  }, 15000);

  discoverAndHookBrokers();

  console.info(
    "[TradeCoach] TradingView trade sync bridge active v0.8.6 (broker API + WebSocket + fetch).",
  );
})();
