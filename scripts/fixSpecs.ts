/**
 * Recalcula specs de todos los productos activos de Fravega:
 * - storage_type correcto (SSD_SATA si "Disco SSD" presente)
 * - gpu correcto (si "Placa de video" tiene RTX/GTX → dedicated)
 *
 * Se necesita re-scrapear Fravega para obtener las specs originales.
 * Este script hace un sync solo de Fravega sin tocar ML.
 */

import { sql } from "@/lib/db/sql";
import { fetchFraveNotebooks, fetchFraveDesktops } from "@/lib/sources/fravega";

async function main() {
  console.log("=== Fix Specs — Fravega ===\n");
  const llmStats = { calls: 0 };

  console.log("[1/2] Obteniendo notebooks de Fravega...");
  const notebooks = await fetchFraveNotebooks(80, llmStats);
  console.log(`  ${notebooks.length} notebooks obtenidos`);

  console.log("[2/2] Obteniendo desktops de Fravega...");
  const desktops = await fetchFraveDesktops(40, llmStats);
  console.log(`  ${desktops.length} desktops obtenidos`);

  const all = [...notebooks, ...desktops];
  let updated = 0;

  for (const p of all) {
    try {
      await sql`
        UPDATE products
        SET specs = ${sql.json(p.specs as never)}, updated_at = ${new Date().toISOString()}
        WHERE external_id = ${p.external_id} AND source = 'fravega'
      `;
      updated++;
    } catch (error) {
      console.error(`Error actualizando ${p.external_id}:`, (error as Error).message);
    }
  }

  console.log(`\n✓ Specs actualizados para ${updated}/${all.length} productos`);
  console.log(`  Llamadas LLM: ${llmStats.calls}`);

  // Verificar distribución
  const data = await sql<{ specs: Record<string, unknown> }[]>`
    SELECT specs FROM products
    WHERE available = true AND source = 'fravega'
  `;

  type S = { storage_type?: string; gpu?: string };
  const stDist: Record<string, number> = {};
  const gpuDist: Record<string, number> = {};
  data.forEach((p) => {
    const s = p.specs as S;
    const st = s?.storage_type ?? "none";
    const g = s?.gpu ?? "none";
    stDist[st] = (stDist[st] || 0) + 1;
    gpuDist[g] = (gpuDist[g] || 0) + 1;
  });
  console.log("\nStorage distribution:", stDist);
  console.log("GPU distribution:", gpuDist);
}

main()
  .catch(console.error)
  .finally(() => sql.end({ timeout: 5 }));
