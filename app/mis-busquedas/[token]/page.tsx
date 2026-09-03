"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { LogoBrand } from "@/components/LogoBrand";
import { withBasePath } from "@/lib/basePath";
import { saveSearch } from "@/lib/storage/localStorage";
import type { SavedSearchListItem } from "@/types";

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days <= 0) return "hoy";
  if (days === 1) return "ayer";
  return `hace ${days} días`;
}

export default function MySavedSearchesPage() {
  const params = useParams();
  const token = params.token as string;

  const [searches, setSearches] = useState<SavedSearchListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(withBasePath(`/api/searches/manage/${token}`))
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: { searches: SavedSearchListItem[] }) => {
        setSearches(data.searches);
        // Mergea de vuelta a este dispositivo — así el sync queda completo
        // en ambas direcciones sin que el usuario tenga que hacer nada más.
        data.searches.forEach((s) =>
          saveSearch({
            search_id: s.share_token,
            share_token: s.share_token,
            raw_input: s.raw_input,
            saved_at: s.created_at,
          })
        );
      })
      .catch(() => setSearches([]))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div className="min-h-screen">
      <header className="border-b border-gathering-outline-variant/50 bg-gathering-surface-container/80 px-4 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <a href={withBasePath("/")} className="flex items-center gap-2">
            <LogoBrand logoClass="h-11" />
          </a>
          <h1 className="font-brand text-sm font-semibold text-gathering-on-surface">Mis búsquedas guardadas</h1>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gathering-primary-fixed-dim border-t-transparent" />
          </div>
        ) : searches.length === 0 ? (
          <div className="py-16 text-center font-brand text-gathering-on-surface-variant">
            <p>No encontramos búsquedas guardadas para este link.</p>
            <a href={withBasePath("/")} className="mt-2 inline-block text-sm text-gathering-primary-fixed-dim hover:underline">Buscar productos</a>
          </div>
        ) : (
          <div className="space-y-3">
            {searches.map((search) => (
              <a
                key={search.share_token}
                href={withBasePath(`/search/${search.share_token}`)}
                className="gathering-glass-card flex items-center gap-4 rounded-2xl p-4 hover:bg-gathering-surface-container-high"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-brand text-sm font-semibold text-gathering-on-surface">{search.raw_input}</p>
                  <p className="mt-0.5 font-brand text-xs text-gathering-on-surface-variant">
                    {search.result_count} resultado{search.result_count === 1 ? "" : "s"} · {timeAgo(search.created_at)}
                  </p>
                </div>
              </a>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
