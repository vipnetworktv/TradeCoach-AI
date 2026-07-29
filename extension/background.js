importScripts("config.js");

const API_URL = TRADECOACH_CONFIG.API_URL;
const APP_URL = TRADECOACH_CONFIG.APP_URL;

const FLUSH_ALARM_NAME =
  "tradecoach-flush-events";

const BROKER_SCAN_ALARM_NAME =
  "tradecoach-scan-brokers";

const MAX_PENDING_EVENTS = 3000;
const MAX_EVENTS_PER_BATCH = 100;

const DEFAULT_STATE = {
  tradovateDetected: false,
  ninjatraderDetected: false,
  tradingviewDetected: false,
  lastSeenAt: null,
  tradovateLastSeenAt: null,
  ninjatraderLastSeenAt: null,
  tradingviewLastSeenAt: null,
  tradovateUrl: null,
  ninjatraderUrl: null,
  tradingviewUrl: null,
  syncEnabled: true,

  paired: false,
  deviceId: null,
  deviceToken: null,
  deviceName: null,
  pairedAt: null,

  lastDeviceCheckAt: null,
  lastDeviceConnected: false,
  lastDeviceError: null,
  lastSuccessfulSyncAt: null,
  lastTestEventAt: null,

  pendingBrokerEvents: [],

  totalLiveFillsDetected: 0,
  totalFillPairsDetected: 0,
  totalFillFeesDetected: 0,
  totalContractMetadataDetected: 0,
  totalCompletedTradesDetected: 0,

  lastFillDetectedAt: null,
  lastFillPairDetectedAt: null,
  lastFillFeeDetectedAt: null,
  lastContractMetadataAt: null,
  lastCompletedTradeDetectedAt: null,

  activeTradingProfileId: null,
  activeTradingProfileName: null,
};

let activeFlushPromise = null;

async function getStoredState() {
  const stored =
    await chrome.storage.local.get([
      ...Object.keys(DEFAULT_STATE),
      "lastBrokerScanAt",
      "lastBrokerScanFound",
      "lastBrokerScanTabCount",
    ]);

  const merged = {
    ...DEFAULT_STATE,
    ...stored,
  };

  if (
    merged.paired &&
    merged.lastDeviceConnected !== false &&
    merged.lastDeviceCheckAt &&
    !merged.lastDeviceError
  ) {
    merged.lastDeviceConnected = true;
  }

  return merged;
}

function getPublicState(state) {
  const pendingEvents =
    Array.isArray(
      state.pendingBrokerEvents,
    )
      ? state.pendingBrokerEvents
      : [];

  return {
    tradovateDetected:
      state.tradovateDetected,

    ninjatraderDetected:
      state.ninjatraderDetected,

    tradingviewDetected:
      state.tradingviewDetected,

    lastSeenAt:
      state.lastSeenAt,

    tradovateLastSeenAt:
      state.tradovateLastSeenAt,

    ninjatraderLastSeenAt:
      state.ninjatraderLastSeenAt,

    tradingviewLastSeenAt:
      state.tradingviewLastSeenAt,

    tradovateUrl:
      state.tradovateUrl,

    ninjatraderUrl:
      state.ninjatraderUrl,

    tradingviewUrl:
      state.tradingviewUrl,

    syncEnabled:
      state.syncEnabled,

    paired:
      state.paired,

    deviceId:
      state.deviceId,

    deviceName:
      state.deviceName,

    pairedAt:
      state.pairedAt,

    lastDeviceCheckAt:
      state.lastDeviceCheckAt,

    lastDeviceConnected:
      state.lastDeviceConnected === true,

    lastDeviceError:
      state.lastDeviceError,

    lastSuccessfulSyncAt:
      state.lastSuccessfulSyncAt,

    lastTestEventAt:
      state.lastTestEventAt,

    lastBrokerScanFound:
      state.lastBrokerScanFound || null,

    pendingEventCount:
      pendingEvents.length,

    totalLiveFillsDetected:
      state.totalLiveFillsDetected,

    totalFillPairsDetected:
      state.totalFillPairsDetected,

    totalFillFeesDetected:
      state.totalFillFeesDetected,

    totalContractMetadataDetected:
      state.totalContractMetadataDetected,

    totalCompletedTradesDetected:
      state.totalCompletedTradesDetected,

    lastFillDetectedAt:
      state.lastFillDetectedAt,

    lastFillPairDetectedAt:
      state.lastFillPairDetectedAt,

    lastFillFeeDetectedAt:
      state.lastFillFeeDetectedAt,

    lastContractMetadataAt:
      state.lastContractMetadataAt,

    lastCompletedTradeDetectedAt:
      state.lastCompletedTradeDetectedAt,
  };
}

async function readJsonResponse(
  response,
) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function humanizeSyncError(message) {
  const text = String(message || "").trim();

  if (
    text.includes("tradovate") &&
    text.includes("ninjatrader") &&
    !text.includes("tradingview")
  ) {
    return (
      "Your TradeCoach API server is outdated and does not accept TradingView sync yet. " +
      "On your VPS run: git pull && bash scripts/deploy-vps.sh — then click Sync pending trades in the extension popup."
    );
  }

  return text;
}

function uniqueMessages(messages) {
  return [
    ...new Set(
      messages.filter(
        (message) =>
          typeof message === "string" &&
          message.trim(),
      ),
    ),
  ];
}

function summarizeApiErrorMessages(messages) {
  const unique = uniqueMessages(messages);

  if (unique.length === 0) {
    return null;
  }

  if (unique.length === 1) {
    return unique[0];
  }

  return `${unique[0]} (${unique.length - 1} more similar error${unique.length === 2 ? "" : "s"})`;
}

function getApiErrorMessage(
  data,
  fallback,
) {
  if (
    typeof data?.detail === "string"
  ) {
    return humanizeSyncError(data.detail);
  }

  if (
    Array.isArray(data?.detail)
  ) {
    const summary = summarizeApiErrorMessages(
      data.detail.map((item) =>
        typeof item?.msg === "string"
          ? item.msg
          : "Invalid request value.",
      ),
    );

    return (
      humanizeSyncError(summary) || fallback
    );
  }

  if (
    Array.isArray(
      data?.processing_errors,
    ) &&
    data.processing_errors.length > 0
  ) {
    const summary = summarizeApiErrorMessages(
      data.processing_errors.map((item) =>
        typeof item?.error === "string"
          ? item.error
          : "The event could not be processed.",
      ),
    );

    return (
      humanizeSyncError(summary) || fallback
    );
  }

  if (
    typeof data?.message === "string"
  ) {
    return humanizeSyncError(data.message);
  }

  return fallback;
}

