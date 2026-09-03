// Guía de referencia "qué significa cada característica", pensada para
// usuarios sin conocimiento técnico. A diferencia de specExplainer.ts (que
// explica el VALOR concreto de un producto puntual, corto, para escanear
// rápido), acá vive la explicación general y con metáfora de cada tipo de
// spec — el usuario la abre/cierra cuando quiere, no compite por espacio
// con los resultados. Sin LLM: contenido estático curado a mano.
//
// Comparaciones elegidas para que las entienda cualquiera, sin tecnicismos
// (feedback del usuario: "la comparación tiene que ser genérica y bien
// comprendida por todo el mundo"):
// - Procesador / Gráfica → motor de auto (más potencia, responde mejor)
// - RAM → espacio de trabajo / escritorio (cuántas cosas abiertas a la vez)
// - Almacenamiento → los GB de un celular (cuánto guardás)
// - Batería / Pantalla y peso → comparación directa y concreta (horas, pulgadas, kg)
// - Cámara → resolución de una foto (zoom sin perder calidad)
// - TV (panel/resolución/refresco) → ventana / cuadros por segundo
//
// Cada entrada tiene DOS partes a propósito: `metaphor` explica QUÉ ES el
// componente, `howToTell` explica CÓMO RECONOCER si el valor de ESTE
// producto es bueno o no — sin la segunda parte, un usuario no técnico
// entiende la metáfora pero sigue sin saber si "Intel Core 5 120U" o "8GB"
// son buenos o flojos (feedback real: "cómo sabrá el usuario que un
// procesador es potente?").

import type { ProductCategory } from "@/types";

export interface GlossaryEntry {
  key: string;
  icon: string; // emoji, liviano y sin dependencias — coherente con el resto de la guía
  label: string;
  metaphor: string;
  howToTell: string;
}

const PROCESSOR: GlossaryEntry = {
  key: "processor",
  icon: "⚙️",
  label: "Procesador",
  metaphor:
    "Es el motor del equipo. Cuanto más potente, más rápido arranca todo y mejor responde cuando le pedís varias cosas a la vez, como un motor de auto más grande responde mejor al pisar el acelerador.",
  howToTell:
    "¿Cómo saber si es potente? No hace falta entender nombres como \"i5\" o \"Ryzen 5\": mirá la palabra que usamos en \"Rapidez\" en cada producto — básica, intermedia, alta o tope de gama. Cuanto más alto ese nivel, más potente.",
};

const RAM: GlossaryEntry = {
  key: "ram",
  icon: "🍳",
  label: "Memoria RAM",
  metaphor:
    "Es el espacio de trabajo del equipo, como el tamaño de un escritorio: cuanto más grande, más cosas podés tener abiertas a la vez (programas, pestañas del navegador) sin que se ponga lento. Con poco, tenés que ir cerrando una cosa para abrir otra.",
  howToTell:
    "¿Cómo saber si alcanza? Mirá directamente el número de GB: 8GB alcanza para el uso diario, 16GB es cómodo para tener varias cosas abiertas o diseño/gaming, 32GB+ es para tareas muy exigentes. Acá sí, más GB es siempre mejor.",
};

const STORAGE: GlossaryEntry = {
  key: "storage",
  icon: "🗄️",
  label: "Almacenamiento",
  metaphor:
    "Es cuánto podés guardar en el equipo: fotos, videos, programas — igual que los GB de un celular. Al ser SSD, además te abre y entrega todo al instante; un disco viejo (HDD) tarda bastante más.",
  howToTell:
    "¿Cómo saber si alcanza? Con 256GB vas justo si guardás muchas fotos o videos, 512GB es cómodo, 1TB+ es para quien acumula mucho contenido. Y si podés elegir, un SSD siempre es mejor que un HDD, sin importar la capacidad.",
};

const GPU: GlossaryEntry = {
  key: "gpu",
  icon: "🏁",
  label: "Placa de video",
  metaphor:
    "Es un motor extra, como el turbo de un auto: no lo necesitás para manejar en la ciudad (uso diario, oficina, redes), pero es indispensable para \"carreras\" exigentes como juegos pesados o edición de video/fotos.",
  howToTell:
    "¿Cómo saber si tiene? Fijate si decimos \"dedicada\" o aparece un nombre como RTX/GTX/RX. Si solo dice \"integrada\", no tiene una placa aparte — le alcanza para uso diario, pero no para gaming pesado ni edición exigente.",
};

