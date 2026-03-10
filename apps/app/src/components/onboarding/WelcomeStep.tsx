import { useCallback, useRef, useState } from "react";
import { getVrmPreviewUrl, getVrmUrl, useApp } from "../../AppContext";
import { client } from "../../api-client";
import { OnboardingVrmAvatar } from "./OnboardingVrmAvatar";

export function WelcomeStep() {
  const { t, onboardingAvatar, customVrmUrl } = useApp();

  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPassword, setImportPassword] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);

  const importFileRef = useRef<HTMLInputElement>(null);
  const importBusyRef = useRef(false);

  // ── VRM avatar path ─────────────────────────────────────────────────
  const avatarVrmPath =
    onboardingAvatar === 0 && customVrmUrl
      ? customVrmUrl
      : getVrmUrl(onboardingAvatar || 1);
  const avatarFallbackPreviewUrl =
    onboardingAvatar > 0
      ? getVrmPreviewUrl(onboardingAvatar)
      : getVrmPreviewUrl(1);

  const handleImportAgent = useCallback(async () => {
    if (importBusyRef.current || importBusy) return;
    if (!importFile) {
      setImportError("Select an export file before importing.");
      return;
    }
    if (!importPassword || importPassword.length < 4) {
      setImportError("Password must be at least 4 characters.");
      return;
    }
    try {
      importBusyRef.current = true;
      setImportBusy(true);
      setImportError(null);
      setImportSuccess(null);
      const fileBuffer = await importFile.arrayBuffer();
      const result = await client.importAgent(importPassword, fileBuffer);
      const counts = result.counts;
      const summary = [
        counts.memories ? `${counts.memories} memories` : null,
        counts.entities ? `${counts.entities} entities` : null,
        counts.rooms ? `${counts.rooms} rooms` : null,
      ]
        .filter(Boolean)
        .join(", ");
      setImportSuccess(
        `Imported "${result.agentName}" successfully${summary ? `: ${summary}` : ""}. Restarting...`,
      );
      setImportPassword("");
      setImportFile(null);
      // Reload after short delay to let user see success message
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed");
    } finally {
      importBusyRef.current = false;
      setImportBusy(false);
    }
  }, [importBusy, importFile, importPassword]);

  return (
    <div className="max-w-[500px] mx-auto mt-10 text-center font-body">
      <OnboardingVrmAvatar
        vrmPath={avatarVrmPath}
        fallbackPreviewUrl={avatarFallbackPreviewUrl}
      />
      <h1 className="text-[28px] font-normal mb-1 text-txt-strong">
        {t("onboarding.welcomeLine1")}
      </h1>
      <h1 className="text-[28px] font-normal mb-1 text-txt-strong">
        {t("onboarding.welcomeLine2")}
      </h1>

      {!showImport ? (
        <button
          type="button"
          className="mt-6 text-[13px] text-muted hover:text-txt underline cursor-pointer bg-transparent border-none"
          onClick={() => setShowImport(true)}
        >
          {t("onboardingwizard.restoreFromBackup")}
        </button>
      ) : (
        <div className="mt-6 mx-auto max-w-[400px] border border-border bg-card rounded-xl p-4 text-left">
          <div className="flex justify-between items-center mb-3">
            <div className="font-bold text-sm text-txt-strong">
              {t("onboardingwizard.ImportAgent")}
            </div>
            <button
              type="button"
              className="text-[11px] text-muted hover:text-txt cursor-pointer bg-transparent border-none"
              onClick={() => {
                setShowImport(false);
                setImportError(null);
                setImportSuccess(null);
                setImportFile(null);
                setImportPassword("");
              }}
            >
              {t("onboardingwizard.cancel")}
            </button>
          </div>
          <div className="text-xs text-muted mb-3">
            {t("onboardingwizard.SelectAn")}{" "}
            <code className="text-[11px]">
              {t("onboardingwizard.ElizaAgent")}
            </code>{" "}
            {t("onboardingwizard.exportFileAndEnte")}
          </div>
          <div className="flex flex-col gap-2">
            <input
              ref={importFileRef}
              type="file"
              accept=".eliza-agent"
              onChange={(e) => {
                setImportFile(e.target.files?.[0] ?? null);
                setImportError(null);
              }}
              className="text-xs"
            />
            <input
              type="password"
              placeholder={t("onboardingwizard.DecryptionPassword")}
              value={importPassword}
              onChange={(e) => {
                setImportPassword(e.target.value);
                setImportError(null);
              }}
              className="px-2.5 py-1.5 border border-border bg-bg text-xs font-mono focus:border-accent focus:outline-none rounded"
            />
            {importError && (
              <div className="text-[11px] text-[var(--danger,#e74c3c)]">
                {importError}
              </div>
            )}
            {importSuccess && (
              <div className="text-[11px] text-[var(--ok,#16a34a)]">
                {importSuccess}
              </div>
            )}
            <button
              type="button"
              className="btn text-xs py-1.5 px-4 mt-1"
              disabled={importBusy || !importFile}
              onClick={() => void handleImportAgent()}
            >
              {importBusy ? "Importing..." : "Import & Restore"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
