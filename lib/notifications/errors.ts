export function isMissingNotificationTable(error: unknown) {
  if (!error || typeof error !== "object") {
    const message = String(error || "");

    return (
      message.includes("user_notification_settings") &&
      message.includes("does not exist")
    );
  }

  const record = error as {
    code?: string;
    message?: string;
    details?: string;
  };

  const message = `${record.message || ""} ${record.details || ""}`.toLowerCase();

  return (
    record.code === "PGRST205" ||
    record.code === "42P01" ||
    message.includes("user_notification_settings") ||
    message.includes("notification_send_log")
  );
}

export function getNotificationSetupMessage() {
  return "Notification tables are not set up yet. Open Supabase → SQL Editor and run the full contents of supabase/setup_notifications.sql once.";
}

export function formatNotificationError(error: unknown) {
  if (isMissingNotificationTable(error)) {
    return getNotificationSetupMessage();
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }

  return "Could not complete the notification request.";
}
