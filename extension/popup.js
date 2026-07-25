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

const ninjatraderStatusDot =
  document.getElementById(
    "ninjatrader-status-dot",
  );

const ninjatraderStatusTitle =
  document.getElementById(
    "ninjatrader-status-title",
  );

const ninjatraderStatusMessage =
  document.getElementById(
    "ninjatrader-status-message",
  );

const openNinjatraderButton =
  document.getElementById(
    "open-ninjatrader",
  );

const tradovateStatusDot =  document.getElementById(
    "tradovate-status-dot",
  );

const tradovateStatusTitle =
  document.getElementById(
    "tradovate-status-title",
  );

const tradovateStatusMessage =
  document.getElementById(
    "tradovate-status-message",
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

const testSyncSection =
  document.getElementById(
    "test-sync-section",
  );

const sendTestEventButton =
  document.getElementById(
    "send-test-event",
  );

const testMessage =
  document.getElementById(
    "test-message",
  );

const checkConnectionButton =
  document.getElementById(
    "check-connection",
  );

const openTradovateButton =
  document.getElementById(
    "open-tradovate",
  );

const connectTradovateTabButton =
  document.getElementById(
    "connect-tradovate-tab",
  );

const connectNinjatraderTabButton =
  document.getElementById(
    "connect-ninjatrader-tab",
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

function showTradeCoachPaired(message) {
  clearStatusClasses(
    tradeCoachStatusDot,
  );

  tradeCoachStatusDot.classList.add(
    "connected",
  );

  tradeCoachStatusTitle.textContent =
    "TradeCoach connected";

  tradeCoachStatusMessage.textContent =
    message ||
    "This browser is securely paired with your TradeCoach account.";

  pairingSection.classList.add(
    "hidden",
  );

  checkConnectionButton.classList.remove(
    "hidden",
  );

  testSyncSection.classList.remove(
    "hidden",
  );
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

  testSyncSection.classList.add(
    "hidden",
  );
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

  testSyncSection.classList.remove(
    "hidden",
  );
}

function showNinjatraderConnected(
  lastSeenAt,
) {
  clearStatusClasses(
    ninjatraderStatusDot,
  );

  ninjatraderStatusDot.classList.add(
    "connected",
  );

  ninjatraderStatusTitle.textContent =
    "NinjaTrader Web detected";

  if (lastSeenAt) {
    const formattedTime =
      new Date(
        lastSeenAt,
      ).toLocaleTimeString();

    ninjatraderStatusMessage.textContent =
      `NinjaTrader Web was detected at ${formattedTime}. Live monitoring is ready.`;
  } else {
    ninjatraderStatusMessage.textContent =
      "NinjaTrader Web is open and available for syncing.";
  }
}

function showNinjatraderDisconnected() {
  clearStatusClasses(
    ninjatraderStatusDot,
  );

  ninjatraderStatusDot.classList.add(
    "warning",
  );

  ninjatraderStatusTitle.textContent =
    "NinjaTrader Web not detected";

  ninjatraderStatusMessage.textContent =
    "Open NinjaTrader Web and sign in. A sign-in page alone does not count as connected.";
}

function showTradovateConnected(  lastSeenAt,
) {
  clearStatusClasses(
    tradovateStatusDot,
  );

  tradovateStatusDot.classList.add(
    "connected",
  );

  tradovateStatusTitle.textContent =
    "Tradovate detected";

  if (lastSeenAt) {
    const formattedTime =
      new Date(
        lastSeenAt,
      ).toLocaleTimeString();

    tradovateStatusMessage.textContent =
      `Tradovate was detected at ${formattedTime}. ` +
      "Live monitoring is ready.";
  } else {
    tradovateStatusMessage.textContent =
      "Tradovate is open and available for syncing.";
  }
}

function showTradovateDisconnected() {
  clearStatusClasses(
    tradovateStatusDot,
  );

  tradovateStatusDot.classList.add(
    "warning",
  );

  tradovateStatusTitle.textContent =
    "Tradovate not detected";

  tradovateStatusMessage.textContent =
    "Open Tradovate and sign in, then click this extension icon while you are on that Tradovate tab and press Check connection.";
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

function activeTabLooksLikeBroker(
  tab,
  broker,
) {
  const haystack = [
    tab?.url,
    tab?.pendingUrl,
    tab?.title,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (
    /\b(sign in|log in|login|authenticate)\b/.test(
      haystack,
    ) ||
    /\/(login|signin|sign-in|auth|welcome|sso)(\/|$|\?)/.test(
      haystack,
    )
  ) {
    return false;
  }

  if (broker === "ninjatrader") {
    return (
      haystack.includes("ninjatrader") ||
      haystack.includes("ninja trader")
    );
  }

  return haystack.includes("tradovate");
}

async function forceConnectActiveTab(
  broker,
) {
  const activeTab =
    await getActiveTab();

  if (!activeTab?.id) {
    return {
      success: false,
      error:
        "No active tab was found in this window.",
    };
  }

  return sendMessage({
    type: "FORCE_BROKER_TAB",
    broker,
    tabId: activeTab.id,
    pageUrl:
      activeTab.url ||
      activeTab.pendingUrl ||
      activeTab.title,
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
    `Scan found Tradovate: ${scanFound.tradovate ? "yes" : "no"}\n` +
    `Scan found NinjaTrader: ${scanFound.ninjatrader ? "yes" : "no"}\n` +
    `Extension v${chrome.runtime.getManifest().version}`;
}

function updateConnectTabButtons(activeTab) {
  if (connectTradovateTabButton) {
    const visible =
      activeTab &&
      activeTabLooksLikeBroker(
        activeTab,
        "tradovate",
      );

    connectTradovateTabButton.classList.toggle(
      "hidden",
      !visible,
    );
  }

  if (connectNinjatraderTabButton) {
    const visible =
      activeTab &&
      activeTabLooksLikeBroker(
        activeTab,
        "ninjatrader",
      );

    connectNinjatraderTabButton.classList.toggle(
      "hidden",
      !visible,
    );
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

async function refreshState() {
  try {
    showTradeCoachChecking();

    const activeTab =
      await getActiveTab();

    updateConnectTabButtons(activeTab);

    if (
      activeTab?.id &&
      activeTabLooksLikeBroker(
        activeTab,
        "tradovate",
      )
    ) {
      await forceConnectActiveTab(
        "tradovate",
      );
    } else if (
      activeTab?.id &&
      activeTabLooksLikeBroker(
        activeTab,
        "ninjatrader",
      )
    ) {
      await forceConnectActiveTab(
        "ninjatrader",
      );
    }

    await sendMessage({
      type: "SCAN_BROKER_TABS",
    });

    const response =
      await sendMessage({
        type: "GET_SYNC_STATE",
      });

    if (!response.success) {
      showTradeCoachUnpaired(
        response.error ||
        "The extension state could not be loaded.",
      );

      showTradovateDisconnected();
      showNinjatraderDisconnected();
      await updateDebugInfo(null, activeTab);
      return;
    }

    const state = response.state;

    await updateDebugInfo(state, activeTab);

  const tradovateLastSeenTimestamp =
    state.tradovateLastSeenAt
      ? new Date(
          state.tradovateLastSeenAt,
        ).getTime()
      : 0;

  const ninjatraderLastSeenTimestamp =
    state.ninjatraderLastSeenAt
      ? new Date(
          state.ninjatraderLastSeenAt,
        ).getTime()
      : 0;

  const scanFound =
    state?.lastBrokerScanFound || {};

  const tradovateRecentlyDetected =
    Boolean(scanFound.tradovate) ||
    (state.tradovateDetected &&
      Date.now() - tradovateLastSeenTimestamp <
        900000);

  const ninjatraderRecentlyDetected =
    Boolean(scanFound.ninjatrader) ||
    (state.ninjatraderDetected &&
      Date.now() - ninjatraderLastSeenTimestamp <
        900000);

  if (tradovateRecentlyDetected) {
    showTradovateConnected(
      state.tradovateLastSeenAt,
    );
  } else {
    showTradovateDisconnected();

    if (activeTab?.url) {
      try {
        const host = new URL(activeTab.url).hostname;

        if (
          host === "localhost" ||
          host === "127.0.0.1"
        ) {
          tradovateStatusMessage.textContent =
            "You're on TradeCoach right now. Switch to your Tradovate tab, click this extension icon there, then press Check connection.";
        }
      } catch {
        // Keep the default disconnected message.
      }
    }
  }

  if (ninjatraderRecentlyDetected) {
    showNinjatraderConnected(
      state.ninjatraderLastSeenAt,
    );
  } else {
    showNinjatraderDisconnected();
  }
  if (!state.paired) {
    showTradeCoachUnpaired();
    return;
  }

  const deviceResponse =
    await sendMessage({
      type:
        "CHECK_DEVICE_STATUS",
    });

  if (!deviceResponse.success) {
    showTradeCoachOffline(
      deviceResponse.error ||
      "The TradeCoach connection could not be checked.",
    );

    return;
  }

  if (
    deviceResponse.paired &&
    deviceResponse.connected
  ) {
    showTradeCoachPaired(
      deviceResponse.message,
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
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "The extension popup failed to load its status.";

    showTradeCoachUnpaired(message);
    showTradovateDisconnected();
    showNinjatraderDisconnected();

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

sendTestEventButton.addEventListener(
  "click",
  async () => {
    sendTestEventButton.disabled = true;

    sendTestEventButton.textContent =
      "Sending test event...";

    testMessage.textContent =
      "Sending through FastAPI to Supabase...";

    testMessage.className =
      "test-message";

    const response =
      await sendMessage({
        type: "SEND_TEST_EVENT",
      });

    if (!response.success) {
      testMessage.textContent =
        response.error ||
        "The test event could not be sent.";

      testMessage.className =
        "test-message error";

      sendTestEventButton.disabled = false;

      sendTestEventButton.textContent =
        "Send test event";

      return;
    }

    testMessage.textContent =
      response.message ||
      "Test event saved successfully.";

    testMessage.className =
      "test-message success";

    sendTestEventButton.disabled = false;

    sendTestEventButton.textContent =
      "Send another test event";
  },
);

checkConnectionButton.addEventListener(
  "click",
  async () => {
    checkConnectionButton.disabled = true;

    checkConnectionButton.textContent =
      "Checking connection...";

    await refreshState();

    checkConnectionButton.disabled = false;

    checkConnectionButton.textContent =
      "Check connection";
  },
);

openNinjatraderButton.addEventListener(
  "click",
  async () => {
    await sendMessage({
      type: "OPEN_NINJATRADER",
    });
  },
);

openTradovateButton.addEventListener(  "click",
  async () => {
    await sendMessage({
      type: "OPEN_TRADOVATE",
    });
  },
);

if (connectTradovateTabButton) {
  connectTradovateTabButton.addEventListener(
    "click",
    async () => {
      connectTradovateTabButton.disabled = true;

      connectTradovateTabButton.textContent =
        "Connecting tab...";

      const response =
        await forceConnectActiveTab(
          "tradovate",
        );

      if (!response.success) {
        tradovateStatusMessage.textContent =
          response.error ||
          "Could not connect this tab.";

        connectTradovateTabButton.disabled = false;

        connectTradovateTabButton.textContent =
          "Connect this Tradovate tab";

        return;
      }

      connectTradovateTabButton.textContent =
        "Connected";

      await refreshState();
    },
  );
}

if (connectNinjatraderTabButton) {
  connectNinjatraderTabButton.addEventListener(
    "click",
    async () => {
      connectNinjatraderTabButton.disabled = true;

      connectNinjatraderTabButton.textContent =
        "Connecting tab...";

      const response =
        await forceConnectActiveTab(
          "ninjatrader",
        );

      if (!response.success) {
        ninjatraderStatusMessage.textContent =
          response.error ||
          "Could not connect this tab.";

        connectNinjatraderTabButton.disabled = false;

        connectNinjatraderTabButton.textContent =
          "Connect this NinjaTrader tab";

        return;
      }

      connectNinjatraderTabButton.textContent =
        "Connected";

      await refreshState();
    },
  );
}

refreshState();