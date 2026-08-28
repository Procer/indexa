/**
 * Limpieza puntual: marca available=false en productos que ya están en la
 * DB y matchean el filtro de accesorios (isLikelyAccessory), pero que se
 * insertaron antes de que ese filtro cubriera términos como "reparación" /
 * "repuesto" / "kit de herramientas" (ver lib/domain/accessoryFilter.ts).
 *
 * No borra nada — solo desactiva, igual que hace el sync normal cuando un
 * producto deja de aparecer en una búsqueda.
 */

import { sql } from "@/lib/db/sql";
import { isLikelyAccessory } from "@/lib/domain/accessoryFilter";

async function main() {
  const data = await sql<
    { id: string; title: string; source: string; available: boolean }[]
  >`
    SELECT id, title, source, available
    FROM products
    WHERE available = true
  `;

  const matches = data.filter((p) => isLikelyAccessory(p.title));

  console.log(`Productos available=true: ${data.length}`);
  console.log(`Matchean filtro de accesorios: ${matches.length}\n`);

  if (matches.length === 0) {
    console.log("Nada para desactivar.");
    return;
  }

  for (const p of matches) {
    console.log(`  [${p.source}] ${p.title}`);
  }

  const ids = matches.map((p) => p.id);
  await sql`
    UPDATE products
    SET available = false, updated_at = ${new Date().toISOString()}
    WHERE id = ANY(${ids}::uuid[])
  `;

  console.log(`\n✓ ${matches.length} productos marcados available=false.`);
}

main()
  .catch((err) => {
    console.error("Error:", err.message ?? err);
    process.exitCode = 1;
  })
  .finally(() => sql.end({ timeout: 5 }));
