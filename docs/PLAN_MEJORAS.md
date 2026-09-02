# Plan de mejoras — indexa

**Análisis + roadmap sobre el código en producción.**
Alcance: pipeline de búsqueda · UI de resultados · comparador · chat.

Cómo indexa resuelve hoy sus tres trabajos centrales, dónde se queda corto cada uno, y un plan concreto y priorizado para que los resuelva **excelentemente bien** — con foco en traducir lo técnico en el poco espacio de una tarjeta de resultado.

---

## El marco: tres trabajos

El proyecto tiene tres objetivos, y el sistema debe resolverlos **excelentemente bien**, no apenas:

1. **Romper la brecha** entre el usuario no técnico y la necesidad de comprar un dispositivo según su **uso real** y su **presupuesto**.
2. Encontrar la **mejor opción económica**.
3. Poder **comprar** y hacer **consultas** sobre los dispositivos.

La buena noticia, tras revisar el código: para los tres, la infraestructura ya existe en un **70–90%**. Casi nada de lo que sigue es "construir desde cero" — es **sacar a la superficie**, **conectar** y **calibrar** piezas que ya están escritas y probadas.

Cada sección sigue el mismo recorrido: *el trabajo* → *qué hay hoy* → *dónde falla* → *plan*.
Las jugadas van etiquetadas **P0** (imprescindible), **P1** (alto impacto), **P2** (mejora).

---

## 1 · Romper la brecha técnica

El usuario no sabe qué es RAM, un procesador o un SSD — y no tiene por qué saberlo. Lo que sabe es *qué quiere hacer* con el equipo y *cuánto puede gastar*. El sistema tiene que traducir specs a consecuencias concretas: qué hace la **rapidez**, la **memoria** y el **almacenamiento** en su vida real, en un lenguaje que entienda de un vistazo, y en el espacio que hay en una tarjeta de resultado. Y además decirle **qué se puede cambiar a futuro** y qué no.

### Qué hay hoy

Bastante, y bien hecho — todo determinístico, sin depender del LLM ni del caché:

- **`lib/domain/specExplainer.ts`** — `explainProductSpecsSimple()` ya devuelve la lectura en lenguaje llano: *"Rapidez: potencia intermedia, cómoda para tu uso"*, *"Memoria: de sobra, multitarea sin trabas"*, *"Almacenamiento: 512GB, abre todo casi al instante"*. Con clasificación `great / ok / warn` para pintar cada línea verde / neutro / ámbar.
- **`lib/domain/specGlossary.ts`** — la guía "qué es cada cosa" con metáforas ya escritas y curadas: procesador = *motor del auto*, RAM = *mesada de la cocina*, almacenamiento = *placard*, placa de video = *turbo*. Cada entrada trae además el *"¿cómo sé si es bueno?"*.
- **`lib/domain/upgradeability.ts`** — `getUpgradeNote()` ya arma la frase de futuro: *"A futuro podés ampliar la RAM y el disco — el procesador y la placa de video vienen soldados, priorizalos al elegir"*. Por categoría: en celular/tablet nada se cambia, en TV solo el panel importa.

### Dónde falla

Todo ese material existe pero **no llega al usuario en el momento que decide**. El rediseño chat-first optimizó la tarjeta para escanear rápido y, en el camino, enterró la traducción:

- En la tarjeta de resultado (`ProductChatCard`), las líneas simples viven detrás de un acordeón *"Ver specs"* **cerrado por defecto**. La vista por defecto es marca + título + precio. Cero traducción visible.
- El glosario con metáforas (`SpecGlossary`) quedó **solo en el comparador**. Un usuario que mira resultados nunca lo ve.
- La nota de "qué se puede cambiar a futuro" (`getUpgradeNote`) está en el panel de detalle y en el comparador, **no en la tarjeta compacta** — que es lo que el usuario mira el 90% del tiempo.
- Nada en la tarjeta responde explícitamente *"¿qué hace la rapidez / la memoria / el almacenamiento?"* con un ancla visual fija. El usuario tiene que saber que hay un acordeón y abrirlo.

