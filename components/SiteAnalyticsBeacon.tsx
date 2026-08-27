"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { getOrCreateVisitId } from "@/lib/analytics/visit";
import { trackEvent, trackEventBeacon } from "@/lib/analytics/track";

// Montado una sola vez en app/layout.tsx. Registra entrada al sitio
// (solo la primera vez que aparece este visit_id, no en cada página) y
// tiempo en página (desde que se monta hasta que la pestaña se oculta o se
// cierra) — no mide "tiempo en el sitio" completo cruzando páginas porque
// cada navegación remonta este componente, pero sumar duration_ms de todos
// los eventos time_on_page de un mismo visit_id da el total real.
export function SiteAnalyticsBeacon() {
  const pathname = usePathname();

  useEffect(() => {
    const { id: visitId, isNewVisit } = getOrCreateVisitId();
    if (isNewVisit) {
      trackEvent("session_start", visitId, {
        path: pathname,
        metadata: { referrer: document.referrer || null },
      });
    }

    const mountedAt = Date.now();
    let reported = false;
    const reportDuration = () => {
      if (reported) return;
      reported = true;
      trackEventBeacon("time_on_page", visitId, {
        path: pathname,
        durationMs: Date.now() - mountedAt,
      });
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") reportDuration();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", reportDuration);

    return () => {
      reportDuration();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", reportDuration);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return null;
}
