/**
 * Pairing view component — simple pairing screen for authentication.
 */

import { useApp } from "../AppContext";
import { MiladyBootShell } from "./MiladyBootShell.js";

const PAIRING_DOCS_URL =
  "https://github.com/milady-ai/milady/blob/develop/docs/api-reference.mdx#authenticate-via-pairing-code";

export function PairingView() {
  const {
    currentTheme,
    pairingEnabled,
    pairingExpiresAt,
    pairingCodeInput,
    pairingError,
    pairingBusy,
    handlePairingSubmit,
    setState,
  } = useApp();

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setState("pairingCodeInput", e.target.value);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void handlePairingSubmit();
  };

  const formatExpiry = (timestamp: number | null): string => {
    if (!timestamp) return "";
    const now = Date.now();
    const diff = timestamp - now;
    if (diff <= 0) return "Expired";
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return `Expires in ${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const content = (
    <div className={currentTheme === "milady-os" ? "p-6" : ""}>
      {currentTheme !== "milady-os" ? (
        <>
          <h1 className="mb-2 text-lg font-semibold text-txt-strong">
            Pairing Required
          </h1>
          <p className="mb-4 leading-relaxed text-muted">
            Enter the pairing code from the server logs to authenticate.
          </p>
        </>
      ) : null}

      {pairingEnabled ? (
        <form onSubmit={handleSubmit}>
          <div>
            <label
              htmlFor="pairing-code"
              className="mb-2 block text-sm text-txt-strong"
            >
              Pairing Code
            </label>
            <input
              id="pairing-code"
              type="text"
              value={pairingCodeInput}
              onChange={handleCodeChange}
              placeholder="Enter pairing code"
              disabled={pairingBusy}
              className="w-full rounded-lg border border-border bg-bg-muted px-3 py-2.5 text-sm text-txt focus:border-accent focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          <div className="mt-3 flex gap-2.5">
            <button
              type="submit"
              className="cursor-pointer border border-accent bg-accent px-6 py-2 text-sm text-accent-fg hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
              disabled={pairingBusy || !pairingCodeInput.trim()}
            >
              {pairingBusy ? "Pairing..." : "Submit"}
            </button>
          </div>

          {pairingError ? (
            <p className="mt-2.5 text-[13px] text-danger">{pairingError}</p>
          ) : null}

          {pairingExpiresAt ? (
            <p className="mt-2.5 text-[13px] text-muted">
              {formatExpiry(pairingExpiresAt)}
            </p>
          ) : null}
        </form>
      ) : (
        <div className="space-y-2 text-sm text-muted">
          <p>Pairing is not enabled on this server.</p>
          <p>Next steps:</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Ask the server owner for an API token.</li>
            <li>Enable pairing on the server and restart Pro Streamer.</li>
          </ol>
          <a
            href={PAIRING_DOCS_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex rounded border border-border px-3 py-2 text-txt hover:border-accent hover:text-accent"
          >
            Pairing setup docs
          </a>
        </div>
      )}
    </div>
  );

  if (currentTheme === "milady-os") {
    return (
      <MiladyBootShell
        title="PAIRING LINK"
        subtitle="Authenticate this node before the dashboard unlocks"
        status={
          pairingEnabled
            ? pairingExpiresAt
              ? formatExpiry(pairingExpiresAt)
              : "pairing ready"
            : "pairing unavailable"
        }
        identityLabel="rasp"
        panelClassName="max-w-[560px] mx-auto"
      >
        {content}
      </MiladyBootShell>
    );
  }

  return (
    <div className="mx-auto mt-15 max-w-[560px] rounded-[10px] border border-border bg-card p-6">
      {content}
    </div>
  );
}
