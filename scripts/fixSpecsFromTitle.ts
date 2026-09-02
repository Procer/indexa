/**
 * Corrige EN LA BASE los specs físicamente inverosímiles que detecta
 * scripts/auditSpecs.ts. Fix de raíz: hasta ahora los valores malos solo se
 * tapaban en el display (guards de lib/domain/specExplainer.ts).
 *
 *   1. storage_gb inverosímil en notebook/desktop (< 64 GB, casi siempre la RAM
 *      filtrada al disco: storage_gb == ram_gb) → se recupera del título con la
 *      MISMA lógica que specExplainer.ts (recoverStorageGbFromTitle). Solo se
 *      escribe si el título da un valor plausible y distinto al guardado.
 *   2. weight_kg cargado en GRAMOS (> 100) en notebooks → se divide por 1000
 *      (vía resolveWeightKg). Solo se escribe si el resultado cae en el rango
 *      físico de una notebook (0,6–5 kg).
 *
 * Preserva el resto del objeto specs: solo toca la clave corregida + updated_at.
 * No toca available, precio, embedding ni el análisis calidad/precio.
 *
 * DRY-RUN por defecto: imprime el antes/después y NO escribe nada.
 * Con --apply ejecuta los UPDATE.
 *
 *   npx tsx --env-file=.env.local scripts/fixSpecsFromTitle.ts          # dry-run
 *   npx tsx --env-file=.env.local scripts/fixSpecsFromTitle.ts --apply  # escribe
 *
 * Después de --apply, volver a correr scripts/auditSpecs.ts para el después.
 */

import { sql } from "@/lib/db/sql";
import { resolveWeightKg } from "@/lib/domain/specExplainer";

const APPLY = process.argv.includes("--apply");

type Row = {
  id: string;
  title: string;
  source: string;
  category: string;
  specs: Record<string, unknown>;
};

// Copia literal de lib/domain/specExplainer.ts (recoverStorageGbFromTitle).
// Mantener sincronizada si cambia allá — igual que hace scripts/auditSpecs.ts.
function recoverStorageGbFromTitle(title: string): number | null {
  const t = title.toLowerCase();
  const tb = t.match(/(\d+(?:[.,]\d+)?)\s*tb\b/);
  if (tb) return Math.round(parseFloat(tb[1].replace(",", ".")) * 1024);
  const near = t.match(
    /(?:ssd|hdd|nvme|m\.?2|emmc)\s*(\d{2,4})\s*gb\b|(\d{2,4})\s*gb\s*(?:ssd|hdd|nvme|m\.?2|emmc)|(?:ssd|hdd|nvme|m\.?2)\s*(\d{3,4})\b/
  );
  if (near) {
    const n = parseInt(near[1] ?? near[2] ?? near[3], 10);
    if (n >= 64) return n;
  }
  const plausible = Array.from(t.matchAll(/(\d{2,4})\s*gb\b/g))
    .map((m) => parseInt(m[1], 10))
    .filter((n) => n >= 120);
  return plausible.length > 0 ? Math.max(...plausible) : null;
}

// Mismo criterio que isImplausibleStorageGb en specExplainer.ts.
function implausibleStorageGb(category: string, gb: number): boolean {
  if (category === "notebook" || category === "desktop") return gb < 64;
  if (category === "phone" || category === "tablet") return gb < 8;
  return false;
}

const num = (v: unknown): number | null => (typeof v === "number" && !Number.isNaN(v) ? v : null);
const clip = (s: string) => (s.length > 72 ? s.slice(0, 71) + "…" : s);

