import { trackEvent } from "@/lib/analytics/track";
import { getOrCreateVisitId } from "@/lib/analytics/visit";

const STORAGE_KEY = "ts_visitor_name";
const DISMISSED_KEY = "ts_visitor_name_dismissed";

// Nombre opcional por visita, para que el dashboard de admin (/admin/sessions)
// muestre "Juan preguntó X" en vez de un visit_id anónimo — pedido explícito
// para poder analizar la prueba con varias personas conocidas 2026-09-11.
// Se guarda en localStorage (nunca se pide de nuevo en esa máquina/navegador)
// y se manda como evento 'visitor_label' — el dashboard busca el más reciente
// por visit_id, no hace falta agregarlo a cada tabla.
export function getVisitorName(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setVisitorName(name: string): void {
  if (typeof window === "undefined") return;
  const trimmed = name.trim().slice(0, 60);
  if (!trimmed) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, trimmed);
  } catch {
    // localStorage bloqueado (privado/incógnito) — igual mandamos el evento.
  }
  trackEvent("visitor_label", getOrCreateVisitId().id, { metadata: { name: trimmed } });
}

export function wasNamePromptDismissed(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return true;
  }
}

export function dismissNamePrompt(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    // no-op
  }
}
