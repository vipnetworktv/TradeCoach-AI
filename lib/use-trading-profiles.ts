"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  getActiveTradingProfile,
  type TradingProfile,
} from "@/lib/trading-profiles";

export function useTradingProfiles() {
  const [profiles, setProfiles] = useState<TradingProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const loadProfiles = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/trading-profiles", {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        profiles?: TradingProfile[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Could not load trading profiles.");
      }

      setProfiles(payload.profiles ?? []);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load trading profiles.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProfiles();
  }, [loadProfiles]);

  const activeProfile = useMemo(
    () => getActiveTradingProfile(profiles),
    [profiles],
  );

  const createProfile = useCallback(
    async (name: string) => {
      setActionLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/trading-profiles", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name }),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          profiles?: TradingProfile[];
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error || "Could not create trading profile.");
        }

        setProfiles(payload.profiles ?? []);
        return true;
      } catch (createError) {
        setError(
          createError instanceof Error
            ? createError.message
            : "Could not create trading profile.",
        );
        return false;
      } finally {
        setActionLoading(false);
      }
    },
    [],
  );

  const activateProfile = useCallback(async (profileId: string) => {
    setActionLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/trading-profiles", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ profileId }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        profiles?: TradingProfile[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Could not switch trading profile.");
      }

      setProfiles(payload.profiles ?? []);
      return true;
    } catch (activateError) {
      setError(
        activateError instanceof Error
          ? activateError.message
          : "Could not switch trading profile.",
      );
      return false;
    } finally {
      setActionLoading(false);
    }
  }, []);

  return {
    profiles,
    activeProfile,
    loading,
    error,
    actionLoading,
    createProfile,
    activateProfile,
    reload: loadProfiles,
  };
}