### Plan

| Prio | Jugada |
|---|---|
| **P0** | **Subir la lectura en lenguaje llano a la tarjeta, siempre visible.** Sacar `spec_highlights_simple` del acordeón. Tres líneas fijas — **Rapidez**, **Memoria**, **Almacenamiento** (celular: + **Batería** / **Cámara**) — cada una con su punto de color y su veredicto de una frase. El acordeón "Ver specs" queda para la ficha técnica cruda (i5-1235U, SSD NVMe), no para la traducción. — *`ProductChatCard.tsx`, ya alimentado por `explainProductSpecsSimple()` / `classifyHighlightLevel()`* |
| **P0** | **Una línea de "a futuro" en la tarjeta.** Debajo de las specs, una sola línea con `getUpgradeNote()`: *"A futuro: ampliás RAM y disco; procesador y placa vienen fijos"*. En celular/tablet: *"Nada se cambia después — el procesador y el almacenamiento son para toda la vida del equipo"*. Es la información que convierte "specs" en "estrategia de compra". — *`ProductChatCard.tsx` + `getUpgradeNote(category, specs, upgradeable)`* |
| **P1** | **Micro-glosario al toque, sin salir de resultados.** Cada etiqueta de spec (**Rapidez**, **Memoria**…) es un *tap* que abre un popover chico con la metáfora de `specGlossary.ts` (*"la RAM es como la mesada de la cocina…"*) + el *"¿cómo sé si alcanza?"*. Reusa contenido ya escrito; cero LLM. — *nuevo `SpecTermPopover` + `getGlossaryForCategories()`* |
| **P1** | **Tira de "traducción" de 3 iconos en el ancho de la tarjeta.** Franja compacta: `⚙ Rapidez · intermedia` — `🍳 Memoria · de sobra` — `🗄 Espacio · cómodo`, cada una con dot de color. Resumen escaneable de un segundo; las frases largas quedan al abrir. Entra en 375px. — *`ProductChatCard.tsx` + `explainRamMeaning()` / `explainStorageMeaning()` (versiones cortas ya existen)* |
| **P2** | **Atar cada veredicto al uso declarado.** En vez de *"potencia intermedia"*, *"para trabajar y ver películas, esta rapidez te sobra"*. `explainProductSpecsSimple()` ya recibe `useCases` y compara contra lo requerido — solo falta que el copy nombre el uso, no solo el nivel. — *`specExplainer.ts` · `ramBulletSimple` / `processorBulletSimple`* |

### Antes / después de la tarjeta

**Hoy:**

```
LENOVO
Notebook IdeaPad 3 15.6" i5 8GB 512GB
$890.000 contado
$74.000/mes en 12 cuotas
─────────────────────────
Ver specs                          ⌄
```

**Propuesto** (mismo espacio, misma altura):

```
LENOVO
Notebook IdeaPad 3 15.6" i5 8GB 512GB
$890.000 contado
$74.000/mes en 12 cuotas
─────────────────────────
● RAPIDEZ    intermedia — cómoda para oficina y varias apps a la vez
● MEMORIA    justa — puede tildarse con muchas pestañas abiertas
● ESPACIO    512GB — prende y abre todo casi al instante
┌───────────────────────────────────────────────────────────┐
│ A futuro: ampliás la memoria y el disco.                   │
│ Procesador y placa vienen fijos.                           │
└───────────────────────────────────────────────────────────┘
```

La ficha cruda (*i5-1235U, SSD NVMe, 1.6 kg*) sigue existiendo detrás de "Ver specs" — para el usuario semi-técnico que la pide. La traducción ya no depende de que la busque.

---

## 2 · Encontrar la mejor opción económica

"Mejor opción económica" no es "la más barata": es la que da **más valor por peso gastado** para el uso declarado, dentro del presupuesto. El sistema tiene que ordenar el catálogo con ese criterio y hacerlo visible.

### Qué hay hoy

