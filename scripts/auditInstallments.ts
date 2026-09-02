/**
 * Auditoría read-only de `price_installment` (jugada #13). Verifica que el
 * campo sea la cuota MENSUAL y no el total financiado — la regla que ahora
 * aplica normalizeMonthlyInstallment() al ingerir.
 *
 * Marca como sospechosa toda fila disponible donde:
 *   - price_installment ≈ price_cash (≥ 95%) con más de 1 cuota  → es un total
 *   - price_installment * installment_count > price_cash * 2      → total inflado
 *
 * No toca la base. Para el antes/después de un resync.
 *
 *   npx tsx --env-file=.env.local scripts/auditInstallments.ts
 */

import { sql } from "@/lib/db/sql";

type Row = {
  id: string;
  source: string;
  title: string;
  price_cash: number | null;
  price_installment: number | null;
  installment_count: number | null;
};

async function main() {
  const rows = await sql<Row[]>`
    SELECT id, source, title, price_cash, price_installment, installment_count
    FROM products
    WHERE available = true AND price_installment IS NOT NULL AND price_installment > 0
  `;
  console.log(`Filas disponibles con price_installment: ${rows.length}\n`);

  const bySource: Record<string, { total: number; bad: number }> = {};
  const bad: { row: Row; why: string }[] = [];

  for (const r of rows) {
    const src = (bySource[r.source] ??= { total: 0, bad: 0 });
    src.total++;
    const pc = r.price_cash;
    const pi = r.price_installment!;
    const n = r.installment_count ?? 0;
    let why = "";
    if (pc != null && n > 1 && pi >= pc * 0.95) why = `cuota=${pi} ≈ contado=${pc} en ${n} cuotas`;
    else if (pc != null && n > 0 && pi * n > pc * 2) why = `cuota×n=${pi * n} > 2× contado=${pc}`;
    if (why) {
      src.bad++;
      bad.push({ row: r, why });
    }
  }

  console.log("Por tienda (sospechosas / total):");
  Object.entries(bySource)
    .sort((a, b) => b[1].bad - a[1].bad)
    .forEach(([s, v]) => console.log(`  ${s.padEnd(12)} ${v.bad}/${v.total}`));

  console.log(`\nTotal sospechosas: ${bad.length} (${((bad.length / rows.length) * 100).toFixed(1)}%)`);
  console.log("\n── Muestra (hasta 25) ──");
  bad.slice(0, 25).forEach(({ row, why }) => {
    console.log(`  [${row.source}] ${row.title.slice(0, 70)}`);
    console.log(`     ${why}`);
  });
}

main()
  .catch(console.error)
  .finally(() => sql.end({ timeout: 5 }));
