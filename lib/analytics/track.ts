import { withBasePath } from "@/lib/basePath";

export type SiteEventType =
  | "session_start"
  | "product_view_details"
  | "product_compare_add"
  | "product_ask_about"
  | "product_buy_click"
  | "time_on_page"
  | "client_error"
  | "visitor_label";

interface TrackEventPayload {
  productId?: string;
  path?: string;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

// Fire-and-forget: el tracking nunca debe bloquear ni romper la interacción
// real del usuario. keepalive permite que el request sobreviva a una
// navegación inmediata (ej. click en "ver detalles" que cambia de vista).
export function trackEvent(eventType: SiteEventType, visitId: string, payload: TrackEventPayload = {}): void {
  if (typeof window === "undefined") return;
  fetch(withBasePath("/api/events"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    keepalive: true,
    body: JSON.stringify({ eventType, visitId, ...payload }),
  }).catch(() => {});
}

// Para el evento de "tiempo en página" en visibilitychange/pagehide: en ese
// momento un fetch normal puede quedar cancelado por el browser al descargar
// la página. sendBeacon está diseñado justo para esto.
export function trackEventBeacon(eventType: SiteEventType, visitId: string, payload: TrackEventPayload = {}): void {
  if (typeof navigator === "undefined" || !("sendBeacon" in navigator)) {
    trackEvent(eventType, visitId, payload);
    return;
  }
  const blob = new Blob([JSON.stringify({ eventType, visitId, ...payload })], { type: "application/json" });
  navigator.sendBeacon(withBasePath("/api/events"), blob);
}