- Búsqueda híbrida real: filtros SQL duros + ranking vectorial + keyword fusionados por RRF (`hybrid_search` / `lib/search/pipeline.ts`).
- Penalización por over-spec: un i7 no le gana a un i5 cuando el uso es oficina (solo notebook/desktop).
- Presupuesto robusto tras los fixes recientes: `estimatedMonthly()` normaliza `price_installment` inconsistente entre tiendas, y hay 20% de tolerancia antes de marcar "fuera de presupuesto".
- `quality_price_score` — un grado de calidad/precio (EXCELENTE…REGULAR) calculado en batch por producto, con la regla de desconfiar de RAM inflada en marcas genéricas.
- `also_at` / botón "En otras tiendas" — el mismo equipo, más barato en otra tienda.

### Dónde falla

- **El `quality_price_score` no entra al ranking.** `scorer.ts` ordena por similitud + popularidad + patrocinado. El grado de calidad/precio — que es *literalmente la métrica del objetivo 2* — solo influye en los picks que elige el modelo del chat, no en el orden del pool.
- **El ranking sobre-pondera el match textual de RAM.** Visto en vivo: para "notebook oficina", un Core 3 flojo con "16GB" en el título le gana a un i5 con 8GB — porque el query expandido pide RAM alta y el match literal pesa más que la clase de procesador. En tablets dejaba entrar RAM inventada (parcheado); el patrón sigue en notebooks.
- **Casi-duplicados comen el top.** El mismo modelo en 3 colores / con y sin Windows / 256 vs 512GB entra como 3 tarjetas distintas y ocupa 3 de los 4 primeros lugares (visto con Samsung S26, notebooks "Sin SO", Galaxy A07). El usuario ve menos variedad real.
- **"Más barato en otra tienda" está escondido.** Es un modal que hay que abrir por tarjeta, no una señal en el ranking ni un dato visible en la tarjeta.
- No hay un veredicto de precio corto y visible (*"buen precio para esta config"*) — solo el análisis largo del LLM, cacheado.

### Plan

| Prio | Jugada |
|---|---|
| **P0** | **Meter `quality_price_score` en `final_score`.** Un peso chico y acotado (p. ej. EXCELENTE +0.06 … REGULAR −0.06) sobre el score final. Alcanza para que una unidad con CPU flojo + RAM inflada + mal grado no encabece por encima de una equilibrada. Es la conexión que falta entre "tenemos la métrica del objetivo" y "el orden la usa". — *`lib/search/scorer.ts` + campo ya presente en `products`* |
| **P0** | **Colapsar casi-duplicados en una tarjeta con selector de variante.** Mismo modelo + diferencia menor (color / SO / 256↔512GB) → **una sola tarjeta** con un selector ("Negro · Azul · Blanco", "con Windows / sin SO", "256GB $X · 512GB $Y"). Libera 2–3 lugares del top para variedad real *y* es exactamente lo que el usuario pidió: *poder elegir entre modelos parecidos para comprar*. La lógica de match ya existe: `findSimilarMatch()` en `lib/domain/dedupe.ts`. — *`pipeline.ts` (agrupar antes del corte a 20) + `ProductChatCard` (selector)* |
| **P1** | **Pasada de "cordura de specs" general, no solo tablet.** Generalizar el filtro anti-RAM-inventada de tablets: para toda categoría, una spec fuera del rango físico plausible para esa marca/precio pesa como sospechosa (penalización, no exclusión). Ataca la raíz del over-weight de RAM. — *nuevo `lib/domain/specSanity.ts`, usado en `pipeline.ts`* |
| **P1** | **"Más barato en X" inline en la tarjeta.** Cuando `also_at` tiene una tienda más barata, mostrarlo en la tarjeta — *"También en Fravega: $815.000 (−$75.000)"* — no solo detrás del botón. Convierte una acción opcional en un dato que empuja la decisión. — *`ProductChatCard.tsx` · ya recibe `also_at`* |
| **P2** | **Veredicto de precio de una línea.** Determinístico, sin LLM: comparar el precio contra la mediana de esa config (marca-clase + RAM + almacenamiento) en el catálogo. *"Buen precio: ~12% bajo el promedio de esta configuración"*. Necesita una consulta agregada barata, cacheable. — *nueva query `getConfigPriceMedian()` + badge en la tarjeta* |

