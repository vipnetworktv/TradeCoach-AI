(() => {
  if (window.__TRADECOACH_CONTENT_V1__) {
    return;
  }

  window.__TRADECOACH_CONTENT_V1__ = true;

let heartbeatTimer = null;
let extensionRefreshWarned = false;
const loggedSyncErrors = new Set();

function warnExtensionRefreshNeeded(reason) {
  if (extensionRefreshWarned) {
    return;
  }

  extensionRefreshWarned = true;

  console.error(
    `[TradeCoach] ${reason} Reload the extension at chrome://extensions, then hard-refresh this TradingView tab (Ctrl+Shift+R).`,
  );
}

function extensionIsAvailable() {
  try {
    return Boolean(
      typeof chrome !== "undefined" &&
      chrome.runtime &&
      chrome.runtime.id,
    );
  } catch {
    return false;
  }
}

function isExtensionContextInvalidatedError(message) {
  return String(message || "")
    .toLowerCase()
    .includes("extension context invalidated");
}

const BROKER = window.location.hostname.includes("ninjatrader")
  ? "ninjatrader"
  : window.location.hostname.includes("tradingview")
    ? "tradingview"
    : "tradovate";

const PAGE_DETECTED_MESSAGE =
  BROKER === "ninjatrader"
    ? "NINJATRADER_PAGE_DETECTED"
    : BROKER === "tradingview"
      ? "TRADINGVIEW_PAGE_DETECTED"
      : "TRADOVATE_PAGE_DETECTED";
const forwardingKeys = new Set();
const forwardedKeys = new Set();

const MAX_FORWARDED_KEYS = 5000;

function stopMonitoring() {
  if (heartbeatTimer !== null) {
    window.clearInterval(
      heartbeatTimer,
    );

    heartbeatTimer = null;
  }

  window.removeEventListener(
    "focus",
    handleWindowFocus,
  );

  window.removeEventListener(
    "message",
    handlePageMessage,
  );

  document.removeEventListener(
    "visibilitychange",
    handleVisibilityChange,
  );

  document.removeEventListener(
    "tradecoach-broker-event",
    handleBridgeCustomEvent,
  );
}

function sendRuntimeMessage(message) {
  return new Promise((resolve) => {
    if (!extensionIsAvailable()) {
      warnExtensionRefreshNeeded(
        "Extension context is unavailable.",
      );

      resolve({
        success: false,
        error:
          "Extension context is unavailable.",
      });

      return;
    }

    try {
      chrome.runtime.sendMessage(
        message,
        (response) => {
          try {
            if (
              chrome.runtime.lastError
            ) {
              const error =
                chrome.runtime
                  .lastError
                  .message ||
                "Extension messaging failed.";

              if (
                isExtensionContextInvalidatedError(
                  error,
                )
              ) {
                warnExtensionRefreshNeeded(
                  "Extension context was invalidated.",
                );
              }

              resolve({
                success: false,
                error,
              });

              return;
            }

            resolve(
              response || {
                success: false,

                error:
                  "The background service worker did not respond.",
              },
            );
          } catch (error) {
            warnExtensionRefreshNeeded(
              "Extension messaging failed.",
            );

            resolve({
              success: false,

              error:
                error instanceof Error
                  ? error.message
                  : "Extension context was invalidated.",
            });
          }
        },
      );
    } catch (error) {
      warnExtensionRefreshNeeded(
        "Extension messaging failed.",
      );

      resolve({
        success: false,

        error:
          error instanceof Error
            ? error.message
            : "Extension messaging failed.",
      });
    }
  });
}

function safeString(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const cleaned = String(value).trim();

  return cleaned || null;
}

function safeNumber(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

function normalizeFill(data) {
  const id = safeString(data?.id);
  const qty = safeNumber(data?.qty);
  const price = safeNumber(data?.price);

  if (
    !id ||
    qty === null ||
    qty <= 0 ||
    price === null
  ) {
    return null;
  }

  return {
    id,

    orderId:
      safeString(data.orderId),

    contractId:
      safeString(data.contractId),

    accountId:
      safeString(data.accountId),

    timestamp:
      safeString(data.timestamp) ||
      new Date().toISOString(),

    tradeDate:
      data.tradeDate || null,

    action:
      safeString(data.action),

    qty,
    price,

    active:
      data.active !== false,

    finallyPaired:
      data.finallyPaired ?? null,

    external:
      data.external === true,
  };
}

function normalizeFillPair(data) {
  const id = safeString(data?.id);
  const qty = safeNumber(data?.qty);

  const buyPrice =
    safeNumber(data?.buyPrice);

  const sellPrice =
    safeNumber(data?.sellPrice);

  if (
    !id ||
    qty === null ||
    qty <= 0 ||
    buyPrice === null ||
    sellPrice === null
  ) {
    return null;
  }

  return {
    id,

    positionId:
      safeString(
        data.positionId,
      ),

    buyFillId:
      safeString(
        data.buyFillId,
      ),

    sellFillId:
      safeString(
        data.sellFillId,
      ),

    qty,
    buyPrice,
    sellPrice,

    active:
      data.active !== false,

    archived:
      data.archived === true,
  };
}

function normalizeFillFee(data) {
  const id = safeString(
    data?.id,
  );

  const fillId = safeString(
    data?.fillId ??
    data?.id,
  );

  if (
    !id ||
    !fillId
  ) {
    return null;
  }

  const clearingFee =
    safeNumber(
      data.clearingFee,
    );

  const exchangeFee =
    safeNumber(
      data.exchangeFee,
    );

  const nfaFee =
    safeNumber(
      data.nfaFee,
    );

  const commission =
    safeNumber(
      data.commission,
    );

  const brokerageFee =
    safeNumber(
      data.brokerageFee,
    );

  const ipFee =
    safeNumber(
      data.ipFee,
    );

  const routingFee =
    safeNumber(
      data.routingFee,
    );

  const componentValues = [
    clearingFee,
    exchangeFee,
    nfaFee,
    commission,
    brokerageFee,
    ipFee,
    routingFee,
  ].filter(
    (value) =>
      value !== null,
  );

  const calculatedTotal =
    componentValues.length > 0
      ? componentValues.reduce(
          (
            total,
            value,
          ) => total + value,
          0,
        )
      : null;

  const totalFee =
    calculatedTotal ??
    safeNumber(
      data.totalFee,
    );

  if (totalFee === null) {
    return null;
  }

  return {
    id,
    fillId,

    clearingFee,

    clearingCurrencyId:
      safeString(
        data.clearingCurrencyId,
      ),

    exchangeFee,

    exchangeCurrencyId:
      safeString(
        data.exchangeCurrencyId,
      ),

    nfaFee,

    nfaCurrencyId:
      safeString(
        data.nfaCurrencyId,
      ),

    commission,

    commissionCurrencyId:
      safeString(
        data.commissionCurrencyId,
      ),

    brokerageFee,

    brokerageCurrencyId:
      safeString(
        data.brokerageCurrencyId,
      ),

    ipFee,

    ipCurrencyId:
      safeString(
        data.ipCurrencyId,
      ),

    routingFee,

    routingCurrencyId:
      safeString(
        data.routingCurrencyId,
      ),

    feeComponents: {
      clearingFee,
      exchangeFee,
      nfaFee,
      commission,
      brokerageFee,
      ipFee,
      routingFee,
    },

    totalFee,

    capturedAt:
      safeString(
        data.capturedAt,
      ) ||
      new Date().toISOString(),
  };
}

function normalizeContractMetadata(data) {
  const contractId =
    safeString(
      data?.contractId ??
      data?.id,
    );

  if (!contractId) {
    return null;
  }

  return {
    id: contractId,
    contractId,

    contractName:
      safeString(
        data.contractName,
      ),

    symbol:
      safeString(data.symbol),

    rootSymbol:
      safeString(
        data.rootSymbol,
      ),

    contractMaturityId:
      safeString(
        data.contractMaturityId,
      ),

    productId:
      safeString(data.productId),

    productName:
      safeString(
        data.productName,
      ),

    description:
      safeString(
        data.description,
      ),

    expirationMonth:
      safeNumber(
        data.expirationMonth,
      ),

    expirationDate:
      safeString(
        data.expirationDate,
      ),

    tickSize:
      safeNumber(data.tickSize),

    providerTickSize:
      safeNumber(
        data.providerTickSize,
      ),

    valuePerPoint:
      safeNumber(
        data.valuePerPoint,
      ),

    productType:
      safeString(
        data.productType,
      ),

    exchangeId:
      safeString(
        data.exchangeId,
      ),

    capturedAt:
      safeString(
        data.capturedAt,
      ) ||
      new Date().toISOString(),
  };
}

function normalizeCompletedTrade(data) {
  const id = safeString(
    data?.id ?? data?.brokerPairId,
  );
  const symbol = safeString(data?.symbol);
  const direction = safeString(data?.direction);
  const quantity = safeNumber(data?.quantity);
  const entryPrice = safeNumber(
    data?.entryPrice,
  );
  const exitPrice = safeNumber(
    data?.exitPrice,
  );
  const entryAt =
    safeString(data?.entryAt) ||
    new Date().toISOString();
  const exitAt =
    safeString(data?.exitAt) ||
    entryAt;

  if (
    !id ||
    !symbol ||
    !direction ||
    quantity === null ||
    quantity <= 0 ||
    entryPrice === null ||
    exitPrice === null
  ) {
    return null;
  }

  return {
    id,
    brokerPairId:
      safeString(data?.brokerPairId) || id,
    symbol,
    direction,
    quantity,
    entryPrice,
    exitPrice,
    entryAt,
    exitAt,
    grossPoints:
      safeNumber(data?.grossPoints) ?? 0,
    pointValue:
      safeNumber(data?.pointValue) ?? 1,
    netPnl: safeNumber(data?.netPnl) ?? 0,
    fees: safeNumber(data?.fees) ?? 0,
    accountExternalId:
      safeString(data?.accountExternalId) ||
      "tv:unknown",
    accountName:
      safeString(data?.accountName),
    isPaper: data?.isPaper === true,
    connectedBroker:
      safeString(data?.connectedBroker),
    buyFillId:
      safeString(data?.buyFillId) ||
      `tv-buy:${id}`,
    sellFillId:
      safeString(data?.sellFillId) ||
      `tv-sell:${id}`,
  };
}

function normalizeBrokerEvent(payload) {
  if (
    !payload ||
    typeof payload !== "object"
  ) {
    return null;
  }

  let data = null;

  if (payload.kind === "fill") {
    data = normalizeFill(
      payload.data,
    );
  }

  if (
    payload.kind ===
    "fill_pair"
  ) {
    data = normalizeFillPair(
      payload.data,
    );
  }

  if (
    payload.kind ===
    "fill_fee"
  ) {
    data = normalizeFillFee(
      payload.data,
    );
  }

  if (
    payload.kind ===
    "contract_metadata"
  ) {
    data =
      normalizeContractMetadata(
        payload.data,
      );
  }

  if (
    payload.kind ===
    "completed_trade"
  ) {
    data =
      normalizeCompletedTrade(
        payload.data,
      );
  }

  if (!data) {
    return null;
  }

  return {
    kind: payload.kind,
    data,

    detectedAt:
      safeString(
        payload.detectedAt,
      ) ||
      new Date().toISOString(),
  };
}

function rememberForwardedKey(key) {
  forwardedKeys.add(key);

  if (
    forwardedKeys.size >
    MAX_FORWARDED_KEYS
  ) {
    const oldestKey = forwardedKeys
      .values()
      .next()
      .value;

    if (oldestKey) {
      forwardedKeys.delete(oldestKey);
    }
  }
}

async function forwardBrokerEvent(
  rawPayload,
) {
  const brokerEvent =
    normalizeBrokerEvent(
      rawPayload,
    );

  if (!brokerEvent) {
    console.warn(
      "[TradeCoach] Invalid broker event ignored.",
      rawPayload,
    );

    return;
  }

  const key =
    `${brokerEvent.kind}:` +
    `${brokerEvent.data.id}`;

  if (
    forwardingKeys.has(key) ||
    forwardedKeys.has(key)
  ) {
    return;
  }

  forwardingKeys.add(key);

  const response =
    await sendRuntimeMessage({
      type:
        "TRADOVATE_BROKER_EVENT_DETECTED",

      broker: BROKER,

      brokerEvent,
      pageUrl:
        window.location.href,

      detectedAt:
        brokerEvent.detectedAt,
    });

  forwardingKeys.delete(key);

  if (!response?.success) {
    console.warn(
      "[TradeCoach] Broker event could not be queued.",
      response?.error ||
        "Unknown sync error.",
    );

    return;
  }

  rememberForwardedKey(key);

  if (brokerEvent.kind === "completed_trade") {
    if (response?.queued && response?.synced) {
      console.info(
        "[TradeCoach] Completed trade synced to TradeCoach.",
        {
          pairId: brokerEvent.data.id,
          symbol: brokerEvent.data.symbol,
          direction: brokerEvent.data.direction,
          netPnl: brokerEvent.data.netPnl,
          isPaper: brokerEvent.data.isPaper,
        },
      );
      return;
    }

    if (response?.queued) {
      const syncError =
        response?.syncError ||
        (response?.paired === false
          ? "Extension is not paired. Open TradeCoach → Connect TradingView and enter the pairing code in the extension popup."
          : "Sync failed. Open the TradeCoach Sync popup for details.");

      if (!loggedSyncErrors.has(syncError)) {
        loggedSyncErrors.add(syncError);

        console.warn(
          `[TradeCoach] Trade saved locally but not synced yet: ${syncError}`,
          {
            pairId: brokerEvent.data.id,
            symbol: brokerEvent.data.symbol,
            pendingCount: response?.pendingCount,
          },
        );
      }

      return;
    }
  }

  if (brokerEvent.kind === "fill") {
    console.info(
      "[TradeCoach] Fill queued for syncing.",
      {
        fillId:
          brokerEvent.data.id,

        action:
          brokerEvent.data.action,

        qty:
          brokerEvent.data.qty,

        price:
          brokerEvent.data.price,
      },
    );
  }

  if (
    brokerEvent.kind ===
    "fill_pair"
  ) {
    console.info(
      "[TradeCoach] Fill pair queued for syncing.",
      {
        pairId:
          brokerEvent.data.id,

        buyFillId:
          brokerEvent.data
            .buyFillId,

        sellFillId:
          brokerEvent.data
            .sellFillId,

        qty:
          brokerEvent.data.qty,
      },
    );
  }

  if (
    brokerEvent.kind ===
    "fill_fee"
  ) {
    console.info(
      "[TradeCoach] Fill fee queued for syncing.",
      {
        fillId:
          brokerEvent.data.fillId,

        totalFee:
          brokerEvent.data.totalFee,

        clearingFee:
          brokerEvent.data
            .clearingFee,

        exchangeFee:
          brokerEvent.data
            .exchangeFee,

        nfaFee:
          brokerEvent.data
            .nfaFee,

        commission:
          brokerEvent.data
            .commission,
      },
    );
  }

  if (
    brokerEvent.kind ===
    "contract_metadata"
  ) {
    console.info(
      "[TradeCoach] Contract metadata queued for syncing.",
      {
        contractId:
          brokerEvent.data
            .contractId,

        contractName:
          brokerEvent.data
            .contractName,

        rootSymbol:
          brokerEvent.data
            .rootSymbol,

        valuePerPoint:
          brokerEvent.data
            .valuePerPoint,
      },
    );
  }
}

async function notifyExtension() {
  if (!extensionIsAvailable()) {
    return;
  }

  if (!isBrokerTradingSession()) {
    return;
  }

  await sendRuntimeMessage({
    type: PAGE_DETECTED_MESSAGE,

    broker: BROKER,

    pageUrl:
      window.location.href,
    detectedAt:
      new Date().toISOString(),
  });
}

function isBrokerTradingSession() {
  const title = document.title.toLowerCase();
  const path = window.location.pathname.toLowerCase();
  const href = window.location.href.toLowerCase();

  if (
    /\b(sign in|log in|login|authenticate|create account|register)\b/.test(
      title,
    )
  ) {
    return false;
  }

  if (
    /\/(login|signin|sign-in|auth|welcome|sso)(\/|$|\?)/.test(
      path,
    ) ||
    /\/(login|signin|sign-in|auth|welcome|sso)(\/|$|\?)/.test(
      href,
    )
  ) {
    return false;
  }

  const passwordField = document.querySelector(
    'input[type="password"]',
  );

  const tradingUi = document.querySelector(
    'canvas, [class*="chart" i], [class*="order" i], [class*="trade" i], [class*="position" i], [data-testid*="trade" i]',
  );

  if (passwordField && !tradingUi) {
    return false;
  }

  return true;
}

function handleBridgeCustomEvent(event) {
  if (event.detail) {
    forwardBrokerEvent(event.detail);
  }
}

function handlePageMessage(event) {
  if (
    window !== window.top &&
    event.source !== window
  ) {
    return;
  }

  if (
    !event.data ||
    event.data.source !== "tradecoach-page-bridge"
  ) {
    return;
  }

  if (event.origin && event.origin !== window.location.origin) {
    return;
  }

  if (event.data.type === "TRADECOACH_BROKER_EVENT") {
    forwardBrokerEvent(event.data.payload);
  }
}

function handleWindowFocus() {
  notifyExtension();
}

function handleVisibilityChange() {
  if (!document.hidden) {
    notifyExtension();
  }
}

window.addEventListener(
  "focus",
  handleWindowFocus,
);

window.addEventListener(
  "message",
  handlePageMessage,
);

document.addEventListener(
  "visibilitychange",
  handleVisibilityChange,
);

document.addEventListener(
  "tradecoach-broker-event",
  handleBridgeCustomEvent,
);

window.addEventListener(
  "beforeunload",
  stopMonitoring,
  {
    once: true,
  },
);

notifyExtension();

if (!extensionIsAvailable()) {
  warnExtensionRefreshNeeded(
    "Extension context is unavailable on this tab.",
  );
} else {
  console.info(
    `[TradeCoach] ${BROKER} content sync bridge loaded (v${chrome.runtime.getManifest().version}).`,
  );
}

heartbeatTimer = window.setInterval(
  notifyExtension,
  15000,
);

})();