async function clearInvalidPairing(
  message,
) {
  await chrome.storage.local.set({
    paired: false,
    deviceId: null,
    deviceToken: null,
    deviceName: null,
    pairedAt: null,

    lastDeviceCheckAt:
      new Date().toISOString(),

    lastDeviceError:
      message ||
      "This device connection is no longer valid.",
  });
}

async function pairDevice(code) {
  const normalizedCode =
    String(code || "")
      .toUpperCase()
      .replace(
        /[^A-Z0-9]/g,
        "",
      );

  if (
    normalizedCode.length !== 8
  ) {
    throw new Error(
      "Enter the complete eight-character pairing code.",
    );
  }

  const formattedCode =
    `${normalizedCode.slice(
      0,
      4,
    )}-` +
    normalizedCode.slice(4);

  let response;

  try {
    response = await fetch(
      `${APP_URL}/api/sync/pair`,
      {
        method: "POST",

        headers: {
          Accept:
            "application/json",

          "Content-Type":
            "application/json",
        },

        body: JSON.stringify({
          code: formattedCode,

          device_name:
            "TradeCoach Sync",

          browser:
            navigator.userAgent.slice(
              0,
              500,
            ),

          extension_version:
            chrome.runtime
              .getManifest()
              .version,
        }),
      },
    );
  } catch {
    throw new Error(
      "The TradeCoach backend could not be reached.",
    );
  }

  const data =
    await readJsonResponse(
      response,
    );

  if (!response.ok) {
    throw new Error(
      getApiErrorMessage(
        data,
        `Pairing failed with status ${response.status}.`,
      ),
    );
  }

  if (
    !data.device_token ||
    !data.device_id
  ) {
    throw new Error(
      "TradeCoach did not return a valid device connection.",
    );
  }

  const pairedAt =
    new Date().toISOString();

  await chrome.storage.local.set({
    paired: true,

    deviceId:
      data.device_id,

    deviceToken:
      data.device_token,

    deviceName:
      "TradeCoach Sync",

    pairedAt,

    lastDeviceCheckAt:
      pairedAt,

    lastDeviceConnected: true,

    lastDeviceError: null,
  });

  await flushPendingEvents();

  return {
    success: true,

    deviceId:
      data.device_id,

    message:
      data.message ||
      "TradeCoach Sync was paired successfully.",
  };
}

async function checkDeviceStatus(options = {}) {
  const skipFlush = options.skipFlush === true;
  const state =
    await getStoredState();

  if (!state.deviceToken) {
    return {
      connected: false,
      paired: false,

      message:
        "This extension has not been paired.",
    };
  }

  let response;

  try {
    response = await fetch(
      `${API_URL}/api/sync/device/status`,
      {
        headers: {
          Accept:
            "application/json",

          Authorization:
            `Bearer ${state.deviceToken}`,
        },
      },
    );
  } catch {
    await chrome.storage.local.set({
      lastDeviceCheckAt:
        new Date().toISOString(),
      lastDeviceConnected: false,
    });

    return {
      connected: false,
      paired: true,

      temporarilyOffline: true,

      message:
        "Paired, but the backend is unavailable.",
    };
  }

  const data =
    await readJsonResponse(
      response,
    );

  if (response.status === 401) {
    const message =
      getApiErrorMessage(
        data,
        "This pairing is no longer valid.",
      );

    await clearInvalidPairing(
      message,
    );

    return {
      connected: false,
      paired: false,
      message,
    };
  }

  if (!response.ok) {
    throw new Error(
      getApiErrorMessage(
        data,
        `Connection check failed with status ${response.status}.`,
      ),
    );
  }

  await chrome.storage.local.set({
    paired: true,

    deviceId:
      data.device_id,

    deviceName:
      data.device_name ||
      "TradeCoach Sync",

    lastDeviceCheckAt:
      new Date().toISOString(),

    lastDeviceConnected: true,

    lastDeviceError: null,

    lastSuccessfulSyncAt:
      data.last_successful_sync_at ||
      null,

    activeTradingProfileId:
      data.active_trading_profile_id ||
      null,

    activeTradingProfileName:
      data.active_trading_profile_name ||
      null,
  });

  if (!skipFlush) {
    await flushPendingEvents();
  }

  return {
    connected: true,
    paired: true,

    deviceId:
      data.device_id,

    deviceName:
      data.device_name,

    lastSuccessfulSyncAt:
      data.last_successful_sync_at,

    lastSyncedFillId:
      data.last_synced_fill_id,

    message:
      "TradeCoach Sync is connected.",
  };
}

async function sendBrokerEvents(events) {
  const state =
    await getStoredState();

  if (
    !state.paired ||
    !state.deviceToken
  ) {
    throw new Error(
      "TradeCoach Sync is not paired.",
    );
  }

  let response;

  try {
    response = await fetch(
      `${API_URL}/api/sync/events`,
      {
        method: "POST",

        headers: {
          Accept:
            "application/json",

          "Content-Type":
            "application/json",

          Authorization:
            `Bearer ${state.deviceToken}`,
        },

        body: JSON.stringify({
          events,
        }),
      },
    );
  } catch {
    throw new Error(
      "The TradeCoach backend could not be reached.",
    );
  }

  const data =
    await readJsonResponse(
      response,
    );

  if (response.status === 401) {
    const message =
      getApiErrorMessage(
        data,
        "The device pairing is no longer valid.",
      );

    await clearInvalidPairing(
      message,
    );

    throw new Error(message);
  }

  if (!response.ok) {
    throw new Error(
      getApiErrorMessage(
        data,
        `The backend rejected the events with status ${response.status}.`,
      ),
    );
  }

  if (data?.success === false) {
    throw new Error(
      getApiErrorMessage(
        data,
        "The backend saved the events but could not process them.",
      ),
    );
  }

  await chrome.storage.local.set({
    lastSuccessfulSyncAt:
      new Date().toISOString(),

    lastDeviceError: null,
  });

  return data;
}

function getEventKey(event) {
  return [
    event.broker ||
      "tradovate",

    event.event_type ||
      "unknown",

    event.broker_event_id ||
      "",
  ].join(":");
}

