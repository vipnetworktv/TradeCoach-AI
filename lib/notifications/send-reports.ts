import type { SupabaseClient } from "@supabase/supabase-js";

import { sendEmail } from "@/lib/email";
import {
  buildReportEmailHtml,
  buildReportEmailText,
  buildSyncAlertEmailHtml,
  type ReportEmailArticle,
} from "@/lib/notifications/email-templates";
import {
  logNotificationSent,
  wasNotificationSent,
} from "@/lib/notifications/settings";
import type { NotificationSettingsRow } from "@/lib/notifications/types";
import { buildPerformanceReportArticle } from "@/lib/performance-report-article";
import { getSubscriptionAccessForUser } from "@/lib/subscription";
import {
  buildTradingReportSummary,
  filterTradesForCurrentWeek,
  filterTradesForMonth,
  filterTradesForNewYorkDate,
  getAppBaseUrl,
  getNewYorkDateParts,
  type ReportTrade,
} from "@/lib/trading-report-summary";

type BrokerAccountRow = {
  id: string;
  account_name: string | null;
  account_number_masked: string | null;
  status: string | null;
  last_synced_at: string | null;
};

function getFirstName(email: string, metadata?: Record<string, unknown>) {
  const firstName =
    typeof metadata?.first_name === "string"
      ? metadata.first_name.trim()
      : "";

  if (firstName) {
    return firstName;
  }

  return email.split("@")[0] || "Trader";
}

async function userHasActiveAccess(
  admin: SupabaseClient,
  userId: string,
  email: string,
) {
  const access = await getSubscriptionAccessForUser(admin, userId, email);
  return access.hasAccess;
}

async function loadUserTrades(admin: SupabaseClient, userId: string) {
  const { data, error } = await admin
    .from("broker_completed_trades")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1000);

  if (error) {
    throw error;
  }

  return (data || []) as ReportTrade[];
}

async function loadStaleAccounts(admin: SupabaseClient, userId: string) {
  const { data, error } = await admin
    .from("broker_accounts")
    .select("id, account_name, account_number_masked, status, last_synced_at")
    .eq("user_id", userId)
    .eq("is_active", true);

  if (error) {
    throw error;
  }

  const staleThresholdMs = 24 * 60 * 60 * 1000;
  const now = Date.now();

  return ((data || []) as BrokerAccountRow[]).filter((account) => {
    const status = String(account.status || "").toLowerCase();

    if (status && status !== "connected") {
      return true;
    }

    if (!account.last_synced_at) {
      return true;
    }

    const timestamp = new Date(account.last_synced_at).getTime();
    return !Number.isFinite(timestamp) || now - timestamp > staleThresholdMs;
  });
}

async function sendReportEmail(
  admin: SupabaseClient,
  row: NotificationSettingsRow,
  notificationType: "daily_report" | "weekly_report" | "monthly_report",
  periodKey: string,
  label: string,
  trades: ReportTrade[],
) {
  const alreadySent = await wasNotificationSent(
    admin,
    row.user_id,
    notificationType,
    periodKey,
  );

  if (alreadySent) {
    return { skipped: true, reason: "already_sent" as const };
  }

  const summary = buildTradingReportSummary(trades, label);
  const { data: authUser } = await admin.auth.admin.getUserById(row.user_id);
  const firstName = getFirstName(
    row.email,
    (authUser.user?.user_metadata || {}) as Record<string, unknown>,
  );

  let article: ReportEmailArticle | undefined;

  if (notificationType === "weekly_report") {
    const weeklyArticle = buildPerformanceReportArticle(trades, "weekly");
    article = {
      intro: weeklyArticle.intro,
      strengths: weeklyArticle.strengths,
      improvements: weeklyArticle.improvements,
      nextFocus: weeklyArticle.nextFocus,
      viewHref: weeklyArticle.viewHref,
    };
  } else if (notificationType === "monthly_report") {
    const monthlyArticle = buildPerformanceReportArticle(trades, "monthly");
    article = {
      intro: monthlyArticle.intro,
      strengths: monthlyArticle.strengths,
      improvements: monthlyArticle.improvements,
      nextFocus: monthlyArticle.nextFocus,
      viewHref: monthlyArticle.viewHref,
    };
  }

  const subject =
    notificationType === "daily_report"
      ? `TradeCoach Daily Report · ${label}`
      : notificationType === "weekly_report"
        ? `TradeCoach Weekly Grade · ${label}`
        : `TradeCoach Monthly Review · ${label}`;

  const result = await sendEmail({
    to: row.email,
    subject,
    html: buildReportEmailHtml(summary, firstName, article),
    text: buildReportEmailText(summary, firstName, article),
  });

  if (!result.sent) {
    return { skipped: true, reason: result.error || "email_not_sent" };
  }

  await logNotificationSent(
    admin,
    row.user_id,
    notificationType,
    periodKey,
  );

  return { skipped: false, sent: true };
}

