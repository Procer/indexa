# DOMAIN_KNOWLEDGE.md — Conocimiento de dominio técnico

## Propósito

Este archivo es la "base de conocimiento" que el LLM usa como contexto.
Define la traducción entre lo que dice el usuario y lo que el sistema busca.
Claude Code debe incluir este contenido en los system prompts relevantes.

---

## Tabla: uso declarado → specs técnicas mínimas requeridas

### Notebooks y PCs

| Uso del usuario | Término interno | RAM mín | Procesador tier | GPU | Storage | Pantalla |
|---|---|---|---|---|---|---|
| "Navegar, YouTube, redes" | `casual_browsing` | 8GB | low | integrated | SSD 256GB | cualquiera |
| "Word, Excel, trabajo de oficina" | `office` | 16GB | mid | integrated | SSD 512GB | FHD+ |
| "Estudio, tomar apuntes, Zoom" | `study` | 8GB | low-mid | integrated | SSD 256GB | cualquiera |
| "Ver películas, series, contenido" | `multimedia` | 8GB | low-mid | integrated | SSD 256GB | FHD 15"+ |
| "Editar fotos amateur" | `photo_editing_light` | 16GB | mid | integrated | SSD 512GB | IPS FHD |
| "Edición de fotos profesional" | `photo_editing_pro` | 16GB | high | dedicated o Apple M | SSD 512GB+ | IPS/OLED FHD+ color-accurate |
| "Editar videos en 1080p" | `video_editing_1080` | 16GB | high | dedicated | SSD 1TB | FHD IPS |
| "Editar videos en 4K" | `video_editing_4k` | 32GB | enthusiast | dedicated high-end | SSD 1TB+ | 4K/QHD |
| "Programar, desarrollo" | `programming` | 16GB | mid-high | integrated | SSD 512GB | FHD+ |
| "Gaming casual" | `gaming_casual` | 16GB | mid | dedicated mid | SSD 512GB | FHD 144Hz |
| "Gaming competitivo" | `gaming_competitive` | 16GB | high | dedicated high | SSD 512GB+ | FHD 144Hz+ |
| "Diseño gráfico" | `graphic_design` | 16GB | high | dedicated o Apple M | SSD 512GB | IPS/OLED color-accurate |
| "Arquitectura, CAD, 3D" | `cad_3d` | 32GB | enthusiast | dedicated high-end | SSD 1TB | FHD+ IPS |
| "Usar en cualquier lugar, llevar siempre" | `portability` | — | — | — | — | ≤14", peso ≤1.5kg |
| "Siempre enchufada, escritorio" | `stationary` | — | — | — | — | 15"+ |

### Combinaciones frecuentes

El usuario suele combinar usos. El sistema toma el más exigente como base:

```
office + multimedia → mid procesador, 16GB RAM, SSD 512GB, FHD 15"
study + casual_browsing → low-mid, 8GB, SSD 256GB
programming + multimedia → mid-high, 16GB, SSD 512GB
photo_editing_pro + video_editing_1080 → high, 32GB, dedicated GPU, SSD 1TB
```

---

### Tablets

| Uso del usuario | RAM mín | Storage mín | Pantalla | Stylus | Celular |
|---|---|---|---|---|---|
| "Para ver series y películas" | 4GB | 64GB | 10"+ | no necesario | no |
| "Para estudiar, apuntes, clases" | 4GB | 128GB | 10"+ | útil | no |
| "Para trabajar, productividad" | 8GB | 128GB | 11"+ | recomendado | no |
| "Para dibujar o diseño" | 8GB | 128GB | 11"+ | imprescindible | no |
| "Para llevar a todos lados" | 4GB | 64GB | 8-11" | opcional | sí (celular) |
| "iPad para el trabajo" | 8GB (M-series) | 256GB | 11"+ | Apple Pencil | no |

Notas tablets:
- iOS (iPad) = más apps optimizadas, ecosistema Apple, soporte más largo
- Android (Samsung/Lenovo/Xiaomi) = más flexible, precio/prestaciones
- Samsung Tab S series = S Pen incluido, AMOLED, mejor pantalla gama Android
- RAM en tablets no escala igual que PCs — 4GB es suficiente para casual, 8GB+ para productividad real

### Smart TVs

| Tamaño | Resolución mínima | Panel recomendado | Refresh mínimo | Para qué |
|---|---|---|---|---|
| 32" | FHD | LED | 60Hz | Habitación pequeña, uso casual |
| 43" | 4K | LED/QLED | 60Hz | Living mediano, cotidiano |
| 50-55" | 4K | QLED/NanoCell | 60-120Hz | Living principal |
| 65" | 4K | QLED/OLED | 120Hz | Living grande, cine en casa |
| 75"+ | 4K | QLED/OLED | 120Hz | Sala grande, home theater |

Jerarquía de paneles TV (mejor a peor):
1. OLED — negros perfectos, contraste infinito, mejor imagen absoluta
2. QLED / MiniLED — brillo alto, excelente HDR, mejor en ambientes iluminados
3. NanoCell — colores más precisos que LED básico, buen ángulo de visión
4. LED básico — económico, funcional, suficiente para uso casual

Smart OS:
- Google TV / Android TV — mayor compatibilidad de apps, más actualizaciones
- webOS (LG) — interfaz fluida, ThinQ AI, buenas apps
- Tizen (Samsung) — buen ecosistema, Bixby, compatible HDMI 2.1 en gamas altas
- Refresh 120Hz+ — recomendado para gaming (HDMI 2.1 requerido), deportes

---

## Tabla: tags funcionales → filtros técnicos

Cuando el usuario clickea un tag de refinamiento sobre los resultados:

| Tag visible | Filtro técnico aplicado |
|---|---|
| "Que encienda más rápido" | `storage_type IN (SSD_NVME)`, boost a RAM > 16GB |
| "Más liviana para llevar" | `weight_kg < 1.5`, `screen_inches <= 14` |
| "Con mejor pantalla" | `screen_type IN (IPS, OLED)`, `screen_resolution = 1920x1080+` |
| "Más económica" | `price_installment` reducido 20% del actual |
| "De otra marca" | excluir marcas ya mostradas |
| "Que dure más la batería" | `battery_wh > 60`, boost a factores de eficiencia |
| "Más potente" | subir `processor_tier` un nivel, `ram_gb` +8 |
| "Para llevar a todos lados" | `weight_kg < 1.5`, `screen_inches <= 14`, batería alta |
| "Con teclado numérico" | `has_numeric_keyboard = true` |
| "Con tarjeta de video" | `gpu = dedicated` |
| "Que sirva para jugar" | agregar `gaming_casual` a use_cases |

---

## Tabla: componentes fijos vs mejorables por categoría

### Notebooks

| Componente | ¿Mejorable? | Nota |
|---|---|---|
| Procesador | ❌ Fijo | Soldado en la mayoría. Elegir bien desde el inicio |
| Pantalla | ❌ Fija | Tamaño, resolución y tipo no cambian |
| Chasis / peso | ❌ Fijo | El formato es permanente |
| Teclado (tipo) | ❌ Fijo | Numérico o no, no cambia |
| RAM | ✅ Mejorable | En muchos modelos tiene slot libre |
| Almacenamiento | ✅ Mejorable | SSD reemplazable en la mayoría |
| Batería | ⚠️ Mejorable con dificultad | Técnico, no siempre conveniente |
| GPU | ❌ Fija | Integrated vs dedicated, no cambia |

### PCs de escritorio

| Componente | ¿Mejorable? | Nota |
|---|---|---|
| Procesador | ✅ Mejorable | Según socket de la motherboard |
| RAM | ✅ Mejorable | Fácil, slots libres frecuentes |
| Almacenamiento | ✅ Mejorable | Muy fácil |
| GPU | ✅ Mejorable | Fácil si hay espacio y alimentación |
| Motherboard | ⚠️ Mejorable | Limita todo lo demás |
| Monitor | ✅ Externo | Independiente de la PC |
| Fuente | ✅ Mejorable | Al agregar GPU puede requerirse |

---

## Tiers de procesador

Usados internamente para comparación y scoring.

### Intel (notebooks)
| Tier | Procesadores |
|---|---|
| low | Core i3, Celeron, Pentium, N-series |
| mid | Core i5 12th+ |
| high | Core i7 12th+ |
| enthusiast | Core i9, HX series |

### AMD (notebooks)
| Tier | Procesadores |
|---|---|
| low | Ryzen 3, Athlon |
| mid | Ryzen 5 5000+, Ryzen 5 7000+ |
| high | Ryzen 7 5000+, Ryzen 7 7000+ |
| enthusiast | Ryzen 9 |

### Apple
| Tier | Procesadores |
|---|---|
| mid | M1, M2 base |
| high | M1 Pro, M2 Pro, M3 |
| enthusiast | M1 Max/Ultra, M2 Max/Ultra, M3 Pro+ |

---

## Score calidad/precio

Fórmula base para clasificar el análisis:

```
score_qp = (
  (processor_tier_score × 0.30) +
  (ram_score × 0.20) +
  (storage_score × 0.15) +
  (screen_score × 0.15) +
  (price_competitiveness × 0.20)
) × penalización_componentes_fijos_deficientes
```

Donde:
- `price_competitiveness`: comparación vs productos similares en DB
- `penalización_componentes_fijos_deficientes`: si la pantalla o procesador es inadecuado para el uso declarado, reduce el score aunque el precio sea bueno

Resultado:
- 0.85 - 1.00 → EXCELENTE
- 0.70 - 0.84 → MUY BUENO
- 0.55 - 0.69 → BUENO
- < 0.55 → REGULAR

---

## Scoring con boost patrocinado

```typescript
const finalScore = (
  semanticSimilarity +
  Math.log(product.click_count + 1) * 0.015 +  // popularidad (activar en Fase 2)
  (product.is_sponsored ? product.sponsor_score_boost : 0)
)

// Regla de negocio: el patrocinado no aparece si su relevancia semántica
// es menor al umbral mínimo configurado en sponsored_placements
if (product.is_sponsored && semanticSimilarity < sponsored.min_relevance) {
  // no incluir en resultados aunque pague
}
```

---

## Preguntas guía del sistema (flujo guiado)

Cuando el input es ambiguo, el sistema hace preguntas en este orden de prioridad:

**1. Categoría** (si no está clara):
> "¿Qué tipo de dispositivo buscás?"
> `[Notebook]` `[PC de escritorio]` `[Tablet]`

**2. Uso principal** (siempre):
> "¿Para qué lo vas a usar principalmente?"
> `[Trabajo y oficina]` `[Estudio]` `[Diseño o edición]` `[Gaming]` `[Uso casual y entretenimiento]`

**3. Presupuesto** (si no se mencionó):
> "¿Cuánto podés invertir?"
> `[Hasta $100.000/mes]` `[Hasta $200.000/mes]` `[Hasta $400.000/mes]` `[Pago en efectivo]`

**4. Preferencia de portabilidad** (solo para notebooks, si aplica):
> "¿La vas a llevar seguido o va a estar en un lugar fijo?"
> `[La llevo siempre]` `[A veces]` `[Queda en casa o trabajo]`

Con 2-3 respuestas el sistema ya puede buscar. No hacer más de 4 preguntas antes de mostrar resultados.
