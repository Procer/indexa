// Filtro compartido por todos los scripts de ingesta (ML, Fravega, Cetrogar,
// Musimundo, Garbarino, Compumundo, Megatone, Coppel, etc.) para descartar
// accesorios/productos no relacionados que se cuelan en los resultados de
// búsqueda por palabra clave de cada fuente (ej. buscar "notebook" también
// trae "Disco SSD ... para Notebook" o "Soporte para Notebook", porque el
// motor de búsqueda de la tienda no filtra por categoría real).
//
// Origen: se detectó en producción un "Disco SSD Kingston" recomendado como
// notebook — la búsqueda "notebook laptop" en ML lo trajo porque el título
// menciona "Notebook" como compatibilidad, y el mapeo asumía ciegamente que
// todo lo que vuelve de esa búsqueda ES una notebook.
//
// Dos listas separadas a propósito:
// - UNAMBIGUOUS_ANYWHERE: ningún producto real de estas categorías vendría
//   nunca con esto de regalo/bundle (una notebook no viene "con" una
//   impresora, un telescopio o un adaptador de video) — seguro matchear en
//   cualquier posición del título.
// - BUNDLE_PRONE_STARTS: estas SÍ son accesorio cuando son el producto
//   principal, pero aparecen legítimamente como bundle real (ej. "Notebook
//   HP ... + Mochila", "PC Armada Gamer ... Teclado Mouse Auriculares") — solo
//   cuentan si abren el título, que es como las tiendas nombran el producto
//   que en verdad se está vendiendo.
// "reloj"/"smartwatch" acá: un reloj inteligente es un producto real, pero
// nunca la categoría que buscamos (notebook/desktop/tablet/tv/phone) — visto
// colándose como category=phone en el origen (bug reportado en vivo:
// "Reloj Smart Fit Noga" apareciendo en resultados de celulares).
const UNAMBIGUOUS_ANYWHERE =
  /\b(adaptador|disco (ssd|r[ií]gido|duro|externo)|webcam|micr[óo]fono|l[áa]mpara|impresora|toner|cooler|silla (de|ergon[óo]mica)|biblioteca|estante|mesa de|mueble|rack de madera|cajonera|archivero|armario|escritorio de madera|repisa|organizador de escritorio|porta notebook|pendrive|memoria (ram|usb)|candado|docking|repetidor wifi|access point|gabinete vac[íi]o|placa madre|film protector|mica para|estuche|malet[íi]n|control remoto universal|conviert[íi] tv en smart|tv box|convertidor smart ?tv|anycast|insecticidas?|telescopio|reparaci[oó]n|repuesto(s)?|destornillador(es)?|kit de herramientas|reloj|smart\s*watch)\b/i;

// "escritorio" acá (a diferencia de "escritorio de madera" en
// UNAMBIGUOUS_ANYWHERE) solo cuenta cuando ABRE el título — un mueble tipo
// "Escritorio Orlandi para Notebook..."/"Escritorio Mosconi 709..." real,
// visto colándose en la categoría notebook. "PC de Escritorio"/"Computadora
// de Escritorio" (equipos reales) siempre tienen "escritorio" después de
// "de", nunca como primera palabra, así que no matchean acá.
const BUNDLE_PRONE_STARTS =
  /^\s*(soporte|base( refrigerante| cooler)?|funda|mochila|bolso|bolsa|cargador|cable( usb)?|mouse|teclado|hub usb|auricular|protector de pantalla|vidrio templado|power bank|correa para reloj|parlante|escritorio)\b/i;

export function isLikelyAccessory(title: string): boolean {
  return UNAMBIGUOUS_ANYWHERE.test(title) || BUNDLE_PRONE_STARTS.test(title);
}
