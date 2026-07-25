(() => {
  const APP_BRIDGE_SOURCE = "tradecoach-app";
  const EXTENSION_BRIDGE_SOURCE = "tradecoach-extension";

  function markReady() {
    window.__TRADECOACH_EXTENSION_READY__ = true;
  }

  function postToPage(message) {
    window.postMessage(
      {
        source: EXTENSION_BRIDGE_SOURCE,
        ...message,
      },
      window.location.origin,
    );
  }

  function sendRuntimeMessage(message) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          const runtimeError = chrome.runtime.lastError;

          if (runtimeError) {
            resolve({
              success: false,
              error: runtimeError.message,
            });
            return;
          }

          resolve(
            response || {
              success: false,
              error: "The extension did not return a response.",
            },
          );
        });
      } catch (error) {
        resolve({
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "The extension request failed.",
        });
      }
    });
  }

  markReady();

  window.addEventListener("message", (event) => {
    if (event.source !== window) {
      return;
    }

    if (event.origin !== window.location.origin) {
      return;
    }

    const data = event.data;

    if (!data || data.source !== APP_BRIDGE_SOURCE) {
      return;
    }

    if (data.type === "TRADECOACH_EXTENSION_PING") {
      postToPage({
        type: "TRADECOACH_EXTENSION_READY",
      });
      return;
    }

    if (data.type !== "TRADECOACH_EXTENSION_REQUEST") {
      return;
    }

    const requestId = data.requestId;
    const action = data.action;
    const payload =
      data.payload && typeof data.payload === "object"
        ? data.payload
        : {};

    sendRuntimeMessage({
      type: action,
      ...payload,
    }).then((response) => {
      postToPage({
        requestId,
        response,
      });
    });
  });

  postToPage({
    type: "TRADECOACH_EXTENSION_READY",
  });
})();
