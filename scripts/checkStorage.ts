import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const { data } = await sb
    .from("products")
    .select("title, specs, category, embedding")
    .eq("available", true)
    .limit(300);

  if (!data) { console.log("No data"); return; }

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
  const samples = data.filter(p => p.category === "notebook").slice(0, 3);
  console.log("\nSample notebook specs:");
  samples.forEach(p => console.log(p.title.substring(0, 60), "→", JSON.stringify(p.specs)));
}

main().catch(console.error);
