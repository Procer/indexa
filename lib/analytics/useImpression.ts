"use client";

import { useEffect, type RefObject } from "react";
import { trackImpression } from "@/lib/analytics/impressions";

// Cuenta una impresión cuando el elemento estuvo ≥50% visible ~1s (scrollear de
// largo no cuenta). Es la base del CTR por tienda y por campaña patrocinada.
export function useImpression(
  ref: RefObject<HTMLElement>,
  shareToken: string | undefined,
  productId: string
): void {
  useEffect(() => {
    const el = ref.current;
    if (!el || !shareToken || typeof IntersectionObserver === "undefined") return;
    let dwell: ReturnType<typeof setTimeout> | null = null;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((e) => e.isIntersecting && e.intersectionRatio >= 0.5);
        if (visible && !dwell) {
          dwell = setTimeout(() => {
            trackImpression(shareToken, productId);
            observer.disconnect();
          }, 1000);
        } else if (!visible && dwell) {
          clearTimeout(dwell);
          dwell = null;
        }
      },
      { threshold: [0, 0.5] }
    );
    observer.observe(el);
    return () => {
      if (dwell) clearTimeout(dwell);
      observer.disconnect();
    };
  }, [ref, shareToken, productId]);
}
