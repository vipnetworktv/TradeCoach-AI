const tradeCoachStatusDot =
  document.getElementById(
    "tradecoach-status-dot",
  );

const tradeCoachStatusTitle =
  document.getElementById(
    "tradecoach-status-title",
  );

const tradeCoachStatusMessage =
  document.getElementById(
    "tradecoach-status-message",
  );

const tradingviewStatusDot = document.getElementById(
  "tradingview-status-dot",
);

const tradingviewStatusTitle = document.getElementById(
  "tradingview-status-title",
);

const tradingviewStatusMessage = document.getElementById(
  "tradingview-status-message",
);

const openTradingviewButton = document.getElementById(
  "open-tradingview",
);

const pairingSection =
  document.getElementById(
    "pairing-section",
  );

const pairingCodeInput =
  document.getElementById(
    "pairing-code",
  );

const pairDeviceButton =
  document.getElementById(
    "pair-device",
  );

const pairingMessage =
  document.getElementById(
    "pairing-message",
  );

const checkConnectionButton =
  document.getElementById(
    "check-connection",
  );

const syncNowButton =
  document.getElementById(
    "sync-now",
  );


const connectTradingviewTabButton = document.getElementById(
  "connect-tradingview-tab",
);

const debugInfo =
  document.getElementById(
    "debug-info",
  );

function clearStatusClasses(element) {
  element.classList.remove(
    "connected",
    "warning",
    "error",
  );
}

function showTradeCoachChecking() {
  clearStatusClasses(
    tradeCoachStatusDot,
  );

  tradeCoachStatusTitle.textContent =
    "Checking TradeCoach";

  tradeCoachStatusMessage.textContent =
    "Verifying the extension connection...";
}

function truncateStatusMessage(message, maxLength = 220) {
  const text = safeString(message);

  if (!text || text.length <= maxLength) {
    return text || "";
  }

  return `${text.slice(0, maxLength - 1).trim()}…`;
}

function showTradeCoachPaired(message, state) {
  clearStatusClasses(
    tradeCoachStatusDot,
  );

  const pendingCount = Number(state?.pendingEventCount || 0);
  const lastError = safeString(state?.lastDeviceError);

  if (pendingCount > 0) {
    tradeCoachStatusDot.classList.add(
      "warning",
    );

    tradeCoachStatusTitle.textContent =
      `${pendingCount} trade${pendingCount === 1 ? "" : "s"} waiting to sync`;

    tradeCoachStatusMessage.textContent =
      truncateStatusMessage(
        lastError ||
          message ||
          "Trades were detected but have not reached TradeCoach yet.",
      );
  } else {
    tradeCoachStatusDot.classList.add(
      "connected",
    );

    tradeCoachStatusTitle.textContent =
      "TradeCoach connected";

    tradeCoachStatusMessage.textContent =
      message ||
      "This browser is securely paired with your TradeCoach account.";
  }

  pairingSection.classList.add(
    "hidden",
  );

  checkConnectionButton.classList.remove(
    "hidden",
  );

  if (syncNowButton) {
    syncNowButton.classList.toggle(
      "hidden",
      pendingCount === 0,
    );
  }
}

function safeString(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const cleaned = String(value).trim();
  return cleaned || null;
}

function showTradeCoachUnpaired(message) {
  clearStatusClasses(
    tradeCoachStatusDot,
  );

  tradeCoachStatusDot.classList.add(
    "warning",
  );

  tradeCoachStatusTitle.textContent =
    "TradeCoach pairing required";

  tradeCoachStatusMessage.textContent =
    message ||
    "Generate a pairing code from your TradeCoach account.";

  pairingSection.classList.remove(
    "hidden",
  );

  checkConnectionButton.classList.add(
    "hidden",
  );

  if (syncNowButton) {
    syncNowButton.classList.add("hidden");
  }
}

function showTradeCoachOffline(message) {
  clearStatusClasses(
    tradeCoachStatusDot,
  );

  tradeCoachStatusDot.classList.add(
    "warning",
  );

  tradeCoachStatusTitle.textContent =
    "TradeCoach temporarily unavailable";

  tradeCoachStatusMessage.textContent =
    message ||
    "The extension is paired, but the backend cannot currently be reached.";

  pairingSection.classList.add(
    "hidden",
  );

  checkConnectionButton.classList.remove(
    "hidden",
  );

  if (syncNowButton) {
    syncNowButton.classList.remove("hidden");
  }
}

