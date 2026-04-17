import { Button } from "@milady/ui";
import { CircleDollarSign, Plus, RefreshCw, Zap } from "lucide-react";
import { useEffect } from "react";
import { useApp } from "../AppContext";

export function CloudDashboard() {
  const {
    t,
    miladyCloudConnected,
    miladyCloudCredits,
    miladyCloudCreditsLow,
    miladyCloudCreditsCritical,
    miladyCloudTopUpUrl,
    miladyCloudUserId,
    miladyCloudLoginBusy,
    handleCloudLogin,
    handleCloudDisconnect,
    miladyCloudDisconnecting: cloudDisconnecting,
    loadDropStatus,
  } = useApp();

  useEffect(() => {
    if (miladyCloudConnected) {
      void loadDropStatus();
    }
  }, [miladyCloudConnected, loadDropStatus]);

  const creditStatusColor = miladyCloudCreditsCritical
    ? "text-danger"
    : miladyCloudCreditsLow
      ? "text-warn"
      : "text-ok";

  if (!miladyCloudConnected) {
    return (
      <div className="flex items-center gap-4 p-4">
        <div className="w-10 h-10 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0">
          <Zap className="w-5 h-5 text-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-txt-strong">
            Milady Cloud
          </div>
          <div className="text-xs text-muted">
            {t("miladyclouddashboard.ScaleYourAgents")}
          </div>
        </div>
        <Button
          variant="default"
          size="sm"
          onClick={handleCloudLogin}
          disabled={miladyCloudLoginBusy}
        >
          {miladyCloudLoginBusy ? (
            <RefreshCw className="w-3.5 h-3.5 mr-2 animate-spin" />
          ) : (
            <Zap className="w-3.5 h-3.5 mr-2" />
          )}
          {miladyCloudLoginBusy
            ? t("miladyclouddashboard.Connecting")
            : t("miladyclouddashboard.ConnectMiladyCloud")}
        </Button>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      {/* Credits + Top up — single row */}
      <div className="flex items-center gap-3 p-3 rounded-lg border border-accent/20 bg-accent/5">
        <div className="w-9 h-9 rounded-md bg-accent text-accent-fg flex items-center justify-center shrink-0">
          <CircleDollarSign className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-muted font-semibold">
            {t("miladyclouddashboard.AvailableBalance")}
          </div>
          <div
            className={`text-xl font-bold tabular-nums leading-tight ${creditStatusColor}`}
          >
            $
            {miladyCloudCredits !== null
              ? miladyCloudCredits.toFixed(2)
              : "0.00"}
          </div>
        </div>
        <Button
          variant="default"
          size="sm"
          onClick={() => window.open(miladyCloudTopUpUrl, "_blank")}
        >
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          {t("miladyclouddashboard.TopUpCredits")}
        </Button>
      </div>

      {/* Account row */}
      <div className="flex items-center justify-between gap-3 px-1">
        <div className="text-xs text-muted min-w-0 truncate">
          <span className="text-[10px] uppercase tracking-wider font-semibold mr-2">
            {t("miladyclouddashboard.CloudUserID")}
          </span>
          <code className="font-mono text-[11px] text-txt-strong">
            {miladyCloudUserId || "—"}
          </code>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="text-danger border-danger/30 hover:bg-danger/10"
          onClick={handleCloudDisconnect}
          disabled={cloudDisconnecting}
        >
          {cloudDisconnecting
            ? t("miladyclouddashboard.Disconnecting")
            : t("miladyclouddashboard.Disconnect")}
        </Button>
      </div>
    </div>
  );
}
