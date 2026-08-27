import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
const { data } = await sb
  .from("products")
  .select("title, specs, category")
  .eq("available", true)
  .limit(300);

if (!data) { console.log("No data"); process.exit(1); }

const byGpu: Record<string, number> = {};
data.forEach((p) => {
  const g = (p.specs as { gpu?: string })?.gpu ?? "none";
  byGpu[g] = (byGpu[g] || 0) + 1;
});

console.log("GPU distribution:", JSON.stringify(byGpu, null, 2));

const ded = data.filter((p) => (p.specs as { gpu?: string })?.gpu === "dedicated");
console.log("Con GPU dedicada:", ded.length);
ded.slice(0, 5).forEach((p) =>
  console.log(
    " ",
    p.title.substring(0, 70),
    "|",
    (p.specs as { gpu_model?: string })?.gpu_model
  )
);
}
main().catch(console.error);