function showTradingViewConnected(lastSeenAt) {
  clearStatusClasses(tradingviewStatusDot);

  tradingviewStatusDot.classList.add("connected");

  tradingviewStatusTitle.textContent = "TradingView detected";

  if (lastSeenAt) {
    const formattedTime = new Date(lastSeenAt).toLocaleTimeString();

    tradingviewStatusMessage.textContent =
      `TradingView was detected at ${formattedTime}. Live monitoring is ready.`;
  } else {
    tradingviewStatusMessage.textContent =
      "TradingView is open and available for syncing.";
  }
}

function showTradingViewDisconnected() {
  clearStatusClasses(tradingviewStatusDot);

  tradingviewStatusDot.classList.add("warning");

  tradingviewStatusTitle.textContent = "TradingView not detected";

  tradingviewStatusMessage.textContent =
    "Open TradingView, sign in, then click this extension icon while you are on that chart tab and press Check connection.";
}

async function getActiveTab() {
  const tabs =
    await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

  return tabs[0] || null;
}

function describeActiveTab(tab) {
  if (!tab) {
    return "No active tab found.";
  }

  const title =
    tab.title || "(no title)";

  let host = "(no url)";

  if (tab.url) {
    try {
      host = new URL(tab.url).hostname;
    } catch {
      host = tab.url.slice(0, 60);
    }
  }

  return `${title} · ${host}`;
}

function activeTabLooksLikeBroker(tab) {
  const haystack = [tab?.url, tab?.pendingUrl, tab?.title]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (
    /\b(sign in|log in|login|authenticate)\b/.test(haystack) ||
    /\/(login|signin|sign-in|auth|welcome|sso)(\/|$|\?)/.test(haystack)
  ) {
    return false;
  }

  return haystack.includes("tradingview");
}

async function forceConnectActiveTab() {
  const activeTab = await getActiveTab();

  if (!activeTab?.id) {
    return {
      success: false,
      error: "No active tab was found in this window.",
    };
  }

  return sendMessage({
    type: "FORCE_BROKER_TAB",
    broker: "tradingview",
    tabId: activeTab.id,
    pageUrl: activeTab.url || activeTab.pendingUrl || activeTab.title,
  });
}

async function updateDebugInfo(state, activeTab) {
  if (!debugInfo) {
    return;
  }

  const scanFound =
    state?.lastBrokerScanFound ||
    {};

  debugInfo.textContent =
    `Active tab: ${describeActiveTab(activeTab)}\n` +
    `Scan found TradingView: ${scanFound.tradingview ? "yes" : "no"}\n` +
    `Paired: ${state?.paired ? "yes" : "no"}\n` +
    `Pending trades/events: ${state?.pendingEventCount ?? 0}\n` +
    `Last sync error: ${state?.lastDeviceError || "none"}\n` +
    `Last successful sync: ${state?.lastSuccessfulSyncAt || "never"}\n` +
    `Extension v${chrome.runtime.getManifest().version}`;
}

function isTradingViewMonitoringActive(state, activeTab) {
  const tradingviewLastSeenTimestamp = state?.tradingviewLastSeenAt
    ? new Date(state.tradingviewLastSeenAt).getTime()
    : 0;

  const scanFound =
    state?.lastBrokerScanFound || {};

  return (
    Boolean(scanFound.tradingview) ||
    (state?.tradingviewDetected &&
      Date.now() - tradingviewLastSeenTimestamp < 900000) ||
    (activeTab &&
      activeTabLooksLikeBroker(activeTab) &&
      Date.now() - tradingviewLastSeenTimestamp < 900000)
  );
}

function updateConnectTabButtons(activeTab, state) {
  if (!connectTradingviewTabButton) {
    return;
  }

  const onTradingViewTab =
    activeTab && activeTabLooksLikeBroker(activeTab);

  const monitoringActive =
    state && isTradingViewMonitoringActive(state, activeTab);

  const showConnectButton =
    onTradingViewTab && !monitoringActive;

  connectTradingviewTabButton.classList.toggle(
    "hidden",
    !showConnectButton,
  );

  if (monitoringActive) {
    connectTradingviewTabButton.textContent =
      "Connected";
  } else if (showConnectButton) {
    connectTradingviewTabButton.textContent =
      "Connect this TradingView tab";
  }
}

function formatPairingCode(value) {
  const normalized = value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);

  if (normalized.length <= 4) {
    return normalized;
  }

  return (
    normalized.slice(0, 4) +
    "-" +
    normalized.slice(4)
  );
}

async function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      message,
      (response) => {
        if (
          chrome.runtime.lastError
        ) {
          resolve({
            success: false,

            error:
              chrome.runtime
                .lastError
                .message,
          });

          return;
        }

        resolve(
          response || {
            success: false,

            error:
              "The extension did not return a response.",
          },
        );
      },
    );
  });
}

