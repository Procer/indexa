# Validación pendiente — sesión 2026-09-04

Checklist de lo que quedó **sin validar en vivo**, de más nuevo a más viejo.
El lote P0/P1/P2 anterior (tarjeta, chat, ranking, comparador, admin analytics,
datos) tiene su propio checklist en `docs/VALIDACION_PLAN_MEJORAS.md` — buena
parte ya se salteó a propósito, se deja como referencia si en algún momento se
quiere hacer una pasada exhaustiva.

> **Ojo:** los cambios de ranking solo se ven en **búsquedas nuevas** — no
> reabrir un link `/search/<token>` viejo (el pool queda cacheado por token).

---

## 1 · Nuevo de hoy (2026-09-04) — commits `9a2caa3` + `161c1ad`

- [ ] **Ranking de celulares por uso.** Buscar "celular para sacar fotos y
  grabar videos" con presupuesto holgado (ej. hasta $1.500.000 contado) → los
  primeros resultados deben tener 8GB+ RAM, 128GB+ y cámara 50MP+, no equipos
  de 4GB/64GB.
- [ ] Probar 2-3 variantes más: "celular para jugar" (gaming_mobile), "celular
  que dure todo el día" (battery_life), "celular básico y barato" (basic_use)
  → que las specs bajen en línea con el uso pedido, sin penalizar de más un
  uso genuinamente básico.
- [ ] **"También en X / más barato".** Buscar algo con marca+modelo específico
  y popular (ej. "tablet samsung galaxy tab s6 lite", "celular redmi note 14")
  — bajo el precio debería aparecer en verde *"También en [tienda]: $X (−$Y)"*
  cuando corresponda. Confirmado por API en esta sesión, falta verlo
  renderizado en la tarjeta real.

## 2 · De ayer (2026-09-03), deployado pero sin validar — commits `bcd4a37` + `390e41c`

- [ ] **Resaltado de filtro por tienda en el chat.** Preguntar "¿en Carrefour
  hay alguno?" (o nombrar una tienda en la búsqueda) → el chat debe responder
  apuntando al filtro **Tienda** y ese botón debe pulsar/destacarse hasta que
  se lo toque (sin re-disparar la misma búsqueda).
- [ ] **Saludo honesto sin marca.** Pedir una marca que no esté en el pool
  (ej. "iphone en Carrefour" si no hay Apple ahí) → el saludo debe decir *"No
  encontré `<marca>`…"* en vez de recomendar otra marca como si nada.

## 3 · Rediseño de tarjeta (2026-09-03), nunca validado — commits `b515659`, `b58c694`, `2c1bbbd`, `d4cf02b`, `1b01635`, `a141baa`, `52ef9c4`

- [ ] **Fila compacta de specs ("Opción B").** Cualquier búsqueda → cada spec
  (Rapidez/Memoria/Espacio) en una sola fila: punto de color + etiqueta +
  valor crudo + veredicto de 1-2 palabras, ya no en bloques separados.
- [ ] Tocar una etiqueta (ej. "Memoria") → popover con la metáfora + "¿cómo sé
  si alcanza?".
- [ ] **"En la práctica"** (pantalla/tamaño/peso en criollo) debe aparecer
  dentro de "Ver detalle" → "Por qué te conviene", no en la tarjeta principal.
- [ ] **Login propio de `/admin`** — iniciar sesión con `derosasjm@gmail.com`.
  Si todavía no se definió la clave, falta abrir el link de invitación
  (regenerar si se perdió).
- [ ] **Branding** — logo nuevo (lupa + wordmark azul) en el header, favicon
  cuadrado/nítido en la pestaña del navegador (antes salía recortado/borroso).

## 4 · Analítica fina en `/admin/analytics` (nuevo, 2026-09-05)

- [ ] **Patrones del año** — dos gráficos nuevos, independientes del selector
  7/30/90: "Búsquedas por mes" (Ene-Dic del año en curso) y "Búsquedas por día
  de la semana" (Lunes-Domingo). Validado con datos reales del VPS antes de
  deployar (533 búsquedas en el año, distribución Jun-Sep, más tráfico
  martes-viernes que fin de semana).
- [ ] **Uso más buscado / Marca más pedida / Tienda con más clicks** — 3
  tarjetas nuevas debajo de "Patrones", con la misma ventana que el selector
  7/30/90. La de marca agrupa case-insensitive (Xiaomi/xiaomi cuentan como una
  sola), verificado con datos reales.

## 5 · Transversales para tener en cuenta al probar

- [ ] **Latencia**: las búsquedas frescas tardan 4-9s (diagnosticado, es
  inherente a las llamadas a OpenAI, no un bug — ver `plan-mejoras-ejecucion`
  en memoria si hace falta el detalle). Debería verse el splash "Analizando"
  de inmediato, sin sensación de página colgada.

---

## Si algo falla

Mirar los logs del VPS en vivo mientras se prueba:

```bash
pm2 logs indexa --lines 0 | grep -E '\[SEARCH\]|\[CHAT\]|\[LLM\]'
```

La línea `[SEARCH] results` trae ahora `stages(ms)=slots:...,embed:...,pool:...,enrich:...`
para diagnosticar de dónde viene una demora puntual.
