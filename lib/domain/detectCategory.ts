import type { ProductCategory } from "@/types";

// Detección liviana por palabras clave, sin LLM — usada tanto en el cliente
// (para mostrar preguntas al toque, ver page.tsx) como en el servidor (para
// detectar determinísticamente si un mensaje del chat implica un cambio de
// categoría, sin depender de que el modelo llame a suggest_refinement).
export function detectCategoryLocally(input: string): ProductCategory | null {
  const l = input.toLowerCase();
  if (/notebook|laptop/.test(l)) return "notebook";
  if (/\bpc\b|computadora|desktop|escritorio/.test(l)) return "desktop";
  if (/\btablet\b|ipad/.test(l)) return "tablet";
  if (/celular|smartphone|iphone/.test(l)) return "phone";
  if (/\btv\b|televisor|smart tv/.test(l)) return "tv";
  return null;
}