async function queueBrokerEvent(
  brokerEvent,
) {
  const state =
    await getStoredState();

  const pendingEvents =
    Array.isArray(
      state.pendingBrokerEvents,
    )
      ? [
          ...state.pendingBrokerEvents,
        ]
      : [];

  const eventKey =
    getEventKey(brokerEvent);

  const alreadyQueued =
    pendingEvents.some(
      (event) =>
        getEventKey(event) ===
        eventKey,
    );

  if (!alreadyQueued) {
    pendingEvents.push(
      brokerEvent,
    );
  }

  while (
    pendingEvents.length >
    MAX_PENDING_EVENTS
  ) {
    pendingEvents.shift();
  }

  await chrome.storage.local.set({
    pendingBrokerEvents:
      pendingEvents,
  });

  return {
    added:
      !alreadyQueued,

    pendingCount:
      pendingEvents.length,
  };
}

async function performFlush() {
  let totalSynced = 0;

  for (
    let attempt = 0;
    attempt < 30;
    attempt += 1
  ) {
    const state =
      await getStoredState();

    const pendingEvents =
      Array.isArray(
        state.pendingBrokerEvents,
      )
        ? state.pendingBrokerEvents
        : [];

    if (
      pendingEvents.length === 0
    ) {
      return {
        success: true,

        syncedCount:
          totalSynced,

        pendingCount: 0,
      };
    }

    if (
      !state.paired ||
      !state.deviceToken
    ) {
      const message =
        "TradeCoach Sync is not paired. Open TradeCoach → Connect TradingView, copy the code, then enter it in this extension popup.";

      await chrome.storage.local.set({
        lastDeviceError: message,
      });

      return {
        success: false,
        paired: false,
        error: message,
        syncedCount: totalSynced,
        pendingCount: pendingEvents.length,
      };
    }

    const batch =
      pendingEvents.slice(
        0,
        MAX_EVENTS_PER_BATCH,
      );

    try {
      await sendBrokerEvents(
        batch,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Events could not be synced.";

      await chrome.storage.local.set({
        lastDeviceError:
          message,
      });

      return {
        success: false,

        syncedCount:
          totalSynced,

        pendingCount:
          pendingEvents.length,

        error: message,
      };
    }

    const sentKeys =
      new Set(
        batch.map(
          getEventKey,
        ),
      );

    const latestState =
      await getStoredState();

    const latestPending =
      Array.isArray(
        latestState
          .pendingBrokerEvents,
      )
        ? latestState
            .pendingBrokerEvents
        : [];

    const remaining =
      latestPending.filter(
        (event) =>
          !sentKeys.has(
            getEventKey(event),
          ),
      );

    totalSynced +=
      batch.length;

    await chrome.storage.local.set({
      pendingBrokerEvents:
        remaining,

      lastSuccessfulSyncAt:
        new Date().toISOString(),

      lastDeviceError: null,
    });
  }

  const state =
    await getStoredState();

  return {
    success: true,

    syncedCount:
      totalSynced,

    pendingCount:
      Array.isArray(
        state.pendingBrokerEvents,
      )
        ? state.pendingBrokerEvents.length
        : 0,
  };
}

function flushPendingEvents() {
  if (activeFlushPromise) {
    return activeFlushPromise;
  }

  activeFlushPromise =
    performFlush().finally(() => {
      activeFlushPromise = null;
    });

  return activeFlushPromise;
}

async function registerBrokerSession(
  broker,
  pageUrl,
) {
  const state = await getStoredState();

  if (
    !state.paired ||
    !state.deviceToken
  ) {
    return {
      success: false,
      skipped: true,
    };
  }

  try {
    const response = await fetch(
      `${API_URL}/api/sync/broker-session`,
      {
        method: "POST",

        headers: {
          Accept:
            "application/json",

          "Content-Type":
            "application/json",

          Authorization:
            `Bearer ${state.deviceToken}`,
        },

        body: JSON.stringify({
          broker,
          page_url:
            pageUrl || null,
        }),
      },
    );

    const data =
      await readJsonResponse(
        response,
      );

    if (!response.ok) {
      return {
        success: false,

        error:
          getApiErrorMessage(
            data,
            "Broker session could not be saved.",
          ),
      };
    }

    return {
      success: true,
      ...data,
    };
  } catch (error) {
    return {
      success: false,

      error:
        error instanceof Error
          ? error.message
          : "Broker session could not be saved.",
    };
  }
}

function hostnameMatchesBroker(hostname, broker) {
  const normalized = String(hostname || "").toLowerCase();

  if (broker === "ninjatrader") {
    return normalized.includes("ninjatrader");
  }

  if (broker === "tradingview") {
    return normalized.includes("tradingview");
  }

  return normalized.includes("tradovate");
}

function isBrokerSignInPage(pageUrl, pageTitle) {
  const haystack = [
    pageUrl,
    pageTitle,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (!haystack) {
    return false;
  }

  const signInPatterns = [
    /\b(sign in|log in|login|authenticate|create account|register)\b/,
    /\/(login|signin|sign-in|auth|welcome|sso)(\/|$|\?)/,
    /\/account\/login/,
  ];

  return signInPatterns.some((pattern) =>
    pattern.test(haystack),
  );
}

async function isTabSignedInToBroker(tab) {
  if (!tab?.id || !tab?.url?.startsWith("http")) {
    return false;
  }

  if (
    isBrokerSignInPage(
      tab.url || tab.pendingUrl,
      tab.title,
    )
  ) {
    return false;
  }

  try {
    const [result] =
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const title =
            document.title.toLowerCase();
          const path =
            window.location.pathname.toLowerCase();

          if (
            /\b(sign in|log in|login|authenticate)\b/.test(
              title,
            )
          ) {
            return false;
          }

          if (
            /\/(login|signin|sign-in|auth|welcome|sso)(\/|$|\?)/.test(
              path,
            )
          ) {
            return false;
          }

          const passwordField =
            document.querySelector(
              'input[type="password"]',
            );

          const tradingUi =
            document.querySelector(
              'canvas, [class*="chart" i], [class*="order" i], [class*="trade" i], [class*="position" i], [data-testid*="trade" i]',
            );

          if (
            passwordField &&
            !tradingUi
          ) {
            return false;
          }

          return true;
        },
      });

    return Boolean(result?.result);
  } catch {
    return !isBrokerSignInPage(
      tab.url || tab.pendingUrl,
      tab.title,
    );
  }
}

