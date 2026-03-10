import { Button, SectionCard } from "@milady/ui";
import {
  CircleDollarSign,
  ExternalLink,
  History,
  LayoutDashboard,
  Plus,
  RefreshCw,
  Settings,
  Shield,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
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

  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadDropStatus();
    // Simulate some network delay for better UX feel
    setTimeout(() => setRefreshing(false), 800);
  }, [loadDropStatus]);

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
      <div className="flex flex-col items-center justify-center h-full max-w-2xl mx-auto px-6 text-center animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="w-20 h-20 rounded-3xl bg-accent/10 flex items-center justify-center mb-8 shadow-inner border border-accent/20">
          <Zap className="w-10 h-10 text-accent animate-pulse" />
        </div>
        <h1 className="text-4xl font-bold text-txt-strong mb-4 tracking-tight">
          Milady Cloud
        </h1>
        <p className="text-lg text-muted mb-10 leading-relaxed">
          {t("miladyclouddashboard.ScaleYourAgents")}
        </p>
        <Button
          variant="default"
          size="lg"
          className="rounded-2xl px-10 py-6 text-lg font-bold shadow-xl shadow-accent/20 hover:shadow-accent/40 hover:-translate-y-1 transition-all duration-300"
          onClick={handleCloudLogin}
          disabled={miladyCloudLoginBusy}
        >
          {miladyCloudLoginBusy ? (
            <RefreshCw className="w-5 h-5 mr-3 animate-spin" />
          ) : (
            <Zap className="w-5 h-5 mr-3" />
          )}
          {miladyCloudLoginBusy
            ? t("miladyclouddashboard.Connecting")
            : t("miladyclouddashboard.ConnectMiladyCloud")}
        </Button>
        <p className="mt-6 text-sm text-muted/60">
          {t("miladyclouddashboard.NewToMiladyCloud")}{" "}
          <a
            href="https://miladycloud.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline hover:text-accent-hover transition-colors"
          >
            {t("miladyclouddashboard.LearnMore")}
          </a>
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto custom-scrollbar p-6 lg:p-10 space-y-8 max-w-7xl mx-auto animate-in fade-in duration-500">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center shadow-lg shadow-accent/20">
              <LayoutDashboard className="w-5 h-5 text-accent-fg" />
            </div>
            <h1 className="text-3xl font-bold text-txt-strong tracking-tight">
              {t("miladyclouddashboard.CloudDashboard")}
            </h1>
          </div>
          <p className="text-muted">
            {t("miladyclouddashboard.ManageInstance")}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl border-border/50 bg-bg/50 backdrop-blur-sm"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw
              className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`}
            />
            {t("miladyclouddashboard.Refresh")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl border-danger/30 text-danger hover:bg-danger/10"
            onClick={handleCloudDisconnect}
            disabled={cloudDisconnecting}
          >
            {cloudDisconnecting
              ? t("miladyclouddashboard.Disconnecting")
              : t("miladyclouddashboard.Disconnect")}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Resource View */}
        <div className="lg:col-span-2 space-y-8">
          {/* Active Agents Grid */}
          <SectionCard
            title={t("miladyclouddashboard.CloudAgents")}
            description={t("miladyclouddashboard.CloudAgentsDesc")}
            className="border-border/50 bg-bg/40 backdrop-blur-xl rounded-3xl overflow-hidden shadow-sm"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              {/* This will be populated by cloud agents list later */}
              <div className="aspect-[4/3] rounded-2xl border border-dashed border-border/60 flex flex-col items-center justify-center p-6 text-center group hover:border-accent/50 hover:bg-accent/5 transition-all duration-300 cursor-pointer">
                <div className="w-12 h-12 rounded-full bg-bg-accent flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <Plus className="w-6 h-6 text-muted group-hover:text-accent" />
                </div>
                <h3 className="font-bold text-txt-strong mb-1">
                  {t("miladyclouddashboard.DeployNewAgent")}
                </h3>
                <p className="text-xs text-muted">
                  {t("miladyclouddashboard.InitializeInstance")}
                </p>
              </div>
            </div>
          </SectionCard>

          {/* Cloud Usage Statistics (Placeholder) */}
          <SectionCard
            title={t("miladyclouddashboard.UsageMetrics")}
            description={t("miladyclouddashboard.UsageMetricsDesc")}
            className="border-border/50 bg-bg/40 backdrop-blur-xl rounded-3xl shadow-sm"
          >
            <div className="h-48 flex items-center justify-center text-muted italic text-sm border border-border/30 rounded-2xl bg-bg/20 mt-4">
              {t("miladyclouddashboard.MetricsPlaceholder")}
            </div>
          </SectionCard>
        </div>

        {/* Sidebar: Billing & Account */}
        <div className="space-y-8">
          {/* Credit Wallet Card */}
          <div className="bg-gradient-to-br from-accent/10 to-accent/5 border border-accent/20 rounded-3xl p-6 shadow-xl relative overflow-hidden group">
            <div className="absolute -right-10 -top-10 w-40 h-40 bg-accent/10 rounded-full blur-3xl group-hover:bg-accent/20 transition-all duration-700" />

            <div className="relative z-10">
              <div className="flex items-center justify-between mb-8">
                <div className="w-12 h-12 rounded-2xl bg-accent text-accent-fg flex items-center justify-center">
                  <CircleDollarSign className="w-6 h-6" />
                </div>
                <div className="text-[10px] uppercase font-bold tracking-widest text-accent/80 bg-accent/10 px-2 py-1 rounded-md border border-accent/20">
                  {t("miladyclouddashboard.CreditWallet")}
                </div>
              </div>

              <div className="mb-8">
                <span className="text-[11px] text-muted uppercase font-bold tracking-wider block mb-1">
                  {t("miladyclouddashboard.AvailableBalance")}
                </span>
                <div
                  className={`text-4xl font-bold tracking-tight flex items-baseline gap-1 ${creditStatusColor}`}
                >
                  <span className="text-2xl opacity-70">$</span>
                  {miladyCloudCredits !== null
                    ? miladyCloudCredits.toFixed(2)
                    : "0.00"}
                </div>
              </div>

              <div className="space-y-3">
                <Button
                  variant="default"
                  className="w-full rounded-2xl h-12 font-bold shadow-lg shadow-accent/20"
                  onClick={() => window.open(miladyCloudTopUpUrl, "_blank")}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  {t("miladyclouddashboard.TopUpCredits")}
                </Button>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1 rounded-xl h-10 border-border/50 text-xs"
                  >
                    <History className="w-3 h-3 mr-2" />
                    {t("miladyclouddashboard.History")}
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 rounded-xl h-10 border-border/50 text-xs"
                  >
                    <Settings className="w-3 h-3 mr-2" />
                    {t("miladyclouddashboard.Pricing")}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Account Info */}
          <SectionCard
            title={t("miladyclouddashboard.AccountDetails")}
            className="border-border/50 bg-bg/40 backdrop-blur-xl rounded-3xl shadow-sm"
          >
            <div className="space-y-4 mt-2">
              <div className="p-3 rounded-2xl bg-bg/30 border border-border/30">
                <span className="text-[10px] text-muted uppercase font-bold tracking-wider mb-1 block">
                  {t("miladyclouddashboard.CloudUserID")}
                </span>
                <code className="text-xs text-txt-strong break-all font-mono">
                  {miladyCloudUserId || "Not available"}
                </code>
              </div>

              <div className="flex items-center justify-between p-3">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-ok" />
                  <span className="text-xs font-medium">
                    {t("miladyclouddashboard.SecurityStatus")}
                  </span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-ok/10 text-ok font-bold uppercase tracking-wider border border-ok/20">
                  {t("miladyclouddashboard.Secure")}
                </span>
              </div>

              <Button
                variant="link"
                className="w-full text-xs text-accent justify-start px-3 h-auto"
                onClick={() =>
                  window.open("https://miladycloud.ai/dashboard", "_blank")
                }
              >
                {t("miladyclouddashboard.AdvancedDashboard")}
                <ExternalLink className="w-3 h-3 ml-2" />
              </Button>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