const SCREEN_PORTABLE: GlossaryEntry = {
  key: "screen",
  icon: "📐",
  label: "Pantalla y tamaño",
  metaphor:
    "El tamaño se mide en diagonal, en pulgadas. Más grande es más cómodo para mirar, pero también pesa y ocupa más en la mochila todos los días — la misma decisión que entre un anotador chico y una carpeta grande.",
  howToTell:
    "Acá no hay truco: son los números tal cual los ves. Cuantas menos pulgadas y menos kg, más fácil de cargar todos los días; cuantas más pulgadas, más cómodo para mirar de cerca.",
};

const SCREEN_FIXED: GlossaryEntry = {
  key: "screen",
  icon: "📐",
  label: "Pantalla",
  metaphor: "El tamaño de pantalla define qué tan cómodo es trabajar con varias ventanas abiertas a la vez, sin afectar portabilidad porque este equipo queda fijo en un lugar.",
  howToTell: "Simplemente mirá las pulgadas: más grande, más cómodo para tener varias ventanas a la vez sin achicar todo.",
};

const BATTERY: GlossaryEntry = {
  key: "battery",
  icon: "🔋",
  label: "Batería",
  metaphor:
    "Lo que importa no es el número (Wh o mAh) sino cuántas horas de uso real aguanta sin que busques el cargador — varía según cuánto exigís el equipo, igual que un auto gasta más nafta manejando a fondo.",
  howToTell:
    "Como referencia rápida: en notebooks, 42Wh es lo básico y 65Wh+ ya es autonomía alta. En celulares, 4000mAh es lo esperable y 5000mAh+ es batería grande. Más número, más duración esperada.",
};

const CAMERA: GlossaryEntry = {
  key: "camera",
  icon: "📸",
  label: "Cámara",
  metaphor:
    "Los megapíxeles son como la resolución de una impresora: más MP te dejan hacer más zoom o recortar la foto después sin que se vea pixelada o borrosa.",
  howToTell:
    "Como referencia rápida: 48MP+ ya da buena nitidez, 100MP+ es resolución muy alta. Ojo: no es la única variable que importa, pero como número para comparar rápido sirve.",
};

const PANEL: GlossaryEntry = {
  key: "panel",
  icon: "🖼️",
  label: "Tipo de panel",
  metaphor:
    "Es como el material de una ventana: un panel OLED apaga cada punto de forma individual y logra negros más profundos, como mirar a través de un vidrio más nítido que uno común (LED).",
  howToTell:
    "Buscá la palabra en la ficha: de mejor a más básico, el orden habitual es OLED, QLED/MiniLED, y LED/NanoCell común.",
};

const RESOLUTION: GlossaryEntry = {
  key: "resolution",
  icon: "🔍",
  label: "Resolución",
  metaphor:
    "Es la cantidad de \"puntitos\" que arman la imagen — como la diferencia entre una foto de baja calidad y una nítida: a mayor resolución (4K), más te podés acercar a la pantalla sin ver la imagen pixelada.",
  howToTell:
    "Buscá \"4K\" (o UHD) en pantallas de 43\" o más — vale la pena. En pantallas más chicas, con Full HD (FHD) alcanza y no hace falta pagar de más por 4K.",
};

const REFRESH_RATE: GlossaryEntry = {
  key: "refresh",
  icon: "🎞️",
  label: "Tasa de refresco",
  metaphor:
    "Cuántas veces por segundo se redibuja la imagen (Hz) — como comparar una animación con pocos cuadros contra una fluida: más Hz, movimiento más suave. Se nota sobre todo en deportes y juegos.",
  howToTell:
    "Buscá el número seguido de \"Hz\": 60Hz es lo básico (series, películas), 120Hz+ se nota fluido y conviene para deportes o gaming.",
};

export const SPEC_GLOSSARY: Record<ProductCategory, GlossaryEntry[]> = {
  notebook: [PROCESSOR, RAM, STORAGE, GPU, SCREEN_PORTABLE, BATTERY],
  desktop: [PROCESSOR, RAM, STORAGE, GPU, SCREEN_FIXED],
  tablet: [PROCESSOR, RAM, STORAGE, SCREEN_PORTABLE, BATTERY],
  phone: [PROCESSOR, RAM, STORAGE, CAMERA, SCREEN_PORTABLE, BATTERY],
  tv: [PANEL, RESOLUTION, REFRESH_RATE],
};

export function getGlossaryForCategories(categories: ProductCategory[]): GlossaryEntry[] {
  const seen = new Set<string>();
  const entries: GlossaryEntry[] = [];
  for (const cat of categories) {
    for (const entry of SPEC_GLOSSARY[cat] ?? []) {
      if (!seen.has(entry.key)) {
        seen.add(entry.key);
        entries.push(entry);
      }
    }
  }
  return entries;
}