function tabMatchesBroker(tab, broker) {
  if (!tab) {
    return false;
  }

  const haystack = [
    tab.url,
    tab.pendingUrl,
    tab.title,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (broker === "ninjatrader") {
    return (
      haystack.includes("ninjatrader") ||
      haystack.includes("ninja trader")
    );
  }

  if (broker === "tradingview") {
    return haystack.includes("tradingview");
  }

  return haystack.includes("tradovate");
}

async function resolveTabHaystack(tab) {
  const parts = [
    tab?.url,
    tab?.pendingUrl,
    tab?.title,
  ].filter(Boolean);

  if (
    tab?.id &&
    tab?.url?.startsWith("http") &&
    !tab?.title
  ) {
    try {
      const [result] =
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => document.title,
        });

      if (result?.result) {
        parts.push(result.result);
      }
    } catch {
      // Ignore tabs we cannot script into.
    }
  }

  return parts.join(" ").toLowerCase();
}

async function tabMatchesBrokerAsync(tab, broker) {
  if (!tab) {
    return false;
  }

  const haystack =
    await resolveTabHaystack(tab);

  if (broker === "ninjatrader") {
    return (
      haystack.includes("ninjatrader") ||
      haystack.includes("ninja trader")
    );
  }

  if (broker === "tradingview") {
    return haystack.includes("tradingview");
  }

  return haystack.includes("tradovate");
}

async function handleBrokerTabCandidate(tab) {
  if (!tab?.id) {
    return null;
  }

  let broker = null;

  if (await tabMatchesBrokerAsync(tab, "ninjatrader")) {
    broker = "ninjatrader";
  } else if (await tabMatchesBrokerAsync(tab, "tradingview")) {
    broker = "tradingview";
  } else if (
    await tabMatchesBrokerAsync(tab, "tradovate")
  ) {
    broker = "tradovate";
  } else {
    return null;
  }

  if (!(await isTabSignedInToBroker(tab))) {
    return null;
  }

  await markBrokerDetected(
    broker,
    tab.url || tab.pendingUrl,
  );

  await registerBrokerSession(
    broker,
    tab.url || tab.pendingUrl,
  );

  await injectBrokerScripts(tab.id, broker);

  return {
    broker,
    url:
      tab.url ||
      tab.pendingUrl ||
      tab.title,
  };
}

async function detectBrokerFromActiveTab() {
  const [activeTab] =
    await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });

  if (!activeTab?.id) {
    return null;
  }

  return handleBrokerTabCandidate(activeTab);
}

async function listCandidateTabs() {
  const windows =
    await chrome.windows.getAll({
      populate: true,
    });

  const tabs = [];

  for (const window of windows) {
    if (!Array.isArray(window.tabs)) {
      continue;
    }

    tabs.push(...window.tabs);
  }

  if (tabs.length > 0) {
    return tabs;
  }

  return chrome.tabs.query({});
}

async function markBrokerDetected(
  broker,
  pageUrl,
) {
  const now = new Date().toISOString();

  if (broker === "ninjatrader") {
    await chrome.storage.local.set({
      ninjatraderDetected: true,
      ninjatraderLastSeenAt: now,
      lastSeenAt: now,
      ninjatraderUrl: pageUrl || null,
    });

    return;
  }

  if (broker === "tradingview") {
    await chrome.storage.local.set({
      tradingviewDetected: true,
      tradingviewLastSeenAt: now,
      lastSeenAt: now,
      tradingviewUrl: pageUrl || null,
    });

    return;
  }

  await chrome.storage.local.set({
    tradovateDetected: true,
    tradovateLastSeenAt: now,
    lastSeenAt: now,
    tradovateUrl: pageUrl || null,
  });
}

async function clearBrokerDetection(broker) {
  if (broker === "ninjatrader") {
    await chrome.storage.local.set({
      ninjatraderDetected: false,
      ninjatraderLastSeenAt: null,
      ninjatraderUrl: null,
    });

    return;
  }

  if (broker === "tradingview") {
    await chrome.storage.local.set({
      tradingviewDetected: false,
      tradingviewLastSeenAt: null,
      tradingviewUrl: null,
    });

    return;
  }

  await chrome.storage.local.set({
    tradovateDetected: false,
    tradovateLastSeenAt: null,
    tradovateUrl: null,
  });
}

async function injectBrokerScripts(tabId, broker = "tradovate") {
  const bridgeFile =
    broker === "ninjatrader"
      ? "page-bridge-ninjatrader.js"
      : broker === "tradingview"
        ? "page-bridge-tradingview.js"
        : "page-bridge.js";

  const target =
    broker === "tradingview"
      ? { tabId, allFrames: true }
      : { tabId };

  try {
    await chrome.scripting.executeScript({
      target,
      files: [bridgeFile],
      world: "MAIN",
    });
  } catch {
    // Bridge may already be present.
  }

  if (broker !== "tradingview") {
    try {
      await chrome.scripting.executeScript({
        target,
        files: ["content.js"],
      });
    } catch {
      // Content script may already be present.
    }
  }
}

function getTradeCoachAppHostnames() {
  const hosts = new Set(["localhost", "127.0.0.1"]);

  try {
    hosts.add(
      new URL(APP_URL).hostname.toLowerCase(),
    );
  } catch {
    // Ignore invalid APP_URL.
  }

  for (const host of TRADECOACH_CONFIG.APP_HOSTS || []) {
    if (host) {
      hosts.add(String(host).toLowerCase());
    }
  }

  return hosts;
}

function isTradeCoachAppUrl(pageUrl) {
  if (!pageUrl) {
    return false;
  }

  try {
    const url = new URL(pageUrl);
    const host = url.hostname.toLowerCase();

    return (
      getTradeCoachAppHostnames().has(host) ||
      host.endsWith(".localhost")
    );
  } catch {
    return false;
  }
}

async function ensureTradeCoachBridge(tab) {
  if (!tab?.id || !isTradeCoachAppUrl(tab.url)) {
    return false;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["tradecoach-connect.js"],
    });

    return true;
  } catch {
    return false;
  }
}

