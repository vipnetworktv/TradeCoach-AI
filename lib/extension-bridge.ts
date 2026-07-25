const APP_BRIDGE_SOURCE = "tradecoach-app";
const EXTENSION_BRIDGE_SOURCE = "tradecoach-extension";
const LIVE_WINDOW_MS = 15 * 60 * 1000;

export type ExtensionSyncState = {
  paired?: boolean;
  tradovateLastSeenAt?: string | null;
  ninjatraderLastSeenAt?: string | null;
  tradovateUrl?: string | null;
  ninjatraderUrl?: string | null;
  tradovateDetected?: boolean;
  ninjatraderDetected?: boolean;
  lastBrokerScanFound?: {
    tradovate?: string | null;
    ninjatrader?: string | null;
  } | null;
};

type ExtensionBridgeResponse = {
  success?: boolean;
  error?: string;
  state?: ExtensionSyncState;
  found?: {
    tradovate?: string | null;
    ninjatrader?: string | null;
  };
};

declare global {
  interface Window {
    __TRADECOACH_EXTENSION_READY__?: boolean;
  }
}

function isExtensionMarkedReady() {
  return window.__TRADECOACH_EXTENSION_READY__ === true;
}

function postToExtension(
  type: string,
  payload: Record<string, unknown> = {},
) {
  window.postMessage(
    {
      source: APP_BRIDGE_SOURCE,
      type,
      ...payload,
    },
    window.location.origin,
  );
}

export async function waitForTradeCoachExtension(
  timeoutMs = 6000,
) {
  if (isExtensionMarkedReady()) {
    return true;
  }

  return new Promise<boolean>((resolve) => {
    let settled = false;

    function finish(result: boolean) {
      if (settled) {
        return;
      }

      settled = true;
      window.removeEventListener("message", onMessage);
      window.clearTimeout(timer);
      window.clearInterval(pingInterval);
      resolve(result);
    }

    function onMessage(event: MessageEvent) {
      if (event.source !== window) {
        return;
      }

      if (
        event.data?.source === EXTENSION_BRIDGE_SOURCE &&
        event.data?.type === "TRADECOACH_EXTENSION_READY"
      ) {
        finish(true);
      }
    }

    window.addEventListener("message", onMessage);

    const pingInterval = window.setInterval(() => {
      if (isExtensionMarkedReady()) {
        finish(true);
        return;
      }

      postToExtension("TRADECOACH_EXTENSION_PING");
    }, 400);

    postToExtension("TRADECOACH_EXTENSION_PING");

    const timer = window.setTimeout(() => {
      finish(isExtensionMarkedReady());
    }, timeoutMs);
  });
}

export async function requestTradeCoachExtension<
  T extends ExtensionBridgeResponse,
>(
  action: string,
  payload: Record<string, unknown> = {},
  timeoutMs = 15000,
) {
  const extensionAvailable =
    await waitForTradeCoachExtension();

  if (!extensionAvailable) {
    throw new Error(
      "TradeCoach Sync extension was not detected on this page.",
    );
  }

  return new Promise<T>((resolve, reject) => {
    const requestId = crypto.randomUUID();
    let settled = false;

    function finishWithError(error: Error) {
      if (settled) {
        return;
      }

      settled = true;
      window.removeEventListener("message", onMessage);
      window.clearTimeout(timer);
      reject(error);
    }

    function finishWithSuccess(response: T) {
      if (settled) {
        return;
      }

      settled = true;
      window.removeEventListener("message", onMessage);
      window.clearTimeout(timer);
      resolve(response);
    }

    function onMessage(event: MessageEvent) {
      if (event.source !== window) {
        return;
      }

      if (event.data?.source !== EXTENSION_BRIDGE_SOURCE) {
        return;
      }

      if (event.data?.requestId !== requestId) {
        return;
      }

      const response = event.data.response as T | undefined;

      if (!response || response.success === false) {
        finishWithError(
          new Error(
            response?.error ||
              "The TradeCoach Sync extension could not complete the request.",
          ),
        );
        return;
      }

      finishWithSuccess(response);
    }

    window.addEventListener("message", onMessage);

    postToExtension("TRADECOACH_EXTENSION_REQUEST", {
      requestId,
      action,
      payload,
    });

    const timer = window.setTimeout(() => {
      finishWithError(
        new Error(
          "The TradeCoach Sync extension did not respond in time.",
        ),
      );
    }, timeoutMs);
  });
}

export function isBrokerLive(
  lastSeenAt: string | null | undefined,
) {
  if (!lastSeenAt) {
    return false;
  }

  return (
    Date.now() - new Date(lastSeenAt).getTime() <
    LIVE_WINDOW_MS
  );
}

export async function scanExtensionBrokers() {
  try {
    return await requestTradeCoachExtension<ExtensionBridgeResponse>(
      "SCAN_BROKER_TABS",
    );
  } catch {
    return null;
  }
}

export async function getExtensionSyncState() {
  try {
    const response =
      await requestTradeCoachExtension<ExtensionBridgeResponse>(
        "GET_SYNC_STATE",
      );

    return response.state ?? null;
  } catch {
    return null;
  }
}

export async function verifyBrokerLiveSync(
  brokerId: "tradovate" | "ninjatrader",
) {
  const extensionReady =
    await waitForTradeCoachExtension();

  if (!extensionReady) {
    return {
      extensionAvailable: false,
      extensionLive: false,
      message:
        "TradeCoach Sync bridge is not loaded on this page. Reload the extension at chrome://extensions, refresh this page, then try again.",
    };
  }

  await scanExtensionBrokers();

  const state = await getExtensionSyncState();

  if (!state?.paired) {
    return {
      extensionAvailable: true,
      extensionLive: false,
      message:
        "TradeCoach Sync is not paired in this browser.",
    };
  }

  const lastSeenAt =
    brokerId === "tradovate"
      ? state.tradovateLastSeenAt
      : state.ninjatraderLastSeenAt;

  const scanFound =
    state.lastBrokerScanFound || {};

  const extensionLive =
    brokerId === "tradovate"
      ? Boolean(scanFound.tradovate) ||
        (Boolean(state.tradovateDetected) &&
          isBrokerLive(lastSeenAt))
      : Boolean(scanFound.ninjatrader) ||
        (Boolean(state.ninjatraderDetected) &&
          isBrokerLive(lastSeenAt));

  return {
    extensionAvailable: true,
    extensionLive,
    lastSeenAt,
    message: extensionLive
      ? "TradeCoach Sync can see your broker tab."
      : "TradeCoach Sync is paired, but it cannot see your broker tab yet. Refresh the broker tab, then try again.",
  };
}
