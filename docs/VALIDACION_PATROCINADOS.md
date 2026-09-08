# Validación — Patrocinados por tienda + rubro

Feature deployada 2026-09-07 (commits `724ceb6` + `e3955db`, migración `023`
corrida en el VPS). Lo verificado hasta ahora fue por API/DB; **falta el
navegador** para el form del panel, la etiqueta en la tarjeta y el bloque de
inicio.

Deploy: mismo flujo de siempre (tarball → VPS → build → `pm2 restart indexa`).
Logs en vivo: `pm2 logs indexa --nostream --lines 80 | grep -E '\[SPONSOR\]|\[SEARCH\]'`.
La línea `[SPONSOR] ... applied=true|false` dice si el boost se aplicó a un producto.

---

## 1 · Form del panel — `/admin/sponsors` (navegador)

- [ ] **"+ Nueva campaña"** abre el modal.
- [ ] **Tienda**: desplegable con los sources reales (fravega, carrefour, oncity,
  naldo, cetrogar, coppel, megatone, jumbo, changomas, vea, disco, pardo).
- [ ] **Rubros**: chips Notebook / PC de escritorio / Tablet / Smart TV / Celular.
  El botón "Crear campaña" queda deshabilitado hasta elegir tienda + ≥1 rubro.
- [ ] **☑ "Mostrar en la pantalla de inicio"** — checkbox, opcional.
- [ ] Al crear: aparece en la lista con el chip de la tienda, "Rubros: …",
  "Boost: +0.xx", "Relevancia mín: 0.xx", y —si se tildó— el badge azul
  **"En el inicio"**.
- [ ] **Pausar / Activar / Eliminar** funcionan.
- [ ] La campaña vieja **PRUEBA** figura como **Pausada** (la migración la
  desactivó por no tener `target_source`).

## 2 · Boost en el ranking (API + logs; navegador para la etiqueta)

Crear una campaña de prueba: **Frávega**, rubro **Celular**, relevancia **0.50**,
boost **0.10**, activa.

- [ ] Buscar *"celular gama media para redes sociales hasta 900000 pesos al
  contado"* → algunos celulares de **Frávega** suben respecto de su posición
  orgánica y llevan la etiqueta ámbar **"Patrocinado"** en la tarjeta.
- [ ] En los logs: `[SPONSOR] placement="…" source=fravega category=phone … applied=true`.
- [ ] En la respuesta de `/api/search` esos productos tienen `sponsored: true`.
- [ ] Editar la campaña y subir **relevancia mínima a 0.95** → en los logs
  `applied=false`, sin boost, sin etiqueta (la similitud real de celulares
  ronda 0.6–0.7, nunca llega a 0.95).
- [ ] Campaña para un rubro distinto al de la búsqueda (ej. Frávega + Notebook,
  buscar celulares) → no aplica.
- [ ] Campaña con `ends_at` en el pasado → no aplica.

**Comportamiento esperado, NO es bug:** el producto patrocinado compite, no se
impone. En la prueba del 2026-09-07 (Motorola Edge 70 Fusion de Frávega,
score 0.747, el más alto) quedó **#4**, no #1, porque las penalizaciones de
calidad del re-rank (specs flojas para el uso, etc.) le restan aunque tenga el
boost. Si se quiere "siempre primero", es otro diseño (slot reservado) — hablarlo.

## 3 · Bloque en la pantalla de inicio (navegador)

Crear/editar una campaña con **☑ "Mostrar en la pantalla de inicio"**.

- [ ] Entrar al sitio **fresco** (ventana incógnita, o borrar `localStorage`
  clave `ts_visit`) → arriba de la 1ª pregunta del chat guiado aparece un
  bloque **"Patrocinado — Ofertas en [rubros] de [Tienda]"** con botón **"Ver"**.
- [ ] Tocar **"Ver"** → dispara una búsqueda hacia ese primer rubro + esa tienda
  (ej. "celulares en Frávega"); el chat sigue pidiendo uso y presupuesto.
- [ ] El bloque **desaparece** cuando hay resultados en pantalla.
- [ ] Pausar la campaña → recargar el inicio → el bloque ya no está.
- [ ] `GET /api/sponsored/home` devuelve `{sponsor:{advertiser,source,categories}}`
  con campaña activa, `{sponsor:null}` sin ninguna. (Verificado 2026-09-07.)
- [ ] Con 2+ campañas `show_on_home` activas → se muestra solo la de mayor boost.

## 4 · Limitación conocida

- Las búsquedas que pegan al **caché estructurado** (`from_cache: true`) traen
  los productos directo de la DB sin re-correr el match de patrocinado → esos
  hits no llevan la etiqueta ni el boost hasta que el pool se regenera. Mismo
  límite que `also_at` / `price_verdict`. Aceptable para v1; anotar si molesta.

## 5 · Al terminar

Borrar las campañas de prueba desde el panel (o `DELETE FROM
sponsored_placements WHERE advertiser LIKE 'TEST%'`).