async function forceBrokerTab(
  broker,
  tabId,
  pageUrl,
) {
  if (!tabId) {
    throw new Error(
      "No browser tab was provided.",
    );
  }

  let tab;

  try {
    tab = await chrome.tabs.get(tabId);
  } catch {
    throw new Error(
      "That browser tab is no longer available.",
    );
  }

  if (!(await isTabSignedInToBroker(tab))) {
    throw new Error(
      "That tab is still on a sign-in page. Finish signing in before connecting it.",
    );
  }

  const resolvedUrl =
    pageUrl ||
    tab.url ||
    tab.pendingUrl ||
    tab.title ||
    null;

  await markBrokerDetected(
    broker,
    resolvedUrl,
  );

  await registerBrokerSession(
    broker,
    tab.url || tab.pendingUrl || pageUrl,
  );

  await injectBrokerScripts(tabId, broker);

  return {
    broker,
    url: resolvedUrl,
    title: tab.title || null,
  };
}

async function refreshBrokerDetectionFromTabs() {
  const activeMatch =
    await detectBrokerFromActiveTab();

  const tabs = await listCandidateTabs();
  const found = {
    tradovate:
      activeMatch?.broker === "tradovate"
        ? activeMatch.url
        : null,
    ninjatrader:
      activeMatch?.broker === "ninjatrader"
        ? activeMatch.url
        : null,
    tradingview:
      activeMatch?.broker === "tradingview"
        ? activeMatch.url
        : null,
  };

  for (const tab of tabs) {
    if (!tab.id) {
      continue;
    }

    if (
      !found.tradovate &&
      (await tabMatchesBrokerAsync(tab, "tradovate"))
    ) {
      const match =
        await handleBrokerTabCandidate(tab);

      if (match?.broker === "tradovate") {
        found.tradovate = match.url || "tradovate-tab";
      }
    }

    if (
      !found.ninjatrader &&
      (await tabMatchesBrokerAsync(tab, "ninjatrader"))
    ) {
      const match =
        await handleBrokerTabCandidate(tab);

      if (match?.broker === "ninjatrader") {
        found.ninjatrader =
          match.url || "ninjatrader-tab";
      }
    }

    if (
      !found.tradingview &&
      (await tabMatchesBrokerAsync(tab, "tradingview"))
    ) {
      const match =
        await handleBrokerTabCandidate(tab);

      if (match?.broker === "tradingview") {
        found.tradingview =
          match.url || "tradingview-tab";
      }
    }
  }

  if (!found.tradovate) {
    await clearBrokerDetection("tradovate");
  }

  if (!found.ninjatrader) {
    await clearBrokerDetection("ninjatrader");
  }

  if (!found.tradingview) {
    await clearBrokerDetection("tradingview");
  }

  await chrome.storage.local.set({
    lastBrokerScanAt: new Date().toISOString(),
    lastBrokerScanFound: found,
    lastBrokerScanTabCount: tabs.length,
  });

  for (const tab of tabs) {
    await ensureTradeCoachBridge(tab);
  }

  return found;
}

function createFillEvent(
  fill,
  metadata,
  broker = "tradovate",
) {
  return {
    broker,
    event_type: "fill",

    broker_event_id:
      String(fill.id),

    account_external_id:
      fill.accountId
        ? String(fill.accountId)
        : null,

    symbol: null,

    occurred_at:
      fill.timestamp ||
      metadata.detectedAt ||
      new Date().toISOString(),

    source: "live",

    payload: {
      fill_id:
        String(fill.id),

      order_id:
        fill.orderId
          ? String(fill.orderId)
          : null,

      contract_id:
        fill.contractId
          ? String(
              fill.contractId,
            )
          : null,

      account_id:
        fill.accountId
          ? String(
              fill.accountId,
            )
          : null,

      timestamp:
        fill.timestamp,

      trade_date:
        fill.tradeDate || null,

      action:
        fill.action,

      qty:
        fill.qty,

      price:
        fill.price,

      active:
        fill.active,

      finally_paired:
        fill.finallyPaired,

      external:
        fill.external,

      page_url:
        metadata.pageUrl || null,

      detected_at:
        metadata.detectedAt ||
        new Date().toISOString(),
    },
  };
}

function createFillPairEvent(
  pair,
  metadata,
  broker = "tradovate",
) {
  return {
    broker,
    event_type: "fill_pair",

    broker_event_id:
      String(pair.id),

    account_external_id: null,
    symbol: null,

    occurred_at:
      metadata.detectedAt ||
      new Date().toISOString(),

    source: "live",

    payload: {
      pair_id:
        String(pair.id),

      position_id:
        pair.positionId
          ? String(pair.positionId)
          : null,

      buy_fill_id:
        pair.buyFillId
          ? String(pair.buyFillId)
          : null,

      sell_fill_id:
        pair.sellFillId
          ? String(pair.sellFillId)
          : null,

      qty:
        pair.qty,

      buy_price:
        pair.buyPrice,

      sell_price:
        pair.sellPrice,

      active:
        pair.active,

      archived:
        pair.archived,

      page_url:
        metadata.pageUrl || null,

      detected_at:
        metadata.detectedAt ||
        new Date().toISOString(),
    },
  };
}

function createFillFeeEvent(
  fee,
  metadata,
  broker = "tradovate",
) {
  const fillId =
    String(fee.fillId);

  return {
    broker,

    event_type:
      "fill_fee",

    broker_event_id:
      `fill_fee:${fillId}`,

    account_external_id: null,
    symbol: null,

    occurred_at:
      fee.capturedAt ||
      metadata.detectedAt ||
      new Date().toISOString(),

    source: "live",

    payload: {
      fee_id:
        String(fee.id),

      fill_id:
        fillId,

      clearing_fee:
        fee.clearingFee,

      clearing_currency_id:
        fee.clearingCurrencyId,

      exchange_fee:
        fee.exchangeFee,

      exchange_currency_id:
        fee.exchangeCurrencyId,

      nfa_fee:
        fee.nfaFee,

      nfa_currency_id:
        fee.nfaCurrencyId,

      commission:
        fee.commission,

      commission_currency_id:
        fee.commissionCurrencyId,

      brokerage_fee:
        fee.brokerageFee,

      brokerage_currency_id:
        fee.brokerageCurrencyId,

      ip_fee:
        fee.ipFee,

      ip_currency_id:
        fee.ipCurrencyId,

      routing_fee:
        fee.routingFee,

      routing_currency_id:
        fee.routingCurrencyId,

      fee_components:
        fee.feeComponents || {},

      total_fee:
        fee.totalFee,

      captured_at:
        fee.capturedAt,

      page_url:
        metadata.pageUrl || null,

      detected_at:
        metadata.detectedAt ||
        new Date().toISOString(),
    },
  };
}

