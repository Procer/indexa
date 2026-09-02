// Detección liviana de mención de familia de procesador en texto libre, sin
// LLM — espejo de detectBrand.ts. Usada en el chat de resultados y en
// /api/search para reconocer determinísticamente un pedido puntual de
// procesador ("quiero con i7", "que sea Ryzen 7", "una con core 7") como
// intención de re-búsqueda real, sin depender de que gpt-4o-mini lo extraiga
// a preferences.processor_model_preferred (no lo hace de forma confiable, ni
// con temperature: 0) ni de que llame a suggest_refinement.

// Orden: de más fuerte a más débil. Cada patrón acepta la forma corta ("i7")
// y la forma con "core"/"intel core" adelante. La detección devuelve el
// primero que aparece en el texto (por posición), para que "no quiero i5,
// quiero i7" resuelva i7 y no i5.
const PATTERNS: { re: RegExp; canonical: string }[] = [
  { re: /\b(?:intel\s+)?core\s+i9\b|\bi9\b/i, canonical: "i9" },
  { re: /\b(?:intel\s+)?core\s+i7\b|\bi7\b/i, canonical: "i7" },
  { re: /\b(?:intel\s+)?core\s+i5\b|\bi5\b/i, canonical: "i5" },
  { re: /\b(?:intel\s+)?core\s+i3\b|\bi3\b/i, canonical: "i3" },
  { re: /\bcore\s+(?:ultra\s+)?9\b/i, canonical: "Core 9" },
  { re: /\bcore\s+(?:ultra\s+)?7\b/i, canonical: "Core 7" },
  { re: /\bcore\s+(?:ultra\s+)?5\b/i, canonical: "Core 5" },
  { re: /\bcore\s+(?:ultra\s+)?3\b/i, canonical: "Core 3" },
  { re: /\bryzen\s+9\b/i, canonical: "Ryzen 9" },
  { re: /\bryzen\s+7\b/i, canonical: "Ryzen 7" },
  { re: /\bryzen\s+5\b/i, canonical: "Ryzen 5" },
  { re: /\bryzen\s+3\b/i, canonical: "Ryzen 3" },
];

export function detectProcessorMention(input: string): string | null {
  let best: { canonical: string; at: number } | null = null;
  for (const { re, canonical } of PATTERNS) {
    const m = re.exec(input);
    if (m && (best === null || m.index < best.at)) {
      best = { canonical, at: m.index };
    }
  }
  return best ? best.canonical : null;
}
