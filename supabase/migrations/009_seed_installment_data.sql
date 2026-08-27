-- Poblar datos de cuotas para todos los productos con precio contado.
-- Se asigna un plan variado y realista basado en el hash del ID (distribución determinística).
--
-- Planes asignados (mercado argentino 2025):
--   0 → 3 cuotas sin interés  (precio por cuota = contado / 3)
--   1 → 6 cuotas sin interés  (precio por cuota = contado / 6)
--   2 → 6 cuotas              (10% de interés total → cuota = contado * 1.10 / 6)
--   3 → 12 cuotas sin interés (precio por cuota = contado / 12)
--   4 → 12 cuotas             (25% de interés total → cuota = contado * 1.25 / 12)
--   5 → 18 cuotas             (40% de interés total → cuota = contado * 1.40 / 18)
--
-- price_installment = precio POR CUOTA (mensual), NO el total.
-- installment_count = cantidad de cuotas.
-- installment_info  = descripción legible para el usuario.

UPDATE products
SET
  installment_count = CASE ABS(HASHTEXT(id::text)) % 6
    WHEN 0 THEN 3
    WHEN 1 THEN 6
    WHEN 2 THEN 6
    WHEN 3 THEN 12
    WHEN 4 THEN 12
    ELSE        18
  END,
  price_installment = CASE ABS(HASHTEXT(id::text)) % 6
    WHEN 0 THEN ROUND((price_cash / 3)::numeric, 2)
    WHEN 1 THEN ROUND((price_cash / 6)::numeric, 2)
    WHEN 2 THEN ROUND((price_cash * 1.10 / 6)::numeric, 2)
    WHEN 3 THEN ROUND((price_cash / 12)::numeric, 2)
    WHEN 4 THEN ROUND((price_cash * 1.25 / 12)::numeric, 2)
    ELSE        ROUND((price_cash * 1.40 / 18)::numeric, 2)
  END,
  installment_info = CASE ABS(HASHTEXT(id::text)) % 6
    WHEN 0 THEN '3 cuotas sin interés'
    WHEN 1 THEN '6 cuotas sin interés'
    WHEN 2 THEN '6 cuotas'
    WHEN 3 THEN '12 cuotas sin interés'
    WHEN 4 THEN '12 cuotas'
    ELSE        '18 cuotas'
  END
WHERE price_cash IS NOT NULL
  AND price_cash > 0;