function createContractMetadataEvent(
  contract,
  metadata,
  broker = "tradovate",
) {
  return {
    broker,

    event_type:
      "contract_metadata",

    broker_event_id:
      `contract_metadata:${contract.contractId}`,

    account_external_id: null,

    symbol:
      contract.rootSymbol ||
      contract.contractName ||
      null,

    occurred_at:
      contract.capturedAt ||
      metadata.detectedAt ||
      new Date().toISOString(),

    source: "live",

    payload: {
      contract_id:
        String(contract.contractId),

      contract_name:
        contract.contractName,

      root_symbol:
        contract.rootSymbol,

      product_id:
        contract.productId,

      product_name:
        contract.productName,

      description:
        contract.description,

      contract_maturity_id:
        contract.contractMaturityId,

      expiration_month:
        contract.expirationMonth,

      expiration_at:
        contract.expirationDate,

      tick_size:
        contract.tickSize,

      provider_tick_size:
        contract.providerTickSize,

      value_per_point:
        contract.valuePerPoint,

      product_type:
        contract.productType,

      exchange_id:
        contract.exchangeId,

      captured_at:
        contract.capturedAt,

      page_url:
        metadata.pageUrl || null,

      detected_at:
        metadata.detectedAt ||
        new Date().toISOString(),
    },
  };
}

function createCompletedTradeEvent(
  trade,
  metadata,
  broker = "tradingview",
) {
  const pairId = String(
    trade.brokerPairId || trade.id,
  );
  const accountExternalId =
    trade.accountExternalId || "tv:unknown";

  return {
    broker,
    event_type: "completed_trade",
    broker_event_id: pairId,
    account_external_id: accountExternalId,
    symbol: trade.symbol || null,
    occurred_at:
      trade.exitAt ||
      metadata.detectedAt ||
      new Date().toISOString(),
    source: "live",
    payload: {
      pair_id: pairId,
      symbol: trade.symbol,
      direction: trade.direction,
      quantity: trade.quantity,
      entry_price: trade.entryPrice,
      exit_price: trade.exitPrice,
      entry_at: trade.entryAt,
      exit_at: trade.exitAt,
      gross_points: trade.grossPoints,
      point_value: trade.pointValue,
      net_pnl: trade.netPnl,
      fees: trade.fees ?? 0,
      buy_fill_id: trade.buyFillId,
      sell_fill_id: trade.sellFillId,
      account_external_id: accountExternalId,
      account_name: trade.accountName || null,
      is_paper: trade.isPaper === true,
      connected_broker: trade.connectedBroker || null,
      trading_profile_id: metadata.tradingProfileId || null,
      page_url:
        metadata.pageUrl || null,
      detected_at:
        metadata.detectedAt ||
        new Date().toISOString(),
    },
  };
}

function createBrokerEvent(
  brokerEvent,
  metadata,
  broker = "tradovate",
) {
  if (
    brokerEvent.kind === "completed_trade"
  ) {
    return createCompletedTradeEvent(
      brokerEvent.data,
      metadata,
      broker,
    );
  }

  if (
    brokerEvent.kind === "fill"
  ) {
    return createFillEvent(
      brokerEvent.data,
      metadata,
      broker,
    );
  }

  if (
    brokerEvent.kind ===
    "fill_pair"
  ) {
    return createFillPairEvent(
      brokerEvent.data,
      metadata,
      broker,
    );
  }

  if (
    brokerEvent.kind ===
    "fill_fee"
  ) {
    return createFillFeeEvent(
      brokerEvent.data,
      metadata,
      broker,
    );
  }

  if (
    brokerEvent.kind ===
    "contract_metadata"
  ) {
    return createContractMetadataEvent(
      brokerEvent.data,
      metadata,
      broker,
    );
  }

  throw new Error(
    `Unsupported broker event type: ${brokerEvent.kind}`,
  );
}

async function handleBrokerEvent(
  message,
) {
  const brokerEvent =
    message.brokerEvent;

  if (
    !brokerEvent ||
    !brokerEvent.kind ||
    !brokerEvent.data
  ) {
    throw new Error(
      "The detected broker event is invalid.",
    );
  }

  const broker =
    message.broker || "tradovate";

  const state =
    await getStoredState();

  const event =
    createBrokerEvent(
      brokerEvent,
      {
        pageUrl:
          message.pageUrl,

        detectedAt:
          message.detectedAt,

        tradingProfileId:
          state.activeTradingProfileId ||
          null,
      },
      broker,
    );

  const queueResult =
    await queueBrokerEvent(event);

  const now =
    new Date().toISOString();

  if (
    queueResult.added &&
    brokerEvent.kind === "fill"
  ) {
    await chrome.storage.local.set({
      totalLiveFillsDetected:
        Number(
          state.totalLiveFillsDetected ||
          0,
        ) + 1,

      lastFillDetectedAt:
        now,
    });
  }

  if (
    queueResult.added &&
    brokerEvent.kind ===
      "fill_pair"
  ) {
    await chrome.storage.local.set({
      totalFillPairsDetected:
        Number(
          state.totalFillPairsDetected ||
          0,
        ) + 1,

      lastFillPairDetectedAt:
        now,
    });
  }

  if (
    queueResult.added &&
    brokerEvent.kind ===
      "fill_fee"
  ) {
    await chrome.storage.local.set({
      totalFillFeesDetected:
        Number(
          state.totalFillFeesDetected ||
          0,
        ) + 1,

      lastFillFeeDetectedAt:
        now,
    });
  }

  if (
    queueResult.added &&
    brokerEvent.kind ===
      "contract_metadata"
  ) {
    await chrome.storage.local.set({
      totalContractMetadataDetected:
        Number(
          state.totalContractMetadataDetected ||
          0,
        ) + 1,

      lastContractMetadataAt:
        now,
    });
  }

  if (
    queueResult.added &&
    brokerEvent.kind ===
      "completed_trade"
  ) {
    await chrome.storage.local.set({
      totalCompletedTradesDetected:
        Number(
          state.totalCompletedTradesDetected ||
          0,
        ) + 1,

      lastCompletedTradeDetectedAt:
        now,
    });
  }

  const flushResult =
    await flushPendingEvents();

  const syncError =
    flushResult.error ||
    (flushResult.paired === false
      ? "TradeCoach Sync is not paired. Open TradeCoach → Connect TradingView and enter the pairing code in the extension popup."
      : null) ||
    (!flushResult.success
      ? "Sync failed. Open the TradeCoach Sync popup for details."
      : null);

  return {
    success: true,

    paired: flushResult.paired !== false,

    queued:
      queueResult.added,

    eventType:
      brokerEvent.kind,

    eventId:
      String(
        brokerEvent.data.id,
      ),

    synced:
      flushResult.success,

    pendingCount:
      flushResult.pendingCount,

    syncError,
  };
}

