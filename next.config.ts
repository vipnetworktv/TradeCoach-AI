import type { NextConfig } from "next";
import path from "node:path";

// Pin workspace root so nested deploy paths (e.g. /var/www/tradecoach/tradecoach)
// are not overridden by a parent package-lock.json.
const appRoot = path.join(__dirname);

const nextConfig: NextConfig = {
  outputFileTracingRoot: appRoot,
  turbopack: {
    root: appRoot,
  },
};

export default nextConfig;