export async function sendDailyReports(admin: SupabaseClient, now = new Date()) {
  const rows = await loadEligibleRows(admin, "daily_report");
  const ny = getNewYorkDateParts(now);
  const periodKey = ny.key;
  const label = `Daily Report · ${ny.month}/${ny.day}/${ny.year}`;
  const results = [];

  for (const row of rows) {
    const trades = filterTradesForNewYorkDate(
      await loadUserTrades(admin, row.user_id),
      periodKey,
    );

    if (trades.length === 0) {
      results.push({ userId: row.user_id, skipped: true, reason: "no_trades" });
      continue;
    }

    results.push({
      userId: row.user_id,
      ...(await sendReportEmail(
        admin,
        row,
        "daily_report",
        periodKey,
        label,
        trades,
      )),
    });
  }

  return results;
}

export async function sendWeeklyReports(admin: SupabaseClient, now = new Date()) {
  const rows = await loadEligibleRows(admin, "weekly_report");
  const ny = getNewYorkDateParts(now);
  const periodKey = `${ny.year}-W${getIsoWeek(now)}`;
  const label = `Weekly Report · Week of ${ny.month}/${ny.day}/${ny.year}`;
  const results = [];

  for (const row of rows) {
    const trades = filterTradesForCurrentWeek(
      await loadUserTrades(admin, row.user_id),
      now,
    );

    if (trades.length === 0) {
      results.push({ userId: row.user_id, skipped: true, reason: "no_trades" });
      continue;
    }

    results.push({
      userId: row.user_id,
      ...(await sendReportEmail(
        admin,
        row,
        "weekly_report",
        periodKey,
        label,
        trades,
      )),
    });
  }

  return results;
}

export async function sendMonthlyReports(
  admin: SupabaseClient,
  now = new Date(),
) {
  const rows = await loadEligibleRows(admin, "monthly_report");
  const ny = getNewYorkDateParts(now);
  const targetMonth = ny.month === 1 ? 12 : ny.month - 1;
  const targetYear = ny.month === 1 ? ny.year - 1 : ny.year;
  const periodKey = `${targetYear}-${String(targetMonth).padStart(2, "0")}`;
  const label = `Monthly Report · ${periodKey}`;
  const results = [];

  for (const row of rows) {
    const trades = filterTradesForMonth(
      await loadUserTrades(admin, row.user_id),
      targetYear,
      targetMonth,
    );

    if (trades.length === 0) {
      results.push({ userId: row.user_id, skipped: true, reason: "no_trades" });
      continue;
    }

    results.push({
      userId: row.user_id,
      ...(await sendReportEmail(
        admin,
        row,
        "monthly_report",
        periodKey,
        label,
        trades,
      )),
    });
  }

  return results;
}

export async function sendTradeSyncAlerts(
  admin: SupabaseClient,
  now = new Date(),
) {
  const rows = await loadEligibleRows(admin, "trade_sync_alert");
  const periodKey = getNewYorkDateParts(now).key;
  const results = [];

  for (const row of rows) {
    const staleAccounts = await loadStaleAccounts(admin, row.user_id);

    if (staleAccounts.length === 0) {
      results.push({
        userId: row.user_id,
        skipped: true,
        reason: "no_stale_accounts",
      });
      continue;
    }

    const alreadySent = await wasNotificationSent(
      admin,
      row.user_id,
      "trade_sync_alert",
      periodKey,
    );

    if (alreadySent) {
      results.push({ userId: row.user_id, skipped: true, reason: "already_sent" });
      continue;
    }

    const { data: authUser } = await admin.auth.admin.getUserById(row.user_id);
    const firstName = getFirstName(
      row.email,
      (authUser.user?.user_metadata || {}) as Record<string, unknown>,
    );

    const result = await sendEmail({
      to: row.email,
      subject: "TradeCoach · Broker Sync Needs Attention",
      html: buildSyncAlertEmailHtml(
        firstName,
        staleAccounts.map((account) => ({
          name:
            account.account_name ||
            account.account_number_masked ||
            "Tradovate account",
          detail: account.last_synced_at
            ? `Last synced ${new Date(account.last_synced_at).toLocaleString("en-US", { timeZone: "America/New_York" })}.`
            : "This account has not synced yet.",
        })),
      ),
      text: `One or more broker accounts need attention. Review them at ${getAppBaseUrl()}/dashboard/accounts`,
    });

    if (!result.sent) {
      results.push({
        userId: row.user_id,
        skipped: true,
        reason: result.error || "email_not_sent",
      });
      continue;
    }

    await logNotificationSent(
      admin,
      row.user_id,
      "trade_sync_alert",
      periodKey,
    );

    results.push({ userId: row.user_id, sent: true, skipped: false });
  }

  return results;
}

