/**
 * Limpieza puntual: marca available=false en productos que ya están en la
 * DB y matchean el filtro de accesorios (isLikelyAccessory), pero que se
 * insertaron antes de que ese filtro cubriera términos como "reparación" /
 * "repuesto" / "kit de herramientas" (ver lib/domain/accessoryFilter.ts).
 *
 * No borra nada — solo desactiva, igual que hace el sync normal cuando un
 * producto deja de aparecer en una búsqueda.
 */

import { createClient } from "@supabase/supabase-js";
import { isLikelyAccessory } from "@/lib/domain/accessoryFilter";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function fetchAllAvailable() {
  const PAGE = 1000;
  const all: { id: string; title: string; source: string; available: boolean }[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("products")
      .select("id, title, source, available")
      .eq("available", true)
      .range(from, from + PAGE - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  return all;
}

async function main() {
  const data = await fetchAllAvailable();

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
  const { error: updErr } = await supabase
    .from("products")
    .update({ available: false, updated_at: new Date().toISOString() })
    .in("id", ids);

  if (updErr) throw updErr;

  console.log(`\n✓ ${matches.length} productos marcados available=false.`);
}

main().catch((err) => {
  console.error("Error:", err.message ?? err);
  process.exit(1);
});
