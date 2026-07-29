import type { ReportInsight } from "@/lib/performance-report-article";
import type { TradingReportSummary } from "@/lib/trading-report-summary";
import { getAppBaseUrl } from "@/lib/trading-report-summary";

export type ReportEmailArticle = {
  intro: string;
  strengths: ReportInsight[];
  improvements: ReportInsight[];
  nextFocus: string;
  viewHref: string;
};

function formatMoney(value: number, showPlus = false): string {
  const normalized = Math.abs(value) < 0.005 ? 0 : value;
  const formatted = Math.abs(normalized).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  if (normalized < 0) {
    return `-$${formatted}`;
  }

  if (normalized > 0 && showPlus) {
    return `+$${formatted}`;
  }

  return `$${formatted}`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function emailLogoMarkup(maxWidth = 220): string {
  const logoUrl = `${getAppBaseUrl()}/brand/tradecoach-ai-logo.png`;

  return `<img src="${logoUrl}" alt="TradeCoach AI" width="${maxWidth}" style="display:block;height:auto;max-width:${maxWidth}px;border:0;" />`;
}

export function buildReportEmailHtml(
  summary: TradingReportSummary,
  firstName: string,
  article?: ReportEmailArticle,
) {
  const tradeRows =
    summary.recentTrades.length > 0
      ? summary.recentTrades
          .map(
            (trade) => `
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid #1e293b;color:#e2e8f0;">${escapeHtml(trade.symbol)}</td>
                <td style="padding:10px 0;border-bottom:1px solid #1e293b;color:#94a3b8;">${escapeHtml(trade.side)}</td>
                <td style="padding:10px 0;border-bottom:1px solid #1e293b;color:#94a3b8;">${escapeHtml(trade.entry)} → ${escapeHtml(trade.exit)}</td>
                <td style="padding:10px 0;border-bottom:1px solid #1e293b;color:${trade.pnl >= 0 ? "#34d399" : "#fb7185"};font-weight:700;">${escapeHtml(formatMoney(trade.pnl, true))}</td>
              </tr>
            `,
          )
          .join("")
      : `<tr><td colspan="4" style="padding:16px 0;color:#94a3b8;">No trades in this period yet.</td></tr>`;

  const articleIntro = article
    ? `<div style="margin-top:20px;background:#020617;border:1px solid #1e293b;border-radius:16px;padding:18px;">
          <p style="margin:0;color:#22d3ee;font-size:13px;font-weight:700;">Your Week In Review</p>
          <p style="margin:10px 0 0;color:#cbd5e1;line-height:1.7;">${escapeHtml(article.intro)}</p>
        </div>`
    : "";

  const strengthsBlock = article?.strengths.length
    ? `<div style="margin-top:16px;background:#020617;border:1px solid #14532d;border-radius:16px;padding:18px;">
          <p style="margin:0;color:#34d399;font-size:13px;font-weight:700;">What You Did Well</p>
          ${article.strengths
            .map(
              (item) => `
                <div style="margin-top:12px;">
                  <p style="margin:0;color:#ffffff;font-weight:700;">${escapeHtml(item.title)}</p>
                  <p style="margin:6px 0 0;color:#cbd5e1;line-height:1.7;">${escapeHtml(item.body)}</p>
                </div>
              `,
            )
            .join("")}
        </div>`
    : `<div style="margin-top:20px;background:#020617;border:1px solid #1e293b;border-radius:16px;padding:18px;">
          <p style="margin:0;color:#22d3ee;font-size:13px;font-weight:700;">Coach Highlight</p>
          <p style="margin:10px 0 0;color:#cbd5e1;line-height:1.7;">${escapeHtml(summary.highlight)}</p>
        </div>`;

  const improvementsBlock = article?.improvements.length
    ? `<div style="margin-top:16px;background:#020617;border:1px solid #78350f;border-radius:16px;padding:18px;">
          <p style="margin:0;color:#fbbf24;font-size:13px;font-weight:700;">Where To Improve</p>
          ${article.improvements
            .map(
              (item) => `
                <div style="margin-top:12px;">
                  <p style="margin:0;color:#ffffff;font-weight:700;">${escapeHtml(item.title)}</p>
                  <p style="margin:6px 0 0;color:#cbd5e1;line-height:1.7;">${escapeHtml(item.body)}</p>
                </div>
              `,
            )
            .join("")}
        </div>`
    : `<div style="margin-top:16px;background:#020617;border:1px solid #1e293b;border-radius:16px;padding:18px;">
          <p style="margin:0;color:#22d3ee;font-size:13px;font-weight:700;">Focus Next Session</p>
          <p style="margin:10px 0 0;color:#cbd5e1;line-height:1.7;">${escapeHtml(summary.focus)}</p>
        </div>`;

  const nextFocusBlock = article
    ? `<div style="margin-top:16px;background:#020617;border:1px solid #1e293b;border-radius:16px;padding:18px;">
          <p style="margin:0;color:#22d3ee;font-size:13px;font-weight:700;">Focus Next Week</p>
          <p style="margin:10px 0 0;color:#cbd5e1;line-height:1.7;">${escapeHtml(article.nextFocus)}</p>
        </div>`
    : "";

  const articleUrl = article
    ? `${getAppBaseUrl()}${article.viewHref}`
    : `${getAppBaseUrl()}/dashboard/reports`;

  return `
    <div style="background:#020617;padding:32px 16px;font-family:Arial,sans-serif;color:#e2e8f0;">
      <div style="max-width:640px;margin:0 auto;background:#0f172a;border:1px solid #1e293b;border-radius:24px;overflow:hidden;">
        <div style="padding:28px 28px 12px;">
          ${emailLogoMarkup()}
          <h1 style="margin:12px 0 0;color:#ffffff;font-size:28px;">${escapeHtml(summary.label)}</h1>
          <p style="margin:12px 0 0;color:#94a3b8;line-height:1.6;">Hi ${escapeHtml(firstName)}, here is your latest trading report.</p>
        </div>

        <div style="padding:0 28px 28px;">
          <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:12px;">
            <div style="flex:1;min-width:140px;background:#020617;border:1px solid #1e293b;border-radius:16px;padding:16px;">
              <p style="margin:0;color:#94a3b8;font-size:12px;">Grade</p>
              <p style="margin:8px 0 0;color:#22d3ee;font-size:32px;font-weight:800;">${escapeHtml(summary.grade)}</p>
            </div>
            <div style="flex:1;min-width:140px;background:#020617;border:1px solid #1e293b;border-radius:16px;padding:16px;">
              <p style="margin:0;color:#94a3b8;font-size:12px;">Total P/L</p>
              <p style="margin:8px 0 0;color:${summary.totalPnl >= 0 ? "#34d399" : "#fb7185"};font-size:28px;font-weight:800;">${escapeHtml(formatMoney(summary.totalPnl, true))}</p>
            </div>
            <div style="flex:1;min-width:140px;background:#020617;border:1px solid #1e293b;border-radius:16px;padding:16px;">
              <p style="margin:0;color:#94a3b8;font-size:12px;">Win Rate</p>
              <p style="margin:8px 0 0;color:#ffffff;font-size:28px;font-weight:800;">${summary.winRate.toFixed(0)}%</p>
            </div>
          </div>

          ${article ? "" : `<div style="margin-top:20px;background:#020617;border:1px solid #1e293b;border-radius:16px;padding:18px;">
            <p style="margin:0;color:#22d3ee;font-size:13px;font-weight:700;">Coach Highlight</p>
            <p style="margin:10px 0 0;color:#cbd5e1;line-height:1.7;">${escapeHtml(summary.highlight)}</p>
          </div>`}

          ${articleIntro}
          ${strengthsBlock}
          ${improvementsBlock}
          ${nextFocusBlock}

          <div style="margin-top:20px;">
            <p style="margin:0 0 12px;color:#ffffff;font-size:16px;font-weight:700;">Recent Trades</p>
            <table style="width:100%;border-collapse:collapse;font-size:14px;">
              <thead>
                <tr>
                  <th align="left" style="padding:0 0 8px;color:#64748b;font-size:12px;text-transform:uppercase;">Symbol</th>
                  <th align="left" style="padding:0 0 8px;color:#64748b;font-size:12px;text-transform:uppercase;">Side</th>
                  <th align="left" style="padding:0 0 8px;color:#64748b;font-size:12px;text-transform:uppercase;">Entry → Exit</th>
                  <th align="left" style="padding:0 0 8px;color:#64748b;font-size:12px;text-transform:uppercase;">P/L</th>
                </tr>
              </thead>
              <tbody>${tradeRows}</tbody>
            </table>
          </div>

          <div style="margin-top:24px;">
            <a href="${escapeHtml(articleUrl)}" style="display:inline-block;background:#22d3ee;color:#020617;text-decoration:none;font-weight:700;padding:14px 18px;border-radius:12px;">${article ? "Read Full Report Article" : "Open Full Reports"}</a>
            <a href="${escapeHtml(getAppBaseUrl())}/dashboard/ai-coach" style="display:inline-block;margin-left:12px;color:#22d3ee;text-decoration:none;font-weight:700;padding:14px 0;">Chat With AI Coach</a>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function buildSyncAlertEmailHtml(
  firstName: string,
  accounts: Array<{ name: string; detail: string }>,
) {
  const rows = accounts
    .map(
      (account) => `
        <li style="margin:0 0 12px;color:#cbd5e1;line-height:1.6;">
          <strong style="color:#ffffff;">${escapeHtml(account.name)}</strong><br />
          ${escapeHtml(account.detail)}
        </li>
      `,
    )
    .join("");

  return `
    <div style="background:#020617;padding:32px 16px;font-family:Arial,sans-serif;color:#e2e8f0;">
      <div style="max-width:640px;margin:0 auto;background:#0f172a;border:1px solid #1e293b;border-radius:24px;padding:28px;">
        ${emailLogoMarkup()}
        <h1 style="margin:12px 0 0;color:#ffffff;font-size:28px;">Broker Sync Needs Attention</h1>
        <p style="margin:12px 0 20px;color:#94a3b8;line-height:1.6;">Hi ${escapeHtml(firstName)}, one or more connected accounts may not be syncing correctly.</p>
        <ul style="padding-left:18px;margin:0;">${rows}</ul>
        <a href="${escapeHtml(getAppBaseUrl())}/dashboard/accounts" style="display:inline-block;margin-top:24px;background:#22d3ee;color:#020617;text-decoration:none;font-weight:700;padding:14px 18px;border-radius:12px;">Review Accounts</a>
      </div>
    </div>
  `;
}

export function buildReportEmailText(
  summary: TradingReportSummary,
  firstName: string,
  article?: ReportEmailArticle,
) {
  const lines = [
    `Hi ${firstName},`,
    "",
    `${summary.label}`,
    `Grade: ${summary.grade}`,
    `Total P/L: ${formatMoney(summary.totalPnl, true)}`,
    `Win Rate: ${summary.winRate.toFixed(0)}%`,
    "",
  ];

  if (article) {
    lines.push(
      article.intro,
      "",
      "What you did well:",
      ...article.strengths.map((item) => `- ${item.title}: ${item.body}`),
      "",
      "Where to improve:",
      ...article.improvements.map((item) => `- ${item.title}: ${item.body}`),
      "",
      `Focus next week: ${article.nextFocus}`,
      "",
      `Read full article: ${getAppBaseUrl()}${article.viewHref}`,
    );
  } else {
    lines.push(
      summary.highlight,
      "",
      `Focus next session: ${summary.focus}`,
      "",
      `Open reports: ${getAppBaseUrl()}/dashboard/reports`,
    );
  }

  return lines.join("\n");
}
