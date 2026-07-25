let heartbeatTimer = null;
let contextInvalidated = false;

const BROKER = window.location.hostname.includes("ninjatrader")
  ? "ninjatrader"
  : "tradovate";

const PAGE_DETECTED_MESSAGE =
  BROKER === "ninjatrader"
    ? "NINJATRADER_PAGE_DETECTED"
    : "TRADOVATE_PAGE_DETECTED";
const forwardingKeys = new Set();
const forwardedKeys = new Set();

const MAX_FORWARDED_KEYS = 5000;

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

function stopMonitoring() {
  contextInvalidated = true;

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
}

function sendRuntimeMessage(message) {
  return new Promise((resolve) => {
    if (
      contextInvalidated ||
      !extensionIsAvailable()
    ) {
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
                error
                  .toLowerCase()
                  .includes(
                    "extension context invalidated",
                  )
              ) {
                stopMonitoring();
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
          } catch {
            stopMonitoring();

            resolve({
              success: false,

              error:
                "Extension context was invalidated.",
            });
          }
        },
      );
    } catch (error) {
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
  if (
    contextInvalidated ||
    !extensionIsAvailable()
  ) {
    stopMonitoring();
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

function handlePageMessage(event) {
  if (
    event.source !== window ||
    event.origin !==
      window.location.origin ||
    !event.data ||
    event.data.source !==
      "tradecoach-page-bridge"
  ) {
    return;
  }

  if (
    event.data.type ===
      "TRADECOACH_BROKER_EVENT"
  ) {
    forwardBrokerEvent(
      event.data.payload,
    );
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

window.addEventListener(
  "beforeunload",
  stopMonitoring,
  {
    once: true,
  },
);

notifyExtension();

heartbeatTimer = window.setInterval(
  notifyExtension,
  15000,
);

console.info(
  `[TradeCoach] ${BROKER} content sync bridge loaded.`,
);