// TradeCoach PM2 config — uses dedicated ports (3001/8001) so vip2025.live
// and other apps on this VPS cannot steal 3000/8000.
const APP_PORT = process.env.TRADECOACH_APP_PORT || "3001";
const API_PORT = process.env.TRADECOACH_API_PORT || "8001";

module.exports = {
  apps: [
    {
      name: "tradecoach",
      cwd: "/var/www/tradecoach",
      script: "node_modules/next/dist/bin/next",
      args: `start -H 127.0.0.1 -p ${APP_PORT}`,
      env: {
        NODE_ENV: "production",
        PORT: APP_PORT,
        TRADECOACH_APP_PORT: APP_PORT,
        NODE_OPTIONS: "--max-old-space-size=512",
      },
      autorestart: true,
      max_restarts: 100,
      min_uptime: "30s",
      restart_delay: 5000,
      kill_timeout: 8000,
      listen_timeout: 15000,
      max_memory_restart: "600M",
      exp_backoff_restart_delay: 2000,
    },
    {
      name: "tradecoach-api",
      cwd: "/var/www/tradecoach/backend",
      script: ".venv/bin/python",
      args: `-m uvicorn main:app --host 127.0.0.1 --port ${API_PORT} --workers 1`,
      interpreter: "none",
      env: {
        NODE_ENV: "production",
        TRADECOACH_API_PORT: API_PORT,
      },
      autorestart: true,
      max_restarts: 100,
      min_uptime: "30s",
      restart_delay: 5000,
      kill_timeout: 8000,
      max_memory_restart: "350M",
      exp_backoff_restart_delay: 2000,
    },
  ],
};
