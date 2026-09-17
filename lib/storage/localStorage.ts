import type { RecentProduct, SavedSearch } from "@/types";

const STORAGE_KEY = "techsearch_history";
const MAX_SAVED = 10;
const RECENT_PRODUCTS_KEY = "techsearch_recent_products";
const MAX_RECENT_PRODUCTS = 8;
const SYNC_CONTACT_KEY = "techsearch_sync_contact";

export interface SyncContact {
  email: string;
  manage_token: string;
}

export function getSavedSearches(): SavedSearch[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as SavedSearch[];
  } catch {
    return [];
  }
}

export function saveSearch(search: SavedSearch): void {
  if (typeof window === "undefined") return;
  const existing = getSavedSearches();
  const updated = [
    search,
    ...existing.filter((s) => s.search_id !== search.search_id),
  ];
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(updated.slice(0, MAX_SAVED))
  );
}

export function removeSearch(searchId: string): void {
  if (typeof window === "undefined") return;
  const existing = getSavedSearches();
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(existing.filter((s) => s.search_id !== searchId))
  );
}

// Productos que el usuario vio/comparó recientemente — le da memoria al chat
// del comparador para poder referirse a ellos ("comparado con la notebook que
// viste antes...") sin necesitar login ni una tabla en la DB.
export function getRecentProducts(): RecentProduct[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(RECENT_PRODUCTS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as RecentProduct[];
  } catch {
    return [];
  }
}

export function addRecentProducts(products: RecentProduct[]): void {
  if (typeof window === "undefined") return;
  const existing = getRecentProducts();
  const newIds = new Set(products.map((p) => p.id));
  const updated = [
    ...products,
    ...existing.filter((p) => !newIds.has(p.id)),
  ];
  localStorage.setItem(
    RECENT_PRODUCTS_KEY,
    JSON.stringify(updated.slice(0, MAX_RECENT_PRODUCTS))
  );
}

// Recuerda el email + manage_token del sync de búsquedas entre dispositivos
// (ver components/SyncSearchesModal.tsx).
export function getSyncContact(): SyncContact | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(SYNC_CONTACT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SyncContact;
  } catch {
    return null;
  }
}

export function saveSyncContact(contact: SyncContact): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SYNC_CONTACT_KEY, JSON.stringify(contact));
}

// Recuerda si el usuario ya cerró la guía de specs alguna vez ("qué significa
// cada característica"). Arranca abierta la primera vez que existe en la
// página (para que el usuario sepa que está), y una vez que la cierra queda
// cerrada por default en toda la app de ahí en más.
const SPEC_GLOSSARY_DISMISSED_KEY = "techsearch_spec_glossary_dismissed";

export function getSpecGlossaryDismissed(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(SPEC_GLOSSARY_DISMISSED_KEY) === "1";
}

export function setSpecGlossaryDismissed(dismissed: boolean): void {
  if (typeof window === "undefined") return;
  if (dismissed) {
    localStorage.setItem(SPEC_GLOSSARY_DISMISSED_KEY, "1");
  } else {
    localStorage.removeItem(SPEC_GLOSSARY_DISMISSED_KEY);
  }
}
