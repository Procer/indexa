import { sql } from "@/lib/db/sql";

async function main() {
  const data = await sql<
    {
      title: string;
      specs: Record<string, unknown>;
      category: string;
      embedding: string | null;
    }[]
  >`
    SELECT title, specs, category, embedding
    FROM products
    WHERE available = true
    LIMIT 300
  `;

  if (data.length === 0) {
    console.log("No data");
    return;
  }

  type S = { storage_type?: string; gpu?: string; ram_gb?: number };
  const byStorage: Record<string, number> = {};
  let noEmbedding = 0;
  data.forEach((p) => {
    const st = (p.specs as S)?.storage_type ?? "none";
    byStorage[st] = (byStorage[st] || 0) + 1;
    if (!p.embedding) noEmbedding++;
  });

  console.log("Storage type distribution:", JSON.stringify(byStorage, null, 2));
  console.log("Sin embedding:", noEmbedding);
  console.log("Total productos:", data.length);

  // Sample 3 notebooks to see full specs
  const samples = data.filter((p) => p.category === "notebook").slice(0, 3);
  console.log("\nSample notebook specs:");
  samples.forEach((p) =>
    console.log(p.title.substring(0, 60), "→", JSON.stringify(p.specs))
  );
}

main()
  .catch(console.error)
  .finally(() => sql.end({ timeout: 5 }));