function isRecentTimestamp(value, maxAgeMs = 900000) {
  if (!value) {
    return false;
  }

  const timestamp = new Date(value).getTime();

  if (!Number.isFinite(timestamp)) {
    return false;
  }

  return Date.now() - timestamp < maxAgeMs;
}

function renderTradingViewStatus(state, activeTab) {
  if (isTradingViewMonitoringActive(state, activeTab)) {
    showTradingViewConnected(state.tradingviewLastSeenAt);
    return;
  }

  showTradingViewDisconnected();

  if (activeTab?.url) {
    try {
      const host = new URL(activeTab.url).hostname;

      if (host === "localhost" || host === "127.0.0.1") {
        tradingviewStatusMessage.textContent =
          "You're on TradeCoach right now. Switch to your TradingView tab, click this extension icon there, then press Check connection.";
      }
    } catch {
      // Keep the default disconnected message.
    }
  }
}

function renderTradeCoachStatus(state, deviceResponse) {
  if (!state?.paired) {
    showTradeCoachUnpaired();
    return;
  }

  if (deviceResponse) {
    if (
      deviceResponse.paired &&
      deviceResponse.connected
    ) {
      showTradeCoachPaired(
        deviceResponse.message,
        state,
      );
      return;
    }

    if (
      deviceResponse.paired &&
      deviceResponse.temporarilyOffline
    ) {
      showTradeCoachOffline(
        deviceResponse.message,
      );
      return;
    }

    showTradeCoachUnpaired(
      deviceResponse.message,
    );
    return;
  }

  if (state.lastDeviceError) {
    showTradeCoachOffline(state.lastDeviceError);
    return;
  }

  if (
    state.lastDeviceConnected === false &&
    isRecentTimestamp(state.lastDeviceCheckAt, 300000)
  ) {
    showTradeCoachOffline(
      "Paired, but the backend is unavailable.",
    );
    return;
  }

  showTradeCoachPaired(
    "TradeCoach Sync is connected.",
    state,
  );
}

async function loadCachedPopupState() {
  const stored = await chrome.storage.local.get([
    "paired",
    "deviceName",
    "pairedAt",
    "lastDeviceCheckAt",
    "lastDeviceConnected",
    "lastDeviceError",
    "lastSuccessfulSyncAt",
    "tradingviewDetected",
    "tradingviewLastSeenAt",
    "lastBrokerScanFound",
    "pendingBrokerEvents",
  ]);

  const pendingEvents = Array.isArray(stored.pendingBrokerEvents)
    ? stored.pendingBrokerEvents
    : [];

  return {
    ...stored,
    lastDeviceConnected:
      stored.lastDeviceConnected === true ||
      (stored.paired === true &&
        stored.lastDeviceConnected !== false &&
        Boolean(stored.lastDeviceCheckAt) &&
        !stored.lastDeviceError),
    pendingEventCount: pendingEvents.length,
  };
}

async function renderCachedStateInstantly() {
  try {
    const state = await loadCachedPopupState();

    renderTradeCoachStatus(state, null);
    renderTradingViewStatus(state, null);
    updateConnectTabButtons(null, state);
  } catch {
    // Fall back to the normal refresh path.
  }
}

