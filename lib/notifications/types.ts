export type NotificationSettings = {
  dailyReport: boolean;
  weeklyReport: boolean;
  monthlyReport: boolean;
  tradeSyncAlerts: boolean;
  productUpdates: boolean;
};

export type NotificationSettingsRow = {
  user_id: string;
  email: string;
  daily_report_enabled: boolean;
  weekly_report_enabled: boolean;
  monthly_report_enabled: boolean;
  trade_sync_alerts_enabled: boolean;
  product_updates_enabled: boolean;
  updated_at: string;
};

export type NotificationType =
  | "daily_report"
  | "weekly_report"
  | "monthly_report"
  | "trade_sync_alert";

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  dailyReport: true,
  weeklyReport: true,
  monthlyReport: true,
  tradeSyncAlerts: true,
  productUpdates: false,
};

export const NOTIFICATION_OPTION_META = [
  {
    key: "dailyReport" as const,
    title: "Daily Trading Report",
    description:
      "Receive a summary of your trades, results, and AI coaching after each trading day.",
  },
  {
    key: "weeklyReport" as const,
    title: "Weekly Performance Report",
    description:
      "Receive your weekly trading grade, patterns, strengths, and improvement plan.",
  },
  {
    key: "monthlyReport" as const,
    title: "Monthly Performance Report",
    description:
      "Receive a detailed monthly review of profitability, consistency, and discipline.",
  },
  {
    key: "tradeSyncAlerts" as const,
    title: "Trade Sync Alerts",
    description:
      "Get notified when a broker account fails to sync or requires attention.",
  },
  {
    key: "productUpdates" as const,
    title: "Product Updates",
    description:
      "Receive occasional updates about new TradeCoach AI features.",
  },
];

export function rowToNotificationSettings(
  row: NotificationSettingsRow | null | undefined,
): NotificationSettings {
  if (!row) {
    return DEFAULT_NOTIFICATION_SETTINGS;
  }

  return {
    dailyReport: row.daily_report_enabled,
    weeklyReport: row.weekly_report_enabled,
    monthlyReport: row.monthly_report_enabled,
    tradeSyncAlerts: row.trade_sync_alerts_enabled,
    productUpdates: row.product_updates_enabled,
  };
}

export function settingsToRowValues(
  settings: NotificationSettings,
  email: string,
) {
  return {
    email,
    daily_report_enabled: settings.dailyReport,
    weekly_report_enabled: settings.weeklyReport,
    monthly_report_enabled: settings.monthlyReport,
    trade_sync_alerts_enabled: settings.tradeSyncAlerts,
    product_updates_enabled: settings.productUpdates,
  };
}
