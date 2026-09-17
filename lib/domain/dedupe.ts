// Agrupa productos equivalentes de distintas tiendas — usado tanto por el
// pipeline de búsqueda (lib/search/pipeline.ts, agrupa dentro del pool ya
// rankeado de una búsqueda puntual) como por el endpoint de "buscar en otras
// tiendas" (app/api/products/[id]/other-stores/route.ts, agrupa contra TODO
// el catálogo de esa categoría/marca).

const NOISE_WORDS = /\b(nuevo|sellado|caja abierta|garantia oficial|gtia|original|oficial)\b/gi;

// Marcador de sistema operativo en el título — la MISMA notebook se lista como
// "... W11H" y "... Sin Sistema Operativo" y quedaba como dos filas distintas
// comiéndose dos slots del top (reportado en vivo 2026-09-10: Lenovo LOQ ×2 en
// una búsqueda de gaming). El SO no cambia el hardware; se borra del título
// antes de armar la clave para que esas variantes colapsen en un solo grupo
// (la más barata queda primaria, el resto van a also_at). RAM/almacenamiento
// siguen en la clave, así que 8GB vs 16GB NO colapsan.
const OS_MARKERS =
  /\b(sin sistema operativo|sin sistema|sin s\.?\s?o\.?|s\/\s?o|free\s?dos|freedos|endless\s?os|windows\s*1[01](\s*(home|pro))?|win\s*1[01]\s*(home|pro)?|w1[01]\s*(home|pro|h)?|w1[01]h)\b/gi;

