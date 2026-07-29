(() => {
  if (window.__TRADECOACH_APP_BRIDGE_V1__) {
    return;
  }

  window.__TRADECOACH_APP_BRIDGE_V1__ = true;

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

  async function pushActiveProfileToExtension() {
    if (!extensionIsAvailable()) {
      return;
    }

    try {
      const response = await fetch("/api/trading-profiles", {
        credentials: "include",
        cache: "no-store",
      });

      if (!response.ok) {
        return;
      }

      const payload = await response.json();
      const profiles = Array.isArray(payload?.profiles)
        ? payload.profiles
        : [];

      const activeProfile = profiles.find(
        (profile) => profile?.is_active,
      );

      if (!activeProfile?.id) {
        return;
      }

      chrome.runtime.sendMessage({
        type: "TRADECOACH_ACTIVE_PROFILE",
        profileId: activeProfile.id,
        profileName: activeProfile.name,
      });
    } catch {
      // Ignore profile sync errors.
    }
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) {
      return;
    }

    if (event.data?.type === "TRADECOACH_ACTIVE_PROFILE_SYNC") {
      void pushActiveProfileToExtension();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      void pushActiveProfileToExtension();
    }
  });

  window.setInterval(() => {
    if (!document.hidden) {
      void pushActiveProfileToExtension();
    }
  }, 15000);

  void pushActiveProfileToExtension();
})();
