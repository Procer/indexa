# SEARCH_PIPELINE.md — Pipeline de búsqueda

## Visión general

```
Input usuario
     │
     ▼
[1] CACHÉ SEMÁNTICO ──── Hit ────► Devolver resultado cacheado
     │ Miss
     ▼
[2] SLOT-FILLING (LLM mini)
     │ Extrae: categoría, usos, presupuesto, preferencias
     ▼
[3] ¿Input suficiente?
     │ No ──────────────────────────► Devolver preguntas guía + tags
     │ Sí
     ▼
[4] QUERY EXPANSION (LLM mini)
     │ Traduce slots a texto técnico rico
     ▼
[5] EMBEDDING (text-embedding-3-small)
     │ Convierte texto expandido a vector 1536D
     ▼
[6] BÚSQUEDA HÍBRIDA (pgvector + SQL)
     │ Filtros SQL duros + similitud coseno
     ▼
[7] SCORING FINAL
     │ Similitud + boost patrocinado
     ▼
[8] ENRIQUECER RESULTADOS
     │ Agregar análisis calidad/precio (desde caché DB o generar)
     ▼
[9] GUARDAR BÚSQUEDA EN DB
     │ Con embedding para futuro caché semántico
     ▼
[10] RESPUESTA AL CLIENTE
      Productos + tags de refinamiento + share token
```

---

## Paso 1: Caché semántico

**Objetivo:** evitar reprocesar búsquedas similares.

```typescript
// lib/search/cache.ts

async function checkSemanticCache(queryEmbedding: number[]): Promise<CacheHit | null> {
  // Buscar búsquedas anteriores con embedding similar
  const { data } = await supabase.rpc('find_similar_search', {
    query_embedding: queryEmbedding,
    similarity_threshold: 0.92,  // muy alto: solo si es casi idéntica
    max_age_hours: 6             // no usar caché de más de 6 horas
  })
  
  if (data && data.length > 0) {
    // Retornar los productos de esa búsqueda cacheada
    return { search_id: data[0].id, result_ids: data[0].result_ids }
  }
  return null
}
```

**Nota:** El threshold de 0.92 es alto intencionalmente. Una búsqueda "notebook para trabajar" y "notebook para oficina" pueden llegar a 0.89-0.91 de similitud pero tener matices distintos. En el MVP usar 0.95 para ser conservadores.

---

## Paso 2: Slot-filling

**Objetivo:** extraer estructura del lenguaje natural del usuario.

**Modelo:** GPT-4o mini (barato, suficiente para esta tarea)

**System prompt** (ver `lib/llm/prompts.ts → SLOT_FILLING_PROMPT`):

```
Eres un extractor de información para un buscador de tecnología en Argentina.
Tu tarea es extraer slots estructurados del texto del usuario.

Devuelve SOLO un JSON válido con esta estructura:
{
  "category": "notebook" | "desktop" | "tablet" | "tv" | null,
  "use_cases": array de: "casual_browsing" | "office" | "study" | "multimedia" | 
               "photo_editing_light" | "photo_editing_pro" | "video_editing_1080" | 
               "video_editing_4k" | "programming" | "gaming_casual" | 
               "gaming_competitive" | "graphic_design" | "cad_3d" | 
               "portability" | "stationary",
  "budget_monthly_ars": número o null,
  "budget_cash_ars": número o null,
  "preferences": {
    "os": "windows" | "macos" | "chromeos" | "any",
    "brands_preferred": [],
    "brands_excluded": [],
    "portability": "light" | "any" | "not_important",
    "screen_size": "small" | "medium" | "large" | "any"
  },
  "is_ambiguous": boolean,
  "missing_info": array de "category" | "use_case" | "budget"
}

Contexto: los precios están en pesos argentinos (ARS).
"200 mil", "$200k", "200.000" → 200000
"en cuotas" → budget_monthly_ars
"en efectivo", "contado" → budget_cash_ars
```

---

## Paso 3: Verificar suficiencia del input

