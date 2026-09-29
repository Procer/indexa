import { BASE_PATH } from "@/lib/basePath";

// Origen público del sitio (sin path). En producción vive en anka.ar/indexa;
// se puede pisar con NEXT_PUBLIC_SITE_ORIGIN cuando haya dominio propio.
export const SITE_ORIGIN = process.env.NEXT_PUBLIC_SITE_ORIGIN ?? "https://anka.ar";

export function absoluteUrl(path: string): string {
  return `${SITE_ORIGIN}${BASE_PATH}${path}`;
}

export const CATEGORY_LABELS: Record<string, string> = {
  notebook: "Notebooks",
  desktop: "PCs de escritorio",
  phone: "Celulares",
  tablet: "Tablets",
  tv: "Smart TVs",
};

// Email público de contacto. null = todavía no hay canal definido: /contact lo
// dice explícito en vez de mostrar una dirección inventada. Cargarlo acá alcanza
// para que aparezca en /contact y /privacy.
export const CONTACT_EMAIL: string | null = null;

export const LEGAL_LAST_UPDATE = "28 de septiembre de 2026";
