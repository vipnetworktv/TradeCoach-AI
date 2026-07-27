"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import ExtensionInstallModal from "@/components/extension-install-modal";
import {
  hasSeenExtensionOnboarding,
  markExtensionOnboardingSeen,
} from "@/lib/extension-install";

type SyncDevice = {
  is_active: boolean | null;
};

export default function ExtensionInstallOnboarding({
  userId,
}: {
  userId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (hasSeenExtensionOnboarding(userId)) {
      return;
    }

    let cancelled = false;

    async function maybeShowOnboarding() {
      try {
        const response = await fetch("/api/sync/devices", {
          cache: "no-store",
        });
        const data = (await response.json()) as {
          devices?: SyncDevice[];
        };

        if (cancelled) {
          return;
        }

        const activeDevices = (data.devices ?? []).filter(
          (device) => device.is_active !== false,
        );

        if (activeDevices.length > 0) {
          markExtensionOnboardingSeen(userId);
          return;
        }

        setOpen(true);
      } catch {
        if (!cancelled) {
          setOpen(true);
        }
      }
    }

    const timer = window.setTimeout(() => {
      void maybeShowOnboarding();
    }, 600);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [userId]);

  function handleClose() {
    markExtensionOnboardingSeen(userId);
    setOpen(false);
  }

  function handleStartPairing() {
    markExtensionOnboardingSeen(userId);
    setOpen(false);
    router.push("/dashboard/accounts/connect");
  }

  return (
    <ExtensionInstallModal
      open={open}
      onClose={handleClose}
      onStartPairing={handleStartPairing}
      welcome
    />
  );
}
