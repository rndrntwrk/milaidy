import { useState } from "react";
import { ConnectionProvider } from "../../lib/ConnectionProvider";
import { AuthGate } from "./AuthGate";
import { ConnectionBar } from "./ConnectionBar";
import { Sidebar, type DashboardSection } from "./Sidebar";

export function Dashboard() {
  const [section, setSection] = useState<DashboardSection>("agents");

  return (
    <AuthGate>
      <ConnectionProvider>
        <div
          data-testid="dashboard"
          className="min-h-screen bg-dark text-text-light flex"
        >
          <Sidebar active={section} onChange={setSection} />
          <div className="flex-1 flex flex-col pt-20">
            <ConnectionBar />
            <main className="flex-1 p-6">
              <DashboardContent section={section} />
            </main>
          </div>
        </div>
      </ConnectionProvider>
    </AuthGate>
  );
}

function DashboardContent({ section }: { section: DashboardSection }) {
  switch (section) {
    case "agents":
      return <div className="text-text-muted font-mono text-sm">Agent grid coming next...</div>;
    case "metrics":
      return <div className="text-text-muted font-mono text-sm">Metrics panel coming soon...</div>;
    case "logs":
      return <div className="text-text-muted font-mono text-sm">Logs panel coming soon...</div>;
    case "export":
      return <div className="text-text-muted font-mono text-sm">Export panel coming soon...</div>;
    case "billing":
      return <div className="text-text-muted font-mono text-sm">Billing panel coming soon...</div>;
  }
}
