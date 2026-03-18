import { useEffect, useState, type ReactNode } from "react";
import { getToken, setToken, clearToken, isTokenExpired, extractTokenFromUrl, redirectToLogin } from "../../lib/auth";

export function AuthGate({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const urlToken = extractTokenFromUrl(window.location.search);
    if (urlToken) {
      setToken(urlToken);
      window.history.replaceState({}, "", window.location.pathname + window.location.hash);
    }

    const token = getToken();
    if (!token || isTokenExpired(token)) {
      clearToken();
      redirectToLogin();
      return;
    }

    setAuthed(true);
    setChecking(false);
  }, []);

  if (checking && !authed) {
    return (
      <div className="min-h-screen bg-dark flex items-center justify-center">
        <div className="text-text-muted font-mono text-sm">Authenticating...</div>
      </div>
    );
  }

  return <>{children}</>;
}
