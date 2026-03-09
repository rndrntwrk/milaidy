/**
 * Databases page — wrapper with Tables / Media / Vectors sub-tabs.
 */

import { useApp } from "../AppContext";
import { DatabaseView } from "./DatabaseView";
import { MediaGalleryView } from "./MediaGalleryView";
import { SectionToolbar } from "./SectionToolbar";
import { SelectablePillGrid } from "./SelectablePillGrid";
import { VectorBrowserView } from "./VectorBrowserView";

const DB_TABS = [
  { id: "tables" as const, label: "Tables" },
  { id: "media" as const, label: "Media" },
  { id: "vectors" as const, label: "Vectors" },
];

export function DatabasePageView() {
  const { databaseSubTab, setState } = useApp();

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <SectionToolbar>
        <SelectablePillGrid
          className="pro-streamer-subtab-grid"
          size="compact"
          value={databaseSubTab}
          onChange={(next) => setState("databaseSubTab", next)}
          options={DB_TABS.map((tab) => ({ value: tab.id, label: tab.label }))}
        />
      </SectionToolbar>

      <div className="flex-1 min-h-0">
        {databaseSubTab === "tables" && <DatabaseView />}
        {databaseSubTab === "media" && <MediaGalleryView />}
        {databaseSubTab === "vectors" && <VectorBrowserView />}
      </div>
    </div>
  );
}
