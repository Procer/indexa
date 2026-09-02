/**
 * Curación de filas miscategorizadas / que no son productos de tecnología pero
 * quedaron cargadas en una categoría tech (visto en la auditoría 2026-09-02:
 * "Difusor Aromático" como desktop, "Tabla esquinera Orlandi" como desktop,
 * tablets de chocolate/insecticida con ram_gb=0 y storage_gb=0).
 *
 * NO borra: hace `available = false` (reversible, mismo patrón no-destructivo
 * que scripts/fixSpecsFromTitle.ts). El scraper las vuelve a activar si el
 * filtro de ingesta las deja pasar de nuevo — por eso conviene además tener el
 * filtro de `lib/sources/vtex.ts` al día.
 *
 * DRY-RUN por defecto: lista qué apagaría. Con --apply ejecuta el UPDATE.
 *
 *   npx tsx --env-file=.env.local scripts/fixMiscategorized.ts          # dry-run
 *   npx tsx --env-file=.env.local scripts/fixMiscategorized.ts --apply
 */

import { sql } from "@/lib/db/sql";

const APPLY = process.argv.includes("--apply");

type Row = {
  id: string;
  source: string;
  category: string;
  title: string;
  brand: string | null;
  price_cash: number | null;
  ram_gb: number | null;
  storage_gb: number | null;
};

// Términos que NO son un equipo de tecnología en ninguna acepción — muebles,
// decoración, electrodoméstico de cocina, alimentos, químicos de limpieza.
// Deliberadamente acotado a cosas vistas en el catálogo real: un término acá
// apaga la fila por título solo, sin más señales.
const NOT_TECH_RE = new RegExp(
  [
    "difusor",
    "aromatizador",
    "arom[aá]tic",
    "humidificador",
    "tabla\\s+(esquinera|de\\s+planchar|de\\s+picar|para\\s+picar)",
    "esquinera\\s+orlandi",
    "repisa",
    "perchero",
    "zapatero",
    "c[oó]moda\\s+\\d",
    "mesa\\s+de\\s+luz",
    "colch[oó]n",
    "almohada",
    "s[aá]bana",
    "acolchado",
    "frazada",
    "olla\\b",
    "sart[eé]n",
    "licuadora",
    "batidora",
    "cafetera",
    "tostadora",
    "chocolate",
    "chocolat[ií]n",
    "golosina",
    "alfajor",
    "galletita",
    "oblea",
    "insecticida",
    "mosquito",
    "detergente",
    "lavandina",
  ].join("|"),
  "i"
);

async function main() {
  const rows = await sql<Row[]>`
    SELECT id, source, category, title, brand, price_cash,
           (specs->>'ram_gb')::float     AS ram_gb,
           (specs->>'storage_gb')::float AS storage_gb
    FROM products
    WHERE available = true
      AND category IN ('notebook', 'desktop', 'phone', 'tablet', 'tv')
  `;
  console.log(`Catálogo disponible en categorías tech: ${rows.length}\n`);

  const notTech: Row[] = [];
  const deadTablet: Row[] = [];

  for (const r of rows) {
    if (NOT_TECH_RE.test(r.title)) {
      notTech.push(r);
      continue;
    }
    // Tablet con ram Y storage en 0 = extracción totalmente fallida: en el
    // catálogo real (verificado 2026-08-29) TODA fila así era basura
    // (chocolates, insecticidas, tabletas gráficas, bafles miscategorizados).
    if (r.category === "tablet" && r.ram_gb === 0 && r.storage_gb === 0) {
      deadTablet.push(r);
    }
  }

  const bySource = (list: Row[]) => {
    const m: Record<string, number> = {};
    for (const r of list) m[r.source] = (m[r.source] ?? 0) + 1;
    return JSON.stringify(m);
  };
  const dump = (list: Row[]) =>
    list.forEach((r) =>
      console.log(`  [${r.category}/${r.source}] ${r.title.slice(0, 78)}${r.price_cash ? ` — $${r.price_cash.toLocaleString("es-AR")}` : ""}`)
    );

  console.log(`═══ No son tecnología (por título) — ${notTech.length} ═══ ${bySource(notTech)}`);
  dump(notTech);
  console.log(`\n═══ Tablets con ram_gb=0 Y storage_gb=0 (extracción fallida) — ${deadTablet.length} ═══ ${bySource(deadTablet)}`);
  dump(deadTablet);

  const targets = Array.from(new Map([...notTech, ...deadTablet].map((r) => [r.id, r])).values());
  console.log(`\nTotal a apagar (available=false): ${targets.length}`);

  if (!APPLY) {
    console.log("Dry-run: no se tocó la base. Corré con --apply para escribir.");
    return;
  }

  console.log("\nAplicando…");
  const ids = targets.map((r) => r.id);
  const res = await sql`
    UPDATE products SET available = false, updated_at = now()
    WHERE id = ANY(${ids}::uuid[]) AND available = true
  `;
  console.log(`\n✓ ${res.count} filas apagadas. (available=false es reversible.)`);
}

main()
  .catch(console.error)
  .finally(() => sql.end({ timeout: 5 }));
