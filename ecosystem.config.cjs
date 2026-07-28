module.exports = {
  apps: [
    {
      name: "tradecoach",
      cwd: "/var/www/tradecoach",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
        NODE_OPTIONS: "--max-old-space-size=1024",
      },
      max_restarts: 10,
      restart_delay: 5000,
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
      max_restarts: 10,
      restart_delay: 5000,
    },
  ],
};
