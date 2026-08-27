# PHASE_1.md — MVP

## Objetivo de la fase

Un buscador funcional de notebooks y PCs con datos mock, pipeline de IA completo,
UI básica pero usable, y todo el backend listo para reemplazar mock con datos reales.

Al terminar esta fase: alguien puede entrar, escribir qué busca, y recibir
resultados reales con análisis. Los datos son ficticios pero el sistema es real.

---

## Criterios de done de la fase

- [ ] Usuario puede buscar en lenguaje natural y recibir resultados en < 3 segundos
- [ ] El flujo guiado funciona cuando el input es ambiguo
- [ ] Las tarjetas muestran todos los campos definidos en PROJECT_CONTEXT.md
- [ ] El análisis calidad/precio se genera y cachea correctamente
- [ ] La comparación de hasta 5 productos funciona
- [ ] Las búsquedas se guardan en localStorage y generan share token
- [ ] El sistema funciona en mobile (375px mínimo)
- [ ] 50 productos mock cargados con embeddings generados

---

## Tareas — en orden de ejecución

### TASK-001: Setup del proyecto

```
Crear proyecto Next.js 14 con App Router y TypeScript estricto.
Configurar Tailwind CSS.
Configurar variables de entorno (.env.local y .env.example).
Instalar dependencias: openai, @supabase/supabase-js, @upstash/redis.
Crear estructura de carpetas según CLAUDE.md.
Configurar ESLint y Prettier.
```

Dependencias: ninguna

---

### TASK-002: Base de datos y migraciones

```
Crear proyecto en Supabase.
Habilitar extensión pgvector.
Ejecutar migraciones en orden (ver DATA_SCHEMA.md):
  001_extensions.sql
  002_products.sql
  003_searches.sql
  004_users.sql
  005_sponsored.sql
  006_indexes.sql
Crear función hybrid_search en PostgreSQL.
Crear función find_similar_search para caché semántico.
Verificar que pgvector y los índices HNSW se crearon correctamente.
```

Dependencias: TASK-001

---

### TASK-003: Tipos TypeScript

```
Crear /types/index.ts con todos los tipos del sistema:
  - Product, ProductSpecs, ProductAnalysis, EnrichedProduct
  - Search, Slots, SearchResponse
  - RefinementTag, GuidingQuestion
  - SponsoredPlacement
  - CompareItem
Estos tipos deben reflejar exactamente el esquema de DATA_SCHEMA.md.
```

Dependencias: TASK-002

---

### TASK-004: Datos mock y embeddings

```
Crear /scripts/seedMockData.ts:
  - 30 notebooks con specs realistas pero datos ficticios
  - 20 PCs de escritorio con specs realistas pero datos ficticios
  - Cubrir todos los rangos de precio (desde gama baja a alta)
  - Cubrir todos los use_cases definidos en DOMAIN_KNOWLEDGE.md
  - URLs de productos ficticias (ej: mercadolibre.com.ar/MLA-XXXXX)
  - Imágenes: usar placeholder.com o similar
  
Crear /scripts/generateEmbeddings.ts:
  - Para cada producto en DB sin embedding, generar texto descriptivo
  - Llamar a OpenAI text-embedding-3-small
  - Guardar vector en columna embedding
  - Procesar en batches de 20 para no exceder rate limits
  
Agregar comandos en package.json:
  "seed": "tsx scripts/seedMockData.ts"
  "embed": "tsx scripts/generateEmbeddings.ts"
```

Dependencias: TASK-003

---

### TASK-005: Capa LLM — prompts y funciones base

```
Crear /lib/llm/prompts.ts con todos los system prompts:
  - SLOT_FILLING_PROMPT (ver SEARCH_PIPELINE.md)
  - QUERY_EXPANSION_PROMPT (ver SEARCH_PIPELINE.md)
  - PRODUCT_ANALYSIS_PROMPT

Crear /lib/llm/slotFilling.ts:
  - extractSlots(input: string, refinements?: Refinement[]): Promise<Slots>
  - Usar GPT-4o mini
  - Parsear respuesta JSON con manejo de errores robusto

Crear /lib/llm/queryExpansion.ts:
  - expandQuery(slots: Slots): Promise<string>
  - generateQueryEmbedding(text: string): Promise<number[]>
  - Usar GPT-4o mini para expansión, text-embedding-3-small para embedding

Crear /lib/llm/productAnalysis.ts:
  - generateProductAnalysis(product: Product, slots: Slots): Promise<ProductAnalysis>
  - Generar: quality_price_score, quality_price_analysis, selection_reason, upgrade_note
  - Usar GPT-4o mini
  - Guardar resultado en DB automáticamente
```

