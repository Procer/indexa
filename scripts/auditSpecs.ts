/**
 * Auditoría de cordura de specs sobre TODO el catálogo disponible.
 * Read-only: no toca la base. Reporta valores físicamente inverosímiles
 * (el bug del normalizador que copió la RAM en storage_gb, etc.), cuántos
 * se pueden recuperar del título, y una muestra de los peores casos.
 *
 *   npx tsx --env-file=.env.local scripts/auditSpecs.ts
 */

import { sql } from "@/lib/db/sql";

type Row = {
  id: string;
  title: string;
  brand: string | null;
  source: string;
  category: string;
  specs: Record<string, unknown>;
};

// Mismo criterio que lib/domain/specExplainer.ts (resolveStorageGb).
function recoverStorageGbFromTitle(title: string): number | null {
  const t = title.toLowerCase();
  const tb = t.match(/(\d+(?:[.,]\d+)?)\s*tb\b/);
  if (tb) return Math.round(parseFloat(tb[1].replace(",", ".")) * 1024);
  const near = t.match(
    /(?:ssd|hdd|nvme|m\.?2|emmc)\s*(\d{2,4})\s*gb\b|(\d{2,4})\s*gb\s*(?:ssd|hdd|nvme|m\.?2|emmc)/
  );
  if (near) {
    const n = parseInt(near[1] ?? near[2], 10);
    if (n >= 64) return n;
  }
  const plausible = Array.from(t.matchAll(/(\d{2,4})\s*gb\b/g))
    .map((m) => parseInt(m[1], 10))
    .filter((n) => n >= 120);
  return plausible.length > 0 ? Math.max(...plausible) : null;
}

const STD_RAM = new Set([2, 3, 4, 6, 8, 12, 16, 18, 24, 32, 36, 48, 64, 96, 128]);

type Issue = { kind: string; detail: string };

function checkRow(r: Row): Issue[] {
  const s = r.specs ?? {};
  const num = (k: string) => (typeof s[k] === "number" ? (s[k] as number) : null);
  const issues: Issue[] = [];
  const ram = num("ram_gb");
  const storage = num("storage_gb");
  const inches = num("screen_inches");
  const cat = r.category;

  if (cat === "notebook" || cat === "desktop") {
    if (storage != null && storage < 64) {
      const rec = recoverStorageGbFromTitle(r.title);
      issues.push({
        kind: "storage_implausible",
        detail: `storage_gb=${storage}${ram != null && storage === ram ? " (== ram_gb)" : ""} → título: ${rec ?? "no recuperable"}`,
      });
    }
    if (storage == null) issues.push({ kind: "storage_missing", detail: "sin storage_gb" });
    if (ram != null && (ram > 128 || ram < 2)) issues.push({ kind: "ram_implausible", detail: `ram_gb=${ram}` });
    else if (ram != null && !STD_RAM.has(ram)) issues.push({ kind: "ram_nonstandard", detail: `ram_gb=${ram}` });
    if (s["processor_tier"] == null) issues.push({ kind: "processor_tier_missing", detail: "sin processor_tier" });
    if (inches != null && (inches < 10 || inches > 18.5)) issues.push({ kind: "screen_implausible", detail: `screen_inches=${inches}` });
    const weight = num("weight_kg");
    if (cat === "notebook" && weight != null && (weight < 0.8 || weight > 4.5)) issues.push({ kind: "weight_implausible", detail: `weight_kg=${weight}` });
    if (cat === "notebook" && weight == null) issues.push({ kind: "weight_missing", detail: "sin weight_kg" });
  }

  if (cat === "phone") {
    if (storage != null && storage < 8) issues.push({ kind: "storage_implausible", detail: `storage_gb=${storage}` });
    if (ram != null && ram > 24) issues.push({ kind: "ram_implausible", detail: `ram_gb=${ram}` });
    const batt = num("battery_mah");
    if (batt != null && (batt < 1500 || batt > 7500)) issues.push({ kind: "battery_implausible", detail: `battery_mah=${batt}` });
    const cam = num("main_camera_mp");
    if (cam != null && (cam < 2 || cam > 250)) issues.push({ kind: "camera_implausible", detail: `main_camera_mp=${cam}` });
    if (inches != null && (inches < 4 || inches > 8)) issues.push({ kind: "screen_implausible", detail: `screen_inches=${inches}` });
  }

  if (cat === "tablet") {
    if (storage != null && storage < 8) issues.push({ kind: "storage_implausible", detail: `storage_gb=${storage}` });
    if (ram != null && ram > 16) issues.push({ kind: "ram_implausible", detail: `ram_gb=${ram}` });
    if (inches != null && (inches < 6 || inches > 15)) issues.push({ kind: "screen_implausible", detail: `screen_inches=${inches}` });
  }

  if (cat === "tv") {
    if (inches != null && (inches < 19 || inches > 120)) issues.push({ kind: "screen_implausible", detail: `screen_inches=${inches}` });
  }

  return issues;
}

async function main() {
  const rows = await sql<Row[]>`
    SELECT id, title, brand, source, category, specs
    FROM products
    WHERE available = true
  `;

  console.log(`Catálogo disponible: ${rows.length} productos\n`);

  const byCat: Record<string, number> = {};
  const kindCount: Record<string, number> = {};
  const kindByCat: Record<string, Record<string, number>> = {};
  let storageFixable = 0;
  let storageUnfixable = 0;
  const worst: { row: Row; issues: Issue[] }[] = [];

  for (const r of rows) {
    byCat[r.category] = (byCat[r.category] ?? 0) + 1;
    const issues = checkRow(r);
    if (issues.length === 0) continue;
    worst.push({ row: r, issues });
    for (const i of issues) {
      kindCount[i.kind] = (kindCount[i.kind] ?? 0) + 1;
      (kindByCat[r.category] ??= {})[i.kind] = ((kindByCat[r.category] ??= {})[i.kind] ?? 0) + 1;
      if (i.kind === "storage_implausible") {
        if (i.detail.includes("no recuperable")) storageUnfixable++;
        else if (i.detail.includes("→ título:")) storageFixable++;
      }
    }
  }

  console.log("Productos por categoría:", JSON.stringify(byCat));
  console.log(`\nFilas con al menos un problema: ${worst.length} (${((worst.length / rows.length) * 100).toFixed(1)}%)\n`);

  console.log("Conteo por tipo de problema:");
  Object.entries(kindCount)
    .sort((a, b) => b[1] - a[1])
    .forEach(([k, n]) => console.log(`  ${k.padEnd(26)} ${n}`));

  console.log("\nPor categoría:");
  for (const [cat, kinds] of Object.entries(kindByCat)) {
    console.log(`  ${cat}:`);
    Object.entries(kinds)
      .sort((a, b) => b[1] - a[1])
      .forEach(([k, n]) => console.log(`     ${k.padEnd(24)} ${n}`));
  }

  console.log(`\nstorage_implausible en notebook/desktop → recuperable del título: ${storageFixable} · NO recuperable: ${storageUnfixable}`);

  console.log("\n── Muestra (hasta 25 filas con más problemas) ──");
  worst
    .sort((a, b) => b.issues.length - a.issues.length)
    .slice(0, 25)
    .forEach(({ row, issues }) => {
      console.log(`\n[${row.category}/${row.source}] ${row.title.slice(0, 78)}`);
      issues.forEach((i) => console.log(`   • ${i.kind}: ${i.detail}`));
    });
}

main()
  .catch(console.error)
  .finally(() => sql.end({ timeout: 5 }));
