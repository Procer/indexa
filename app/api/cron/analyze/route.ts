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
import { sql } from "@/lib/db/sql";
import { generateBatchAnalysis } from "@/lib/llm/batchAnalysis";
import type { ProductCategory, ProductSpecs } from "@/types";

interface AnalyzeProductRow {
  id: string;
  title: string;
  brand: string | null;
  category: ProductCategory;
  price_cash: number | null;
  price_installment: number | null;
  specs: ProductSpecs;
}

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

  let products: AnalyzeProductRow[];
  try {
    products = regenerate
      ? await sql<AnalyzeProductRow[]>`
          SELECT id, title, brand, category, price_cash, price_installment, specs
          FROM products
          WHERE available = true
          LIMIT ${limit}
        `
      : await sql<AnalyzeProductRow[]>`
          SELECT id, title, brand, category, price_cash, price_installment, specs
          FROM products
          WHERE available = true AND quality_price_score IS NULL
          LIMIT ${limit}
        `;
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }

  if (products.length === 0) {
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
        await sql`
          UPDATE products SET
            quality_price_score    = ${analysis.quality_price_score},
            quality_price_analysis = ${analysis.quality_price_analysis},
            analysis_generated_at  = ${new Date().toISOString()}
          WHERE id = ${product.id}::uuid
        `;
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