Dependencias: TASK-003

---

### TASK-006: Dominio — mapeos técnicos

```
Crear /lib/domain/usageToSpecs.ts:
  - Implementar toda la tabla "uso → specs" de DOMAIN_KNOWLEDGE.md
  - getRequiredSpecs(useCases: UseCase[]): RequiredSpecs
  - Cuando hay múltiples use_cases, tomar el más exigente como base

Crear /lib/domain/upgradeability.ts:
  - getUpgradeNote(product: Product, useCases: UseCase[]): string | null
  - Generar nota en lenguaje natural sobre qué se puede mejorar después
  - Ejemplo: "La RAM puede ampliarse si en el futuro necesitás más velocidad"
```

Dependencias: TASK-003

---

### TASK-007: Pipeline de búsqueda

```
Crear /lib/db/supabase.ts: cliente Supabase singleton.
Crear /lib/db/queries.ts: queries reutilizables.

Crear /lib/search/hybridSearch.ts:
  - hybridSearch(params): Promise<ProductSearchResult[]>
  - buildSQLFilters(slots: Slots): SQLFilters
  - Llamar a función hybrid_search de Supabase

Crear /lib/search/scorer.ts:
  - scoreResults(results, sponsoredPlacements): ScoredProduct[]
  - Sin boost de popularidad en MVP (log desactivado)
  - Con boost de patrocinados respetando umbral mínimo

Crear /lib/search/cache.ts:
  - checkSemanticCache(embedding): Promise<CacheHit | null>
  - saveSearchToCache(search): Promise<void>
  - Usar Upstash Redis para caché de resultados recientes (TTL 1 hora)

Implementar lógica de tags de refinamiento:
  - generateRefinementTags(results, slots): RefinementTag[]
  - Nunca usar términos técnicos en los labels (ver DOMAIN_KNOWLEDGE.md)
```

Dependencias: TASK-005, TASK-006

---

### TASK-008: API endpoint de búsqueda

```
Crear /app/api/search/route.ts con el flujo completo de SEARCH_PIPELINE.md:
  POST /api/search
  Body: { input: string, sessionId: string, refinements?: Refinement[] }
  Response: SearchResponse (ver tipos)

Manejar dos tipos de respuesta:
  { type: 'needs_info', questions: GuidingQuestion[] }
  { type: 'results', products: EnrichedProduct[], refinementTags, totalCount, shareToken }

Crear /app/api/search/[id]/route.ts:
  GET /api/search/:shareToken → recuperar búsqueda guardada

Crear /app/api/products/compare/route.ts:
  POST /api/products/compare
  Body: { productIds: string[] } (máximo 5)
  Response: productos completos para comparación
```

Dependencias: TASK-007

---

### TASK-009: UI — componentes base

```
Leer /mnt/skills/public/frontend-design/SKILL.md antes de escribir cualquier componente.

Crear /components/SearchInput.tsx:
  - Input principal grande, centrado, con placeholder descriptivo
  - "¿Qué necesitás? Contanos para qué lo vas a usar y cuánto podés invertir"
  - Estado de loading mientras procesa
  - Mobile-first: ocupa todo el ancho en mobile

Crear /components/GuidingQuestions.tsx:
  - Muestra pregunta del sistema + tags clickeables
  - Al clickear un tag, se agrega al input como texto y reenvía
  - Animación suave de entrada

Crear /components/RefinementTags.tsx:
  - Tags funcionales que aparecen debajo de los resultados
  - Al clickear, refina la búsqueda actual sin reemplazarla
  - Labels siempre en lenguaje de usuario, nunca técnico

Crear /components/ProductCard.tsx:
  - Foto, nombre, precio contado y en cuotas
  - Badge "PATROCINADO" si aplica
  - Score calidad/precio con color (EXCELENTE=verde, MUY BUENO=azul, BUENO=amarillo, REGULAR=gris)
  - Análisis de calidad/precio (texto LLM)
  - Razón de selección ("Seleccionada porque...")
  - Nota de upgradeabilidad si aplica
  - Botón "Ver en [tienda]" que abre en nueva pestaña
  - Checkbox "+ Comparar" (deshabilitado si ya hay 5 seleccionados)

Crear /components/SponsoredBadge.tsx:
  - Badge sutil pero visible
  - Tooltip opcional explicando qué significa
```

