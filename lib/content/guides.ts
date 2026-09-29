// Guías de compra para gente que NO sabe de tecnología. Reglas de redacción:
//  · nada de siglas sin explicar; cada término técnico va con una comparación cotidiana;
//  · ejemplos concretos ("si tenés 30 pestañas abiertas…") en vez de definiciones;
//  · sin precios ni modelos puntuales (envejecen rápido) — los precios reales viven en la búsqueda.

export type GuideBlock =
  | { type: "p"; text: string }
  | { type: "list"; items: string[] }
  | { type: "steps"; items: string[] }
  /** "Pensalo así": una comparación de la vida real que explica el concepto. */
  | { type: "analogy"; title: string; text: string }
  | { type: "tip"; text: string }
  | { type: "warn"; text: string }
  /** Ejemplo concreto: una persona con una necesidad y qué le conviene. */
  | { type: "example"; who: string; need: string; answer: string }
  /** Tabla "si tu caso es… → elegí…". */
  | { type: "table"; head: [string, string]; rows: [string, string][] }
  /** Glosario "en criollo": término, qué es en una frase, cómo se nota. */
  | { type: "glossary"; items: { term: string; meaning: string }[] };

export interface GuideSection {
  id: string;
  heading: string;
  icon: string;
  blocks: GuideBlock[];
}

export interface Guide {
  slug: string;
  title: string;
  description: string;
  /** Nombre de ícono de Material Symbols. */
  icon: string;
  minutes: number;
  intro: string;
  /** "En resumen": lo esencial en 3–4 renglones para quien no lee todo. */
  summary: string[];
  sections: GuideSection[];
  cta: string;
  related: string[];
}

