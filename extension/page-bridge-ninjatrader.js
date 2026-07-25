(() => {
  if (window.__TRADECOACH_NT_BRIDGE_V1__) {
    return;
  }

  window.__TRADECOACH_NT_BRIDGE_V1__ = true;

  const BRIDGE_SOURCE = "tradecoach-page-bridge";
  const emittedKeys = new Set();
  const MAX_EMITTED_KEYS = 5000;
  const openLots = new Map();

  const NativeWebSocket = window.WebSocket;
  const nativeFetch = window.fetch.bind(window);

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

  function firstString(...values) {
    for (const value of values) {
      const cleaned = safeString(value);

      if (cleaned) {
        return cleaned;
      }
    }

    return null;
  }

  function firstNumber(...values) {
    for (const value of values) {
      const number = safeNumber(value);

      if (number !== null) {
        return number;
      }
    }

    return null;
  }

  function rememberKey(key) {
    emittedKeys.add(key);

    if (emittedKeys.size > MAX_EMITTED_KEYS) {
      const oldest = emittedKeys.values().next().value;

      if (oldest) {
        emittedKeys.delete(oldest);
      }
    }
  }

  function postBrokerEvent(payload) {
    window.postMessage(
      {
        source: BRIDGE_SOURCE,
        type: "TRADECOACH_BROKER_EVENT",
        payload,
      },
      window.location.origin,
    );
  }

  function normalizeAction(value) {
    const normalized = safeString(value)?.toLowerCase();

    if (!normalized) {
      return null;
    }

    if (
      normalized.includes("buy") ||
      normalized.includes("long") ||
      normalized === "b"
    ) {
      return "Buy";
    }

    if (
      normalized.includes("sell") ||
      normalized.includes("short") ||
      normalized === "s"
    ) {
      return "Sell";
    }

    return null;
  }

  function looksLikeExecution(record) {
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      return false;
    }

    const id = firstString(
      record.executionId,
      record.execution_id,
      record.fillId,
      record.fill_id,
      record.tradeId,
      record.trade_id,
      record.id,
    );

    const price = firstNumber(
      record.price,
      record.avgPrice,
      record.averagePrice,
      record.fillPrice,
      record.executionPrice,
    );

    const qty = firstNumber(
      record.quantity,
      record.qty,
      record.size,
      record.filledQuantity,
      record.fillQty,
    );

    return Boolean(id && price !== null && qty !== null);
  }

  function normalizeExecution(record) {
    const id = firstString(
      record.executionId,
      record.execution_id,
      record.fillId,
      record.fill_id,
      record.tradeId,
      record.trade_id,
      record.id,
    );

    if (!id) {
      return null;
    }

    const action =
      normalizeAction(
        firstString(
          record.action,
          record.side,
          record.direction,
          record.buySell,
          record.orderAction,
        ),
      ) || "Buy";

    const qty = firstNumber(
      record.quantity,
      record.qty,
      record.size,
      record.filledQuantity,
      record.fillQty,
    );

    const price = firstNumber(
      record.price,
      record.avgPrice,
      record.averagePrice,
      record.fillPrice,
      record.executionPrice,
    );

    if (qty === null || price === null) {
      return null;
    }

    return {
      kind: "fill",
      data: {
        id,
        orderId: firstString(
          record.orderId,
          record.order_id,
          record.parentOrderId,
        ),
        accountId: firstString(
          record.accountId,
          record.account_id,
          record.account,
          record.accountName,
        ),
        contractId: firstString(
          record.contractId,
          record.contract_id,
          record.instrumentId,
          record.symbol,
          record.instrument,
          record.product,
        ),
        timestamp:
          firstString(
            record.timestamp,
            record.time,
            record.executedAt,
            record.executionTime,
            record.fillTime,
            record.date,
          ) || new Date().toISOString(),
        tradeDate: firstString(record.tradeDate, record.trade_date),
        action,
        qty,
        price,
        active: true,
        finallyPaired: false,
        external: true,
        symbol: firstString(
          record.symbol,
          record.instrument,
          record.product,
          record.contractName,
        ),
      },
      detectedAt: new Date().toISOString(),
    };
  }

  function normalizeCommission(record, fillId) {
    const commission = firstNumber(
      record.commission,
      record.commissions,
      record.fee,
      record.totalFee,
      record.totalCommission,
    );

    if (commission === null) {
      return null;
    }

    const resolvedFillId =
      fillId ||
      firstString(
        record.fillId,
        record.fill_id,
        record.executionId,
        record.execution_id,
        record.tradeId,
        record.trade_id,
      );

    if (!resolvedFillId) {
      return null;
    }

    return {
      kind: "fill_fee",
      data: {
        id: `commission:${resolvedFillId}`,
        fillId: resolvedFillId,
        commission,
        totalFee: commission,
        capturedAt: new Date().toISOString(),
      },
      detectedAt: new Date().toISOString(),
    };
  }

  function lotKey(accountId, contractId) {
    return `${accountId || "unknown"}:${contractId || "unknown"}`;
  }

  function emitFillPair(entryFill, exitFill, qty) {
    const buyFill =
      entryFill.action === "Buy" ? entryFill : exitFill;
    const sellFill =
      entryFill.action === "Sell" ? entryFill : exitFill;
    const pairId = `nt-pair:${buyFill.id}:${sellFill.id}`;

    if (emittedKeys.has(`fill_pair:${pairId}`)) {
      return;
    }

    rememberKey(`fill_pair:${pairId}`);

    postBrokerEvent({
      kind: "fill_pair",
      data: {
        id: pairId,
        positionId: firstString(
          buyFill.orderId,
          sellFill.orderId,
          buyFill.id,
        ),
        buyFillId: buyFill.id,
        sellFillId: sellFill.id,
        qty,
        buyPrice: buyFill.price,
        sellPrice: sellFill.price,
        active: true,
        archived: false,
      },
      detectedAt: new Date().toISOString(),
    });
  }

  function pairCompletedTrade(fill) {
    const key = lotKey(fill.accountId, fill.contractId);
    const oppositeAction = fill.action === "Buy" ? "Sell" : "Buy";
    const lots = openLots.get(key) || [];
    let remainingQty = fill.qty;

    while (remainingQty > 0 && lots.length > 0) {
      const lot = lots[0];

      if (lot.action !== oppositeAction) {
        break;
      }

      const matchedQty = Math.min(remainingQty, lot.qty);

      emitFillPair(lot, fill, matchedQty);

      lot.qty -= matchedQty;
      remainingQty -= matchedQty;

      if (lot.qty <= 0) {
        lots.shift();
      }
    }

    if (remainingQty > 0) {
      lots.push({
        id: fill.id,
        action: fill.action,
        qty: remainingQty,
        price: fill.price,
        orderId: fill.orderId,
        accountId: fill.accountId,
        contractId: fill.contractId,
      });
    }

    if (lots.length > 0) {
      openLots.set(key, lots);
    } else {
      openLots.delete(key);
    }
  }

  function emitExecution(record) {
    const fillEvent = normalizeExecution(record);

    if (!fillEvent) {
      return;
    }

    const fillKey = `fill:${fillEvent.data.id}`;

    if (emittedKeys.has(fillKey)) {
      return;
    }

    rememberKey(fillKey);
    postBrokerEvent(fillEvent);
    pairCompletedTrade(fillEvent.data);

    const feeEvent = normalizeCommission(record, fillEvent.data.id);

    if (!feeEvent) {
      return;
    }

    const feeKey = `fill_fee:${feeEvent.data.fillId}`;

    if (emittedKeys.has(feeKey)) {
      return;
    }

    rememberKey(feeKey);
    postBrokerEvent(feeEvent);
  }

  function walkValue(value, depth = 0) {
    if (depth > 8 || value === null || value === undefined) {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => walkValue(item, depth + 1));
      return;
    }

    if (typeof value !== "object") {
      return;
    }

    if (looksLikeExecution(value)) {
      emitExecution(value);
    }

    Object.values(value).forEach((item) => walkValue(item, depth + 1));
  }

  function parsePayload(raw) {
    if (typeof raw === "string") {
      const trimmed = raw.trim();

      if (
        !trimmed.startsWith("{") &&
        !trimmed.startsWith("[")
      ) {
        return null;
      }

      try {
        return JSON.parse(trimmed);
      } catch {
        return null;
      }
    }

    return raw;
  }

  function inspectPayload(raw) {
    const parsed = parsePayload(raw);

    if (parsed !== null && parsed !== undefined) {
      walkValue(parsed);
    }
  }

  if (NativeWebSocket) {
    window.WebSocket = function PatchedWebSocket(url, protocols) {
      const socket = protocols
        ? new NativeWebSocket(url, protocols)
        : new NativeWebSocket(url);

      socket.addEventListener("message", (event) => {
        inspectPayload(event.data);
      });

      return socket;
    };

    window.WebSocket.prototype = NativeWebSocket.prototype;
    window.WebSocket.CONNECTING = NativeWebSocket.CONNECTING;
    window.WebSocket.OPEN = NativeWebSocket.OPEN;
    window.WebSocket.CLOSING = NativeWebSocket.CLOSING;
    window.WebSocket.CLOSED = NativeWebSocket.CLOSED;
  }

  window.fetch = async (...args) => {
    const response = await nativeFetch(...args);

    try {
      const cloned = response.clone();
      const contentType = cloned.headers.get("content-type") || "";

      if (contentType.includes("application/json")) {
        const data = await cloned.json();
        walkValue(data);
      }
    } catch {
      // Ignore non-JSON responses.
    }

    return response;
  };

  console.info(
    "[TradeCoach] NinjaTrader Web bridge loaded.",
  );
})();
