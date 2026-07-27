export const EXTENSION_STORE_URL =
  process.env.NEXT_PUBLIC_EXTENSION_STORE_URL?.trim() || "";

export const EXTENSION_DOWNLOAD_URL = "/downloads/tradecoach-sync.zip";

export const EXTENSION_GITHUB_URL =
  "https://github.com/vipnetworktv/TradeCoach-AI/tree/main/extension";

export type ExtensionInstallStep = {
  title: string;
  description: string;
  hint?: string;
};

export const EXTENSION_SETUP_STEPS: ExtensionInstallStep[] = [
  {
    title: "Download the extension",
    description:
      "Download the TradeCoach Sync zip file and extract it to a folder on your computer.",
    hint: "Keep the extracted folder — Chrome needs that folder path for Load unpacked.",
  },
  {
    title: "Open Chrome extensions",
    description:
      "In Google Chrome, open chrome://extensions or use Extensions from the menu.",
    hint: "Use Chrome or a Chromium browser such as Edge in developer mode.",
  },
  {
    title: "Enable Developer mode",
    description:
      'Turn on the "Developer mode" switch in the top-right corner of the extensions page.',
  },
  {
    title: "Load unpacked",
    description:
      'Click "Load unpacked" and select the extracted TradeCoach Sync folder.',
    hint: "Select the folder that contains manifest.json.",
  },
  {
    title: "Pin the extension",
    description:
      "Click the puzzle icon in Chrome's toolbar and pin TradeCoach Sync for quick access.",
  },
  {
    title: "Pair with TradeCoach",
    description:
      "Return to TradeCoach, generate a pairing code, open the extension popup, and enter the code.",
    hint: "After pairing, connect Tradovate or NinjaTrader Web from Accounts.",
  },
];

export const EXTENSION_INSTALL_DISMISS_KEY =
  "tradecoach-extension-install-dismissed";

export function getExtensionOnboardingDismissKey(userId: string) {
  return `tradecoach-extension-onboarding-seen-${userId}`;
}

export function hasSeenExtensionOnboarding(userId: string) {
  if (typeof window === "undefined") {
    return false;
  }

  return (
    localStorage.getItem(getExtensionOnboardingDismissKey(userId)) === "1" ||
    sessionStorage.getItem(EXTENSION_INSTALL_DISMISS_KEY) === "1"
  );
}

export function markExtensionOnboardingSeen(userId: string) {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.setItem(getExtensionOnboardingDismissKey(userId), "1");
  sessionStorage.setItem(EXTENSION_INSTALL_DISMISS_KEY, "1");
}