---

## 3 · Comprar y consultar

Encontrado el equipo, el usuario tiene que poder **comprarlo** (o comprar una variante parecida) y **preguntar** lo que no entienda — sin fricción y sin salir del flujo.

### Qué hay hoy

- Compra: botón "Comprar en {tienda}" por tarjeta (link de afiliado), con logo real de la tienda. Tracking de clicks (`product_clicks` → `click_count`, que retroalimenta el ranking).
- Modal "En otras tiendas": dos listas — *variants* (mismo SKU en otra tienda, con "más barato") y *similar* (misma línea, diferencia menor), ambas con link de compra y las diferencias explícitas.
- Chat de resultados (`refine-chat`) — ahora con atajo determinístico (marca/procesador/categoría en ~15ms sin LLM), guard de alcance, y honestidad de presupuesto. Chat del comparador (`compare/chat`).
- Comparador: hasta 5 equipos, veredicto por producto (`buildGroupVerdicts`), chat embebido, glosario.

### Dónde falla

- **"Modelos parecidos" es una lista muerta.** El pedido explícito del usuario: los parecidos del modal tienen link de compra, pero **no se pueden meter en la comparación** ni seleccionar varios para elegir entre ellos. Ves que existen y ahí termina.
- El comparador **no deja traer un "parecido"** — se arma solo con lo que marcaste "+Comparar" en la grilla.
- Consultar sobre *un equipo puntual* no tiene atajo: hay que volver al chat y describirlo.
- Confiabilidad del chat: `empty_reply_retry` aparece seguido (gpt-4o-mini devuelve vacío). Hay retry, pero suma latencia y a veces encadena.

### Plan

| Prio | Jugada |
|---|---|
| **P0** | **"Modelos parecidos" → seleccionables y comparables.** En el modal "En otras tiendas": cada parecido gana un **"+ Comparar"** que lo mete en el comparador junto al equipo actual. Y checkboxes para elegir 2+ y un **"Comparar seleccionados"**. Convierte la lista muerta en el flujo de decisión que el usuario pidió: *ver los parecidos lado a lado y comprar el que conviene*. — *`OtherStoresButton.tsx` + estado de comparación compartido* |
| **P0** | **Bloque "modelos parecidos" dentro del comparador.** Al comparar N equipos, una fila abajo: *"Parecidos a los que estás viendo"* con "+ agregar" al toque. Reusa `findSimilarMatch()` contra el catálogo de la categoría/marca. El comparador deja de ser un cul-de-sac. — *`CompareExperience.tsx` + `/api/products/[id]/other-stores` (ya devuelve `similar`)* |
| **P1** | **"Consultar sobre este equipo" desde la tarjeta.** Un botón que abre el chat con ese producto ya cargado como contexto — *"¿Le entra un juego pesado?"*, *"¿Cómo se compara con la Acer que vi?"* — sin que el usuario tenga que redescribirlo. — *`ProductChatCard.tsx` → `refine-chat` con `productId` de contexto* |
| **P1** | **Endurecer la confiabilidad del turno de recomendación.** El turno que elige picks es el más crítico y el que más falla. Opciones: subir *solo ese turno* a un modelo más confiable, o precalcular los picks de forma determinística (el pool ya viene rankeado) y usar el LLM solo para el texto — patrón que ya se aplicó al saludo y bajó el `empty_reply_retry`. — *`app/api/search/refine-chat/route.ts`* |
| **P2** | **Cierre post-decisión: guardar y alertar precio.** La tabla `price_alerts` y el endpoint de check ya existen. Falta el gesto en la UI: *"Avisame si baja de $X"* desde la tarjeta o el comparador. Cierra el ciclo entre "encontré" y "compré en el momento justo". — *`price_alerts` (existe) + botón + PWA/push pendiente* |

