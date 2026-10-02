import { withBasePath } from "@/lib/basePath";
import { getOrCreateVisitId } from "@/lib/analytics/visit";

// Impresiones: una tarjeta de producto "se vio" cuando estuvo ≥50% visible
// durante ~1s (lo decide el componente con IntersectionObserver). Acá solo se
// juntan y se mandan en lote: el mismo producto en la misma búsqueda se avisa
// una sola vez por carga de página (y el servidor igual deduplica por
// búsqueda + visita + producto).

const FLUSH_DELAY_MS = 1500;
const MAX_BATCH = 30;

const seen = new Set<string>();
const queue = new Map<string, Set<string>>(); // shareToken -> productIds
let timer: ReturnType<typeof setTimeout> | null = null;

function flush(): void {
  timer = null;
  if (typeof window === "undefined") return;
  const visitId = getOrCreateVisitId().id;
  for (const [shareToken, ids] of Array.from(queue.entries())) {
    const list = Array.from(ids);
    for (let i = 0; i < list.length; i += MAX_BATCH) {
      fetch(withBasePath("/api/impressions"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({ shareToken, visitId, productIds: list.slice(i, i + MAX_BATCH) }),
      }).catch(() => {});
    }
  }
  queue.clear();
}

export function trackImpression(shareToken: string | undefined, productId: string): void {
  if (typeof window === "undefined" || !shareToken) return;
  const key = `${shareToken}:${productId}`;
  if (seen.has(key)) return;
  seen.add(key);
  const ids = queue.get(shareToken) ?? new Set<string>();
  ids.add(productId);
  queue.set(shareToken, ids);
  if (!timer) timer = setTimeout(flush, FLUSH_DELAY_MS);
}

// Si la persona cierra la pestaña antes de que corra el timer, se manda con
// sendBeacon (un fetch común puede cancelarse al descargar la página).
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    if (queue.size === 0) return;
    const visitId = getOrCreateVisitId().id;
    for (const [shareToken, ids] of Array.from(queue.entries())) {
      const blob = new Blob([JSON.stringify({ shareToken, visitId, productIds: Array.from(ids).slice(0, MAX_BATCH) })], {
        type: "application/json",
      });
      if ("sendBeacon" in navigator) navigator.sendBeacon(withBasePath("/api/impressions"), blob);
    }
    queue.clear();
  });
}
