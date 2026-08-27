-- Eliminar productos de mobiliario/accesorios que se coló en categorías de notebook/desktop.
-- El scraper de MercadoLibre a veces incluye muebles de computación (escritorios, racks,
-- bibliotecas) en las mismas listings que los equipos. El filtro en route.ts los excluye
-- de los resultados, pero siguen ocupando espacio en la DB.

DELETE FROM products
WHERE (
  title ~* '\m(biblioteca|estante\s+rack|rack\s+de|mueble|escritorio\s+gamer|escritorio\s+pc|silla\s+gamer|soporte\s+monitor|monitor\s+soporte|pedestal|cajonera)\M'
)
AND (
  -- Solo eliminar si no tienen specs de procesador (confirma que son accesorios, no equipos)
  (specs->>'processor_tier') IS NULL
  OR category NOT IN ('notebook', 'desktop', 'phone', 'tablet', 'tv')
);
