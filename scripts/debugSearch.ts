import { extractSlots, isInputSufficient } from "@/lib/llm/slotFilling";
import { buildSQLFilters } from "@/lib/domain/usageToSpecs";
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function debugQuery(input: string) {
  console.log(`\n=== "${input}" ===`);

  const slots = await extractSlots(input, []);
  console.log("Slots:", JSON.stringify(slots, null, 2));
  console.log("Sufficient:", isInputSufficient(slots));

  const filters = buildSQLFilters(slots);
  console.log("SQL Filters:", JSON.stringify(filters, null, 2));

  // Run SQL query manually with the same filters
  const query = sb
    .from("products")
    .select("id, title, category, specs->storage_type, specs->gpu, specs->ram_gb, price_cash")
    .eq("available", true);

  if (filters.category) query.eq("category", filters.category);
  if (filters.max_price_cash) query.lte("price_cash", filters.max_price_cash);
  if (filters.require_gpu) query.eq("specs->>gpu", "dedicated");
  if (filters.min_ram_gb) query.gte("specs->>ram_gb", filters.min_ram_gb.toString());
  if (filters.require_ssd) {
    // Simulating LIKE 'SSD%'
    query.like("specs->>storage_type", "SSD%");
  }

  const { data, count, error } = await query.limit(5);
  if (error) { console.error("DB Error:", error); return; }
  console.log(`Results (sample): ${count ?? data?.length}`);
  data?.forEach(p => console.log(" -", (p as Record<string, unknown>).title));
}

async function main() {
  await debugQuery("notebook con buena bateria para usar todo el dia");
  await debugQuery("notebook HP o Lenovo con 16GB de RAM");
}

main().catch(console.error);
