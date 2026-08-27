/**
 * POST /api/cron/analyze
 *
 * Endpoint para cron job (Railway/Vercel Cron) que pre-genera quality_price_score
 * y quality_price_analysis para productos nuevos sin análisis.
 *
 * Requiere: Authorization: Bearer {CRON_SECRET}
 *
 * Parámetros de body (opcionales):
 *   limit: number    → máx productos por run (default 50, máx 200)
 *   regenerate: bool → si true, regenera incluso los que ya tienen análisis
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generateBatchAnalysis } from "@/lib/llm/batchAnalysis";

const BATCH_SIZE = 10;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function POST(request: NextRequest) {
  // Verificar CRON_SECRET
  const authHeader = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as {
    limit?: number;
    regenerate?: boolean;
  };

  const limit = Math.min(body.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  const regenerate = body.regenerate ?? false;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const baseQuery = supabase
    .from("products")
    .select("id, title, brand, category, price_cash, price_installment, specs")
    .eq("available", true)
    .limit(limit);

  const { data: products, error } = await (
    regenerate ? baseQuery : baseQuery.is("quality_price_score", null)
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!products || products.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, failed: 0, message: "No products pending analysis" });
  }

  let processed = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = products.slice(i, i + BATCH_SIZE);

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
      })
    );

    processed += results.filter((r) => r.status === "fulfilled").length;
    const batchFailed = results.filter(
      (r): r is PromiseRejectedResult => r.status === "rejected"
    );
    failed += batchFailed.length;
    batchFailed.forEach((r) => errors.push(r.reason?.message ?? "unknown"));
  }

  return NextResponse.json({
    ok: true,
    processed,
    failed,
    errors: errors.slice(0, 10),
  });
}
