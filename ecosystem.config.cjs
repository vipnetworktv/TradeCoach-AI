module.exports = {
  apps: [
    {
      name: "tradecoach",
      cwd: "/var/www/tradecoach",
      script: "node_modules/next/dist/bin/next",
      args: "start -H 127.0.0.1 -p 3000",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
        NODE_OPTIONS: "--max-old-space-size=768",
      },
      autorestart: true,
      max_restarts: 20,
      min_uptime: "10s",
      restart_delay: 3000,
      max_memory_restart: "900M",
      exp_backoff_restart_delay: 1000,
    },
    {
      name: "tradecoach-api",
      cwd: "/var/www/tradecoach/backend",
      script: ".venv/bin/python",
      args: "-m uvicorn main:app --host 127.0.0.1 --port 8000",
      interpreter: "none",
      env: {
        NODE_ENV: "production",
      },
      autorestart: true,
      max_restarts: 20,
      min_uptime: "10s",
      restart_delay: 3000,
      max_memory_restart: "400M",
    },
  ],
};
