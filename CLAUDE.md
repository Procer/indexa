# CLAUDE.md — TechSearch AR

## Qué es este proyecto

Buscador de tecnología con IA para el mercado argentino. Permite a usuarios sin conocimiento técnico encontrar notebooks, PCs y tablets según su uso real y presupuesto, usando lenguaje natural.

El diferencial no es solo búsqueda semántica: es traducir intención de uso ("notebook rápida para trabajar y ver películas") a especificaciones técnicas reales, y devolver resultados con análisis de calidad/precio en lenguaje accesible.

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Frontend | Next.js 14 (App Router) + Tailwind CSS |
| Backend | Next.js API Routes |
| Base de datos | PostgreSQL 16 + pgvector **self-hosted en el VPS** (puerto 5433). Acceso vía `postgres` (postgres.js) en `lib/db/sql.ts` — `DATABASE_URL`. Migrado desde Supabase (ver `db/vps/README.md`). Backup diario `db/vps/backup.sh` (cron 03:00). |
| Auth | Supabase Auth (magic link + Google OAuth) — **única pieza que todavía usa Supabase**; pendiente de migrar (ver `docs/AUTH_MIGRATION.md`). Por eso `@supabase/supabase-js` y las env `NEXT_PUBLIC_SUPABASE_*` / `SUPABASE_SERVICE_ROLE_KEY` siguen presentes. |
| Caché | Tabla `cache_kv` en la misma base Postgres (ver `lib/search/cache.ts`). |
| Rate limiting | En memoria del proceso (`lib/rateLimit.ts`) — Upstash Redis eliminado. |
| LLM principal | OpenAI GPT-4o mini (slot-filling, expansión, análisis) |
| Embeddings | OpenAI text-embedding-3-small |
| Scraping/APIs | MercadoLibre API oficial (MVP) |
| Deploy | VPS Dattatec por SSH — tarball → `npm install && npm run build` → `pm2 restart indexa`. Scrapers como cron (`scripts/syncFraveOnly.ts` 06:00, `scripts/analyzeProducts.ts` 07:00). **El deploy NO pasa por git** — es manual, tarball directo al VPS. |
| Repositorio | GitHub: `https://github.com/Procer/indexa.git` (remote `origin`, agregado 2026-09-17 — estaba vacío, sin commits). El deploy al VPS es independiente del repo (ver fila Deploy); pushear a GitHub no actualiza el VPS ni viceversa. |

---

## Estructura del repositorio

```
/
├── app/                        # Next.js App Router
│   ├── page.tsx                # Home — input de búsqueda
│   ├── search/
│   │   └── [id]/page.tsx       # Resultados de búsqueda
│   ├── compare/page.tsx        # Comparación de productos (hasta 5)
│   └── api/
│       ├── search/route.ts     # Pipeline de búsqueda principal
│       ├── products/route.ts   # CRUD productos
│       ├── embed/route.ts      # Generación de embeddings
│       └── alerts/route.ts     # Alertas de precio
├── components/
│   ├── SearchInput.tsx         # Input principal con guía progresiva
│   ├── RefinementTags.tsx      # Tags funcionales (no técnicos)
│   ├── ProductCard.tsx         # Tarjeta de resultado
│   ├── CompareTable.tsx        # Tabla de comparación
│   └── SponsoredBadge.tsx      # Badge de patrocinado
├── lib/
│   ├── llm/
│   │   ├── slotFilling.ts      # Extrae slots estructurados del input
│   │   ├── queryExpansion.ts   # Expande query a términos técnicos
│   │   ├── productAnalysis.ts  # Genera análisis calidad/precio
│   │   └── prompts.ts          # Todos los system prompts centralizados
│   ├── search/
│   │   ├── hybridSearch.ts     # Búsqueda híbrida SQL + vectorial
│   │   ├── scorer.ts           # Scoring final con boost patrocinado
│   │   └── cache.ts            # Caché estructurado (tabla cache_kv en Supabase)
│   ├── db/
│   │   ├── supabase.ts         # Cliente Supabase
│   │   └── queries.ts          # Queries reutilizables
│   └── domain/
│       ├── usageToSpecs.ts     # Tabla uso → specs técnicas requeridas
│       └── upgradeability.ts   # Mapa componentes fijos vs mejorables
├── types/
│   └── index.ts                # Todos los tipos TypeScript
├── scripts/
│   ├── seedMockData.ts         # Poblar DB con datos ficticios para MVP
│   └── generateEmbeddings.ts  # Generar embeddings para productos en DB
└── supabase/
    └── migrations/             # Migraciones SQL
```

---

## Variables de entorno requeridas

```env
# Postgres (VPS self-hosted, puerto 5433)
DATABASE_URL=postgres://techsearch:...@127.0.0.1:5433/techsearch

# Supabase — SOLO para Auth (pendiente de migrar, ver docs/AUTH_MIGRATION.md)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# OpenAI
OPENAI_API_KEY=

# MercadoLibre (Fase 2+)
ML_APP_ID=
ML_CLIENT_SECRET=
```

---

## Reglas de desarrollo que Claude Code debe respetar

1. **Nunca hardcodear prompts inline** — todos los prompts van en `lib/llm/prompts.ts`
2. **Nunca llamar al LLM si el resultado está en caché** — siempre verificar `cache_kv` (Supabase) primero, ver `lib/search/cache.ts`
3. **Los tags de refinamiento son siempre funcionales, nunca técnicos** — ver `lib/domain/usageToSpecs.ts`
4. **El análisis calidad/precio se genera por producto, no por búsqueda** — se cachea en DB
5. **Los patrocinados solo aparecen si su score de relevancia supera el umbral mínimo** — ver `lib/search/scorer.ts`
6. **Mobile-first** — todos los componentes deben funcionar en 375px de ancho mínimo
7. **TypeScript estricto** — no usar `any`, tipar todo con los tipos de `/types/index.ts`
8. **Cada fase tiene su rama git** — `phase/1-mvp`, `phase/2-features`, `phase/3-expansion`

---

## Comandos frecuentes

```bash
npm run dev              # Desarrollo local
npm run seed             # Poblar DB con datos mock
npm run embed            # Generar embeddings para productos en DB
npm run typecheck        # Verificar tipos TypeScript
```

---

## Documentos de referencia

- `docs/PROJECT_CONTEXT.md` — contexto completo del producto
- `docs/DATA_SCHEMA.md` — esquema de base de datos completo
- `docs/SEARCH_PIPELINE.md` — pipeline de búsqueda paso a paso
- `docs/DOMAIN_KNOWLEDGE.md` — tabla uso → specs y componentes
- `phases/PHASE_1.md` — tareas MVP
- `phases/PHASE_2.md` — tareas Fase 2
- `phases/PHASE_3.md` — tareas Fase 3
