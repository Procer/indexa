# Validación — PLAN_MEJORAS en producción

Checklist de verificación en vivo de todo lo deployado a `anka.ar/indexa`
(commits `2f92a95` P0 + saneado specs, `9206f75` P1+P2, `dfe6846` curación + retry).

> **Ojo:** los cambios de ranking (#9, #15) y de datos solo se ven en **búsquedas
> nuevas** — no reutilizar un link `/search/<token>` viejo (el pool se cachea por token).

---

## 1 · Tarjeta de resultado

- [ ] **P0 — lectura llana fija.** Búsqueda de notebook → 3 líneas siempre visibles
  **RAPIDEZ / MEMORIA / ALMACENAMIENTO**, cada una con punto de color y chip de
  valor crudo (`i5` · `8GB` · `512GB SSD`). Sin acordeón "Ver specs".
- [ ] **P0 — línea "a futuro".** Debajo de las specs: *"A futuro: ampliás RAM y
  disco; procesador y placa vienen fijos"* (en celular/tablet: *"nada se cambia
  después"*).
- [ ] **#8 — tira de traducción.** Arriba de las 3 líneas, franja compacta:
  `⚙️ RAPIDEZ · cómoda — 🍳 MEMORIA · de sobra — 🗄️ ESPACIO · amplio` con dots de color.
  Entra en 375px sin romper el layout.
- [ ] **#7 — micro-glosario.** Tocar una etiqueta (ej. **MEMORIA**) → popover con
  la metáfora ("la RAM es como la mesada de la cocina…") + "¿cómo sé si alcanza?".
  Cierra al tocar afuera o con Esc. Funciona también en PANTALLA / TAMAÑO.
- [ ] **#14 — veredicto atado al uso.** Las líneas nombran el uso declarado:
  *"de sobra para trabajo de oficina y ver películas"*, no *"para tu uso"*.
- [ ] **#10 — "más barato en X" inline.** Buscar un equipo que esté en varias
  tiendas → bajo el precio, en verde: *"También en Frávega: $X (−$Y)"* (solo si
  hay una tienda más barata).
- [ ] **#15 — veredicto de precio.** En una config con varias unidades en el
  catálogo ("notebook 8gb 512gb") → línea *"Buen precio: ~12% bajo el promedio de
  esta configuración"* / *"Precio en línea con esta configuración"* / *"Precio
  alto: ~X% sobre…"*.
- [ ] **#16 — alerta de precio.** Botón "Avisame si baja de precio" → form con
  monto sugerido (−10%) + email → "Activar" → *"Te avisamos por email si baja de
  $X"* + link "Ver mis alertas". Verificar que llega a `/alertas/<token>`.
- [ ] **#11 — consultar sobre el equipo.** Botón "Consultar sobre este equipo" →
  abre el chat y envía *"Contame más sobre la {marca} {modelo}. ¿Me conviene para
  lo que busco?"*; el bot responde sobre ESE equipo.
- [ ] **P0 — precio en cuotas.** Buscar "… en cuotas / por mes" → el número grande
  es la **cuota mensual**, "$X contado" queda chico abajo.
- [ ] **P0 — variantes colapsadas.** Mismo modelo con 256 vs 512GB / colores →
  una sola tarjeta con selector de variante; al cambiar, cambian precio y link de
  compra, las specs quedan las del primario.

## 2 · Chat de búsqueda

- [ ] **#12 — turno de recomendación robusto.** Preguntar "¿cuál me conviene para
  editar video?" varias veces seguidas → siempre llega texto, nunca burbuja vacía
  ni error. En logs del VPS: `[CHAT] empty_reply_deterministic` en vez de
  `[CHAT] empty_reply_retry`.
- [ ] **29/8 — saludo.** Búsqueda nueva → fase "Analizando" ~4-5s, saludo corto
  (máx 3 oraciones), sin `empty_reply_retry` en el log.
- [ ] **29/8 — multimarca.** "quiero iphone y samsung" → respuesta corta, marca
  **Apple** y **Samsung** en negrita, no editorializa el presupuesto.
- [ ] **retry con backoff.** Si OpenAI está lento: en vez de "No pudimos realizar
  la búsqueda" inmediato, reintenta 2 veces (600ms, 1200ms) antes de mostrar el
  error.

## 3 · Ranking (solo búsquedas NUEVAS)

- [ ] **P0 — calidad/precio al orden.** "notebook para oficina hasta 800000" →
  arriba las de mejor grado calidad/precio (badge EXCELENTE / MUY BUENO), no un
  Core flojo con "16GB" en el título.
- [ ] **#9 — cordura de specs general.** "tablet para trabajo" / "notebook barata"
  → no encabezan equipos con RAM inverosímil (aiprotablet 24GB), `storage == ram`,
  ni marca desconocida barata con specs infladas.
- [ ] **P0 — tablets.** "tablet para mis hijos" → sin pizarras LCD de dibujo ni
  tablets de 1GB RAM / 8GB.

## 4 · "En otras tiendas" y comparador

- [ ] **P0 — parecidos seleccionables.** Botón "En otras tiendas" → sección
  "Modelos parecidos" con checkboxes + "Comparar seleccionados".
- [ ] **P0 — parecidos al comparador.** Marcar 2 parecidos → "Comparar" → entran
  al comparador junto al equipo actual.
- [ ] **P0 — bloque en el comparador.** Dentro del comparador: *"Parecidos a los
  que estás viendo"* con "+ Agregar" (cap de 5).

## 5 · Panel admin — `/admin/analytics`

- [ ] **#17 — comprado vs recomendado.** Después de que se registren clicks de
  "Comprar": tiles nuevos **"Clicks de compra"** y **"Compras de un recomendado"**
  (X% · n/total).

## 6 · Datos (specs)

- [ ] **Saneado de specs.** Buscar notebooks → ninguna dice "8GB de
  almacenamiento" ni "2200 kg" de peso (107 filas corregidas en la DB
  2026-09-02).
- [ ] **Curación.** Buscar "difusor" o "tabla esquinera" → no aparecen (apagadas
  con `available=false`).
- [ ] **#13 — cuotas.** `npx tsx --env-file=.env.local scripts/auditInstallments.ts`
  en el VPS → 0 sospechosas (ya verificado 2026-09-02; la normalización al
  ingerir es guarda preventiva).

---

## Si algo falla

Lo más útil es mirar los logs del VPS en vivo mientras se prueba:

```bash
pm2 logs indexa --lines 0 | grep -E '\[SEARCH\]|\[CHAT\]'
```

Copiar las líneas `[SEARCH]` / `[CHAT]` correlacionadas con lo que se ve mal.

## Diferido a propósito (no validar)

- **Greeting cache por clave estructural** — el payload del saludo embebe los IDs
  de productos de esa búsqueda; reusarlo entre búsquedas exige refactorizar para
  cachear solo el texto. Riesgo alto / ganancia chica tras el fix de
  `empty_reply_retry`.
- **Push / PWA de la alerta de precio (#16)** — el plan ya lo diferencia; hoy el
  aviso es solo por email.
