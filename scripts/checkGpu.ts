import { sql } from "@/lib/db/sql";

async function main() {
  const data = await sql<
    { title: string; specs: Record<string, unknown>; category: string }[]
  >`
    SELECT title, specs, category
    FROM products
    WHERE available = true
    LIMIT 300
  `;

  if (data.length === 0) {
    console.log("No data");
    return;
  }

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

main()
  .catch(console.error)
  .finally(() => sql.end({ timeout: 5 }));