```typescript
function isInputSufficient(slots: Slots): boolean {
  const hasCategory = slots.category !== null
  const hasUseCase = slots.use_cases.length > 0
  const hasBudget = slots.budget_monthly_ars !== null || slots.budget_cash_ars !== null
  
  // Mínimo necesario para buscar: categoría + (uso O presupuesto)
  return hasCategory && (hasUseCase || hasBudget)
}

function getGuidingQuestions(slots: Slots): GuidingQuestion[] {
  const questions: GuidingQuestion[] = []
  
  if (!slots.category) {
    questions.push({
      text: "¿Qué tipo de dispositivo buscás?",
      tags: ["Notebook", "PC de escritorio", "Tablet"]
    })
  }
  
  if (slots.use_cases.length === 0) {
    questions.push({
      text: "¿Para qué lo vas a usar principalmente?",
      tags: ["Trabajo y oficina", "Estudio", "Diseño o edición", "Gaming", "Uso casual y entretenimiento"]
    })
  }
  
  if (!slots.budget_monthly_ars && !slots.budget_cash_ars) {
    questions.push({
      text: "¿Cuánto podés invertir?",
      tags: ["Hasta $100.000/mes", "Hasta $200.000/mes", "Hasta $400.000/mes", "Pago en efectivo"]
    })
  }
  
  return questions
}
```

---

## Paso 4: Query expansion

**Objetivo:** convertir los slots en texto técnico rico para mejor embedding.

**Modelo:** GPT-4o mini

**System prompt** (ver `lib/llm/prompts.ts → QUERY_EXPANSION_PROMPT`):

```
Eres un experto en hardware de computadoras. 
Recibirás slots estructurados de lo que busca un usuario y debes generar 
un texto técnico descriptivo del producto ideal para ese usuario.

El texto debe mencionar: tipo de procesador ideal, RAM recomendada, 
tipo de almacenamiento, características de pantalla, GPU si aplica, 
y cualquier característica relevante según el uso.

No incluyas precios. No uses listas. Escribe en prosa técnica densa, 
entre 50 y 100 palabras. En español.

Usa el conocimiento de dominio:
[INSERTAR CONTENIDO DE DOMAIN_KNOWLEDGE.md → sección "uso → specs"]
```

**Ejemplo de output:**

Input slots:
```json
{ "category": "notebook", "use_cases": ["office", "multimedia"], "budget_monthly_ars": 200000 }
```

Output expandido:
```
Notebook con procesador Intel Core i5 o AMD Ryzen 5 de generación reciente, 
16 gigabytes de RAM para manejo fluido de múltiples aplicaciones de oficina, 
almacenamiento SSD NVMe de 512 gigabytes para arranque rápido y respuesta 
ágil en Office y navegador. Pantalla Full HD de 15.6 pulgadas con buena 
reproducción de color para contenido multimedia. Batería de autonomía 
razonable para jornada de trabajo. Sin necesidad de tarjeta gráfica dedicada.
```

---

## Paso 5: Embedding

```typescript
// lib/llm/queryExpansion.ts

async function generateQueryEmbedding(expandedQuery: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: expandedQuery,
  })
  return response.data[0].embedding
}
```

Costo: ~$0.00002 por query. Prácticamente gratis.

---

## Paso 6: Búsqueda híbrida

```typescript
// lib/search/hybridSearch.ts

async function hybridSearch(params: {
  queryEmbedding: number[],
  slots: Slots,
  limit: number,
  offset: number
}): Promise<ProductSearchResult[]> {
  
  // Construir filtros SQL desde slots
  const filters = buildSQLFilters(params.slots)
  
  // Llamar función PostgreSQL de búsqueda híbrida
  const { data } = await supabase.rpc('hybrid_search', {
    query_embedding: params.queryEmbedding,
    category_filter: filters.category,
    max_price_cash: filters.max_price_cash,
    max_price_installment: filters.max_price_installment,
    require_gpu: filters.require_gpu,
    min_ram_gb: filters.min_ram_gb,
    require_ssd: filters.require_ssd,
    limit_results: params.limit,
    offset_results: params.offset
  })
  
  return data
}

function buildSQLFilters(slots: Slots): SQLFilters {
  // Mapear specs requeridas según use_cases
  const requiredSpecs = getRequiredSpecs(slots.use_cases) // ver DOMAIN_KNOWLEDGE
  
  return {
    category: slots.category,
    max_price_cash: slots.budget_cash_ars,
    max_price_installment: slots.budget_monthly_ars,
    require_gpu: requiredSpecs.gpu === 'dedicated',
    min_ram_gb: requiredSpecs.ram_gb,
    require_ssd: requiredSpecs.storage_type?.startsWith('SSD')
  }
}
```

---

## Paso 7: Scoring final

