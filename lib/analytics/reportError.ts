import { trackEvent } from "@/lib/analytics/track";
import { getOrCreateVisitId } from "@/lib/analytics/visit";

// Reporte de errores del cliente a site_events (event_type='client_error') —
// prueba con varias personas (2026-09-11): antes un error como "No pudimos
// realizar la búsqueda" no dejaba ningún rastro consultable (solo lo que el
// usuario alcanzaba a describir de memoria). `kind` agrupa el tipo de fallo
// para poder filtrar después (ej. "search_failed", "js_error",
// "unhandled_rejection"); `metadata` lleva el detalle específico.
export function reportError(kind: string, message: string, metadata: Record<string, unknown> = {}): void {
  if (typeof window === "undefined") return;
  trackEvent("client_error", getOrCreateVisitId().id, {
    path: window.location.pathname,
    // userAgent es el dato que más ayuda a reproducir un bug real (ej. "solo
    // pasa en Safari mobile") — pedido explícito para la prueba con varias
    // personas 2026-09-11.
    metadata: { kind, message: message.slice(0, 500), userAgent: navigator.userAgent, ...metadata },
  });
}
