import ActiveSessionPanel from "@/components/active-session-panel";
import ExtensionPairingPanel from "@/components/extension-pairing-panel";
import NotificationSettingsPanel from "@/components/notification-settings";
import PasswordSettingsPanel from "@/components/password-settings-panel";
import ProfileSettingsPanel from "@/components/profile-settings-panel";
import TradingDataSettingsPanel from "@/components/trading-data-settings-panel";
import TradingPreferencesPanel from "@/components/trading-preferences-panel";
import TwoFactorSettingsPanel from "@/components/two-factor-settings";

export default function SettingsPage() {
  return (
    <>
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-400">
          Account Settings
        </p>

        <h2 className="mt-2 text-3xl font-extrabold">
          Customize Your TradeCoach AI Experience
        </h2>

        <p className="mt-2 max-w-3xl leading-7 text-slate-400">
          Manage your profile, trading preferences, notifications, security,
          and account settings.
        </p>
      </div>

      <div className="mt-8 grid gap-8 xl:grid-cols-[1fr_0.8fr]">
        <div className="space-y-8">
          <ProfileSettingsPanel />
          <TradingPreferencesPanel />
          <NotificationSettingsPanel />
        </div>

        <div className="space-y-8">
          <ExtensionPairingPanel />
          <PasswordSettingsPanel />
          <TwoFactorSettingsPanel />
          <ActiveSessionPanel />

          <TradingDataSettingsPanel />

          <div className="rounded-3xl border border-rose-500/20 bg-rose-500/5 p-6">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-rose-400">
              Danger Zone
            </p>

            <h3 className="mt-2 text-2xl font-bold">Delete Account</h3>

            <p className="mt-3 text-sm leading-6 text-slate-400">
              Permanently delete your TradeCoach AI account, connected broker
              information, imported trades, reports, and AI coaching history.
            </p>

            <button
              type="button"
              disabled
              className="mt-5 w-full cursor-not-allowed rounded-xl border border-rose-500/20 px-5 py-3 font-semibold text-rose-300/50"
            >
              Delete My Account
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