---

## Transversal: lo que sostiene a los tres

### Datos: `price_installment` inconsistente entre tiendas

Algunas tiendas cargan el campo como la cuota mensual, otras como el total financiado. Se parcheó en runtime con `estimatedMonthly()`, pero el fix de raíz es **normalizar en el scraper** (`lib/sources/*`) al ingerir, con una regla explícita y un test contra el catálogo. Afecta directo al objetivo 2 (presupuesto) y al 1 (mostrar la cuota bien).

### Latencia del LLM

Las búsquedas están tardando 6–9s cuando OpenAI va lento — el rango donde el cliente empieza a cortar (visto: "No pudimos realizar la búsqueda" con el server OK). Mitigaciones: cachear el saludo de forma más agresiva por clave estructurada, mover más lógica del chat a determinístico (ya empezado con el atajo), y del lado del cliente, no dejar que una llamada paralela tardía pise una grilla ya cargada (arreglado) + un reintento con backoff en vez del error directo.

### Instrumentación

Ya se agregó `replyPreview` y `greetingOverBudget` al log del chat, y `refinements` / `procPreferred` al de búsqueda. Próximo: loguear qué producto se compró (click en "Comprar") contra qué se buscó, para medir de verdad si el objetivo 2 se cumple — hoy `conversionRate` existe pero no cruza "lo comprado" con "lo recomendado".

---

## Backlog priorizado

Ordenado por prioridad y, dentro de cada nivel, por relación impacto / esfuerzo. Impacto y esfuerzo en escala 1–3 (● = bajo, ●●● = alto).

| Jugada | Obj. | Impacto | Esfuerzo | Prior. |
|---|:---:|:---:|:---:|:---:|
| Lectura en lenguaje llano fija en la tarjeta (sacar del acordeón) | 1 | ●●● | ● | **P0** |
| Línea "a futuro" (`getUpgradeNote`) en la tarjeta | 1 | ●●● | ● | **P0** |
| `quality_price_score` dentro de `final_score` | 2 | ●●● | ● | **P0** |
| Colapsar casi-duplicados → tarjeta con selector de variante | 2·3 | ●●● | ●● | **P0** |
| "Modelos parecidos" seleccionables + "+ Comparar" | 3 | ●●● | ●● | **P0** |
| Bloque "parecidos" dentro del comparador | 3 | ●● | ●● | **P0** |
| Micro-glosario en tap por etiqueta de spec | 1 | ●● | ●● | P1 |
| Tira de 3 iconos de "traducción" en la tarjeta | 1 | ●● | ● | P1 |
| Pasada de "cordura de specs" general | 2 | ●● | ●● | P1 |
| "Más barato en X" inline en la tarjeta | 2 | ●● | ● | P1 |
| "Consultar sobre este equipo" desde la tarjeta | 3 | ●● | ●● | P1 |
| Endurecer el turno de recomendación del chat | 3 | ●● | ●● | P1 |
| Normalizar `price_installment` en el scraper | 1·2 | ●● | ●● | P1 |
| Veredicto de uso ("para trabajo, te sobra") en el copy | 1 | ●● | ● | P2 |
| Veredicto de precio de una línea (vs. mediana de config) | 2 | ●● | ●● | P2 |
| Guardar + alertar precio desde la UI | 3 | ● | ●●● | P2 |
| Cruzar "comprado" vs "recomendado" en analytics | 2 | ●● | ● | P2 |

### Primera tanda sugerida

Las seis **P0** se agrupan limpio en dos frentes que no se pisan:

- **Tarjeta de resultado** — lectura llana + "a futuro" + colapsar duplicados.
- **Flujo de comparación** — parecidos seleccionables + bloque en el comparador + `quality_price_score` al ranking.

Cada frente es ~un par de días y mueve la aguja de los tres objetivos a la vez.

---

*Análisis sobre el código en producción. Las jugadas P0 no requieren infraestructura nueva, solo conectar y calibrar lo que ya está escrito.*
