"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { getOrCreateVisitId } from "@/lib/analytics/visit";
import { trackEvent, trackEventBeacon } from "@/lib/analytics/track";
import { reportError } from "@/lib/analytics/reportError";

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

    // Errores de JS no capturados y promesas rechazadas sin catch — prueba
    // con varias personas (2026-09-11): antes esto solo aparecía en la
    // consola del navegador de cada persona, invisible para quien analiza
    // después. Se re-registra en cada cambio de pathname (barato, solo
    // add/remove de listeners) para no depender de un componente aparte.
    const onError = (e: ErrorEvent) => {
      reportError("js_error", e.message, { path: pathname, filename: e.filename, lineno: e.lineno });
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const reason = e.reason instanceof Error ? e.reason.message : String(e.reason);
      reportError("unhandled_rejection", reason, { path: pathname });
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);

    return () => {
      reportDuration();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", reportDuration);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return null;
}
