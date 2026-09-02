// Colapsa casi-duplicados de la grilla de resultados (misma línea/modelo con
// una diferencia menor: color / SO / 256↔512GB) en una sola tarjeta con
// selector de variante. Presentacional: corre del lado del cliente sobre los
// ~6-20 items que se muestran, NO toca el pool ni el caché ni la paginación.
// El match reusa findSimilarMatch() de dedupe.ts (misma línea + ≤2 specs clave
// distintas + banda de precio acotada).

import { findSimilarMatch } from "@/lib/domain/dedupe";
import type { ProductCategory, ProductSource, ProductSpecs, VariantOption } from "@/types";

export interface Groupable {
  id: string;
  category: ProductCategory;
  brand: string | null;
  title: string;
  specs?: ProductSpecs;
  price_cash: number | null;
  price_installment: number | null;
  installment_count?: number | null;
  url: string;
  affiliate_url: string | null;
  source: ProductSource;
}

// 5 opciones por tarjeta como tope — más que eso el selector se vuelve ruido.
const MAX_VARIANTS = 4;

const COLOR_WORDS = [
  "negro", "blanco", "gris", "plata", "plateado", "silver", "azul", "celeste",
  "rojo", "verde", "dorado", "gold", "rosa", "rosado", "violeta", "lila",
  "grafito", "titanio", "beige", "amarillo", "naranja",
];
const COLOR_NORM: Record<string, string> = {
  plateado: "plata", silver: "plata", gold: "dorado", rosado: "rosa", lila: "violeta",
};

function colorOf(title: string): string | null {
  const t = title.toLowerCase();
  const hit = COLOR_WORDS.find((w) => new RegExp(`\\b${w}\\b`).test(t));
  if (!hit) return null;
  const v = COLOR_NORM[hit] ?? hit;
  return v.charAt(0).toUpperCase() + v.slice(1);
}

function osOf(title: string): string | null {
  const t = title.toLowerCase();
  if (/\bsin\s+(so|sistema)\b|free\s?dos|freedos/.test(t)) return "sin SO";
  if (/windows|\bwin\s?1[01]\b|\bw1[01]\b/.test(t)) return "Windows";
  return null;
}

function fmtStorage(gb: number): string {
  return gb >= 1000 ? `${(gb / 1000).toLocaleString("es-AR")}TB` : `${gb}GB`;
}

type Dims = {
  storage: number | null;
  ram: number | null;
  cellular: boolean | null;
  color: string | null;
  os: string | null;
};

function dimsOf(p: Groupable): Dims {
  const s = (p.specs ?? {}) as { storage_gb?: number; ram_gb?: number; has_cellular?: boolean };
  return {
    storage: typeof s.storage_gb === "number" && s.storage_gb > 0 ? s.storage_gb : null,
    ram: typeof s.ram_gb === "number" && s.ram_gb > 0 ? s.ram_gb : null,
    cellular: typeof s.has_cellular === "boolean" ? s.has_cellular : null,
    color: colorOf(p.title),
    os: osOf(p.title),
  };
}

function similarCandidate(p: Groupable) {
  return {
    category: p.category,
    brand: p.brand,
    title: p.title,
    specs: p.specs ?? {},
    price_cash: p.price_cash,
  };
}

export function groupVariants<T extends Groupable>(
  products: T[]
): (T & { variants?: VariantOption[] })[] {
  const used = new Set<number>();
  const groups: T[][] = [];

  for (let i = 0; i < products.length; i++) {
    if (used.has(i)) continue;
    const primary = products[i];
    const members: T[] = [primary];
    used.add(i);
    for (let j = i + 1; j < products.length; j++) {
      if (used.has(j) || members.length > MAX_VARIANTS) continue;
      if (findSimilarMatch(similarCandidate(primary), similarCandidate(products[j]))) {
        members.push(products[j]);
        used.add(j);
      }
    }
    groups.push(members);
  }

  // Salvaguarda: si colapsar dejaría muy poca variedad (p. ej. una búsqueda
  // filtrada a un solo modelo), no colapsar — mejor varias tarjetas iguales
  // que una sola con un selector gigante.
  const anyCollapsed = groups.some((g) => g.length > 1);
  if (anyCollapsed && products.length >= 3 && groups.length < 3) {
    return products as (T & { variants?: VariantOption[] })[];
  }

  return groups.map((members) => {
    const primary = members[0];
    if (members.length === 1) return primary;

    const dims = members.map(dimsOf);
    const keys: (keyof Dims)[] = ["storage", "ram", "cellular", "color", "os"];
    const varying = keys.filter((k) => {
      const vals = new Set(dims.map((d) => d[k]).filter((v) => v != null));
      return vals.size > 1;
    });

    const labelFor = (d: Dims): string => {
      const parts: string[] = [];
      for (const k of varying) {
        const v = d[k];
        if (v == null) continue;
        if (k === "storage") parts.push(fmtStorage(v as number));
        else if (k === "ram") parts.push(`${v}GB RAM`);
        else if (k === "cellular") parts.push(v ? "con datos" : "WiFi");
        else parts.push(String(v));
      }
      return parts.join(" · ") || "otra versión";
    };

    // Etiquetas únicas: si dos opciones quedan con el mismo texto, se numeran.
    const seen = new Map<string, number>();
    const variants: VariantOption[] = members.map((m, idx) => {
      let label = labelFor(dims[idx]);
      const n = (seen.get(label) ?? 0) + 1;
      seen.set(label, n);
      if (n > 1) label = `${label} (${n})`;
      return {
        id: m.id,
        label,
        price_cash: m.price_cash,
        price_installment: m.price_installment,
        installment_count: m.installment_count ?? null,
        url: m.url,
        affiliate_url: m.affiliate_url,
        source: m.source,
        isPrimary: idx === 0,
      };
    });

    return { ...primary, variants };
  });
}