async function refreshState(options = {}) {
  const forceCheck = options.forceCheck === true;

  try {
    const [activeTab, response] = await Promise.all([
      getActiveTab(),
      sendMessage({
        type: "GET_SYNC_STATE",
      }),
    ]);

    if (!response.success) {
      showTradeCoachUnpaired(
        response.error ||
        "The extension state could not be loaded.",
      );

      showTradingViewDisconnected();
      await updateDebugInfo(null, activeTab);
      return;
    }

    const state = response.state;

    await updateDebugInfo(state, activeTab);
    renderTradingViewStatus(state, activeTab);
    renderTradeCoachStatus(state, null);
    updateConnectTabButtons(activeTab, state);

    const shouldRefreshDevice =
      forceCheck ||
      !state.lastDeviceCheckAt ||
      !isRecentTimestamp(state.lastDeviceCheckAt, 120000);

    if (
      activeTab?.id &&
      activeTabLooksLikeBroker(activeTab) &&
      !isTradingViewMonitoringActive(state, activeTab)
    ) {
      void forceConnectActiveTab().then(async (result) => {
        if (!result?.success) {
          return;
        }

        const latest = await sendMessage({
          type: "GET_SYNC_STATE",
        });

        if (!latest.success) {
          return;
        }

        renderTradingViewStatus(latest.state, activeTab);
        updateConnectTabButtons(activeTab, latest.state);
      });
    }

    void sendMessage({
      type: "SCAN_BROKER_TABS",
    }).then(async () => {
      const latest = await sendMessage({
        type: "GET_SYNC_STATE",
      });

      if (!latest.success) {
        return;
      }

      renderTradingViewStatus(latest.state, activeTab);
      updateConnectTabButtons(activeTab, latest.state);
    });

    if (!state.paired || !shouldRefreshDevice) {
      return;
    }

    if (forceCheck) {
      showTradeCoachChecking();
    }

    void sendMessage({
      type: "CHECK_DEVICE_STATUS",
      skipFlush: true,
    }).then((deviceResponse) => {
      if (!deviceResponse.success) {
        showTradeCoachOffline(
          deviceResponse.error ||
          "The TradeCoach connection could not be checked.",
        );
        return;
      }

      renderTradeCoachStatus(state, deviceResponse);
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "The extension popup failed to load its status.";

    showTradeCoachUnpaired(message);
    showTradingViewDisconnected();

    if (debugInfo) {
      debugInfo.textContent =
        `Popup error: ${message}\n` +
        `Extension v${chrome.runtime.getManifest().version}`;
    }
  }
}

pairingCodeInput.addEventListener(
  "input",
  () => {
    pairingCodeInput.value =
      formatPairingCode(
        pairingCodeInput.value,
      );

    pairingMessage.textContent = "";

    pairingMessage.className =
      "pairing-message";
  },
);

pairingCodeInput.addEventListener(
  "keydown",
  (event) => {
    if (event.key === "Enter") {
      event.preventDefault();

      pairDeviceButton.click();
    }
  },
);

pairDeviceButton.addEventListener(
  "click",
  async () => {
    const code =
      formatPairingCode(
        pairingCodeInput.value,
      );

    if (
      code.replace("-", "")
        .length !== 8
    ) {
      pairingMessage.textContent =
        "Enter the complete pairing code.";

      pairingMessage.className =
        "pairing-message error";

      return;
    }

    pairDeviceButton.disabled = true;
    pairingCodeInput.disabled = true;

    pairDeviceButton.textContent =
      "Pairing securely...";

    pairingMessage.textContent =
      "Connecting this extension to TradeCoach...";

    pairingMessage.className =
      "pairing-message";

    const response =
      await sendMessage({
        type: "PAIR_DEVICE",
        code,
      });

    if (!response.success) {
      pairingMessage.textContent =
        response.error ||
        "The extension could not be paired.";

      pairingMessage.className =
        "pairing-message error";

      pairDeviceButton.disabled = false;
      pairingCodeInput.disabled = false;

      pairDeviceButton.textContent =
        "Pair TradeCoach Sync";

      return;
    }

    pairingMessage.textContent =
      response.message ||
      "TradeCoach Sync was paired successfully.";

    pairingMessage.className =
      "pairing-message success";

    pairingCodeInput.value = "";

    window.setTimeout(
      refreshState,
      500,
    );
  },
);

checkConnectionButton.addEventListener(
  "click",
  async () => {
    checkConnectionButton.disabled = true;

    checkConnectionButton.textContent =
      "Checking connection...";

    await refreshState({
      forceCheck: true,
    });

    checkConnectionButton.disabled = false;

    checkConnectionButton.textContent =
      "Check connection";
  },
);

if (syncNowButton) {
  syncNowButton.addEventListener(
    "click",
    async () => {
      syncNowButton.disabled = true;
      syncNowButton.textContent = "Syncing...";

      const response = await sendMessage({
        type: "FLUSH_PENDING_EVENTS",
      });

      if (!response.success) {
        tradeCoachStatusMessage.textContent =
          response.error ||
          "Pending trades could not be synced.";
      }

      await refreshState({
      forceCheck: true,
    });

      syncNowButton.disabled = false;
      syncNowButton.textContent = "Sync pending trades";
    },
  );
}

openTradingviewButton.addEventListener("click", async () => {
  await sendMessage({
    type: "OPEN_TRADINGVIEW",
  });
});

if (connectTradingviewTabButton) {
  connectTradingviewTabButton.addEventListener("click", async () => {
    connectTradingviewTabButton.disabled = true;

    connectTradingviewTabButton.textContent = "Connecting tab...";

    const response = await forceConnectActiveTab();

    if (!response.success) {
      tradingviewStatusMessage.textContent =
        response.error || "Could not connect this tab.";

      connectTradingviewTabButton.disabled = false;

      connectTradingviewTabButton.textContent =
        "Connect this TradingView tab";

      return;
    }

    connectTradingviewTabButton.textContent = "Connected";

    await refreshState({
      forceCheck: true,
    });
  });
}

void renderCachedStateInstantly();
refreshState();