import type { SupabaseClient } from "@supabase/supabase-js";

import {
  formatNotificationError,
  isMissingNotificationTable,
} from "@/lib/notifications/errors";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  rowToNotificationSettings,
  settingsToRowValues,
  type NotificationSettings,
  type NotificationSettingsRow,
} from "@/lib/notifications/types";

export async function getNotificationSettingsForUser(
  supabase: SupabaseClient,
  userId: string,
  email: string,
) {
  const { data, error } = await supabase
    .from("user_notification_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    if (isMissingNotificationTable(error)) {
      return {
        settings: DEFAULT_NOTIFICATION_SETTINGS,
        email,
        updatedAt: null,
        setupRequired: true,
      };
    }

    throw error;
  }

  if (data) {
    return {
      settings: rowToNotificationSettings(
        data as NotificationSettingsRow,
      ),
      email: (data as NotificationSettingsRow).email,
      updatedAt: (data as NotificationSettingsRow).updated_at,
      setupRequired: false,
    };
  }

  const defaults = settingsToRowValues(
    DEFAULT_NOTIFICATION_SETTINGS,
    email,
  );

  const { data: created, error: insertError } = await supabase
    .from("user_notification_settings")
    .insert({
      user_id: userId,
      ...defaults,
    })
    .select("*")
    .single();

  if (insertError) {
    if (isMissingNotificationTable(insertError)) {
      return {
        settings: DEFAULT_NOTIFICATION_SETTINGS,
        email,
        updatedAt: null,
        setupRequired: true,
      };
    }

    throw insertError;
  }

  return {
    settings: rowToNotificationSettings(
      created as NotificationSettingsRow,
    ),
    email: (created as NotificationSettingsRow).email,
    updatedAt: (created as NotificationSettingsRow).updated_at,
    setupRequired: false,
  };
}

export async function saveNotificationSettingsForUser(
  supabase: SupabaseClient,
  userId: string,
  email: string,
  settings: NotificationSettings,
) {
  const values = {
    user_id: userId,
    ...settingsToRowValues(settings, email),
  };

  const { data, error } = await supabase
    .from("user_notification_settings")
    .upsert(values, { onConflict: "user_id" })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return {
    settings: rowToNotificationSettings(
      data as NotificationSettingsRow,
    ),
    email: (data as NotificationSettingsRow).email,
    updatedAt: (data as NotificationSettingsRow).updated_at,
    setupRequired: false,
  };
}

export async function listNotificationSettingsForCron(
  supabase: SupabaseClient,
) {
  const { data, error } = await supabase
    .from("user_notification_settings")
    .select("*");

  if (error) {
    throw error;
  }

  return (data || []) as NotificationSettingsRow[];
}

export async function wasNotificationSent(
  supabase: SupabaseClient,
  userId: string,
  notificationType: string,
  periodKey: string,
) {
  const { data, error } = await supabase
    .from("notification_send_log")
    .select("id")
    .eq("user_id", userId)
    .eq("notification_type", notificationType)
    .eq("period_key", periodKey)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return Boolean(data);
}

export async function logNotificationSent(
  supabase: SupabaseClient,
  userId: string,
  notificationType: string,
  periodKey: string,
) {
  const { error } = await supabase.from("notification_send_log").insert({
    user_id: userId,
    notification_type: notificationType,
    period_key: periodKey,
  });

  if (error && !error.message.includes("duplicate key")) {
    throw error;
  }
}
