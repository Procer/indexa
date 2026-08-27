// Helpers de presentación compartidos entre ProductCard (grilla/panel de detalle)
// y ProductChatCard (tarjeta compacta dentro del chat) — un solo lugar para no
// desalinear nombres de tienda ni formato de precio entre los dos.

export const SOURCE_NAMES: Record<string, string> = {
  fravega: "Frávega",
  cetrogar: "Cetrogar",
  musimundo: "Musimundo",
  garbarino: "Garbarino",
  compumundo: "Compumundo",
  megatone: "Megatone",
  coppel: "Coppel",
  naldo: "Naldo",
  jumbo: "Jumbo",
  carrefour: "Carrefour",
  oncity: "On City",
  mercadolibre: "MercadoLibre",
  disco: "Disco",
  vea: "Vea",
  changomas: "Changomas",
  pardo: "Pardo Hogar",
};

// Dominio real de cada tienda (ver lib/sources/*.ts) — se usa para pedirle el
// ícono al servicio de favicons de Google, sin tener que subir/mantener
// archivos de marca a mano por cada tienda nueva. (Clearbit tenía un servicio
// de logos público equivalente pero el dominio dejó de resolver — verificado
// en vivo, ya no existe.)
const SOURCE_DOMAINS: Record<string, string> = {
  fravega: "fravega.com",
  cetrogar: "cetrogar.com.ar",
  musimundo: "musimundo.com",
  garbarino: "garbarino.com",
  compumundo: "compumundo.com.ar",
  megatone: "megatone.net",
  coppel: "coppel.com.ar",
  naldo: "naldo.com.ar",
  jumbo: "jumbo.com.ar",
  carrefour: "carrefour.com.ar",
  oncity: "oncity.com",
  mercadolibre: "mercadolibre.com.ar",
  disco: "disco.com.ar",
  vea: "vea.com.ar",
  // El link real de producto apunta a masonline.com.ar (ver lib/sources/changomas.ts),
  // pero el ícono de la marca que el usuario reconoce es el de Changomas.
  changomas: "changomas.com.ar",
  // Igual que Changomas: el link de producto real apunta a pardo.com.ar
  // (ver lib/sources/pardo.ts), pero "Pardo Hogar" es la marca que el
  // usuario reconoce en pardohogar.com.ar (alias que redirige ahí).
  pardo: "pardo.com.ar",
};

export function storeLogoUrl(source: string): string | null {
  const domain = SOURCE_DOMAINS[source];
  return domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=128` : null;
}

export function formatPrice(price: number): string {
  return `$${Math.round(price).toLocaleString("es-AR")}`;
}

export function storeName(source: string): string {
  return SOURCE_NAMES[source] ?? source;
}
