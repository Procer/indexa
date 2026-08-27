import type { ProductCategory, UseCase } from "@/types";

// Detección liviana de un tag de uso curado (ej. "Juegos", "Diseño y
// edición") en texto libre, sin LLM — mismo patrón que detectBrandMention.ts.
// Blindaje contra que el modelo de slot-filling no detecte una respuesta de
// botón curado (bug reportado en vivo: clickear "🎮 Juegos" en celular a
// veces no se traducía a gaming_mobile — y como todavía no había ningún
// use_case guardado la primera vez que pasaba, el relleno de huecos de
// mergeKnownSlots no tenía nada para recuperar, así que el chat volvía a
// preguntar lo mismo en loop hasta que el LLM acertaba por pura suerte).
//
// Solo cubre los tags con mapeo 1:1 sin ambigüedad a un UseCase del enum
// general — se deja afuera "TV en vivo"/"Pantalla de PC" (TV) y "Para mis
// hijos" (tablet), que no tienen una traducción clara y única.
const PHONE_TAG_USE_CASES: [RegExp, UseCase][] = [
  [/\bfotos y videos\b/i, "photography"],
  [/\bredes sociales\b/i, "social_media"],
  [/\bjuegos\b/i, "gaming_mobile"],
  [/\btrabajo y email\b/i, "professional_mobile"],
  [/\buso b[aá]sico\b/i, "basic_use"],
];

const COMPUTER_TAG_USE_CASES: [RegExp, UseCase][] = [
  [/\btrabajo y oficina\b/i, "office"],
  [/\bestudio\b/i, "study"],
  [/\bdise[nñ]o y edici[oó]n\b/i, "graphic_design"],
  [/\bgaming\b/i, "gaming_casual"],
  [/\bpel[ií]culas y uso diario\b/i, "multimedia"],
];

// Tablet: "Para mis hijos" queda afuera a propósito, mismo criterio que
// arriba — no tiene una traducción 1:1 clara (podría ser estudio, uso
// básico, juegos casuales). El resto sí, y "Entretenimiento" es justo el
// que se vio fallar en vivo (use_cases quedaba vacío tras click real en
// producción, reproducido dos veces seguidas).
const TABLET_TAG_USE_CASES: [RegExp, UseCase][] = [
  [/\bestudio\b/i, "study"],
  [/\bdibujo y dise[nñ]o\b/i, "graphic_design"],
  [/\bentretenimiento\b/i, "multimedia"],
  [/\btrabajo\b/i, "office"],
];

export function detectTagUseCase(input: string, category: ProductCategory | null): UseCase | null {
  const map =
    category === "phone"
      ? PHONE_TAG_USE_CASES
      : category === "notebook" || category === "desktop"
        ? COMPUTER_TAG_USE_CASES
        : category === "tablet"
          ? TABLET_TAG_USE_CASES
          : null;
  if (!map) return null;

  for (const [re, useCase] of map) {
    if (re.test(input)) return useCase;
  }
  return null;
}