async function main() {
  const rows = await sql<Row[]>`
    SELECT id, title, source, category, specs
    FROM products
    WHERE available = true
      AND category IN ('notebook', 'desktop')
  `;
  console.log(`Notebooks/desktops disponibles: ${rows.length}\n`);

  const storageFixes: { row: Row; from: number; to: number; sameAsRam: boolean }[] = [];
  const storageUnfixable: { row: Row; from: number }[] = [];
  const weightFixes: { row: Row; from: number; to: number }[] = [];
  const weightUnfixable: { row: Row; from: number }[] = [];

  for (const r of rows) {
    const s = r.specs ?? {};
    const storage = num(s.storage_gb);
    const ram = num(s.ram_gb);
    const weight = num(s.weight_kg);

    if (storage != null && implausibleStorageGb(r.category, storage)) {
      const rec = recoverStorageGbFromTitle(r.title);
      if (rec != null && !implausibleStorageGb(r.category, rec) && rec !== storage) {
        storageFixes.push({ row: r, from: storage, to: rec, sameAsRam: storage === ram });
      } else {
        storageUnfixable.push({ row: r, from: storage });
      }
    }

    // weight_kg en gramos: solo notebooks, solo el caso claro (> 100).
    if (r.category === "notebook" && weight != null && weight > 100) {
      const kg = resolveWeightKg(weight);
      if (kg != null) weightFixes.push({ row: r, from: weight, to: kg });
      else weightUnfixable.push({ row: r, from: weight });
    }
  }

  console.log("═══ storage_gb — recuperado del título (notebook/desktop) ═══");
  console.log(
    `Corregibles: ${storageFixes.length}  ·  sin dato confiable en el título: ${storageUnfixable.length}\n`
  );
  for (const f of storageFixes) {
    console.log(`  [${f.row.category}/${f.row.source}] ${clip(f.row.title)}`);
    console.log(`     storage_gb ${f.from}${f.sameAsRam ? " (== ram_gb)" : ""}  →  ${f.to}`);
  }
  if (storageUnfixable.length) {
    console.log(`\n  — Se dejan como están (el guard de display ya oculta el número):`);
    for (const f of storageUnfixable) {
      console.log(`     [${f.row.category}/${f.row.source}] ${clip(f.row.title)} — storage_gb=${f.from}`);
    }
  }

  console.log("\n═══ weight_kg — gramos → kg (notebook) ═══");
  console.log(
    `Corregibles: ${weightFixes.length}  ·  fuera de rango tras convertir: ${weightUnfixable.length}\n`
  );
  for (const f of weightFixes) {
    console.log(`  [${f.row.source}] ${clip(f.row.title)}`);
    console.log(`     weight_kg ${f.from}  →  ${f.to} kg`);
  }
  for (const f of weightUnfixable) {
    console.log(`     [${f.row.source}] ${clip(f.row.title)} — weight_kg=${f.from} (se deja)`);
  }

  // Una fila puede tener los dos arreglos: agrupar por id y escribir una vez.
  const byId = new Map<string, { row: Row; specs: Record<string, unknown> }>();
  const stage = (row: Row) => {
    let e = byId.get(row.id);
    if (!e) {
      e = { row, specs: { ...(row.specs ?? {}) } };
      byId.set(row.id, e);
    }
    return e;
  };
  for (const f of storageFixes) stage(f.row).specs.storage_gb = f.to;
  for (const f of weightFixes) stage(f.row).specs.weight_kg = f.to;

  console.log(
    `\n${byId.size} filas a actualizar (${storageFixes.length} storage + ${weightFixes.length} weight).`
  );

  if (!APPLY) {
    console.log("Dry-run: no se tocó la base. Corré con --apply para escribir.");
    return;
  }

  console.log("\nAplicando…");
  let ok = 0;
  for (const { row, specs } of Array.from(byId.values())) {
    try {
      await sql`
        UPDATE products
        SET specs = ${sql.json(specs as never)}, updated_at = ${new Date().toISOString()}
        WHERE id = ${row.id}
      `;
      ok++;
    } catch (err) {
      console.error(`  ✗ ${row.id}: ${(err as Error).message}`);
    }
  }
  console.log(`\n✓ ${ok}/${byId.size} filas actualizadas. Corré scripts/auditSpecs.ts para verificar.`);
}

main()
  .catch(console.error)
  .finally(() => sql.end({ timeout: 5 }));
