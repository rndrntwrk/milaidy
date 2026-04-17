import { useAuth } from "../../lib/useAuth";

export function SessionTile({
  onSignIn,
  isSigningIn = false,
}: {
  onSignIn: () => void;
  isSigningIn?: boolean;
}) {
  const { isAuthenticated, signOut } = useAuth();

  return (
    <div className="rounded-lg border border-border bg-black/30 p-3">
      <div className="flex items-center gap-2.5">
        <div
          aria-hidden="true"
          className={`h-2 w-2 rounded-full ${
            isAuthenticated
              ? "bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.35)]"
              : isSigningIn
                ? "bg-brand animate-pulse"
                : "bg-white/25"
          }`}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-medium text-white/90">
            {isAuthenticated ? "cloud user" : "not signed in"}
          </div>
          <div className="mt-0.5 font-mono text-[10px] lowercase tracking-[0.08em] text-white/45">
            {isAuthenticated
              ? "cloud: connected"
              : isSigningIn
                ? "waiting for sign-in"
                : "cloud: offline"}
          </div>
        </div>
      </div>
      <div className="mt-2.5">
        {isAuthenticated ? (
          <button
            type="button"
            onClick={signOut}
            className="w-full rounded-md border border-border px-2.5 py-1.5 text-[11px] text-white/60 transition hover:border-white/20 hover:text-white/90 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white/30"
          >
            sign out
          </button>
        ) : (
          <button
            type="button"
            onClick={onSignIn}
            className="w-full rounded-md bg-brand px-2.5 py-1.5 text-[11px] font-medium text-black transition duration-200 hover:bg-[var(--color-gold-300)] active:scale-[0.98]"
          >
            sign in to cloud
          </button>
        )}
      </div>
    </div>
  );
}