function createUniqueTestId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID ===
      "function"
  ) {
    return crypto.randomUUID();
  }

  return (
    `${Date.now()}-` +
    Math.random()
      .toString(16)
      .slice(2)
  );
}

async function sendTestEvent() {
  const id =
    createUniqueTestId();

  const result =
    await sendBrokerEvents([
      {
        broker: "tradovate",

        event_type:
          "test_event",

        broker_event_id:
          `test-${id}`,

        account_external_id:
          "local-test-account",

        symbol: "MNQ",

        occurred_at:
          new Date().toISOString(),

        source:
          "manual_test",

        payload: {
          test: true,

          message:
            "TradeCoach Sync test event",

          extension_version:
            chrome.runtime
              .getManifest()
              .version,
        },
      },
    ]);

  await chrome.storage.local.set({
    lastTestEventAt:
      new Date().toISOString(),
  });

  return {
    success: true,
    ...result,
  };
}

function createFlushAlarm() {
  chrome.alarms.create(
    FLUSH_ALARM_NAME,
    {
      periodInMinutes: 1,
    },
  );
}

function createBrokerScanAlarm() {
  chrome.alarms.create(
    BROKER_SCAN_ALARM_NAME,
    {
      periodInMinutes: 0.5,
    },
  );
}

chrome.runtime.onInstalled.addListener(
  async () => {
    const existing =
      await chrome.storage.local.get(
        Object.keys(DEFAULT_STATE),
      );

    await chrome.storage.local.set({
      ...DEFAULT_STATE,
      ...existing,
    });

    createFlushAlarm();
    createBrokerScanAlarm();

    await refreshBrokerDetectionFromTabs();
    await flushPendingEvents();
  },
);

chrome.runtime.onStartup.addListener(
  async () => {
    createFlushAlarm();
    createBrokerScanAlarm();

    await refreshBrokerDetectionFromTabs();
    await flushPendingEvents();
  },
);

chrome.alarms.onAlarm.addListener(
  async (alarm) => {
    if (
      alarm.name ===
      BROKER_SCAN_ALARM_NAME
    ) {
      await refreshBrokerDetectionFromTabs();
      return;
    }

    if (
      alarm.name ===
      FLUSH_ALARM_NAME
    ) {
      await flushPendingEvents();
    }
  },
);

chrome.tabs.onUpdated.addListener(
  (tabId, changeInfo, tab) => {
    const mergedTab = {
      ...tab,
      id: tabId,
    };

    if (
      changeInfo.url ||
      changeInfo.status === "complete"
    ) {
      ensureTradeCoachBridge(mergedTab).catch(
        () => {},
      );
    }

    if (
      !changeInfo.url &&
      !changeInfo.title &&
      changeInfo.status !== "complete"
    ) {
      return;
    }

    handleBrokerTabCandidate(mergedTab).catch(
      () => {},
    );
  },
);

chrome.tabs.onActivated.addListener(
  async ({ tabId }) => {
    try {
      const tab =
        await chrome.tabs.get(tabId);

      await handleBrokerTabCandidate(tab);
    } catch {
      // Ignore closed or inaccessible tabs.
    }
  },
);

