// Identificador de visita persistente por navegador — a diferencia del
// sessionId efímero de app/search/[token]/page.tsx (se regenera en cada
// carga, solo sirve para cachear resultados intermedios de UNA búsqueda),
// este vive en localStorage y sobrevive a navegación entre páginas. Una
// "visita" termina cuando pasan más de 30min sin actividad (mismo criterio
// estándar que usan la mayoría de las herramientas de analytics).

const STORAGE_KEY = "ts_visit";
const INACTIVITY_WINDOW_MS = 30 * 60 * 1000;

interface StoredVisit {
  id: string;
  lastSeen: number;
}

function readStoredVisit(): StoredVisit | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredVisit;
    if (typeof parsed.id !== "string" || typeof parsed.lastSeen !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredVisit(visit: StoredVisit): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(visit));
  } catch {
    // localStorage puede fallar (modo privado, storage lleno) — el tracking
    // es best-effort, no debe romper la navegación.
  }
}

// Devuelve el visit_id vigente, creando uno nuevo si no hay ninguno guardado
// o si la última actividad registrada fue hace más de 30min. isNewVisit
// distingue "primera vez que vemos este id" de "seguimos en la misma visita".
export function getOrCreateVisitId(): { id: string; isNewVisit: boolean } {
  if (typeof window === "undefined") {
    return { id: "server", isNewVisit: false };
  }

  const now = Date.now();
  const stored = readStoredVisit();
  const isExpired = stored != null && now - stored.lastSeen > INACTIVITY_WINDOW_MS;

  if (stored != null && !isExpired) {
    writeStoredVisit({ id: stored.id, lastSeen: now });
    return { id: stored.id, isNewVisit: false };
  }

  const id = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${now}-${Math.random().toString(36).slice(2)}`;
  writeStoredVisit({ id, lastSeen: now });
  return { id, isNewVisit: true };
}
