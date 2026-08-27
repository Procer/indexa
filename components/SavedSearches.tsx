"use client";

import { useEffect, useState } from "react";
import {
  getSavedSearches,
  removeSearch,
} from "@/lib/storage/localStorage";
import type { SavedSearch } from "@/types";

export function SavedSearches() {
  const [searches, setSearches] = useState<SavedSearch[]>([]);

  useEffect(() => {
    setSearches(getSavedSearches());
  }, []);

  if (searches.length === 0) return null;

  const handleRemove = (searchId: string) => {
    removeSearch(searchId);
    setSearches(getSavedSearches());
  };

  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
        Búsquedas recientes
      </p>
      <div className="space-y-1">
        {searches.map((s) => (
          <div key={s.search_id} className="flex items-center gap-2">
            <a
              href={`/search/${s.share_token}`}
              className="min-w-0 flex-1 truncate text-sm text-blue-600 hover:underline"
            >
              {s.raw_input}
            </a>
            <button
              type="button"
              onClick={() => handleRemove(s.search_id)}
              className="shrink-0 text-gray-300 hover:text-red-400"
              aria-label="Eliminar"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
