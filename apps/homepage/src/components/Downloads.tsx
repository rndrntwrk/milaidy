import { releaseData } from "../generated/release-data";

const shellCommand = releaseData.scripts.shell.command;
const powershellCommand = releaseData.scripts.powershell.command;
const checksumCommand = releaseData.release.checksum
  ? [
      "cd ~/Downloads",
      `curl -fsSLO ${releaseData.release.checksum.url}`,
      "shasum -a 256 --check --ignore-missing SHA256SUMS.txt",
    ].join("\n")
  : "";

export function Downloads() {
  return (
    <section
      id="install"
      className="relative overflow-hidden bg-white py-48 text-dark"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(240,185,11,0.16),transparent_40%),radial-gradient(circle_at_bottom_right,rgba(11,53,241,0.1),transparent_40%)]" />
      <div className="relative z-10 mx-auto grid max-w-7xl grid-cols-1 gap-16 px-6 md:px-12 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <p className="mb-4 font-mono text-xs uppercase tracking-[0.2em] text-brand">
            Distribution
          </p>
          <h2 className="text-5xl font-black uppercase tracking-tighter md:text-7xl">
            Release-backed install paths.
          </h2>
          <p className="mt-6 max-w-xl text-base leading-8 text-dark/70">
            Desktop buttons are generated from GitHub release assets instead of
            hardcoded placeholders. Milady Cloud and remote self-hosting now sit
            alongside the download flow so users can either run local or attach
            to a hosted backend from the same frontend.
          </p>
          <div className="mt-8 border border-dark/10 bg-black px-5 py-4 font-mono text-sm text-white">
            <div className="text-[10px] uppercase tracking-[0.2em] text-white/50">
              Current channel
            </div>
            <div className="mt-2 text-lg font-bold uppercase tracking-[0.08em]">
              {releaseData.release.prerelease ? "Canary" : "Stable"} •{" "}
              {releaseData.release.tagName}
            </div>
            <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-white/50">
              Published {releaseData.release.publishedAtLabel}
            </div>
          </div>
        </div>

        <div className="space-y-6 lg:col-span-8">
          <div className="grid gap-4 md:grid-cols-2">
            {releaseData.release.downloads.map((download) => (
              <a
                key={download.id}
                href={download.url}
                target="_blank"
                rel="noreferrer"
                className="group border border-dark/10 bg-white p-6 transition-colors duration-300 hover:border-dark hover:bg-black hover:text-white"
              >
                <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-dark/45 group-hover:text-white/45">
                  {download.note}
                </div>
                <div className="mt-3 text-2xl font-black uppercase tracking-tight">
                  {download.label}
                </div>
                <div className="mt-3 break-all font-mono text-xs text-dark/60 group-hover:text-white/60">
                  {download.fileName}
                </div>
                <div className="mt-5 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-dark/45 group-hover:text-white/45">
                  <span>{download.sizeLabel}</span>
                  <span>Download</span>
                </div>
              </a>
            ))}
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <CommandCard
              eyebrow="macOS / Linux / WSL"
              title="Shell bootstrap"
              description="Copies the current install.sh from the Pages root."
              code={shellCommand}
            />
            <CommandCard
              eyebrow="Windows PowerShell"
              title="PowerShell bootstrap"
              description="Uses the same script currently shipped on the Pages site."
              code={powershellCommand}
            />
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <InfoCard
              eyebrow="Managed hosting"
              title="Milady Cloud"
              body="Create managed Milady instances at cloud.milady.ai and connect the frontend to provisioned backend containers."
              href="https://cloud.milady.ai"
              action="Open cloud"
            />
            <InfoCard
              eyebrow="Self-hosted"
              title="Remote backend"
              body="Run Milady on your own box, expose it securely, then connect from onboarding with the backend address and MILADY_API_TOKEN."
              href="https://github.com/milady-ai/milady#remote-backend-deployment"
              action="Read setup"
            />
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <InfoCard
              eyebrow="GitHub Releases"
              title="Release page"
              body="Open the full asset list, release notes, and changelog for the currently selected release."
              href={releaseData.release.url}
              action="Open release"
            />
            <InfoCard
              eyebrow="Network path"
              title="Tailscale attach"
              body="Keep a remote Milady backend private with Tailscale serve or funnel, then connect from the Milady frontend with the same access key."
              href="https://github.com/milady-ai/milady#tailscale"
              action="View flow"
            />
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {releaseData.release.checksum ? (
              <CommandCard
                eyebrow="Verification"
                title="Checksum verification"
                description={`Downloads ${releaseData.release.checksum.fileName} from the selected release.`}
                code={checksumCommand}
              />
            ) : (
              <InfoCard
                eyebrow="Verification"
                title="Checksums unavailable"
                body="This release did not publish a SHA256 checksum file, so verification stays on the release page."
                href={releaseData.release.url}
                action="Inspect assets"
              />
            )}
            <InfoCard
              eyebrow="Install surface"
              title="Pages root scripts"
              body="The deploy workflow copies install.sh and install.ps1 into the Pages artifact so the website and bootstrap commands stay in sync."
              href={releaseData.scripts.shell.url}
              action="Open install.sh"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function CommandCard({
  eyebrow,
  title,
  description,
  code,
}: {
  eyebrow: string;
  title: string;
  description: string;
  code: string;
}) {
  return (
    <div className="border border-dark/10 bg-black p-6 text-white">
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/45">
        {eyebrow}
      </div>
      <div className="mt-3 text-2xl font-black uppercase tracking-tight">
        {title}
      </div>
      <p className="mt-3 text-sm leading-7 text-white/70">{description}</p>
      <pre className="mt-5 overflow-x-auto border border-white/10 bg-white/[0.03] p-4 text-xs text-white">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function InfoCard({
  eyebrow,
  title,
  body,
  href,
  action,
}: {
  eyebrow: string;
  title: string;
  body: string;
  href: string;
  action: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="group border border-dark/10 bg-white p-6 transition-colors duration-300 hover:border-dark hover:bg-black hover:text-white"
    >
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-dark/45 group-hover:text-white/45">
        {eyebrow}
      </div>
      <div className="mt-3 text-2xl font-black uppercase tracking-tight">
        {title}
      </div>
      <p className="mt-3 text-sm leading-7 text-dark/70 group-hover:text-white/70">
        {body}
      </p>
      <div className="mt-5 font-mono text-[10px] uppercase tracking-[0.18em] text-brand">
        {action}
      </div>
    </a>
  );
}
