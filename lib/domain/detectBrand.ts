// Detección liviana de mención de marca en texto libre, sin LLM — usada en
// el chat de resultados para reconocer determinísticamente un pedido de
// marca ("tenés algo de Apple?", "quiero Dell") como una intención de
// búsqueda real, sin depender de que el modelo llame a suggest_refinement
// (bug reportado en vivo: preguntas de disponibilidad de marca a veces se
// respondían en texto genérico, sin buscar de verdad).
const KNOWN_BRANDS = [
  "samsung",
  "apple",
  "motorola",
  "xiaomi",
  "redmi",
  "poco",
  "dell",
  "hp",
  "lenovo",
  "asus",
  "acer",
  "lg",
  "sony",
  "tcl",
  "philips",
  "oppo",
  "tecno",
  "positivo",
  "noblex",
  "bangho",
  "huawei",
  "microsoft",
  "msi",
  "gigabyte",
  "razer",
  "nubia",
  "zte",
  "realme",
  "vivo",
  "infinix",
  "honor",
  "iphone",
] as const;

const DISPLAY_NAME: Record<string, string> = {
  iphone: "Apple",
};

function displayName(brand: string): string {
  return DISPLAY_NAME[brand] ?? brand.charAt(0).toUpperCase() + brand.slice(1);
}

export function detectBrandMention(input: string): string | null {
  const l = input.toLowerCase();
  for (const brand of KNOWN_BRANDS) {
    if (new RegExp(`\\b${brand}\\b`).test(l)) return displayName(brand);
  }
  return null;
}
