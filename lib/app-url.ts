const PRODUCTION_APP_URL = "https://tradecoachai.org";

/** Public site origin for redirects, PayPal return URLs, and email links. */
export function getAppBaseUrl() {
  const fromEnv =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.FRONTEND_URL?.trim() ||
    process.env.APP_URL?.trim();

  if (fromEnv) {
    return fromEnv.replace(/\/$/, "");
  }

  if (process.env.NODE_ENV === "production") {
    return PRODUCTION_APP_URL;
  }

  if (process.env.VERCEL_URL?.trim()) {
    const host = process.env.VERCEL_URL.trim().replace(/^https?:\/\//, "");
    return `https://${host}`;
  }

  return "http://localhost:3000";
}
