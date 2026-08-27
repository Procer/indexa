/**
 * Análisis LLM batch: pre-genera quality_price_score y quality_price_analysis
 * para productos sin análisis (quality_price_score IS NULL) O con análisis
 * vencido (más viejo que ANALYSIS_FRESHNESS_MS en lib/llm/productAnalysis.ts
 * — mismo umbral que usa la búsqueda en vivo para decidir si confía en el
 * caché). Cubrir también los vencidos acá es lo que evita que el usuario
 * termine pagando esa regeneración en vivo durante una búsqueda real.
 *
 * Uso:
 *   npm run analyze              → hasta 300 productos sin análisis o vencidos
 *   npm run analyze -- --all     → regenera todos (ignora ambos filtros)
 *
 * Diseñado para correr como tarea nocturna en Railway, después del sync.
 * Evita que el análisis se genere durante el request del usuario.
 */

import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import type { WebSocketLikeConstructor } from "@supabase/realtime-js";
import { generateBatchAnalysis } from "@/lib/llm/batchAnalysis";

// Node 20 no trae WebSocket nativo (recién en Node 22); supabase-js igual
// instancia un RealtimeClient al crear el cliente aunque este script nunca
// use realtime, así que sin esto tira "Node.js 20 detected without native
// WebSocket support" apenas se llama a createClient (mismo fix que
// scripts/syncFraveOnly.ts y scripts/generateEmbeddings.ts).
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { realtime: { transport: ws as unknown as WebSocketLikeConstructor } }
);

const BATCH_SIZE = 10;   // llamadas LLM en paralelo por batch
const MAX_PER_RUN = 300; // máximo de productos por ejecución — a este ritmo
                          // el catálogo completo (~1300 productos) da la
                          // vuelta en 4-5 noches en vez de 13+.
const ANALYSIS_FRESHNESS_MS = 21 * 24 * 60 * 60 * 1000; // igual a lib/llm/productAnalysis.ts
const regenerateAll = process.argv.includes("--all");

async function main() {
  console.log(`=== Análisis LLM batch${regenerateAll ? " (regenerate-all)" : ""} ===\n`);

  const baseQuery = supabase
    .from("products")
    .select("id, title, brand, category, price_cash, price_installment, specs")
    .eq("available", true)
    .limit(MAX_PER_RUN);

  const staleCutoff = new Date(Date.now() - ANALYSIS_FRESHNESS_MS).toISOString();
  const { data: products, error } = await (
    regenerateAll
      ? baseQuery
      : baseQuery.or(`quality_price_score.is.null,analysis_generated_at.lt.${staleCutoff}`)
  );

  if (error) {
    console.error("Error al consultar productos:", error.message);
    process.exit(1);
  }

  if (!products || products.length === 0) {
    console.log("No hay productos para analizar.");
    return;
  }

  console.log(`${products.length} productos para procesar en batches de ${BATCH_SIZE}\n`);

  let ok = 0;
  let failed = 0;

  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = products.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(products.length / BATCH_SIZE);
    process.stdout.write(`Batch ${batchNum}/${totalBatches}... `);

    const results = await Promise.allSettled(
      batch.map(async (product) => {
        const analysis = await generateBatchAnalysis(product);

        const { error: updateErr } = await supabase
          .from("products")
          .update({
            quality_price_score: analysis.quality_price_score,
            quality_price_analysis: analysis.quality_price_analysis,
            analysis_generated_at: new Date().toISOString(),
          })
          .eq("id", product.id);

        if (updateErr) throw new Error(updateErr.message);
        return product.id;
      })
    );

    const batchOk = results.filter((r) => r.status === "fulfilled").length;
    const batchFailed = results.filter((r) => r.status === "rejected").length;
    ok += batchOk;
    failed += batchFailed;

    if (batchFailed > 0) {
      const errors = results
        .filter((r): r is PromiseRejectedResult => r.status === "rejected")
        .map((r) => r.reason?.message ?? "unknown");
      console.log(`✓ ${batchOk} | ✗ ${batchFailed}`);
      errors.forEach((e) => console.warn(`  Error: ${e}`));
    } else {
      console.log(`✓ ${batchOk}`);
    }

    // Pequeña pausa entre batches para no saturar la API de OpenAI
    if (i + BATCH_SIZE < products.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  console.log(`\nResumen: ${ok} analizados | ${failed} errores`);
}

main().catch((err) => {
  console.error("Error en análisis batch:", err.message ?? err);
  process.exit(1);
});
