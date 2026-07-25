"use client";

import {
  FormEvent,
  useEffect,
  useState,
} from "react";

type TradovateStatus = {
  broker: string;
  configured: boolean;
  connection_method: string;
  message: string;
};

type ConnectResponse = {
  success: boolean;
  broker: string;
  environment: "live" | "demo";
  account_count: number;
  message: string;
};

type ConnectionState =
  | "checking"
  | "ready"
  | "connecting"
  | "success"
  | "error"
  | "backend-offline";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ||
  "http://localhost:8000";

export default function TradovateConnectForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [cid, setCid] = useState("");
  const [secret, setSecret] = useState("");

  const [environment, setEnvironment] = useState<
    "live" | "demo"
  >("live");

  const [showPassword, setShowPassword] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  const [connectionState, setConnectionState] =
    useState<ConnectionState>("checking");

  const [message, setMessage] = useState(
    "Checking the TradeCoach AI backend...",
  );

  const [accountCount, setAccountCount] = useState<
    number | null
  >(null);

  useEffect(() => {
    let isMounted = true;

    async function checkBackend() {
      try {
        const response = await fetch(
          `${API_URL}/api/brokers/tradovate/status`,
          {
            method: "GET",
            headers: {
              Accept: "application/json",
            },
            cache: "no-store",
          },
        );

        if (!response.ok) {
          throw new Error(
            `Backend returned status ${response.status}.`,
          );
        }

        const data =
          (await response.json()) as TradovateStatus;

        if (!isMounted) {
          return;
        }

        setConnectionState("ready");
        setMessage(data.message);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setConnectionState("backend-offline");

        setMessage(
          error instanceof Error
            ? `Could not reach the backend: ${error.message}`
            : "Could not reach the TradeCoach AI backend.",
        );
      }
    }

    checkBackend();

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const numericCid = Number(cid);

    if (!username.trim()) {
      setConnectionState("error");
      setMessage("Enter your Tradovate API username.");
      return;
    }

    if (!password) {
      setConnectionState("error");
      setMessage("Enter your dedicated Tradovate API password.");
      return;
    }

    if (!cid.trim() || !Number.isInteger(numericCid)) {
      setConnectionState("error");
      setMessage("Enter a valid numeric Tradovate CID.");
      return;
    }

    if (!secret.trim()) {
      setConnectionState("error");
      setMessage("Enter your Tradovate API secret.");
      return;
    }

    setConnectionState("connecting");
    setAccountCount(null);
    setMessage("Connecting securely to Tradovate...");

    try {
      const response = await fetch(
        `${API_URL}/api/brokers/tradovate/connect`,
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            username: username.trim(),
            password,
            cid: numericCid,
            secret: secret.trim(),
            environment,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : "Tradovate rejected the connection.",
        );
      }

      const result = data as ConnectResponse;

      setAccountCount(result.account_count);
      setConnectionState("success");
      setMessage(result.message);

      // Remove sensitive values from the form after a
      // successful credential test.
      setPassword("");
      setSecret("");
    } catch (error) {
      setConnectionState("error");

      setMessage(
        error instanceof Error
          ? error.message
          : "The Tradovate connection could not be completed.",
      );
    }
  }

  const isConnecting =
    connectionState === "connecting";

  const backendUnavailable =
    connectionState === "checking" ||
    connectionState === "backend-offline";

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <div className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] p-5">
        <p className="text-sm font-semibold text-amber-100">
          Use dedicated API credentials
        </p>

        <p className="mt-2 text-xs leading-6 text-slate-400">
          Do not enter your regular Tradovate account password.
          Enter the dedicated API password, CID, and secret created
          in your Tradovate API settings.
        </p>
      </div>

      <div>
        <label
          htmlFor="tradovate-username"
          className="block text-sm font-medium text-slate-200"
        >
          Tradovate API username
        </label>

        <input
          id="tradovate-username"
          name="tradovateUsername"
          type="text"
          value={username}
          onChange={(event) =>
            setUsername(event.target.value)
          }
          placeholder="Your Tradovate username"
          autoComplete="username"
          required
          disabled={isConnecting}
          className="mt-3 min-h-12 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/10 disabled:opacity-60"
        />
      </div>

      <div>
        <label
          htmlFor="tradovate-password"
          className="block text-sm font-medium text-slate-200"
        >
          Dedicated API password
        </label>

        <div className="relative mt-3">
          <input
            id="tradovate-password"
            name="tradovatePassword"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(event) =>
              setPassword(event.target.value)
            }
            placeholder="Enter your API password"
            autoComplete="new-password"
            required
            disabled={isConnecting}
            className="min-h-12 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 pr-20 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/10 disabled:opacity-60"
          />

          <button
            type="button"
            onClick={() =>
              setShowPassword((current) => !current)
            }
            disabled={isConnecting}
            className="absolute inset-y-0 right-0 px-4 text-xs font-medium text-slate-400 transition hover:text-white disabled:opacity-50"
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
      </div>

      <div>
        <label
          htmlFor="tradovate-cid"
          className="block text-sm font-medium text-slate-200"
        >
          API CID
        </label>

        <input
          id="tradovate-cid"
          name="tradovateCid"
          type="text"
          inputMode="numeric"
          value={cid}
          onChange={(event) =>
            setCid(
              event.target.value.replace(/[^0-9]/g, ""),
            )
          }
          placeholder="Example: 12345"
          autoComplete="off"
          required
          disabled={isConnecting}
          className="mt-3 min-h-12 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/10 disabled:opacity-60"
        />
      </div>

      <div>
        <label
          htmlFor="tradovate-secret"
          className="block text-sm font-medium text-slate-200"
        >
          API secret
        </label>

        <div className="relative mt-3">
          <input
            id="tradovate-secret"
            name="tradovateSecret"
            type={showSecret ? "text" : "password"}
            value={secret}
            onChange={(event) =>
              setSecret(event.target.value)
            }
            placeholder="Enter your API secret"
            autoComplete="new-password"
            required
            disabled={isConnecting}
            className="min-h-12 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 pr-20 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/10 disabled:opacity-60"
          />

          <button
            type="button"
            onClick={() =>
              setShowSecret((current) => !current)
            }
            disabled={isConnecting}
            className="absolute inset-y-0 right-0 px-4 text-xs font-medium text-slate-400 transition hover:text-white disabled:opacity-50"
          >
            {showSecret ? "Hide" : "Show"}
          </button>
        </div>
      </div>

      <fieldset>
        <legend className="text-sm font-medium text-slate-200">
          Tradovate environment
        </legend>

        <p className="mt-1 text-xs leading-5 text-slate-500">
          Select where the API credentials were created.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="cursor-pointer">
            <input
              type="radio"
              name="environment"
              value="live"
              checked={environment === "live"}
              onChange={() => setEnvironment("live")}
              disabled={isConnecting}
              className="peer sr-only"
            />

            <span className="block rounded-2xl border border-white/10 bg-slate-950/50 p-4 transition peer-checked:border-cyan-300/50 peer-checked:bg-cyan-300/[0.07] peer-disabled:cursor-not-allowed peer-disabled:opacity-50">
              <span className="block text-sm font-semibold text-white">
                Live
              </span>

              <span className="mt-1 block text-xs leading-5 text-slate-500">
                Funded, evaluation, and personal accounts.
              </span>
            </span>
          </label>

          <label className="cursor-pointer">
            <input
              type="radio"
              name="environment"
              value="demo"
              checked={environment === "demo"}
              onChange={() => setEnvironment("demo")}
              disabled={isConnecting}
              className="peer sr-only"
            />

            <span className="block rounded-2xl border border-white/10 bg-slate-950/50 p-4 transition peer-checked:border-cyan-300/50 peer-checked:bg-cyan-300/[0.07] peer-disabled:cursor-not-allowed peer-disabled:opacity-50">
              <span className="block text-sm font-semibold text-white">
                Demo
              </span>

              <span className="mt-1 block text-xs leading-5 text-slate-500">
                Tradovate simulation and practice accounts.
              </span>
            </span>
          </label>
        </div>
      </fieldset>

      <div
        className={`rounded-2xl border p-5 ${
          connectionState === "success"
            ? "border-emerald-300/20 bg-emerald-300/[0.06]"
            : connectionState === "error" ||
                connectionState === "backend-offline"
              ? "border-red-300/20 bg-red-300/[0.06]"
              : connectionState === "connecting"
                ? "border-cyan-300/20 bg-cyan-300/[0.06]"
                : "border-white/10 bg-slate-950/50"
        }`}
      >
        <p className="text-sm font-semibold text-white">
          {connectionState === "checking"
            ? "Checking backend"
            : connectionState === "connecting"
              ? "Connecting to Tradovate"
              : connectionState === "success"
                ? "Connection successful"
                : connectionState === "error"
                  ? "Connection failed"
                  : connectionState ===
                      "backend-offline"
                    ? "Backend unavailable"
                    : "Ready to connect"}
        </p>

        <p className="mt-2 text-xs leading-6 text-slate-400">
          {message}
        </p>

        {connectionState === "success" &&
        accountCount !== null ? (
          <p className="mt-3 text-sm font-medium text-emerald-300">
            Tradovate accounts found: {accountCount}
          </p>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={backendUnavailable || isConnecting}
        className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-cyan-500"
      >
        {isConnecting
          ? "Testing connection..."
          : "Connect Tradovate"}
      </button>

      <p className="text-center text-xs leading-5 text-slate-500">
        This step tests the connection only. Credentials are not
        saved yet.
      </p>
    </form>
  );
}