export const GUIDES: Guide[] = [
  {
    slug: "tecnologia-sin-vueltas",
    title: "Tecnología sin vueltas: qué significa cada cosa",
    description:
      "El diccionario para no técnicos: procesador, RAM, almacenamiento, SSD, placa de video y más, explicados con ejemplos de la vida diaria.",
    icon: "menu_book",
    minutes: 6,
    intro:
      "Cuando mirás una notebook o un celular aparecen palabras como “procesador”, “RAM” o “SSD”. Nadie nace sabiendo qué son. Acá está cada una explicada como se la explicarías a un amigo, con una comparación para que no se te olvide.",
    summary: [
      "El procesador es el cerebro: cuanto mejor, más rápido piensa.",
      "La RAM es el escritorio: cuanto más grande, más cosas abiertas a la vez.",
      "El almacenamiento es el placard: ahí guardás fotos, videos y programas.",
      "Con esas tres ya entendés el 90% de lo que dice una ficha de producto.",
    ],
    sections: [
      {
        id: "lo-basico",
        heading: "Las tres cosas que tenés que entender",
        icon: "lightbulb",
        blocks: [
          {
            type: "p",
            text: "Casi todo lo que se ve en una ficha técnica se resume en tres piezas. Si entendés estas, ya podés comparar.",
          },
          {
            type: "analogy",
            title: "Pensalo como una cocina",
            text: "El procesador es el cocinero: si es rápido, prepara los platos más rápido. La RAM es la mesada: cuanto más grande, más ingredientes podés tener a mano a la vez. El almacenamiento es la heladera y la alacena: ahí guardás todo lo que no estás usando ahora.",
          },
          {
            type: "glossary",
            items: [
              {
                term: "Procesador (CPU)",
                meaning:
                  "El cerebro del equipo. Decide qué tan rápido hace todo. Los nombres típicos son Intel Core (i3, i5, i7), AMD Ryzen (3, 5, 7), o Snapdragon y MediaTek en celulares. Un número más alto suele ser más potente dentro de la misma marca.",
              },
              {
                term: "Memoria RAM",
                meaning:
                  "Donde el equipo tiene “a mano” lo que estás usando ahora. Se mide en GB. Con poca RAM, si abrís muchas cosas a la vez, todo se pone lento. Se borra al apagar.",
              },
              {
                term: "Almacenamiento",
                meaning:
                  "Donde se guardan tus fotos, videos, documentos y programas, incluso con el equipo apagado. También se mide en GB (o TB, que son 1000 GB).",
              },
            ],
          },
          {
            type: "warn",
            text: "RAM y almacenamiento se confunden mucho porque los dos se miden en GB. Una notebook con “8 GB” de RAM y “512 GB” de almacenamiento no es contradictoria: son dos cosas distintas.",
          },
        ],
      },
      {
        id: "disco",
        heading: "SSD y HDD: el detalle que más se nota",
        icon: "speed",
        blocks: [
          {
            type: "p",
            text: "Existen dos tipos de almacenamiento en las notebooks y PCs, y la diferencia se siente todos los días.",
          },
          {
            type: "analogy",
            title: "Pensalo como un fichero",
            text: "El HDD es un fichero con carpetas en un cajón: una pieza mecánica tiene que ir a buscar lo que pedís. El SSD es como tenerlo todo abierto sobre la mesa: encuentra lo que pedís al instante.",
          },
          {
            type: "table",
            head: ["", "Cómo se siente"],
            rows: [
              ["SSD", "La compu prende en segundos, los programas abren al toque. Es el que conviene."],
              ["HDD", "Más lento: prender tarda minutos y todo abre con demora. Solo sirve si necesitás muchísimo espacio a bajo costo."],
            ],
          },
          {
            type: "tip",
            text: "Si tenés que elegir una sola mejora, elegí que la notebook tenga SSD. Cambia más la sensación de velocidad que casi cualquier otra cosa.",
          },
        ],
      },
      {
        id: "pantalla-bateria",
        heading: "Pantalla, batería y otras palabras que vas a ver",
        icon: "smartphone",
        blocks: [
          {
            type: "glossary",
            items: [
              {
                term: "Pulgadas",
                meaning:
                  "El tamaño de la pantalla medido en diagonal, de esquina a esquina. Un celular tiene alrededor de 6 pulgadas; una notebook cómoda para llevar, entre 14 y 15; un televisor, desde 32 para arriba.",
              },
              {
                term: "Full HD, 4K",
                meaning:
                  "Qué tan nítida se ve la imagen. Full HD ya se ve muy bien en celular y notebook. 4K se aprecia sobre todo en televisores grandes.",
              },
              {
                term: "OLED, IPS, LED",
                meaning:
                  "Tipos de pantalla. OLED muestra negros más profundos y colores más vivos (y suele ser más caro). IPS se ve bien desde cualquier ángulo. No necesitás recordarlos: en general OLED > IPS > el resto.",
              },
              {
                term: "Hz (frecuencia de la pantalla)",
                meaning:
                  "Cuántas veces por segundo se actualiza la imagen. 60 Hz es lo normal; 90 o 120 Hz hace que deslizar y mover cosas se vea más suave.",
              },
              {
                term: "Batería (mAh o Wh)",
                meaning:
                  "Cuánta energía guarda. En celulares se mide en mAh: alrededor de 5000 mAh dura un día de uso fuerte. En notebooks se suele decir directamente cuántas horas dura.",
              },
              {
                term: "Placa de video (GPU)",
                meaning:
                  "Una segunda pieza especializada en gráficos. La necesitás para juegos exigentes o para editar video. Para trabajar, estudiar o ver series, alcanza con la que viene integrada.",
              },
              {
                term: "Sistema operativo",
                meaning:
                  "El “idioma” con el que funciona el equipo: Windows o macOS en computadoras, Android o iOS en celulares. Es lo que define qué aplicaciones podés instalar.",
              },
            ],
          },
        ],
      },
      {
        id: "garantia",
        heading: "Garantía y otras cosas para mirar antes de pagar",
        icon: "verified_user",
        blocks: [
          {
            type: "list",
            items: [
              "Garantía: preguntá cuántos meses cubre y si es del fabricante o solo de la tienda.",
              "Qué trae en la caja: a veces el cargador se vende aparte.",
              "Si es nuevo o reacondicionado: lo dice en la ficha; los reacondicionados son más baratos pero usados.",
            ],
          },
        ],
      },
    ],
    cta: "Contale a indexa qué necesitás",
    related: ["que-notebook-comprar", "como-elegir-celular", "cuanta-ram-y-almacenamiento-necesito"],
  },
  {
    slug: "notebook-pc-o-tablet",
    title: "¿Notebook, PC o tablet? Cuál te conviene",
    description:
      "Antes de elegir un modelo, hay que elegir el tipo de equipo. Una guía simple con ejemplos para decidir entre notebook, PC de escritorio, tablet o celular.",
    icon: "devices",
    minutes: 4,
    intro:
      "Muchos empiezan mirando modelos sin haber decidido qué tipo de equipo necesitan. Es más fácil al revés: primero definí qué vas a hacer, y el tipo de equipo se elige solo.",
    summary: [
      "Si lo vas a mover de lugar: notebook.",
      "Si va a estar fijo en un escritorio y querés más potencia por menos plata: PC de escritorio.",
      "Si es para mirar, leer y usar apps livianas: tablet.",
      "Para trabajar en serio con documentos, planillas o programar, una tablet suele quedarse corta.",
    ],
    sections: [
      {
        id: "cual-elegir",
        heading: "Cada uno sirve para algo distinto",
        icon: "compare_arrows",
        blocks: [
          {
            type: "table",
            head: ["Si vos…", "Te conviene"],
            rows: [
              ["Trabajás o estudiás en distintos lugares (casa, oficina, facultad)", "Notebook"],
              ["Usás la compu siempre en el mismo escritorio", "PC de escritorio"],
              ["Querés jugar o editar video con la mejor relación potencia/precio", "PC de escritorio"],
              ["Mirás series, leés, navegás y mandás mails desde el sillón", "Tablet"],
              ["Necesitás algo para chicos que dibujen, miren videos y hagan tareas simples", "Tablet"],
              ["Escribís mucho, usás Excel/Word o programás", "Notebook o PC (la tablet se queda corta)"],
            ],
          },
          {
            type: "example",
            who: "Lucía, estudiante de Derecho",
            need: "Lleva la compu a la facultad, escribe trabajos y mira clases grabadas.",
            answer: "Una notebook liviana con buena batería. No necesita placa de video.",
          },
          {
            type: "example",
            who: "Martín, diseña en casa",
            need: "Trabaja siempre en el mismo escritorio con programas de diseño pesados.",
            answer: "Una PC de escritorio: por el mismo dinero rinde más que una notebook, y se puede mejorar después.",
          },
          {
            type: "example",
            who: "Marta, jubilada",
            need: "Videollamadas con la familia, mirar fotos, leer las noticias.",
            answer: "Una tablet grande, fácil de usar, o un celular con buena pantalla.",
          },
        ],
      },
      {
        id: "celular-o-tablet",
        heading: "¿Alcanza con el celular?",
        icon: "smartphone",
        blocks: [
          {
            type: "p",
            text: "Para mensajes, redes, fotos y pagos, sí. Pero para escribir textos largos, usar planillas o trabajar con varios programas a la vez, una pantalla más grande y un teclado hacen la vida mucho más fácil.",
          },
          {
            type: "tip",
            text: "Si dudás entre dos tipos de equipo, contale a indexa qué vas a hacer con él y te recomendamos el que corresponde.",
          },
        ],
      },
    ],
    cta: "Ayudame a elegir el tipo de equipo",
    related: ["que-notebook-comprar", "tecnologia-sin-vueltas"],
  },
  {
    slug: "que-notebook-comprar",
    title: "¿Qué notebook comprar? Guía simple según tu uso",
    description:
      "Cómo elegir una notebook en Argentina sin saber de tecnología: qué necesitás si trabajás, estudiás, jugás o editás, con ejemplos.",
    icon: "laptop_mac",
    minutes: 5,
    intro:
      "La mejor notebook no es la más cara ni la que más números tiene: es la que resuelve lo que vas a hacer todos los días. Pagar por potencia que no vas a usar es plata tirada.",
    summary: [
      "Para trabajo de oficina y estudio: 8 GB de RAM y SSD alcanzan.",
      "Para programar o tener muchas cosas abiertas: 16 GB de RAM.",
      "Para juegos o edición de video: hace falta placa de video dedicada.",
      "Si la llevás todos los días, mirá el peso y la batería antes que la potencia.",
    ],
    sections: [
      {
        id: "para-que",
        heading: "Primero: ¿para qué la vas a usar?",
        icon: "flag",
        blocks: [
          {
            type: "table",
            head: ["Si la vas a usar para…", "Lo que necesitás"],
            rows: [
              ["Navegar, videollamadas, Word, Excel, series", "Procesador de gama media, 8 GB de RAM y SSD"],
              ["Estudiar todos los días (y llevarla)", "Lo de arriba, más liviana y con buena batería"],
              ["Programar, diseñar o abrir muchas cosas a la vez", "16 GB de RAM y un procesador de buena gama"],
              ["Jugar o editar video", "Placa de video dedicada y 16 GB de RAM"],
            ],
          },
          {
            type: "example",
            who: "Sofía, contadora",
            need: "Trabaja con Excel, mail y Zoom todo el día, con 20 pestañas abiertas.",
            answer: "8 GB de RAM es el piso; 16 GB le va a dar margen sin trabarse. SSD sí o sí. Placa de video no la necesita.",
          },
          {
            type: "example",
            who: "Tomás, 17 años",
            need: "Juega a los juegos de moda y quiere que la notebook le dure varios años.",
            answer: "Una notebook con placa de video dedicada. Sin ella, los juegos exigentes van a ir mal aunque tenga buen procesador.",
          },
        ],
      },
      {
        id: "tres-cosas",
        heading: "Las tres cosas que más se sienten",
        icon: "bolt",
        blocks: [
          {
            type: "steps",
            items: [
              "SSD: la notebook prende en segundos y los programas abren al instante. Es la mejora que más se nota.",
              "RAM: decide cuántas cosas podés tener abiertas sin que se trabe. 8 GB es el mínimo razonable hoy; 4 GB se queda corto rápido.",
              "Procesador: importa, pero dentro de una misma gama las diferencias entre modelos cercanos casi no se sienten en el uso diario.",
            ],
          },
          {
            type: "analogy",
            title: "Pensalo como un auto",
            text: "No hace falta un auto de carrera para ir al supermercado. Igual con la notebook: elegí la potencia que necesitás, no la máxima.",
          },
        ],
      },
      {
        id: "despues",
        heading: "Qué se puede mejorar después y qué no",
        icon: "build",
        blocks: [
          {
            type: "p",
            text: "En muchas notebooks se puede agrandar la RAM y el almacenamiento más adelante; el procesador y la placa de video casi nunca. Por eso, si el presupuesto aprieta, no ahorres en el procesador: es lo que no vas a poder cambiar.",
          },
          {
            type: "warn",
            text: "Ojo con las ofertas raras: un precio muy bajo con specs muy altas suele esconder un procesador viejo o un disco lento. Compará el precio con el historial antes de decidir.",
          },
        ],
      },
    ],
    cta: "Buscar mi notebook",
    related: ["cuanta-ram-y-almacenamiento-necesito", "como-saber-si-una-oferta-es-real"],
  },
  {
    slug: "como-elegir-celular",
    title: "Cómo elegir un celular: qué mirar además de la marca",
    description:
      "Batería, cámara, memoria y pantalla explicadas sin tecnicismos, con ejemplos, para elegir celular en Argentina sin pagar de más.",
    icon: "smartphone",
    minutes: 5,
    intro:
      "Dos celulares del mismo precio pueden ser muy distintos en lo que más usás: cuánto dura la batería, qué tan rápido va y cómo salen las fotos. Así se comparan.",
    summary: [
      "Batería: alrededor de 5000 mAh aguanta un día completo.",
      "Memoria: 128 GB de almacenamiento es el mínimo cómodo; 6 a 8 GB de RAM para que no se trabe.",
      "Cámara: no importan los megapíxeles, importa que sea buena la principal.",
      "Compará siempre el precio contado, no solo la cuota.",
    ],
    sections: [
      {
        id: "memoria",
        heading: "Memoria: dos cosas distintas",
        icon: "sd_card",
        blocks: [
          {
            type: "analogy",
            title: "Pensalo como un escritorio y un placard",
            text: "La RAM es el escritorio: cuántas apps podés tener abiertas a la vez sin que se trabe. El almacenamiento es el placard: cuántas fotos, videos y apps guardás.",
          },
          {
            type: "table",
            head: ["", "Qué necesitás"],
            rows: [
              ["RAM", "4 GB para uso básico; 6 a 8 GB se siente ágil por más años."],
              ["Almacenamiento", "128 GB es lo mínimo cómodo si sacás fotos y videos."],
            ],
          },
          {
            type: "example",
            who: "Carla, saca muchas fotos y videos de sus hijos",
            need: "El celular viejo le dice siempre “memoria llena”.",
            answer: "Que el nuevo tenga como mínimo 128 GB, o 256 GB si guarda todo en el teléfono.",
          },
        ],
      },
      {
        id: "bateria",
        heading: "Batería y carga",
        icon: "battery_full",
        blocks: [
          {
            type: "p",
            text: "Se mide en mAh: cuanto más alto, más dura. Alrededor de 5000 mAh aguanta cómodamente un día de uso fuerte. Mirá también la potencia del cargador: con la misma batería, uno rápido puede cargarla en la mitad del tiempo.",
          },
          {
            type: "tip",
            text: "Si pasás el día fuera de casa y no tenés dónde cargar, priorizá la batería por sobre la cámara.",
          },
        ],
      },
      {
        id: "camara-pantalla",
        heading: "Cámara y pantalla",
        icon: "photo_camera",
        blocks: [
          {
            type: "p",
            text: "Los megapíxeles no dicen todo: un sensor principal bueno vale más que muchas cámaras secundarias. Si sacás mucha foto, buscá reseñas con fotos reales de ese modelo.",
          },
          {
            type: "p",
            text: "En la pantalla, OLED muestra mejores colores y negros; 90 o 120 Hz hace que todo se deslice más suave. No son imprescindibles, pero se nota la diferencia.",
          },
        ],
      },
      {
        id: "cuotas",
        heading: "El precio real",
        icon: "payments",
        blocks: [
          {
            type: "warn",
            text: "Muchas tiendas muestran solo el valor de la cuota. Fijate cuántas cuotas son y si tienen interés; y siempre compará el precio contado entre tiendas.",
          },
        ],
      },
    ],
    cta: "Buscar mi celular",
    related: ["como-pagar-en-cuotas", "tecnologia-sin-vueltas"],
  },
  {
    slug: "cuanta-ram-y-almacenamiento-necesito",
    title: "¿Cuánta RAM y almacenamiento necesito?",
    description:
      "Cuánta RAM, qué disco y cuánto espacio necesitás en una notebook, PC o celular, con ejemplos de la vida real.",
    icon: "memory",
    minutes: 3,
    intro:
      "Estas dos especificaciones son las que más confunden y las que más plata pueden hacerte gastar de más. Con estas tablas sabés cuánto necesitás realmente.",
    summary: [
      "RAM: 8 GB para lo cotidiano, 16 GB para trabajo más pesado.",
      "Almacenamiento: 512 GB es el punto cómodo para casi todos.",
      "Siempre que puedas, elegí SSD en lugar de HDD.",
    ],
    sections: [
      {
        id: "ram",
        heading: "RAM: cuántas cosas abrís a la vez",
        icon: "memory",
        blocks: [
          {
            type: "analogy",
            title: "Pensalo como una mesa de trabajo",
            text: "Con una mesa chica, si ponés más cosas se te empiezan a caer. La RAM es el tamaño de esa mesa.",
          },
          {
            type: "table",
            head: ["Si hacés…", "RAM recomendada"],
            rows: [
              ["Navegar, Office, series, videollamadas", "8 GB"],
              ["Programar, editar fotos, muchas pestañas, juegos actuales", "16 GB"],
              ["Edición de video profesional, máquinas virtuales, 3D", "32 GB o más"],
            ],
          },
        ],
      },
      {
        id: "almacenamiento",
        heading: "Almacenamiento: dónde guardás tus cosas",
        icon: "hard_drive",
        blocks: [
          {
            type: "table",
            head: ["Si guardás…", "Necesitás"],
            rows: [
              ["Pocos archivos, todo en la nube", "256 GB"],
              ["Fotos, documentos, algunos programas", "512 GB"],
              ["Muchos videos, fotos o juegos", "1 TB o más"],
            ],
          },
          {
            type: "tip",
            text: "Podés ampliar el espacio con un disco externo o la nube, pero el disco interno rápido (SSD) no se cambia tan fácil: elegí bien de entrada.",
          },
        ],
      },
    ],
    cta: "Decime cuánto necesito",
    related: ["tecnologia-sin-vueltas", "que-notebook-comprar"],
  },
  {
    slug: "como-pagar-en-cuotas",
    title: "Cuotas sin interés: cómo entenderlas y no pagar de más",
    description:
      "Qué significa 12 cuotas sin interés, por qué el precio en cuotas puede ser mayor que el contado y cómo comparar bien entre tiendas.",
    icon: "credit_card",
    minutes: 3,
    intro:
      "“12 cuotas sin interés” suena a regalo, pero conviene mirar el precio completo. Estos tres conceptos te evitan sorpresas.",
    summary: [
      "Compará siempre el precio total: cuota × cantidad de cuotas.",
      "En muchas tiendas el precio contado es menor que el precio en cuotas.",
      "Con inflación, pagar en cuotas fijas sin interés puede convenirte, pero hacé la cuenta.",
    ],
    sections: [
      {
        id: "cuenta",
        heading: "La cuenta que tenés que hacer",
        icon: "calculate",
        blocks: [
          {
            type: "steps",
            items: [
              "Mirá el valor de la cuota y cuántas cuotas son.",
              "Multiplicá: eso es lo que vas a pagar en total.",
              "Compará con el precio contado del mismo producto (en la misma tienda y en otras).",
            ],
          },
          {
            type: "example",
            who: "Diego, compra un celular",
            need: "Ve “12 cuotas de $100.000” en una tienda y “$1.100.000 contado” en otra.",
            answer: "Las cuotas suman $1.200.000, es decir $100.000 más que el contado de la otra tienda. Le conviene el contado si puede pagarlo, o evaluar si esa diferencia justifica la financiación.",
          },
        ],
      },
      {
        id: "sin-interes",
        heading: "“Sin interés” no siempre es gratis",
        icon: "info",
        blocks: [
          {
            type: "p",
            text: "Algunas tiendas suben el precio de lista para poder ofrecer cuotas “sin interés”. Por eso el mismo producto puede tener un precio contado más bajo en otra tienda.",
          },
          {
            type: "tip",
            text: "Fijate también qué medio de pago exige: a veces las cuotas valen solo con ciertas tarjetas o bancos.",
          },
        ],
      },
    ],
    cta: "Comparar precios y cuotas",
    related: ["como-saber-si-una-oferta-es-real", "como-elegir-celular"],
  },
  {
    slug: "como-saber-si-una-oferta-es-real",
    title: "Cómo saber si una oferta de tecnología es real",
    description:
      "Trucos para detectar descuentos inflados en Hot Sale, Cyber Monday y Black Friday: historial de precios, comparación entre tiendas y cuotas.",
    icon: "local_offer",
    minutes: 3,
    intro:
      "En las semanas de ofertas es común ver “40% de descuento” sobre un precio que se subió unos días antes. Tres chequeos rápidos para no caer.",
    summary: [
      "El precio tachado no prueba nada: mirá cuánto costaba de verdad.",
      "Compará el mismo modelo en otras tiendas.",
      "Distinguí precio contado de cuotas.",
    ],
    sections: [
      {
        id: "tres-chequeos",
        heading: "Tres chequeos antes de comprar",
        icon: "fact_check",
        blocks: [
          {
            type: "steps",
            items: [
              "Mirá el historial: el precio “de lista” lo pone la tienda. Lo que importa es cuánto costó en las últimas semanas. En indexa cada producto te dice si hoy está en su precio más bajo, en su precio habitual o por encima.",
              "Comparalo con otras tiendas: el mismo modelo puede variar bastante. Usá “En otras tiendas” para ver el resto.",
              "Distinguí contado de cuotas: un buen precio en 12 cuotas no es un buen precio contado, y al revés. Compará tu forma de pago real.",
            ],
          },
          {
            type: "analogy",
            title: "Pensalo como el precio de la nafta",
            text: "Si mañana “baja” $50 pero la semana pasada la subieron $100, no es una oferta, es un maquillaje. Con la tecnología pasa igual: sin historial no podés saberlo.",
          },
          {
            type: "warn",
            text: "Desconfiá de descuentos enormes en marcas que casi nunca bajan de precio, o de tiendas que no conocés.",
          },
        ],
      },
    ],
    cta: "Ver ofertas reales",
    related: ["como-pagar-en-cuotas", "que-notebook-comprar"],
  },
];

export function getGuide(slug: string): Guide | undefined {
  return GUIDES.find((g) => g.slug === slug);
}
