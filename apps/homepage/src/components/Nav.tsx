import { releaseData } from "../generated/release-data";

export function Nav() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 md:px-12 bg-dark/95 backdrop-blur-md border-b border-sharp">
      <a
        href="#top"
        className="text-2xl font-black text-text-light tracking-tighter uppercase flex items-center gap-2"
      >
        <img src="/logo.png" alt="Milady" className="w-7 h-7 rounded-full" />
        MILADY
      </a>
      <div className="hidden md:flex items-center gap-8 font-mono text-xs uppercase tracking-widest">
        <a
          href="#install"
          className="text-text-muted hover:text-brand transition-colors duration-300"
        >
          Install
        </a>
        <a
          href="https://cloud.milady.ai"
          target="_blank"
          rel="noreferrer"
          className="text-text-muted hover:text-brand transition-colors duration-300"
        >
          Cloud
        </a>
        <a
          href="#privacy"
          className="text-text-muted hover:text-brand transition-colors duration-300"
        >
          Privacy
        </a>
        <a
          href="#features"
          className="text-text-muted hover:text-brand transition-colors duration-300"
        >
          Features
        </a>
        <a
          href="#comparison"
          className="text-text-muted hover:text-brand transition-colors duration-300"
        >
          Why Local
        </a>
        <a
          href={releaseData.release.url}
          target="_blank"
          rel="noreferrer"
          className="border-sharp px-4 py-2 hover:bg-brand hover:text-dark hover:border-brand transition-all duration-300"
        >
          Releases
        </a>
      </div>
    </nav>
  );
}
