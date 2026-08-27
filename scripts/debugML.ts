import { fetchMLNotebooks } from "@/lib/sources/mlScraper";

async function main() {
  console.log("=== Test ML scraper (max 5 notebooks) ===\n");
  const stats = { calls: 0 };

  try {
    const products = await fetchMLNotebooks(5, stats);
    console.log(`\nProductos obtenidos: ${products.length}`);
    console.log(`LLM calls: ${stats.calls}`);

    for (const p of products) {
      console.log(`\n  [${p.external_id}] ${p.title.slice(0, 70)}`);
      console.log(`  URL: ${p.url}`);
      console.log(`  Precio: $${p.price_cash?.toLocaleString("es-AR") ?? "N/A"}`);
      console.log(`  Specs: ${JSON.stringify(p.specs).slice(0, 120)}`);
    }
  } catch (err) {
    console.error("Error:", err);
  }
}

main();