// Specs "reafirmadas" en el título que NO distinguen un modelo de otro: los
// megapíxeles de la cámara ("12MP", "48 MP") y el tamaño de pantalla ("6.1
// Pulgadas", '6.1"'). Dos listados del MISMO teléfono quedaban como filas
// distintas solo porque uno agregaba "12MP." al final y otro no (reportado en
// vivo 2026-09-10: iPhone 13 128GB ×3 en el top). El almacenamiento (128GB) NO
// entra acá: sí distingue variantes reales, se conserva en la clave.
const RESTATED_SPECS = /\b\d+([.,]\d+)?\s*(mp\b|pulgadas?\b|pulg\.?|"|''|″|”)/gi;
// Puntuación que solo ensucia la clave (puntos finales, comas, comillas,
// paréntesis). Se saca al final; el guión y la barra se conservan porque
// aparecen en códigos de modelo ("SM-X133") y en combos RAM/almacenamiento
// ("8/256gb").
const KEY_PUNCT = /[.,;:!¡¿?()"''´`]/g;

export function buildDedupeKey(product: { category: string; brand: string | null; title: string }): string {
  const brand = (product.brand ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const titleNorm = product.title
    .toLowerCase()
    .replace(new RegExp(brand, "g"), "")
    .replace(NOISE_WORDS, "")
    .replace(OS_MARKERS, "")
    .replace(RESTATED_SPECS, " ")
    .replace(KEY_PUNCT, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `${product.category}:${brand}:${titleNorm}`;
}

// 0 nunca es un valor real para estas specs (RAM/almacenamiento/pulgadas/MP
// de cámara) — es el sentinel que deja el normalizador cuando la extracción
// falla (confirmado contra el catálogo real: 25/184 tablets disponibles
// tienen ram_gb=storage_gb=screen_inches=0 exactamente, todas del mismo tipo
// de fila con extracción fallida). Tratarlo como "sin dato" evita que dos
// tablets DISTINTAS con extracción fallida matcheen entre sí solo por
// compartir 0===0 en todos los campos numéricos.
function normNum(v: unknown): number | null {
  return typeof v === "number" && !Number.isNaN(v) && v !== 0 ? v : null;
}

function normStr(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function normBool(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

// Palabras que no ayudan a distinguir UN modelo de otro (genéricas de
// cualquier notebook/celular, o ya capturadas aparte como specs numéricas)
// — se descartan antes de comparar títulos entre tiendas.
const STOPWORDS = new Set([
  "notebook", "laptop", "pc", "computadora", "tablet", "celular", "smart", "tv",
  "de", "con", "para", "sin", "el", "la", "los", "las", "un", "una", "y",
  "windows", "home", "pro", "win11", "win", "w11h", "w11", "ssd", "hdd", "hd", "fhd", "uhd",
  "ram", "gb", "tb", "mp", "hz", "core", "intel", "amd", "ryzen",
]);

function significantTokens(title: string, brand: string): Set<string> {
  const brandNorm = brand.toLowerCase().replace(/[^a-z0-9]/g, "");
  return new Set(
    title
      .toLowerCase()
      .replace(NOISE_WORDS, "")
      .split(/[^a-z0-9]+/)
      .filter(
        (t) =>
          t.length >= 2 &&
          t !== brandNorm &&
          !STOPWORDS.has(t) &&
          // Solo descarta números CON unidad (16gb, 512gb, 50mp — ya
          // capturados aparte como specs). Un número suelto (14, 13, 3, 5)
          // casi siempre es parte del nombre real del modelo o generación
          // (ej. "Redmi Note 14" vs "13", "Ryzen 5" vs "3") — descartarlo
          // hacía que modelos DISTINTOS quedaran indistinguibles (bug real
          // encontrado: agrupaba "Redmi Note 13" con "Redmi Note 14").
          !/^\d+(gb|tb|mp|hz|w)$/.test(t)
      )
  );
}

// Superposición de tokens "de identidad" del título (línea/modelo — ej.
// "250r", "g10", "elitebook", "idealpad", "g06") ignorando marca, specs
// numéricas y palabras genéricas. Se usa como desempate cuando la marca y
// las specs numéricas ya coinciden pero eso solo no alcanza para asegurar
// que sea el MISMO modelo — ver nota en isLikelySameProduct.
function titleTokenOverlap(a: string, b: string, brand: string): number {
  const setA = significantTokens(a, brand);
  const setB = significantTokens(b, brand);
  if (setA.size === 0 || setB.size === 0) return 0;
  let shared = 0;
  Array.from(setA).forEach((t) => { if (setB.has(t)) shared++; });
  return shared / Math.min(setA.size, setB.size);
}

const TITLE_OVERLAP_THRESHOLD = 0.6;

// Token que mezcla letra(s) y número(s) pegados Y es largo (≥6) — en la
// práctica es el código de SKU/config real del fabricante dentro del título
// (ej. "fc0235la"), casi imposible que coincida por azar entre dos productos
// distintos. El mínimo de 6 es a propósito MÁS ESTRICTO que el resto de
// significantTokens: probado en vivo contra el catálogo completo (ver
// scripts/_regressionCheckDedupe.ts, no versionado) con un mínimo de 3 —
// eso SÍ tenía falsos positivos reales: códigos de LÍNEA cortos como "l14"/
// "l16"/"e16"/"g2i"/"s3" son iguales entre variantes con procesador
// DISTINTO de la misma serie (ej. "ThinkPad L16 Ryzen 7 PRO" vs "ThinkPad
// L16 Ryzen 5 PRO" — mismo "l16", procesador real distinto). Con mínimo 6
// esos códigos de línea cortos quedan afuera; solo sobreviven códigos que ya
// encodean la config específica, no solo la serie.
// UNIT_SUBSTRING_RE excluye además tokens que son specs pegadas sin espacio
// (ej. "ssd512gb", que en un título sin espacio entre "SSD" y "512GB" queda
// como un solo token largo con letras+números, pero no es un código de
// modelo — es RAM/almacenamiento, y coincide entre productos DISTINTOS que
// simplemente comparten esas specs, otro falso positivo real encontrado en
// el mismo chequeo).
const SKU_TOKEN_RE = /^(?=.*[a-z])(?=.*\d)[a-z0-9]{6,}$/;
const UNIT_SUBSTRING_RE = /(gb|tb|mp|hz|mah|wh)/i;

// Bug real encontrado en vivo (2026-08-24): el mismo modelo físico (HP
// 15-fc0235la, Ryzen 3 7320U) quedó con processor_tier="low" en la fila de
// una tienda y "mid" en la de otra — mismo procesador real, clasificado
// distinto según de dónde vino el listado (ruido del normalizador, no un
// procesador distinto de verdad). isLikelySameProduct exige tier idéntico a
// propósito (evita mezclar procesadores distintos), así que esos 4 listados
// del MISMO modelo nunca se agrupaban entre sí. Esta función da una salida
// segura: solo tolera el tier distinto si además comparten un token de SKU
// largo (arriba) — evidencia mucho más fuerte que el tier de que es el
// mismo producto exacto, no un empate laxo de specs genéricas o de línea.
function sharesSkuToken(a: string, b: string, brand: string): boolean {
  const setA = significantTokens(a, brand);
  const setB = significantTokens(b, brand);
  for (const t of Array.from(setA)) {
    if (SKU_TOKEN_RE.test(t) && !UNIT_SUBSTRING_RE.test(t) && setB.has(t)) return true;
  }
  return false;
}

export interface DedupeCandidate {
  category: string;
  brand: string | null;
  title: string;
  specs: unknown;
}

// Match "aflojado" para el botón de "buscar en otras tiendas" — medido en
// vivo contra el catálogo real, dos problemas descartaron enfoques más
// simples antes de llegar a este:
// 1. Match por título exacto (buildDedupeKey): casi nunca encontraba nada,
//    porque cada tienda redacta el título distinto (color, palabras de más)
//    aunque sea el mismo modelo.
// 2. Match solo por specs numéricas (marca+tier+RAM+almacenamiento): al
//    revés, encontraba de más — agrupó una HP 250 de gama básica ($1,8M) con
//    notebooks EliteBook/ProBook de gama empresarial ($2,7M-$3,4M) porque
//    processor_model viene como texto libre ruidoso entre tiendas (el mismo
//    HP 250R G10 tenía "Core i5-120U" en una tienda y literalmente
//    "core i5 16gb" en otra — error de normalización, no distingue línea de
//    producto) y varias líneas de HP comparten tier/RAM/almacenamiento.
// Este enfoque combina las dos señales: specs numéricas exactas (RAM,
// almacenamiento — confiables porque son números, no texto libre) COMO
// filtro duro, más superposición de palabras "de identidad" del título
// (línea/modelo, ej. "250r g10" vs "elitebook 840 g10") como desempate para
// no mezclar líneas distintas que casualmente comparten specs.
export function isLikelySameProduct(a: DedupeCandidate, b: DedupeCandidate): boolean {
  if (a.category !== b.category) return false;
  const brandA = (a.brand ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const brandB = (b.brand ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!brandA || brandA !== brandB) return false;

  const sa = (a.specs ?? {}) as Record<string, unknown>;
  const sb = (b.specs ?? {}) as Record<string, unknown>;

  if (a.category === "tv") {
    const inchesA = normNum(sa.screen_inches);
    const inchesB = normNum(sb.screen_inches);
    if (inchesA == null || inchesA !== inchesB) return false;
    // Resolución (HD/FHD/4K/8K) es un salto de precio grande dentro de la
    // misma marca+tamaño — exigir igualdad evita agrupar un TV HD barato con
    // un 4K. Sin dato en cualquiera de los dos, no matchea (fail closed).
    const resA = normStr(sa.resolution);
    const resB = normStr(sb.resolution);
    if (resA == null || resB == null || resA !== resB) return false;
  } else {
    const ramA = normNum(sa.ram_gb);
    const ramB = normNum(sb.ram_gb);
    const storageA = normNum(sa.storage_gb);
    const storageB = normNum(sb.storage_gb);
    if (ramA == null || ramA !== ramB) return false;
    if (storageA == null || storageA !== storageB) return false;

    if (a.category === "phone") {
      // Los celulares no tienen processor_tier — processor_chip (enum
      // cerrado: Snapdragon/Dimensity/Apple A/Exynos/Tensor) es la señal
      // confiable equivalente, a diferencia de processor_model (texto libre
      // ruidoso entre tiendas, ver nota de HP 250R G10 arriba). main_camera_mp
      // es otro salto de precio real entre variantes de una misma línea (ej.
      // versión "Pro" con mejor cámara, mismo RAM/almacenamiento). Fail
      // closed: sin dato en cualquiera de los dos, no matchea.
      const chipA = normStr(sa.processor_chip);
      const chipB = normStr(sb.processor_chip);
      if (chipA == null || chipB == null || chipA !== chipB) return false;

      const camA = normNum(sa.main_camera_mp);
      const camB = normNum(sb.main_camera_mp);
      if (camA == null || camA !== camB) return false;
    } else {
      // notebook / desktop / tablet: processor_tier (low/mid/high/enthusiast)
      // ahora es OBLIGATORIO en ambos — antes, si a alguno le faltaba, el
      // chequeo se salteaba entero y quedaba en manos de RAM+almacenamiento+
      // título, lo que permitía agrupar notebooks con procesadores reales
      // distintos (bug reportado por el usuario: causa raíz, los scripts de
      // sync no reescriben `specs` en cada corrida, así que filas viejas
      // quedan con este campo ausente para siempre hasta reingresar). Fail
      // closed es intencional: preferimos perder algún match real de una fila
      // vieja antes que mezclar procesadores distintos.
      const tierA = normStr(sa.processor_tier);
      const tierB = normStr(sb.processor_tier);
      if (tierA == null || tierB == null) return false;
      if (tierA !== tierB && !sharesSkuToken(a.title, b.title, a.brand ?? "")) return false;

      if (a.category === "notebook" || a.category === "desktop") {
        // Integrada vs dedicada es el salto de precio más grande dentro de
        // una misma línea (ej. variante "gaming" vs base, mismo RAM/tier).
        const gpuA = normStr(sa.gpu);
        const gpuB = normStr(sb.gpu);
        if (gpuA == null || gpuB == null || gpuA !== gpuB) return false;
      } else if (a.category === "tablet") {
        // WiFi-only vs con conectividad celular son SKUs distintos con
        // precio distinto aunque compartan el resto de las specs.
        const cellA = normBool(sa.has_cellular);
        const cellB = normBool(sb.has_cellular);
        if (cellA == null || cellB == null || cellA !== cellB) return false;
      }
    }
  }

  return titleTokenOverlap(a.title, b.title, a.brand ?? "") >= TITLE_OVERLAP_THRESHOLD;
}

// ─── "Modelos parecidos" (segundo bloque de "En otras tiendas") ───────────────
//
// isLikelySameProduct arriba es a propósito estricto: solo agrupa el MISMO SKU
// (misma capacidad, mismo chip, misma cámara). Eso deja afuera comparaciones
// igual de útiles para el usuario — la MISMA línea/modelo con una diferencia
// menor: 256GB vs 512GB, o la variante "Pro" vs "Pro+". isSimilarProduct captura
// eso SIN aflojar el matching estricto (siguen siendo dos listas separadas en la
// UI). Guardas para no volver al falso positivo histórico (HP 250 básica
// agrupada con EliteBook): generación de título idéntica, alto solape de tokens
// de identidad, banda de precio acotada, y como mucho 2 specs clave distintas.

// Tamaños de pantalla decimales ("6.83", "15,6") y combos RAM/almacenamiento
// pegados ("8/256gb") — ruido que ensucia tanto el solape de identidad como la
// detección de generación. Se limpian ANTES de tokenizar en este path (el path
// estricto no los toca, mantiene su comportamiento actual).
const DECIMAL_SIZE_RE = /\b\d+[.,]\d+\b/g;
const RAM_STORAGE_COMBO_RE = /\b\d+\s*\/\s*\d+\s*(gb|tb)\b/gi;

const SIMILAR_STOPWORDS = new Set([
  ...Array.from(STOPWORDS),
  "smartphone", "telefono", "phone", "cel", "equipo", "nuevo", "libre",
  "5g", "4g", "lte", "dual", "sim",
]);

function cleanForSimilar(title: string): string {
  return title
    .toLowerCase()
    .replace(NOISE_WORDS, " ")
    .replace(DECIMAL_SIZE_RE, " ")
    .replace(RAM_STORAGE_COMBO_RE, " ")
    // "Pro+" / "Pro Plus" / "Plus" sueltos → un token de identidad estable, así
    // "Note 15 Pro+" y "Note 15 Pro Plus" se ven iguales entre sí y DISTINTOS de
    // "Note 15 Pro" (que no tiene el token) y de "Note 15" pelado.
    .replace(/\bpro\s*\+/g, " proplus ")
    .replace(/\bpro\s+plus\b/g, " proplus ")
    .replace(/\bplus\b/g, " proplus ");
}

function similarIdentityTokens(title: string, brand: string): Set<string> {
  const brandNorm = brand.toLowerCase().replace(/[^a-z0-9]/g, "");
  return new Set(
    cleanForSimilar(title)
      .split(/[^a-z0-9]+/)
      .filter(
        (t) =>
          t.length >= 2 &&
          t !== brandNorm &&
          !SIMILAR_STOPWORDS.has(t) &&
          !/^\d+(gb|tb|mp|hz|w|mah|wh)$/.test(t)
      )
  );
}

// Números "pelados" del título tras limpiar tamaños de pantalla y specs — en la
// práctica son marcadores de generación/serie ("15" en "Redmi Note 15", "14" en
// "Note 14"). Si ambos títulos tienen alguno y NO coinciden, no son la misma
// línea. Si alguno queda vacío, no se aplica la guarda (no todos los modelos
// numeran la generación así).
function generationMarkers(title: string): Set<string> {
  return new Set(
    cleanForSimilar(title)
      .split(/[^a-z0-9]+/)
      .filter((t) => /^\d{1,4}$/.test(t))
  );
}

function sameGeneration(a: string, b: string): boolean {
  const ga = generationMarkers(a);
  const gb = generationMarkers(b);
  if (ga.size === 0 || gb.size === 0) return true;
  if (ga.size !== gb.size) return false;
  for (const t of Array.from(ga)) if (!gb.has(t)) return false;
  return true;
}

function similarTitleOverlap(a: string, b: string, brand: string): number {
  const setA = similarIdentityTokens(a, brand);
  const setB = similarIdentityTokens(b, brand);
  if (setA.size === 0 || setB.size === 0) return 0;
  let shared = 0;
  Array.from(setA).forEach((t) => { if (setB.has(t)) shared++; });
  return shared / Math.min(setA.size, setB.size);
}

const SIMILAR_TITLE_OVERLAP_THRESHOLD = 0.7;
const SIMILAR_PRICE_MIN_RATIO = 0.5;
const SIMILAR_PRICE_MAX_RATIO = 2;
const SIMILAR_MAX_SPEC_DIFFS = 2;

// Specs "clave" por categoría — las que mueven el precio dentro de una misma
// línea. Solo se cuenta una diferencia cuando AMBOS lados declaran el valor.
const KEY_SPEC_FIELDS: Record<string, string[]> = {
  phone: ["ram_gb", "storage_gb", "processor_chip", "main_camera_mp"],
  notebook: ["ram_gb", "storage_gb", "processor_tier", "gpu"],
  desktop: ["ram_gb", "storage_gb", "processor_tier", "gpu"],
  tablet: ["ram_gb", "storage_gb", "processor_tier", "has_cellular"],
  tv: ["screen_inches", "resolution", "panel_type"],
};

function specValue(specs: unknown, field: string): string | number | boolean | null {
  const s = (specs ?? {}) as Record<string, unknown>;
  const v = s[field];
  if (typeof v === "number") return normNum(v);
  if (typeof v === "string") return normStr(v);
  if (typeof v === "boolean") return v;
  return null;
}

interface SpecDiff {
  field: string;
  a: string | number | boolean;
  b: string | number | boolean;
}

// Diferencias de specs clave entre dos productos (solo campos que ambos
// declaran). Devuelve null si supera el máximo tolerado o si no hay suficientes
// campos comparables para afirmar que es la misma línea.
function keySpecDiffs(category: string, a: unknown, b: unknown): SpecDiff[] | null {
  const fields = KEY_SPEC_FIELDS[category] ?? ["ram_gb", "storage_gb"];
  let comparable = 0;
  const diffs: SpecDiff[] = [];
  for (const field of fields) {
    const va = specValue(a, field);
    const vb = specValue(b, field);
    if (va == null || vb == null) continue;
    comparable++;
    if (va !== vb) diffs.push({ field, a: va, b: vb });
  }
  if (comparable < 2) return null;
  if (diffs.length === 0 || diffs.length > SIMILAR_MAX_SPEC_DIFFS) return null;
  return diffs;
}

export interface SimilarMatch {
  differences: string[];
}

const SPEC_FIELD_LABELS: Record<string, (v: string | number | boolean) => string> = {
  ram_gb: (v) => `${v} GB RAM`,
  storage_gb: (v) => `${v} GB`,
  processor_chip: (v) => String(v),
  processor_tier: (v) => String(v),
  main_camera_mp: (v) => `${v} MP`,
  gpu: (v) => String(v),
  has_cellular: (v) => (v ? "con datos móviles" : "solo WiFi"),
  screen_inches: (v) => `${v}"`,
  resolution: (v) => String(v),
  panel_type: (v) => String(v),
};

function labelSpec(field: string, v: string | number | boolean): string {
  return (SPEC_FIELD_LABELS[field] ?? ((x) => String(x)))(v);
}

// Match "parecido" — MISMA línea/modelo con una diferencia menor. No sustituye a
// isLikelySameProduct: el endpoint muestra las dos listas por separado.
export function findSimilarMatch(
  a: DedupeCandidate & { price_cash?: number | null },
  b: DedupeCandidate & { price_cash?: number | null }
): SimilarMatch | null {
  if (a.category !== b.category) return null;
  const brandA = (a.brand ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const brandB = (b.brand ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!brandA || brandA !== brandB) return null;

  // Los idénticos ya van en el bloque exacto.
  if (isLikelySameProduct(a, b)) return null;

  if (!sameGeneration(a.title, b.title)) return null;
  if (similarTitleOverlap(a.title, b.title, a.brand ?? "") < SIMILAR_TITLE_OVERLAP_THRESHOLD) return null;

  const pa = a.price_cash ?? null;
  const pb = b.price_cash ?? null;
  if (pa != null && pb != null && pa > 0) {
    const ratio = pb / pa;
    if (ratio < SIMILAR_PRICE_MIN_RATIO || ratio > SIMILAR_PRICE_MAX_RATIO) return null;
  }

  const diffs = keySpecDiffs(a.category, a.specs, b.specs);
  if (diffs == null) return null;

  const differences = diffs.map((d) => `${labelSpec(d.field, d.b)} (vs ${labelSpec(d.field, d.a)})`);
  return { differences };
}
