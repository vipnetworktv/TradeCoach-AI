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
      },
      max_restarts: 10,
      restart_delay: 5000,
    },
  ],
};