chrome.runtime.onMessage.addListener(
  (
    message,
    sender,
    sendResponse,
  ) => {
    if (message?.type === "TRADECOACH_ACTIVE_PROFILE") {
      const profileId = String(message.profileId || "").trim();
      const profileName = String(message.profileName || "").trim();

      if (!profileId) {
        sendResponse({ success: false });
        return false;
      }

      chrome.storage.local
        .set({
          activeTradingProfileId: profileId,
          activeTradingProfileName: profileName || null,
        })
        .then(() => {
          sendResponse({ success: true });
        })
        .catch((error) => {
          sendResponse({
            success: false,
            error:
              error instanceof Error
                ? error.message
                : "Could not store active profile.",
          });
        });

      return true;
    }

    if (
      message?.type ===
      "TRADOVATE_PAGE_DETECTED"
    ) {
      const pageUrl =
        sender.tab?.url ||
        message.pageUrl ||
        null;

      if (
        isBrokerSignInPage(
          pageUrl,
          sender.tab?.title,
        )
      ) {
        clearBrokerDetection("tradovate")
          .then(() => {
            sendResponse({
              success: true,
              skipped: true,
            });
          })
          .catch((error) => {
            sendResponse({
              success: false,
              error:
                error instanceof Error
                  ? error.message
                  : "Tradovate detection failed.",
            });
          });

        return true;
      }

      chrome.storage.local
        .set({
          tradovateDetected: true,

          tradovateLastSeenAt:
            new Date().toISOString(),

          lastSeenAt:
            new Date().toISOString(),

          tradovateUrl:
            sender.tab?.url ||
            message.pageUrl ||
            null,
        })
        .then(async () => {
          await registerBrokerSession(
            "tradovate",
            sender.tab?.url ||
              message.pageUrl ||
              null,
          );

          const result =
            await flushPendingEvents();

          sendResponse({
            success: true,
            flushResult: result,
          });
        })
        .catch((error) => {
          sendResponse({
            success: false,

            error:
              error instanceof Error
                ? error.message
                : "Tradovate detection failed.",
          });
        });

      return true;
    }

    if (
      message?.type ===
      "NINJATRADER_PAGE_DETECTED"
    ) {
      const pageUrl =
        sender.tab?.url ||
        message.pageUrl ||
        null;

      if (
        isBrokerSignInPage(
          pageUrl,
          sender.tab?.title,
        )
      ) {
        clearBrokerDetection("ninjatrader")
          .then(() => {
            sendResponse({
              success: true,
              skipped: true,
            });
          })
          .catch((error) => {
            sendResponse({
              success: false,
              error:
                error instanceof Error
                  ? error.message
                  : "NinjaTrader detection failed.",
            });
          });

        return true;
      }

      chrome.storage.local
        .set({
          ninjatraderDetected: true,

          ninjatraderLastSeenAt:
            new Date().toISOString(),

          lastSeenAt:
            new Date().toISOString(),

          ninjatraderUrl:
            sender.tab?.url ||
            message.pageUrl ||
            null,
        })
        .then(async () => {
          await registerBrokerSession(
            "ninjatrader",
            sender.tab?.url ||
              message.pageUrl ||
              null,
          );

          const result =
            await flushPendingEvents();

          sendResponse({
            success: true,
            flushResult: result,
          });
        })
        .catch((error) => {
          sendResponse({
            success: false,

            error:
              error instanceof Error
                ? error.message
                : "NinjaTrader detection failed.",
          });
        });

      return true;
    }

    if (
      message?.type ===
      "TRADINGVIEW_PAGE_DETECTED"
    ) {
      const pageUrl =
        sender.tab?.url ||
        message.pageUrl ||
        null;

      if (
        isBrokerSignInPage(
          pageUrl,
          sender.tab?.title,
        )
      ) {
        clearBrokerDetection("tradingview")
          .then(() => {
            sendResponse({
              success: true,
              skipped: true,
            });
          })
          .catch((error) => {
            sendResponse({
              success: false,
              error:
                error instanceof Error
                  ? error.message
                  : "TradingView detection failed.",
            });
          });

        return true;
      }

      chrome.storage.local
        .set({
          tradingviewDetected: true,

          tradingviewLastSeenAt:
            new Date().toISOString(),

          lastSeenAt:
            new Date().toISOString(),

          tradingviewUrl:
            sender.tab?.url ||
            message.pageUrl ||
            null,
        })
        .then(async () => {
          await registerBrokerSession(
            "tradingview",
            sender.tab?.url ||
              message.pageUrl ||
              null,
          );

          const result =
            await flushPendingEvents();

          sendResponse({
            success: true,
            flushResult: result,
          });
        })
        .catch((error) => {
          sendResponse({
            success: false,

            error:
              error instanceof Error
                ? error.message
                : "TradingView detection failed.",
          });
        });

      return true;
    }

    if (
      message?.type ===
      "TRADOVATE_BROKER_EVENT_DETECTED"
    ) {
      handleBrokerEvent(message)
        .then(sendResponse)
        .catch((error) => {
          sendResponse({
            success: false,

            error:
              error instanceof Error
                ? error.message
                : "The broker event could not be processed.",
          });
        });

      return true;
    }

    if (
      message?.type ===
      "OPEN_TRADOVATE"
    ) {
      chrome.tabs
        .create({
          url:
            "https://trader.tradovate.com/",
        })
        .then(() => {
          sendResponse({
            success: true,
          });
        });

      return true;
    }

    if (
      message?.type ===
      "OPEN_NINJATRADER"
    ) {
      chrome.tabs
        .create({
          url:
            "https://web-trader.ninjatrader.com/",
        })
        .then(() => {
          sendResponse({
            success: true,
          });
        });

      return true;
    }

    if (
      message?.type ===
      "OPEN_TRADINGVIEW"
    ) {
      chrome.tabs
        .create({
          url:
            "https://www.tradingview.com/chart/",
        })
        .then(() => {
          sendResponse({
            success: true,
          });
        });

      return true;
    }

    if (
      message?.type ===
      "FORCE_BROKER_TAB"
    ) {
      forceBrokerTab(
        message.broker === "ninjatrader"
          ? "ninjatrader"
          : message.broker === "tradingview"
            ? "tradingview"
            : "tradovate",
        message.tabId,
        message.pageUrl,
      )
        .then((result) => {
          sendResponse({
            success: true,
            ...result,
          });
        })
        .catch((error) => {
          sendResponse({
            success: false,

            error:
              error instanceof Error
                ? error.message
                : "That tab could not be connected.",
          });
        });

      return true;
    }

    if (
      message?.type ===
      "SCAN_BROKER_TABS"
    ) {
      refreshBrokerDetectionFromTabs()
        .then((found) => {
          sendResponse({
            success: true,
            found,
          });
        })
        .catch((error) => {
          sendResponse({
            success: false,

            error:
              error instanceof Error
                ? error.message
                : "Broker tabs could not be scanned.",
          });
        });

      return true;
    }

    if (
      message?.type ===
      "GET_SYNC_STATE"
    ) {
      getStoredState()
        .then((state) => {
          sendResponse({
            success: true,

            state:
              getPublicState(state),
          });
        })
        .catch((error) => {
          sendResponse({
            success: false,

            error:
              error instanceof Error
                ? error.message
                : "Sync state could not be loaded.",
          });
        });

      void refreshBrokerDetectionFromTabs().catch(
        () => {},
      );

      return true;
    }

    if (
      message?.type ===
      "PAIR_DEVICE"
    ) {
      pairDevice(message.code)
        .then(sendResponse)
        .catch((error) => {
          sendResponse({
            success: false,

            error:
              error instanceof Error
                ? error.message
                : "Pairing failed.",
          });
        });

      return true;
    }

    if (
      message?.type ===
      "CHECK_DEVICE_STATUS"
    ) {
      checkDeviceStatus({
        skipFlush:
          message.skipFlush === true,
      })
        .then((result) => {
          sendResponse({
            success: true,
            ...result,
          });
        })
        .catch((error) => {
          sendResponse({
            success: false,

            error:
              error instanceof Error
                ? error.message
                : "The connection could not be checked.",
          });
        });

      return true;
    }

    if (
      message?.type ===
      "SEND_TEST_EVENT"
    ) {
      sendTestEvent()
        .then(sendResponse)
        .catch((error) => {
          sendResponse({
            success: false,

            error:
              error instanceof Error
                ? error.message
                : "The test event could not be sent.",
          });
        });

      return true;
    }

    if (
      message?.type ===
      "FLUSH_PENDING_EVENTS"
    ) {
      flushPendingEvents()
        .then((result) => {
          sendResponse({
            success: true,
            ...result,
          });
        })
        .catch((error) => {
          sendResponse({
            success: false,

            error:
              error instanceof Error
                ? error.message
                : "Pending events could not be synced.",
          });
        });

      return true;
    }

    return false;
  },
);

createFlushAlarm();
flushPendingEvents();