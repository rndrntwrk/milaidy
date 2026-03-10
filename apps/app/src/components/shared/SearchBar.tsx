import { useCallback, useState } from "react";
import { useApp } from "../../AppContext";
import { btnPrimary, inputCls } from "./button-styles";

export function SearchBar({
  onSearch,
  searching,
  placeholder,
}: {
  onSearch: (query: string) => void;
  searching?: boolean;
  placeholder?: string;
}) {
  const { t } = useApp();
  const [query, setQuery] = useState("");

  const handleSubmit = useCallback(() => {
    if (query.trim()) {
      onSearch(query.trim());
    }
  }, [query, onSearch]);

  const defaultPlaceholder = t("knowledgeview.SearchKnowledge") || "Search...";

  return (
    <div className="mb-6">
      <div className="flex gap-2">
        <input
          type="text"
          placeholder={placeholder || defaultPlaceholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          className={inputCls}
          disabled={searching}
        />
        <button
          type="button"
          className={btnPrimary}
          onClick={handleSubmit}
          disabled={!query.trim() || searching}
        >
          {searching ? "Searching..." : "Search"}
        </button>
      </div>
    </div>
  );
}