Dependencias: TASK-008

---

### TASK-010: UI — páginas principales

```
Leer /mnt/skills/public/frontend-design/SKILL.md.

Crear /app/page.tsx (Home):
  - Logo/nombre del producto
  - SearchInput centrado
  - Ejemplos de búsquedas clickeables: 
    "Notebook para trabajar con Office, hasta $200k/mes"
    "PC para editar videos, pago en efectivo"
    "Tablet para estudiar y leer"
  - Diseño limpio, sin distracciones

Crear /app/search/[token]/page.tsx (Resultados):
  - SearchInput en header (más pequeño)
  - Contador: "23 resultados para tu búsqueda"
  - Grid de ProductCards (2 columnas desktop, 1 columna mobile)
  - RefinementTags debajo del contador
  - Paginación: cargar más al scroll o botón "Ver más"
  - Barra de comparación fija abajo cuando hay productos seleccionados
  - Botón "Compartir búsqueda" con share token

Crear /app/compare/page.tsx (Comparación):
  - Tabla con una columna por producto (máximo 5)
  - Filas por atributo (ver PROJECT_CONTEXT.md → sección Comparación)
  - Sticky header con nombre/foto de cada producto
  - Botón para eliminar un producto de la comparación
  - Mobile: scroll horizontal
```

Dependencias: TASK-009

---

### TASK-011: Guardar búsquedas (anónimo)

```
Crear /lib/storage/localStorage.ts:
  - saveSearchLocally(searchId, shareToken, input): void
  - getSavedSearches(): SavedSearch[]
  - removeSavedSearch(searchId): void

En la página de resultados:
  - Mostrar lista de búsquedas guardadas localmente en sidebar o drawer
  - Opción "Guardar esta búsqueda" (ya guardada automáticamente)
  - Opción "Compartir" que copia el link al clipboard

No implementar registro de usuario en MVP.
No implementar alertas de precio en MVP.
```

Dependencias: TASK-010

---

### TASK-012: Testing y ajuste

```
Probar los 10 casos de uso más comunes (ver DOMAIN_KNOWLEDGE.md):
  1. "Notebook para trabajar con Office, hasta $200k por mes"
  2. "PC para editar videos" (sin presupuesto → flujo guiado)
  3. "Algo para estudiar, no tengo mucha plata"
  4. "Quiero cambiar mi notebook" (ambiguo → flujo guiado completo)
  5. "Notebook gamer, pago en efectivo hasta 500k"
  6. "Tablet para mi hijo que estudia"
  7. "PC de escritorio para diseño gráfico"
  8. "Notebook liviana para llevar al trabajo"
  9. "Algo barato para navegar y YouTube"
  10. "Notebook para programar"

Verificar:
  - Los slots se extraen correctamente en cada caso
  - Los resultados son relevantes para el uso declarado
  - Los análisis calidad/precio son coherentes
  - El caché semántico funciona (búsquedas similares reutilizan resultado)
  - La UI no se rompe en mobile
  - El tiempo de respuesta es < 3 segundos (con caché < 1 segundo)

Ajustar prompts según resultados de testing.
```

Dependencias: TASK-010, TASK-011

---

## Lo que NO entra en Fase 1

- Registro de usuarios
- Alertas de precio
- API real de MercadoLibre (datos son mock)
- Datos de cuotas reales por banco/tarjeta
- Patrocinados reales
- Tablets, TVs
- Boost de popularidad (no hay datos propios aún)
