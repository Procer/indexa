// Guías de compra (contenido estático para SEO y confianza). Sin precios ni
// modelos puntuales: envejecen rápido. Los precios reales viven en la búsqueda.

export interface GuideSection {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
}

export interface Guide {
  slug: string;
  title: string;
  description: string;
  intro: string;
  sections: GuideSection[];
  /** Texto del botón que lleva al buscador. */
  cta: string;
}

export const GUIDES: Guide[] = [
  {
    slug: "que-notebook-comprar",
    title: "¿Qué notebook comprar? Guía simple según tu uso",
    description:
      "Cómo elegir una notebook en Argentina sin saber de tecnología: qué necesitás según trabajes, estudies, juegues o edites, y qué specs importan de verdad.",
    intro:
      "La mejor notebook no es la más cara ni la de más especificaciones: es la que resuelve lo que vas a hacer todos los días. Estas son las preguntas que conviene responder antes de mirar precios.",
    sections: [
      {
        heading: "Primero: ¿para qué la vas a usar?",
        paragraphs: [
          "Para navegar, videollamadas, planillas y documentos alcanza con un equipo básico. Las diferencias grandes de precio aparecen cuando entran juegos, edición de video o diseño 3D.",
        ],
        bullets: [
          "Trabajo de oficina o estudio: procesador de gama media, 8 GB de RAM como mínimo y un SSD.",
          "Programar o abrir muchas pestañas y programas a la vez: 16 GB de RAM.",
          "Juegos o edición de video: placa de video dedicada (no integrada) y 16 GB de RAM.",
          "Llevarla todos los días: priorizá peso y batería antes que potencia.",
        ],
      },
      {
        heading: "Las tres cosas que más se sienten en el día a día",
        paragraphs: [
          "Un SSD hace que la notebook arranque y abra programas mucho más rápido que un disco común (HDD): si tiene que ser una sola mejora, es esa.",
          "La RAM decide cuántas cosas podés tener abiertas sin que se trabe. 8 GB es el piso razonable hoy; 4 GB se queda corto rápido.",
          "El procesador importa, pero dentro de una misma gama las diferencias entre modelos cercanos son chicas en el uso cotidiano.",
        ],
      },
      {
        heading: "Qué se puede mejorar después y qué no",
        paragraphs: [
          "En muchas notebooks se puede ampliar la RAM y el almacenamiento más adelante; el procesador y la placa de video casi nunca. Por eso conviene no ahorrar en el procesador y, si el presupuesto aprieta, dejar la RAM o el SSD para ampliar después.",
        ],
      },
      {
        heading: "Cuidado con las ofertas raras",
        paragraphs: [
          "Un precio muy bajo con specs muy altas suele esconder un procesador viejo o un disco lento. Compará el precio contra el historial: en indexa te mostramos si el precio actual es el más bajo o está por encima de lo habitual.",
        ],
      },
    ],
    cta: "Buscar mi notebook",
  },
  {
    slug: "como-elegir-celular",
    title: "Cómo elegir un celular: qué mirar además de la marca",
    description:
      "Guía para elegir celular en Argentina: batería, cámara, memoria y pantalla explicadas sin tecnicismos, y cómo no pagar de más.",
    intro:
      "Dos celulares del mismo precio pueden ser muy distintos en lo que más se usa: batería, velocidad y cámara. Así se comparan.",
    sections: [
      {
        heading: "Memoria: RAM y almacenamiento no son lo mismo",
        paragraphs: [
          "La RAM es la velocidad con que el celular maneja varias apps a la vez; el almacenamiento es el lugar donde guardás fotos, videos y apps.",
        ],
        bullets: [
          "RAM: 4 GB alcanza para uso básico; 6 a 8 GB se siente más ágil durante más años.",
          "Almacenamiento: 128 GB es lo mínimo cómodo si sacás fotos y videos.",
        ],
      },
      {
        heading: "Batería y carga",
        paragraphs: [
          "Una batería de 5000 mAh dura cómodamente un día de uso intenso. Mirá también la potencia del cargador: dos celulares con la misma batería pueden tardar el doble en cargar.",
        ],
      },
      {
        heading: "Cámara: los megapíxeles no lo dicen todo",
        paragraphs: [
          "Un sensor principal bueno vale más que muchas cámaras secundarias. Si la foto es importante para vos, fijate en reseñas con fotos reales de ese modelo, no solo en el número de megapíxeles.",
        ],
      },
      {
        heading: "Pantalla",
        paragraphs: [
          "Las pantallas OLED muestran mejores negros y colores; una tasa de refresco de 90 o 120 Hz hace que todo se sienta más fluido al deslizar. No son imprescindibles, pero se notan.",
        ],
      },
      {
        heading: "Cuotas: cuál es el precio real",
        paragraphs: [
          "Muchas tiendas muestran el valor de la cuota sin decir cuántas son ni si tienen interés. Compará siempre el precio contado y la cantidad de cuotas sin interés antes de decidir.",
        ],
      },
    ],
    cta: "Buscar mi celular",
  },
  {
    slug: "cuanta-ram-y-almacenamiento-necesito",
    title: "¿Cuánta RAM y almacenamiento necesito?",
    description:
      "Cuánta RAM, qué tipo de disco (SSD o HDD) y cuánto espacio necesitás en una notebook, PC o celular según lo que hagas.",
    intro:
      "Las dos especificaciones que más confunden al comprar son RAM y almacenamiento. Esta tabla mental te ahorra pagar de más o quedarte corto.",
    sections: [
      {
        heading: "RAM: cuántas cosas abrís a la vez",
        paragraphs: ["Pensala como el tamaño de tu escritorio: más RAM, más cosas abiertas sin amontonarse."],
        bullets: [
          "8 GB: navegación, Office, videollamadas, series.",
          "16 GB: programación, edición de fotos, muchas pestañas, juegos actuales.",
          "32 GB o más: edición de video profesional, máquinas virtuales, 3D.",
        ],
      },
      {
        heading: "Almacenamiento: dónde guardás tus cosas",
        paragraphs: ["Pensalo como el tamaño del placard: cuánta ropa (archivos) entra."],
        bullets: [
          "256 GB: uso básico con pocos archivos pesados.",
          "512 GB: el punto cómodo para la mayoría.",
          "1 TB o más: si guardás muchas fotos, videos o juegos.",
        ],
      },
      {
        heading: "SSD vs HDD",
        paragraphs: [
          "El SSD es varias veces más rápido que el HDD: el equipo arranca en segundos y los programas abren al instante. Salvo que necesites mucho espacio barato, elegí SSD.",
        ],
      },
    ],
    cta: "Decime qué necesito",
  },
  {
    slug: "como-saber-si-una-oferta-es-real",
    title: "Cómo saber si una oferta de tecnología es real",
    description:
      "Trucos para detectar descuentos inflados en Hot Sale, Cyber Monday y Black Friday: historial de precios, comparación entre tiendas y cuotas.",
    intro:
      "En las semanas de ofertas es común ver descuentos del 40% sobre un precio que se subió unos días antes. Tres chequeos rápidos para no caer.",
    sections: [
      {
        heading: "1. Mirá el historial de precio",
        paragraphs: [
          "El precio de lista tachado no prueba nada: lo pone la tienda. Lo que sí importa es cuánto costó el producto en las últimas semanas. En indexa cada producto muestra si hoy está en su precio más bajo, en su precio habitual o por encima.",
        ],
      },
      {
        heading: "2. Comparalo con otras tiendas",
        paragraphs: [
          "El mismo modelo puede variar bastante de una tienda a otra. Usá la opción \"En otras tiendas\" para ver el mismo producto (o uno parecido) en el resto.",
        ],
      },
      {
        heading: "3. Distinguí contado de cuotas",
        paragraphs: [
          "Un buen precio en 12 cuotas sin interés no es un buen precio contado, y al revés. Fijate cuál es tu forma de pago real y comparás esa.",
        ],
      },
    ],
    cta: "Ver ofertas reales",
  },
];

export function getGuide(slug: string): Guide | undefined {
  return GUIDES.find((g) => g.slug === slug);
}
