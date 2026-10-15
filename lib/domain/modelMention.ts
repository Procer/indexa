// Detección de dos patrones de mensaje que el chat resolvía mal:
//  - preguntas de opinión/comparación ("¿por qué es mejor una Lenovo que
//    Samsung?") que nombran marcas pero NO piden filtrar por ellas, y
//  - pedidos de una variante puntual de modelo ("Galaxy Tab S10 Ultra") que no
//    está entre los productos disponibles — el chat decía "dentro de tu
//    presupuesto" o prometía "busco eso" cuando en realidad el modelo no existe
//    (o está dado de baja) y la re-búsqueda devolvía lo mismo.

const OPINION_PATTERNS: RegExp[] = [
  /\bpor ?qu[eé]\b/i,
  /\bes mejor\b/i,
  /\bmejor (?:que|opci[oó]n entre)\b/i,
  /\bdiferencias?\b/i,
  /\bconviene\b/i,
  /\bcompar(?:a|ar|ame|ando|aci[oó]n)\b/i,
  /\b(?:vs\.?|versus)\b/i,
  /\bcu[aá]l (?:es )?mejor\b/i,
];

/** Pregunta que pide una explicación/opinión, no un filtro nuevo. */
export function isOpinionQuestion(message: string): boolean {
  return OPINION_PATTERNS.some((re) => re.test(message));
}

const VARIANTS = "ultra|pro|max|plus|fe|lite|mini|air";
// Token con letra+dígito (s10, a54, x920) o "iphone 15" seguido de variante.
const MODEL_PHRASE_RE = new RegExp(
  `\\b((?:iphone\\s+\\d{1,2})|(?:[a-z]{1,3}\\d{1,4}[a-z]{0,2}))\\s+(${VARIANTS})\\b`,
  "gi"
);

function normalize(text: string): string {
  return (
    " " +
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim() +
    " "
  );
}

/**
 * Devuelve la primera frase "modelo + variante" mencionada en `text` que no
 * aparece en NINGÚN título de `titles` (ej. "S10 Ultra" cuando solo hay S10 FE
 * y S10 Lite). null si no menciona variantes o todas existen.
 */
export function findUnmetModelPhrase(text: string, titles: string[]): string | null {
  const normTitles = titles.map(normalize);
  for (const m of Array.from(text.matchAll(MODEL_PHRASE_RE))) {
    const phrase = normalize(`${m[1]} ${m[2]}`);
    if (!normTitles.some((t) => t.includes(phrase))) {
      return `${m[1]} ${m[2]}`.replace(/\b[a-z]/g, (c) => c.toUpperCase());
    }
  }
  return null;
}

// ── Pedido de un modelo puntual ─────────────────────────────────────────────
// "Galaxy Tab S11 Ultra", "iPhone 15", "Moto G84", "Asus TUF A15": el usuario
// ya sabe qué quiere — no se le pregunta uso ni presupuesto, se le muestra ese
// modelo (y lo más parecido) directamente.

// Tokens letra+dígito que NO son un modelo: capacidades, memoria, GPU/CPU,
// conectividad, sistema operativo, unidades.
const NOT_A_MODEL_RE =
  /^(?:\d.*|(?:i[3579]|r[3579]|m[1-4]|rtx|gtx|rx|gt|ddr|lpddr|ssd|hdd|nvme|usb|hdmi|wifi|wi|bt|win|w|windows|android|ios|gen|hz|gb|tb|mb|mp|mah|fhd|uhd|qhd|hd|led|oled|lcd|ips|va|k|x)\d*[a-z]{0,2})$/i;

const MODEL_TOKEN_RE = /\b(?:iphone\s+\d{1,2}|[a-z]{1,3}\d{1,4}[a-z]{0,2})\b/gi;
const VARIANT_AFTER_RE = new RegExp("^\\s+(" + VARIANTS + ")\\b", "i");

/**
 * Frases normalizadas de modelo pedidas en `text` ("s11 ultra", "g84",
 * "iphone 15 pro"). Vacío si el texto no nombra ningún modelo puntual.
 */
export function extractModelRequests(text: string): string[] {
  const out: string[] = [];
  for (const m of Array.from(text.matchAll(MODEL_TOKEN_RE))) {
    const token = m[0];
    if (!/^iphone/i.test(token) && NOT_A_MODEL_RE.test(token)) continue;
    const rest = text.slice((m.index ?? 0) + token.length);
    const variant = VARIANT_AFTER_RE.exec(rest);
    const phrase = normalize(variant ? `${token} ${variant[1]}` : token).trim();
    if (phrase && !out.includes(phrase)) out.push(phrase);
  }
  return out;
}

export function isSpecificModelRequest(text: string): boolean {
  return extractModelRequests(text).length > 0;
}

/** ¿El título nombra alguno de los modelos pedidos? (comparación por palabras) */
export function titleMatchesModelRequest(title: string, requests: string[]): boolean {
  if (requests.length === 0) return false;
  const t = normalize(title);
  return requests.some((r) => t.includes(` ${r} `));
}