async function loadEligibleRows(
  admin: SupabaseClient,
  kind:
    | "daily_report"
    | "weekly_report"
    | "monthly_report"
    | "trade_sync_alert",
) {
  const { data, error } = await admin
    .from("user_notification_settings")
    .select("*");

  if (error) {
    throw error;
  }

  const rows = (data || []) as NotificationSettingsRow[];
  const eligible: NotificationSettingsRow[] = [];

  for (const row of rows) {
    const enabled =
      kind === "daily_report"
        ? row.daily_report_enabled
        : kind === "weekly_report"
          ? row.weekly_report_enabled
          : kind === "monthly_report"
            ? row.monthly_report_enabled
            : row.trade_sync_alerts_enabled;

    if (!enabled) {
      continue;
    }

    const hasAccess = await userHasActiveAccess(admin, row.user_id, row.email);

    if (!hasAccess) {
      continue;
    }

    eligible.push(row);
  }

  return eligible;
}

function getIsoWeek(date: Date) {
  const target = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const dayNumber = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export async function sendTestReportForUser(
  admin: SupabaseClient,
  userId: string,
  email: string,
  reportType: "daily_report" | "weekly_report" | "monthly_report",
) {
  const trades = await loadUserTrades(admin, userId);
  const now = new Date();
  let filtered = trades;
  let label = "Test Report";

  if (reportType === "daily_report") {
    const ny = getNewYorkDateParts(now);
    filtered = filterTradesForNewYorkDate(trades, ny.key);
    label = `Daily Report · ${ny.month}/${ny.day}/${ny.year}`;
  } else if (reportType === "weekly_report") {
    filtered = filterTradesForCurrentWeek(trades, now);
    label = "Weekly Report · Current Week";
  } else {
    const ny = getNewYorkDateParts(now);
    filtered = filterTradesForMonth(trades, ny.year, ny.month);
    label = `Monthly Report · ${ny.year}-${String(ny.month).padStart(2, "0")}`;
  }

  const summary = buildTradingReportSummary(
    filtered.length > 0 ? filtered : trades.slice(0, 10),
    label,
  );

  const { data: authUser } = await admin.auth.admin.getUserById(userId);
  const firstName = getFirstName(
    email,
    (authUser.user?.user_metadata || {}) as Record<string, unknown>,
  );

  let article: ReportEmailArticle | undefined;

  if (reportType === "weekly_report") {
    const weeklyArticle = buildPerformanceReportArticle(
      filtered.length > 0 ? filtered : trades.slice(0, 10),
      "weekly",
    );
    article = {
      intro: weeklyArticle.intro,
      strengths: weeklyArticle.strengths,
      improvements: weeklyArticle.improvements,
      nextFocus: weeklyArticle.nextFocus,
      viewHref: weeklyArticle.viewHref,
    };
  } else if (reportType === "monthly_report") {
    const monthlyArticle = buildPerformanceReportArticle(
      filtered.length > 0 ? filtered : trades.slice(0, 10),
      "monthly",
    );
    article = {
      intro: monthlyArticle.intro,
      strengths: monthlyArticle.strengths,
      improvements: monthlyArticle.improvements,
      nextFocus: monthlyArticle.nextFocus,
      viewHref: monthlyArticle.viewHref,
    };
  }

  return sendEmail({
    to: email,
    subject: `TradeCoach Test · ${label}`,
    html: buildReportEmailHtml(summary, firstName, article),
    text: buildReportEmailText(summary, firstName, article),
  });
}
