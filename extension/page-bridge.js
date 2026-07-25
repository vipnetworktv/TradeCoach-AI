(() => {
    if (window.__TRADECOACH_BRIDGE_V10__) {
      return;
    }
  
    window.__TRADECOACH_BRIDGE_V10__ = true;
  
    const NativeWebSocket = window.WebSocket;
  
    if (!NativeWebSocket) {
      console.warn("[TradeCoach] WebSocket is unavailable.");
      return;
    }
  
    const diagnostics = [];
    const emittedEventKeys = new Set();
  
    const socketsById = new Map();
    const nativeSendBySocketId = new Map();
    const requestsBySocket = new Map();
  
    const ordersById = new Map();
    const contractsById = new Map();
    const maturitiesById = new Map();
    const productsById = new Map();
  
    const contractMetadataById = new Map();
    const contractResolutionById = new Map();
  
    const fillFeesById = new Map();
    const fillFeeRetryTimersById = new Map();
  
    const MAX_DIAGNOSTICS = 500;
    const MAX_CACHE_SIZE = 5000;
    const MAX_EMITTED_EVENTS = 5000;
  
    // The fee can appear slightly after the fill. These retries make the bridge
    // actively request it instead of depending only on the live fillFee event.
    const FILL_FEE_RETRY_DELAYS_MS = [
      0,
      250,
      750,
      1500,
      3000,
      6000,
      10000,
      15000,
    ];
  
    let socketCounter = 0;
    let nextRequestId = 900000000;
  
    let latestFill = null;
    let latestFillPair = null;
    let latestFillFee = null;
  
    function safeString(value) {
      if (value === null || value === undefined) {
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
  
    function trimMap(map, maximumSize) {
      while (map.size > maximumSize) {
        const oldestKey = map.keys().next().value;
  
        if (oldestKey === undefined || oldestKey === null) {
          break;
        }
  
        map.delete(oldestKey);
      }
    }
  
    function trimArray(array, maximumSize) {
      while (array.length > maximumSize) {
        array.shift();
      }
    }
  
    function parseJsonOnce(value) {
      if (typeof value !== "string") {
        return value;
      }
  
      const trimmed = value.trim();
  
      if (
        !trimmed.startsWith("{") &&
        !trimmed.startsWith("[")
      ) {
        return value;
      }
  
      try {
        return JSON.parse(trimmed);
      } catch {
        return value;
      }
    }
  
    function parseNestedJson(value, depth = 0) {
      if (depth > 8) {
        return value;
      }
  
      const parsed = parseJsonOnce(value);
  
      if (parsed !== value) {
        return parseNestedJson(parsed, depth + 1);
      }
  
      if (Array.isArray(parsed)) {
        return parsed.map((item) =>
          parseNestedJson(item, depth + 1),
        );
      }
  
      if (
        parsed !== null &&
        typeof parsed === "object"
      ) {
        const result = {};
  
        for (const [key, item] of Object.entries(parsed)) {
          result[key] = parseNestedJson(item, depth + 1);
        }
  
        return result;
      }
  
      return parsed;
    }
  
    function decodeSocketMessages(text) {
      const value = String(text || "");
  
      if (!value || value === "o" || value === "h") {
        return [];
      }
  
      if (value.startsWith("a[")) {
        try {
          const messages = JSON.parse(value.slice(1));
  
          if (!Array.isArray(messages)) {
            return [];
          }
  
          return messages.map((message) =>
            parseNestedJson(message),
          );
        } catch {
          return [];
        }
      }
  
      return [parseNestedJson(value)];
    }
  
    async function socketDataToText(data) {
      if (typeof data === "string") {
        return data;
      }
  
      if (data instanceof Blob) {
        try {
          return await data.text();
        } catch {
          return "";
        }
      }
  
      if (data instanceof ArrayBuffer) {
        try {
          return new TextDecoder().decode(data);
        } catch {
          return "";
        }
      }
  
      if (ArrayBuffer.isView(data)) {
        try {
          return new TextDecoder().decode(data.buffer);
        } catch {
          return "";
        }
      }
  
      return "";
    }
  
    function rememberEmittedEvent(eventKey) {
      emittedEventKeys.add(eventKey);
  
      if (emittedEventKeys.size > MAX_EMITTED_EVENTS) {
        const oldestKey = emittedEventKeys.values().next().value;
  
        if (oldestKey) {
          emittedEventKeys.delete(oldestKey);
        }
      }
    }
  
    function postBrokerEvent(kind, data) {
      const id = data?.id ?? data?.contractId;
  
      if (id === null || id === undefined) {
        return false;
      }
  
      const eventKey = `${kind}:${String(id)}`;
  
      if (emittedEventKeys.has(eventKey)) {
        return false;
      }
  
      rememberEmittedEvent(eventKey);
  
      window.postMessage(
        {
          source: "tradecoach-page-bridge",
          type: "TRADECOACH_BROKER_EVENT",
          payload: {
            kind,
            data,
            detectedAt: new Date().toISOString(),
          },
        },
        window.location.origin,
      );
  
      return true;
    }
  
    function saveDiagnostic(route, payload) {
      diagnostics.push({
        capturedAt: new Date().toISOString(),
        route,
        payload,
      });
  
      trimArray(diagnostics, MAX_DIAGNOSTICS);
    }
  
    function parseOutgoingRequest(text) {
      if (typeof text !== "string") {
        return null;
      }
  
      const lines = text.split("\n");
      const route = String(lines[0] || "").trim();
  
      const requestId = Number.parseInt(
        String(lines[1] || "").trim(),
        10,
      );
  
      const query = String(lines[2] || "").trim();
      const body = String(lines[3] || "").trim();
  
      if (!route) {
        return null;
      }
  
      return {
        route,
        requestId: Number.isFinite(requestId)
          ? requestId
          : null,
        query,
        body,
        tradeCoachRequest: false,
        context: null,
        sentAt: new Date().toISOString(),
      };
    }
  
    function createRequestKey(socketId, requestId) {
      return `${socketId}:${requestId}`;
    }
  
    function rememberRequest(socketId, request) {
      if (
        request.requestId === null ||
        request.requestId === undefined
      ) {
        return;
      }
  
      const key = createRequestKey(
        socketId,
        request.requestId,
      );
  
      requestsBySocket.set(key, request);
  
      window.setTimeout(() => {
        requestsBySocket.delete(key);
      }, 5 * 60 * 1000);
    }
  
    function findRequest(socketId, requestId) {
      if (requestId === null || requestId === undefined) {
        return null;
      }
  
      return (
        requestsBySocket.get(
          createRequestKey(socketId, requestId),
        ) || null
      );
    }
  
    function forgetRequest(socketId, requestId) {
      if (requestId === null || requestId === undefined) {
        return;
      }
  
      requestsBySocket.delete(
        createRequestKey(socketId, requestId),
      );
    }
  
    function getSocketDetails(socket) {
      if (!socket) {
        return {
          valid: false,
          hostname: "",
          isAccountSocket: false,
          isMarketDataSocket: false,
        };
      }
  
      let hostname = "";
  
      try {
        hostname = new URL(socket.url).hostname.toLowerCase();
      } catch {
        return {
          valid: false,
          hostname: "",
          isAccountSocket: false,
          isMarketDataSocket: false,
        };
      }
  
      const isTradovate =
        hostname === "tradovateapi.com" ||
        hostname.endsWith(".tradovateapi.com");
  
      const isMarketDataSocket =
        hostname.startsWith("md-") ||
        hostname.startsWith("md.");
  
      return {
        valid: true,
        hostname,
        isMarketDataSocket,
        isAccountSocket:
          isTradovate &&
          !isMarketDataSocket,
      };
    }
  
    function socketIsOpen(socket) {
      return Boolean(
        socket &&
        socket.readyState === NativeWebSocket.OPEN,
      );
    }
  
    function socketIsAccountSocket(socket) {
      return (
        socketIsOpen(socket) &&
        getSocketDetails(socket).isAccountSocket
      );
    }
  
    function getAvailableAccountSocket() {
      const entries = Array.from(
        socketsById.entries(),
      ).reverse();
  
      for (const [socketId, socket] of entries) {
        if (!socketIsAccountSocket(socket)) {
          continue;
        }
  
        return {
          socketId,
          socket,
        };
      }
  
      return null;
    }
  
    function getPreferredAccountSocket(preferredSocketId = null) {
      if (
        preferredSocketId !== null &&
        preferredSocketId !== undefined
      ) {
        const preferredSocket = socketsById.get(
          preferredSocketId,
        );
  
        if (socketIsAccountSocket(preferredSocket)) {
          return {
            socketId: preferredSocketId,
            socket: preferredSocket,
          };
        }
      }
  
      return getAvailableAccountSocket();
    }
  
    function getNextRequestId() {
      nextRequestId += 1;
  
      if (nextRequestId > 2000000000) {
        nextRequestId = 900000001;
      }
  
      return nextRequestId;
    }
  
    function sendTradovateRequest({
      socketId,
      route,
      query = "",
      body = "",
      context = null,
    }) {
      const socket = socketsById.get(socketId);
      const nativeSend = nativeSendBySocketId.get(socketId);
  
      if (
        !socket ||
        typeof nativeSend !== "function" ||
        !socketIsAccountSocket(socket)
      ) {
        throw new Error(
          "A regular Tradovate account socket is not available.",
        );
      }
  
      const requestId = getNextRequestId();
  
      const request = {
        route,
        requestId,
        query,
        body,
        context,
        tradeCoachRequest: true,
        sentAt: new Date().toISOString(),
      };
  
      rememberRequest(socketId, request);
  
      nativeSend(
        [
          route,
          String(requestId),
          query,
          body,
        ].join("\n"),
      );
  
      console.info("[TradeCoach API request]", {
        route,
        requestId,
        query,
        socketUrl: socket.url,
        context,
      });
  
      return requestId;
    }
  
    function rememberOrder(entity) {
      if (!entity || typeof entity !== "object") {
        return null;
      }
  
      const id = safeString(entity.id);
  
      if (!id) {
        return null;
      }
  
      const previous = ordersById.get(id) || {};
  
      const order = {
        ...previous,
        ...entity,
        id,
        accountId: firstString(
          entity.accountId,
          previous.accountId,
        ),
        contractId: firstString(
          entity.contractId,
          previous.contractId,
        ),
        action: firstString(
          entity.action,
          previous.action,
        ),
        ordStatus: firstString(
          entity.ordStatus,
          previous.ordStatus,
        ),
        timestamp: firstString(
          entity.timestamp,
          previous.timestamp,
        ),
        updatedAt: new Date().toISOString(),
      };
  
      ordersById.set(id, order);
      trimMap(ordersById, MAX_CACHE_SIZE);
  
      return order;
    }
  
    function rememberContract(entity) {
      if (!entity || typeof entity !== "object") {
        return null;
      }
  
      const id = safeString(entity.id);
  
      if (!id) {
        return null;
      }
  
      const previous = contractsById.get(id) || {};
  
      const contract = {
        ...previous,
        ...entity,
        id,
        name: firstString(
          entity.name,
          previous.name,
        ),
        contractMaturityId: firstString(
          entity.contractMaturityId,
          previous.contractMaturityId,
        ),
        providerTickSize: firstNumber(
          entity.providerTickSize,
          previous.providerTickSize,
        ),
        capturedAt: new Date().toISOString(),
      };
  
      contractsById.set(id, contract);
      trimMap(contractsById, MAX_CACHE_SIZE);
  
      return contract;
    }
  
    function rememberMaturity(entity) {
      if (!entity || typeof entity !== "object") {
        return null;
      }
  
      const id = safeString(entity.id);
  
      if (!id) {
        return null;
      }
  
      const previous = maturitiesById.get(id) || {};
  
      const maturity = {
        ...previous,
        ...entity,
        id,
        productId: firstString(
          entity.productId,
          previous.productId,
        ),
        capturedAt: new Date().toISOString(),
      };
  
      maturitiesById.set(id, maturity);
      trimMap(maturitiesById, MAX_CACHE_SIZE);
  
      return maturity;
    }
  
    function rememberProduct(entity) {
      if (!entity || typeof entity !== "object") {
        return null;
      }
  
      const id = safeString(entity.id);
  
      if (!id) {
        return null;
      }
  
      const previous = productsById.get(id) || {};
  
      const product = {
        ...previous,
        ...entity,
        id,
        name: firstString(
          entity.name,
          previous.name,
        ),
        valuePerPoint: firstNumber(
          entity.valuePerPoint,
          previous.valuePerPoint,
        ),
        tickSize: firstNumber(
          entity.tickSize,
          previous.tickSize,
        ),
        capturedAt: new Date().toISOString(),
      };
  
      productsById.set(id, product);
      trimMap(productsById, MAX_CACHE_SIZE);
  
      return product;
    }
  
    function normalizeFill(entity) {
      if (!entity || typeof entity !== "object") {
        return null;
      }
  
      const id = safeString(entity.id);
      const orderId = safeString(entity.orderId);
  
      const order = orderId
        ? ordersById.get(orderId)
        : null;
  
      const qty = safeNumber(entity.qty);
      const price = safeNumber(entity.price);
  
      if (
        !id ||
        qty === null ||
        qty <= 0 ||
        price === null
      ) {
        return null;
      }
  
      const fill = {
        id,
        orderId,
        contractId: firstString(
          entity.contractId,
          order?.contractId,
        ),
        accountId: firstString(
          entity.accountId,
          order?.accountId,
        ),
        timestamp:
          firstString(entity.timestamp) ||
          new Date().toISOString(),
        tradeDate: entity.tradeDate || null,
        action: firstString(
          entity.action,
          order?.action,
        ),
        qty,
        price,
        active: entity.active !== false,
        finallyPaired:
          entity.finallyPaired ?? null,
        external: entity.external === true,
      };
  
      latestFill = fill;
      return fill;
    }
  
    function normalizeFillPair(entity) {
      if (!entity || typeof entity !== "object") {
        return null;
      }
  
      const id = safeString(entity.id);
      const qty = safeNumber(entity.qty);
      const buyPrice = safeNumber(entity.buyPrice);
      const sellPrice = safeNumber(entity.sellPrice);
  
      if (
        !id ||
        qty === null ||
        qty <= 0 ||
        buyPrice === null ||
        sellPrice === null
      ) {
        return null;
      }
  
      const pair = {
        id,
        positionId: safeString(entity.positionId),
        buyFillId: safeString(entity.buyFillId),
        sellFillId: safeString(entity.sellFillId),
        qty,
        buyPrice,
        sellPrice,
        active: entity.active !== false,
        archived: entity.archived === true,
      };
  
      latestFillPair = pair;
      return pair;
    }
  
    function normalizeFillFee(entity) {
      if (!entity || typeof entity !== "object") {
        return null;
      }
  
      const id = safeString(entity.id);
  
      if (!id) {
        return null;
      }
  
      const feeComponents = {};
  
      for (const [key, value] of Object.entries(entity)) {
        if (
          key === "id" ||
          !key.toLowerCase().endsWith("fee")
        ) {
          continue;
        }
  
        const number = safeNumber(value);
  
        if (number !== null) {
          feeComponents[key] = number;
        }
      }
  
      const componentValues = Object.values(feeComponents);
  
      // Keep the same behavior as the existing bridge:
      // totalFee is the sum of the fields ending in "Fee".
      // commission is sent separately so the backend can include it once.
      const totalFee =
        componentValues.length > 0
          ? componentValues.reduce(
              (total, value) => total + value,
              0,
            )
          : null;
  
      const orderRoutingFee = firstNumber(
        entity.orderRoutingFee,
        entity.routingFee,
      );
  
      const orderRoutingCurrencyId = firstString(
        entity.orderRoutingCurrencyId,
        entity.routingCurrencyId,
      );
  
      const commission = safeNumber(entity.commission);
  
      // A very early lookup can return an object before the fee values are
      // populated. Do not emit that incomplete object; allow later retries.
      if (
        totalFee === null &&
        commission === null
      ) {
        return null;
      }
  
      const fillFee = {
        id,
        fillId: id,
  
        clearingFee: safeNumber(entity.clearingFee),
        clearingCurrencyId: safeString(
          entity.clearingCurrencyId,
        ),
  
        exchangeFee: safeNumber(entity.exchangeFee),
        exchangeCurrencyId: safeString(
          entity.exchangeCurrencyId,
        ),
  
        nfaFee: safeNumber(entity.nfaFee),
        nfaCurrencyId: safeString(
          entity.nfaCurrencyId,
        ),
  
        commission,
        commissionCurrencyId: safeString(
          entity.commissionCurrencyId,
        ),
  
        brokerageFee: safeNumber(entity.brokerageFee),
        brokerageCurrencyId: safeString(
          entity.brokerageCurrencyId,
        ),
  
        ipFee: safeNumber(entity.ipFee),
        ipCurrencyId: safeString(entity.ipCurrencyId),
  
        // Tradovate's documented field is orderRoutingFee. Keep routingFee as
        // a compatibility alias for any existing backend/content code.
        orderRoutingFee,
        orderRoutingCurrencyId,
        routingFee: orderRoutingFee,
        routingCurrencyId: orderRoutingCurrencyId,
  
        feeComponents,
        totalFee,
        capturedAt: new Date().toISOString(),
      };
  
      fillFeesById.set(id, fillFee);
      trimMap(fillFeesById, MAX_CACHE_SIZE);
  
      latestFillFee = fillFee;
      return fillFee;
    }
  
    function requestContract(socketId, contractId) {
      return sendTradovateRequest({
        socketId,
        route: "contract/item",
        query: `id=${encodeURIComponent(contractId)}`,
        context: {
          type: "contract",
          contractId,
        },
      });
    }
  
    function requestMaturity(
      socketId,
      contractId,
      maturityId,
    ) {
      return sendTradovateRequest({
        socketId,
        route: "contractMaturity/item",
        query: `id=${encodeURIComponent(maturityId)}`,
        context: {
          type: "maturity",
          contractId,
          maturityId,
        },
      });
    }
  
    function requestProduct(
      socketId,
      contractId,
      productId,
    ) {
      return sendTradovateRequest({
        socketId,
        route: "product/item",
        query: `id=${encodeURIComponent(productId)}`,
        context: {
          type: "product",
          contractId,
          productId,
        },
      });
    }
  
    function requestFillFee(
      socketId,
      fillId,
      attempt = 1,
    ) {
      return sendTradovateRequest({
        socketId,
        route: "fillFee/item",
        query: `id=${encodeURIComponent(fillId)}`,
        context: {
          type: "fill_fee",
          fillId,
          attempt,
        },
      });
    }
  
    function clearFillFeeRetries(fillId) {
      const normalizedId = safeString(fillId);
  
      if (!normalizedId) {
        return;
      }
  
      const timers = fillFeeRetryTimersById.get(normalizedId);
  
      if (timers) {
        for (const timer of timers) {
          window.clearTimeout(timer);
        }
      }
  
      fillFeeRetryTimersById.delete(normalizedId);
    }
  
    function scheduleFillFeeLookup(
      fillId,
      preferredSocketId = null,
    ) {
      const normalizedId = safeString(fillId);
  
      if (!normalizedId) {
        return false;
      }
  
      if (fillFeesById.has(normalizedId)) {
        clearFillFeeRetries(normalizedId);
        return true;
      }
  
      // Do not create duplicate retry groups for the same fill.
      if (fillFeeRetryTimersById.has(normalizedId)) {
        return true;
      }
  
      const timers = new Set();
      fillFeeRetryTimersById.set(normalizedId, timers);
  
      FILL_FEE_RETRY_DELAYS_MS.forEach(
        (delayMs, index) => {
          const timer = window.setTimeout(() => {
            timers.delete(timer);
  
            if (fillFeesById.has(normalizedId)) {
              clearFillFeeRetries(normalizedId);
              return;
            }
  
            const socketEntry = getPreferredAccountSocket(
              preferredSocketId,
            );
  
            if (!socketEntry) {
              console.warn(
                "[TradeCoach] Fill-fee lookup is waiting for an account socket.",
                {
                  fillId: normalizedId,
                  attempt: index + 1,
                  delayMs,
                },
              );
  
              if (timers.size === 0) {
                fillFeeRetryTimersById.delete(normalizedId);
              }
  
              return;
            }
  
            try {
              requestFillFee(
                socketEntry.socketId,
                normalizedId,
                index + 1,
              );
  
              console.info(
                "[TradeCoach] Requested fill fee.",
                {
                  fillId: normalizedId,
                  attempt: index + 1,
                  delayMs,
                },
              );
            } catch (error) {
              console.warn(
                "[TradeCoach] Fill-fee request could not be sent.",
                {
                  fillId: normalizedId,
                  attempt: index + 1,
                  error:
                    error instanceof Error
                      ? error.message
                      : String(error),
                },
              );
            }
  
            if (timers.size === 0) {
              fillFeeRetryTimersById.delete(normalizedId);
            }
          }, delayMs);
  
          timers.add(timer);
        },
      );
  
      return true;
    }
  
    function emitFillFee(fillFee, source) {
      if (!fillFee) {
        return false;
      }
  
      clearFillFeeRetries(fillFee.fillId);
  
      const emitted = postBrokerEvent(
        "fill_fee",
        fillFee,
      );
  
      console.info(
        source === "lookup"
          ? "[TradeCoach fill-fee lookup result]"
          : "[TradeCoach live fill fee]",
        fillFee,
      );
  
      if (emitted) {
        console.info(
          "[TradeCoach] Fill fee sent to sync bridge.",
          {
            fillId: fillFee.fillId,
            totalFee: fillFee.totalFee,
            commission: fillFee.commission,
            feeComponents: fillFee.feeComponents,
            source,
          },
        );
      }
  
      return emitted;
    }
  
    function buildContractMetadata(contractId) {
      const normalizedId = safeString(contractId);
  
      if (!normalizedId) {
        return null;
      }
  
      const contract = contractsById.get(normalizedId);
  
      if (!contract) {
        return null;
      }
  
      const maturityId = safeString(
        contract.contractMaturityId,
      );
  
      const maturity = maturityId
        ? maturitiesById.get(maturityId)
        : null;
  
      const productId = safeString(
        maturity?.productId,
      );
  
      const product = productId
        ? productsById.get(productId)
        : null;
  
      if (!maturity || !product) {
        return null;
      }
  
      const metadata = {
        id: normalizedId,
        contractId: normalizedId,
        contractName: safeString(contract.name),
        symbol: safeString(contract.name),
        rootSymbol: safeString(product.name),
        contractMaturityId: maturityId,
        productId,
        productName: safeString(product.name),
        description: safeString(product.description),
        expirationMonth: safeNumber(
          maturity.expirationMonth,
        ),
        expirationDate: safeString(
          maturity.expirationDate,
        ),
        tickSize: firstNumber(
          product.tickSize,
          contract.providerTickSize,
        ),
        providerTickSize: safeNumber(
          contract.providerTickSize,
        ),
        valuePerPoint: safeNumber(
          product.valuePerPoint,
        ),
        productType: safeString(product.productType),
        exchangeId: safeString(product.exchangeId),
        capturedAt: new Date().toISOString(),
      };
  
      contractMetadataById.set(
        normalizedId,
        metadata,
      );
  
      contractResolutionById.set(
        normalizedId,
        {
          status: "resolved",
          updatedAt: new Date().toISOString(),
        },
      );
  
      const emitted = postBrokerEvent(
        "contract_metadata",
        metadata,
      );
  
      console.info(
        "[TradeCoach contract metadata resolved]",
        metadata,
      );
  
      if (emitted) {
        console.info(
          "[TradeCoach] Contract metadata sent to sync bridge.",
          {
            contractId: metadata.contractId,
            contractName: metadata.contractName,
            rootSymbol: metadata.rootSymbol,
            valuePerPoint: metadata.valuePerPoint,
          },
        );
      }
  
      return metadata;
    }
  
    function ensureContractResolution(
      contractId,
      preferredSocketId = null,
    ) {
      const normalizedId = safeString(contractId);
  
      if (!normalizedId) {
        return false;
      }
  
      if (contractMetadataById.has(normalizedId)) {
        return true;
      }
  
      const currentStatus = contractResolutionById.get(
        normalizedId,
      );
  
      if (
        currentStatus?.status === "requesting" &&
        currentStatus.updatedAt
      ) {
        const elapsed =
          Date.now() -
          new Date(currentStatus.updatedAt).getTime();
  
        if (elapsed < 15000) {
          return true;
        }
      }
  
      const socketEntry = getPreferredAccountSocket(
        preferredSocketId,
      );
  
      if (!socketEntry) {
        contractResolutionById.set(
          normalizedId,
          {
            status: "waiting_for_account_socket",
            updatedAt: new Date().toISOString(),
          },
        );
  
        console.warn(
          "[TradeCoach] No regular Tradovate account socket is available.",
          {
            contractId: normalizedId,
          },
        );
  
        return false;
      }
  
      contractResolutionById.set(
        normalizedId,
        {
          status: "requesting",
          socketId: socketEntry.socketId,
          socketUrl: socketEntry.socket.url,
          updatedAt: new Date().toISOString(),
        },
      );
  
      try {
        requestContract(
          socketEntry.socketId,
          normalizedId,
        );
  
        return true;
      } catch (error) {
        contractResolutionById.set(
          normalizedId,
          {
            status: "failed",
            error:
              error instanceof Error
                ? error.message
                : String(error),
            updatedAt: new Date().toISOString(),
          },
        );
  
        console.warn(
          "[TradeCoach] Contract lookup failed.",
          error,
        );
  
        return false;
      }
    }
  
    function handleMetadataResponse(
      socketId,
      request,
      payload,
    ) {
      const route = request.route;
  
      const contractId = safeString(
        request.context?.contractId,
      );
  
      if (route === "contract/item") {
        const contract = rememberContract(payload);
  
        const resolvedContractId = firstString(
          contract?.id,
          contractId,
        );
  
        const maturityId = safeString(
          contract?.contractMaturityId,
        );
  
        if (resolvedContractId && maturityId) {
          requestMaturity(
            socketId,
            resolvedContractId,
            maturityId,
          );
        }
  
        return;
      }
  
      if (route === "contractMaturity/item") {
        const maturity = rememberMaturity(payload);
        const productId = safeString(
          maturity?.productId,
        );
  
        if (contractId && productId) {
          requestProduct(
            socketId,
            contractId,
            productId,
          );
        }
  
        return;
      }
  
      if (route === "product/item") {
        rememberProduct(payload);
  
        if (contractId) {
          buildContractMetadata(contractId);
        }
      }
    }
  
    function handleFillFeeResponse(
      request,
      payload,
    ) {
      const requestedFillId = safeString(
        request.context?.fillId,
      );
  
      const fillFee = normalizeFillFee(payload);
  
      if (!fillFee) {
        console.info(
          "[TradeCoach] Fill fee is not available yet; later retries remain scheduled.",
          {
            fillId: requestedFillId,
            attempt: request.context?.attempt ?? null,
            payload,
          },
        );
  
        return;
      }
  
      emitFillFee(fillFee, "lookup");
    }
  
    function processPropsEvent(payload, socketId) {
      if (!payload || typeof payload !== "object") {
        return;
      }
  
      const entityType = String(
        payload.entityType || "",
      ).toLowerCase();
  
      const eventType = String(
        payload.eventType || "",
      ).toLowerCase();
  
      const entity =
        payload.entity &&
        typeof payload.entity === "object"
          ? payload.entity
          : null;
  
      saveDiagnostic(
        `props:${entityType}:${eventType}`,
        payload,
      );
  
      if (entityType === "order") {
        rememberOrder(entity);
        return;
      }
  
      if (entityType === "contract") {
        rememberContract(entity);
      }
  
      if (entityType === "contractmaturity") {
        rememberMaturity(entity);
      }
  
      if (entityType === "product") {
        rememberProduct(entity);
      }
  
      if (
        entityType === "fillfee" &&
        (
          eventType === "created" ||
          eventType === "updated"
        )
      ) {
        const fillFee = normalizeFillFee(entity);
  
        if (!fillFee) {
          return;
        }
  
        emitFillFee(fillFee, "live");
        return;
      }
  
      if (eventType !== "created") {
        return;
      }
  
      if (entityType === "fill") {
        const fill = normalizeFill(entity);
  
        if (!fill) {
          return;
        }
  
        postBrokerEvent("fill", fill);
  
        console.info(
          "[TradeCoach live fill]",
          fill,
        );
  
        if (fill.contractId) {
          ensureContractResolution(
            fill.contractId,
            socketId,
          );
        }
  
        // NEW: actively retrieve the exact fill fee, with delayed retries.
        scheduleFillFeeLookup(
          fill.id,
          socketId,
        );
  
        return;
      }
  
      if (entityType === "fillpair") {
        const pair = normalizeFillPair(entity);
  
        if (!pair) {
          return;
        }
  
        postBrokerEvent(
          "fill_pair",
          pair,
        );
  
        console.info(
          "[TradeCoach live fill pair]",
          pair,
        );
  
        // NEW: a pair confirms both sides. Recheck both IDs in case a live
        // fillFee event was missed for either the entry or exit.
        if (pair.buyFillId) {
          scheduleFillFeeLookup(
            pair.buyFillId,
            socketId,
          );
        }
  
        if (pair.sellFillId) {
          scheduleFillFeeLookup(
            pair.sellFillId,
            socketId,
          );
        }
      }
    }
  
    function processEnvelope(
      socketId,
      socketUrl,
      envelope,
    ) {
      if (Array.isArray(envelope)) {
        for (const item of envelope) {
          processEnvelope(
            socketId,
            socketUrl,
            item,
          );
        }
  
        return;
      }
  
      if (!envelope || typeof envelope !== "object") {
        return;
      }
  
      if (envelope.e === "props") {
        const payload = parseNestedJson(
          envelope.d ??
          envelope.data ??
          null,
        );
  
        processPropsEvent(
          payload,
          socketId,
        );
  
        return;
      }
  
      const requestId =
        envelope.i ??
        envelope.requestId ??
        null;
  
      const request = findRequest(
        socketId,
        requestId,
      );
  
      if (!request) {
        return;
      }
  
      forgetRequest(
        socketId,
        requestId,
      );
  
      const payload = parseNestedJson(
        envelope.d ??
        envelope.data ??
        null,
      );
  
      const status = Number(
        envelope.s ??
        envelope.status ??
        200,
      );
  
      if (
        request.tradeCoachRequest &&
        status >= 400
      ) {
        if (request.route === "fillFee/item") {
          console.info(
            "[TradeCoach] Fill-fee lookup did not return a fee yet.",
            {
              fillId: request.context?.fillId ?? null,
              attempt: request.context?.attempt ?? null,
              requestId,
              status,
              payload,
              socketUrl,
            },
          );
  
          // Do not cancel the other delayed retries.
          return;
        }
  
        const contractId = safeString(
          request.context?.contractId,
        );
  
        if (contractId) {
          contractResolutionById.set(
            contractId,
            {
              status: "failed",
              statusCode: status,
              payload,
              updatedAt: new Date().toISOString(),
            },
          );
        }
  
        console.warn(
          "[TradeCoach API request failed]",
          {
            route: request.route,
            requestId,
            status,
            payload,
            socketUrl,
          },
        );
  
        return;
      }
  
      if (
        request.tradeCoachRequest &&
        request.route === "fillFee/item"
      ) {
        handleFillFeeResponse(
          request,
          payload,
        );
  
        return;
      }
  
      if (
        request.tradeCoachRequest &&
        (
          request.route === "contract/item" ||
          request.route ===
            "contractMaturity/item" ||
          request.route === "product/item"
        )
      ) {
        console.info(
          "[TradeCoach contract response]",
          {
            route: request.route,
            requestId,
            socketUrl,
            payload,
          },
        );
  
        handleMetadataResponse(
          socketId,
          request,
          payload,
        );
      }
    }
  
    function attachSocketMonitor(socket, socketId) {
      const nativeSend = socket.send.bind(socket);
  
      socketsById.set(socketId, socket);
      nativeSendBySocketId.set(
        socketId,
        nativeSend,
      );
  
      socket.send = function (data) {
        if (typeof data === "string") {
          const request = parseOutgoingRequest(data);
  
          if (request) {
            rememberRequest(
              socketId,
              request,
            );
          }
        }
  
        return nativeSend(data);
      };
  
      socket.addEventListener(
        "message",
        async (event) => {
          const text = await socketDataToText(
            event.data,
          );
  
          if (!text) {
            return;
          }
  
          const messages = decodeSocketMessages(text);
  
          for (const message of messages) {
            processEnvelope(
              socketId,
              socket.url,
              message,
            );
          }
        },
      );
  
      socket.addEventListener(
        "close",
        () => {
          socketsById.delete(socketId);
          nativeSendBySocketId.delete(socketId);
        },
      );
  
      console.info(
        "[TradeCoach] Monitoring Tradovate socket.",
        {
          socketId,
          socketUrl: socket.url,
          socketType: getSocketDetails(socket),
        },
      );
    }
  
    const WrappedWebSocket = new Proxy(
      NativeWebSocket,
      {
        construct(Target, argumentsList) {
          const socket = Reflect.construct(
            Target,
            argumentsList,
          );
  
          socketCounter += 1;
  
          attachSocketMonitor(
            socket,
            socketCounter,
          );
  
          return socket;
        },
      },
    );
  
    window.WebSocket = WrappedWebSocket;
  
    window.__TRADECOACH_DIAGNOSTICS__ =
      diagnostics;
  
    window.__TRADECOACH_ORDERS__ =
      ordersById;
  
    window.__TRADECOACH_CONTRACTS__ =
      contractsById;
  
    window.__TRADECOACH_MATURITIES__ =
      maturitiesById;
  
    window.__TRADECOACH_PRODUCTS__ =
      productsById;
  
    window.__TRADECOACH_CONTRACT_METADATA__ =
      contractMetadataById;
  
    window.__TRADECOACH_FILL_FEES__ =
      fillFeesById;
  
    window.__TRADECOACH_FILL_FEE_RETRIES__ =
      fillFeeRetryTimersById;
  
    window.tradeCoachResolveContract =
      (contractId) =>
        ensureContractResolution(contractId);
  
    window.tradeCoachRequestFillFee =
      (fillId) => {
        clearFillFeeRetries(fillId);
        return scheduleFillFeeLookup(fillId);
      };
  
    window.tradeCoachFillFeeStatus =
      (fillId) => {
        const normalizedId = safeString(fillId);
  
        const result = {
          fillId: normalizedId,
          fee:
            normalizedId
              ? fillFeesById.get(normalizedId) || null
              : null,
          retrying:
            normalizedId
              ? fillFeeRetryTimersById.has(normalizedId)
              : false,
        };
  
        console.log(
          JSON.stringify(
            result,
            null,
            2,
          ),
        );
  
        return result;
      };
  
    window.tradeCoachContractMetadata =
      (contractId = null) => {
        if (contractId !== null) {
          const result =
            contractMetadataById.get(
              String(contractId),
            ) || null;
  
          console.log(
            JSON.stringify(
              result,
              null,
              2,
            ),
          );
  
          return result;
        }
  
        const results = Array.from(
          contractMetadataById.values(),
        );
  
        console.log(
          JSON.stringify(
            results,
            null,
            2,
          ),
        );
  
        return results;
      };
  
    window.tradeCoachContractStatus =
      (contractId) => {
        const result =
          contractResolutionById.get(
            String(contractId),
          ) || null;
  
        console.log(
          JSON.stringify(
            result,
            null,
            2,
          ),
        );
  
        return result;
      };
  
    window.tradeCoachLatestFill = () => {
      console.log(
        JSON.stringify(
          latestFill,
          null,
          2,
        ),
      );
  
      return latestFill;
    };
  
    window.tradeCoachLatestFillPair = () => {
      console.log(
        JSON.stringify(
          latestFillPair,
          null,
          2,
        ),
      );
  
      return latestFillPair;
    };
  
    window.tradeCoachLatestFillFee = () => {
      console.log(
        JSON.stringify(
          latestFillFee,
          null,
          2,
        ),
      );
  
      return latestFillFee;
    };
  
    window.tradeCoachFillFees = () => {
      const fees = Array.from(
        fillFeesById.values(),
      );
  
      console.log(
        JSON.stringify(
          fees,
          null,
          2,
        ),
      );
  
      return fees;
    };
  
    window.tradeCoachDump = () => {
      console.table(
        diagnostics.map(
          (event, index) => ({
            number: index + 1,
            route: event.route,
          }),
        ),
      );
  
      return diagnostics;
    };
  
    window.tradeCoachClear = () => {
      diagnostics.length = 0;
  
      console.info(
        "[TradeCoach] Diagnostics cleared.",
      );
  
      return true;
    };
  
    console.info(
      "[TradeCoach] Fill, fill-pair, automatic fill-fee lookup, and contract metadata bridge active.",
    );
  })();