```typescript
// lib/search/scorer.ts

function scoreResults(
  results: ProductSearchResult[],
  sponsoredPlacements: SponsoredPlacement[]
): ScoredProduct[] {
  return results
    .map(product => {
      let score = product.similarity
      
      // Boost patrocinado (solo si supera umbral mínimo de relevancia)
      const placement = sponsoredPlacements.find(
        p => p.product_ids.includes(product.id) && p.active
      )
      if (placement && product.similarity >= placement.min_relevance) {
        score += placement.score_boost
      }
      
      // Nota: boost de popularidad desactivado en MVP
      // score += Math.log(product.click_count + 1) * 0.015
      
      return { ...product, final_score: score }
    })
    .sort((a, b) => b.final_score - a.final_score)
}
```

---

## Paso 8: Enriquecer con análisis

```typescript
// lib/llm/productAnalysis.ts

async function enrichWithAnalysis(
  products: ScoredProduct[],
  slots: Slots
): Promise<EnrichedProduct[]> {
  return Promise.all(products.map(async product => {
    
    // Si ya tiene análisis en DB, usarlo (no llamar al LLM)
    if (product.quality_price_analysis && product.analysis_generated_at) {
      const ageHours = getAgeInHours(product.analysis_generated_at)
      if (ageHours < 24) {
        return { ...product, analysisFromCache: true }
      }
    }
    
    // Generar análisis con LLM
    const analysis = await generateProductAnalysis(product, slots)
    
    // Guardar en DB para próximas búsquedas
    await saveAnalysisToDB(product.id, analysis)
    
    return { ...product, ...analysis }
  }))
}

async function generateProductAnalysis(
  product: Product,
  slots: Slots
): Promise<ProductAnalysis> {
  // Ver prompts.ts → PRODUCT_ANALYSIS_PROMPT
  // Genera: quality_price_score, quality_price_analysis, selection_reason, upgrade_note
}
```

---

## Paso 9: Tags de refinamiento

Los tags se generan en base a los resultados obtenidos, no son fijos.

```typescript
function generateRefinementTags(
  results: EnrichedProduct[],
  slots: Slots
): RefinementTag[] {
  const tags: RefinementTag[] = []
  
  // Siempre disponibles
  tags.push({ label: "Más económica", action: "reduce_price_20pct" })
  tags.push({ label: "Más potente", action: "increase_tier" })
  tags.push({ label: "De otra marca", action: "exclude_shown_brands" })
  
  // Condicionales según resultados
  const hasHeavyProducts = results.some(p => p.specs.weight_kg > 2)
  if (hasHeavyProducts) {
    tags.push({ label: "Más liviana para llevar", action: "filter_lightweight" })
  }
  
  const hasHDDProducts = results.some(p => p.specs.storage_type === 'HDD')
  if (hasHDDProducts) {
    tags.push({ label: "Que encienda más rápido", action: "require_ssd" })
  }
  
  // ... más lógica condicional
  
  return tags.slice(0, 6) // máximo 6 tags visibles
}
```

---

## Endpoint principal

```typescript
// app/api/search/route.ts

export async function POST(request: Request) {
  const { input, sessionId, refinements } = await request.json()
  
  // 1. Slot-filling
  const slots = await extractSlots(input, refinements)
  
  // 2. Verificar suficiencia
  if (!isInputSufficient(slots)) {
    return Response.json({
      type: 'needs_info',
      questions: getGuidingQuestions(slots)
    })
  }
  
  // 3. Query expansion + embedding
  const expandedQuery = await expandQuery(slots)
  const queryEmbedding = await generateQueryEmbedding(expandedQuery)
  
  // 4. Caché semántico
  const cacheHit = await checkSemanticCache(queryEmbedding)
  if (cacheHit) {
    const cachedProducts = await getProductsByIds(cacheHit.result_ids)
    return Response.json({ type: 'results', products: cachedProducts, fromCache: true })
  }
  
  // 5. Búsqueda híbrida
  const rawResults = await hybridSearch({ queryEmbedding, slots, limit: 50, offset: 0 })
  
  // 6. Scoring
  const sponsoredPlacements = await getActiveSponsoredPlacements()
  const scoredResults = scoreResults(rawResults, sponsoredPlacements)
  const pageResults = scoredResults.slice(0, 10)
  
  // 7. Enriquecer
  const enrichedResults = await enrichWithAnalysis(pageResults, slots)
  
  // 8. Tags de refinamiento
  const refinementTags = generateRefinementTags(enrichedResults, slots)
  
  // 9. Guardar búsqueda
  const search = await saveSearch({
    rawInput: input, slots, expandedQuery,
    queryEmbedding, resultIds: scoredResults.map(p => p.id),
    sessionId
  })
  
  return Response.json({
    type: 'results',
    products: enrichedResults,
    refinementTags,
    totalCount: scoredResults.length,
    shareToken: search.share_token,
    searchId: search.id
  })
}
```
