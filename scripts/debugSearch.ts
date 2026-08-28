import { extractSlots, isInputSufficient } from "@/lib/llm/slotFilling";
import { buildSQLFilters } from "@/lib/domain/usageToSpecs";
import { sql } from "@/lib/db/sql";

async function debugQuery(input: string) {
  console.log(`\n=== "${input}" ===`);

  const slots = await extractSlots(input, []);
  console.log("Slots:", JSON.stringify(slots, null, 2));
  console.log("Sufficient:", isInputSufficient(slots));

  const filters = buildSQLFilters(slots);
  console.log("SQL Filters:", JSON.stringify(filters, null, 2));

  // Run SQL query manually with the same filters
  const conds = [sql`available = true`];
  if (filters.category) conds.push(sql`category = ${filters.category}`);
  if (filters.max_price_cash)
    conds.push(sql`price_cash <= ${filters.max_price_cash}`);
  if (filters.require_gpu) conds.push(sql`specs->>'gpu' = 'dedicated'`);
  if (filters.min_ram_gb)
    conds.push(sql`(specs->>'ram_gb')::int >= ${filters.min_ram_gb}`);
  if (filters.require_ssd)
    conds.push(sql`specs->>'storage_type' LIKE 'SSD%'`);

  const where = conds.reduce((acc, c, i) => (i === 0 ? c : sql`${acc} AND ${c}`));

  const data = await sql<{ title: string }[]>`
    SELECT id, title, category, price_cash,
           specs->'storage_type' AS storage_type,
           specs->'gpu' AS gpu,
           specs->'ram_gb' AS ram_gb
    FROM products
    WHERE ${where}
    LIMIT 5
  `;

  console.log(`Results (sample): ${data.length}`);
  data.forEach((p) => console.log(" -", p.title));
}

async function main() {
  await debugQuery("notebook con buena bateria para usar todo el dia");
  await debugQuery("notebook HP o Lenovo con 16GB de RAM");
}

main()
  .catch(console.error)
  .finally(() => sql.end({ timeout: 5 }));
