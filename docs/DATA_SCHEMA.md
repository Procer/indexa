# DATA_SCHEMA.md — Esquema de base de datos

## Motor: PostgreSQL (Supabase) con extensión pgvector

---

## Migraciones — orden de ejecución

1. `001_extensions.sql`
2. `002_products.sql`
3. `003_searches.sql`
4. `004_users.sql`
5. `005_sponsored.sql`
6. `006_indexes.sql`

---

## Tabla: products

Producto normalizado. Un registro por producto, independiente de la tienda.

```sql
CREATE TABLE products (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Identificación
  external_id     TEXT NOT NULL,          -- ID en la tienda origen (ej: ML ID)
  source          TEXT NOT NULL,          -- 'mercadolibre' | 'fravega' | 'garbarino'
  url             TEXT NOT NULL,          -- Link directo al producto en la tienda
  
  -- Clasificación
  category        TEXT NOT NULL,          -- 'notebook' | 'desktop' | 'tablet' | 'tv'
  brand           TEXT,
  model           TEXT,
  title           TEXT NOT NULL,          -- Título original de la tienda
  
  -- Specs normalizadas (extraídas por LLM o reglas del título)
  specs           JSONB NOT NULL DEFAULT '{}',
  -- Estructura de specs según categoría, ver DOMAIN_KNOWLEDGE.md
  
  -- Componentes mejorables
  upgradeable     JSONB NOT NULL DEFAULT '{}',
  -- { "ram": true, "storage": true, "processor": false, "screen": false }
  
  -- Precios
  price_cash      NUMERIC(12,2),          -- Precio contado
  price_installment NUMERIC(12,2),        -- Precio cuota
  installment_count INT,                  -- Cantidad de cuotas
  installment_info TEXT,                  -- "12x $28.750 sin interés Naranja X"
  currency        TEXT DEFAULT 'ARS',
  
  -- Imágenes
  image_url       TEXT,
  images          TEXT[] DEFAULT '{}',
  
  -- Análisis generado por LLM (se cachea, no se regenera en cada búsqueda)
  quality_price_score   TEXT,             -- 'EXCELENTE' | 'MUY BUENO' | 'BUENO' | 'REGULAR'
  quality_price_analysis TEXT,            -- Texto explicativo generado por LLM
  analysis_generated_at TIMESTAMPTZ,
  
  -- Disponibilidad
  available       BOOLEAN DEFAULT true,
  stock           INT,
  
  -- Popularidad (se actualiza con clicks internos)
  click_count     INT DEFAULT 0,
  
  -- Patrocinado
  is_sponsored    BOOLEAN DEFAULT false,
  sponsor_score_boost NUMERIC(4,3) DEFAULT 0, -- máximo 0.1
  
  -- Vector embedding del producto (para búsqueda semántica)
  -- Se genera a partir de: título + specs normalizadas + categoría + uso ideal
  embedding       vector(1536),
  
  -- Metadata
  scraped_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### Estructura de specs por categoría:

```jsonc
// notebook / desktop
{
  "processor_brand": "AMD",           // AMD | Intel
  "processor_model": "Ryzen 5 5500U",
  "processor_tier": "mid",            // low | mid | high | enthusiast
  "ram_gb": 16,
  "ram_upgradeable": true,
  "storage_gb": 512,
  "storage_type": "SSD_NVME",        // HDD | SSD_SATA | SSD_NVME
  "storage_upgradeable": true,
  "gpu": "integrated",               // integrated | dedicated
  "gpu_model": null,                 // null si integrated
  "screen_inches": 15.6,
  "screen_resolution": "1920x1080",
  "screen_type": "IPS",             // TN | IPS | OLED | VA
  "has_numeric_keyboard": false,
  "weight_kg": 1.8,
  "battery_wh": 45,
  "os": "Windows 11",
  "ports": ["USB-A", "USB-C", "HDMI"],
  "connectivity": ["WiFi 6", "Bluetooth 5"]
}

// tablet
{
  "processor_model": "Apple M2",
  "ram_gb": 8,
  "storage_gb": 256,
  "storage_upgradeable": false,
  "screen_inches": 11,
  "has_cellular": false,
  "os": "iPadOS 17",
  "stylus_compatible": true
}
```

---

## Tabla: searches

Registro de búsquedas para caché semántico y análisis.

```sql
CREATE TABLE searches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Input del usuario
  raw_input       TEXT NOT NULL,          -- Texto original del usuario
  
  -- Slots extraídos por LLM
  slots           JSONB NOT NULL DEFAULT '{}',
  -- { category, use_cases, budget_monthly, budget_cash, preferences, excluded }
  
  -- Query expandida para embedding
  expanded_query  TEXT,
  
  -- Embedding de la query (para caché semántico)
  query_embedding vector(1536),
  
  -- IDs de productos resultantes (en orden)
  result_ids      UUID[] DEFAULT '{}',
  
  -- URL única para compartir
  share_token     TEXT UNIQUE DEFAULT encode(gen_random_bytes(6), 'base64'),
  
  -- Usuario (opcional)
  user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id      TEXT,                   -- Para usuarios anónimos
  
  -- Metadata
  result_count    INT DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### Estructura de slots:

```jsonc
{
  "category": "notebook",
  "use_cases": ["office", "multimedia"],    // ver DOMAIN_KNOWLEDGE.md
  "budget_monthly": 200000,                 // ARS, null si no mencionó
  "budget_cash": null,                      // ARS, null si no mencionó
  "preferences": {
    "os": "windows",                        // windows | macos | chromeos | any
    "brands_preferred": [],
    "brands_excluded": [],
    "portability": "any",                   // light | any | not_important
    "screen_size": "any"                    // small | medium | large | any
  },
  "excluded_product_ids": [],              // productos que el usuario rechazó
  "technical_filters": {
    "min_ram_gb": 16,
    "storage_type": "SSD_NVME",
    "gpu_required": false
  }
}
```

---

## Tabla: saved_products

Productos guardados por el usuario (para alertas).

```sql
CREATE TABLE saved_products (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id  UUID REFERENCES products(id) ON DELETE CASCADE,
  price_at_save NUMERIC(12,2),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, product_id)
);
```

---

## Tabla: price_history

Historial de precios para alertas y tendencias.

```sql
CREATE TABLE price_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID REFERENCES products(id) ON DELETE CASCADE,
  price_cash  NUMERIC(12,2),
  price_installment NUMERIC(12,2),
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Tabla: sponsored_placements

```sql
CREATE TABLE sponsored_placements (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advertiser    TEXT NOT NULL,
  product_ids   UUID[] NOT NULL,           -- productos que pueden aparecer patrocinados
  categories    TEXT[] DEFAULT '{}',       -- categorías donde aplica
  score_boost   NUMERIC(4,3) DEFAULT 0.05, -- boost al score (máx 0.10)
  min_relevance NUMERIC(4,3) DEFAULT 0.65, -- score mínimo para aparecer
  active        BOOLEAN DEFAULT true,
  starts_at     TIMESTAMPTZ,
  ends_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Índices críticos

```sql
-- Búsqueda vectorial HNSW (el más importante)
CREATE INDEX idx_products_embedding 
ON products USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Caché semántico de búsquedas
CREATE INDEX idx_searches_embedding 
ON searches USING hnsw (query_embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Filtros SQL frecuentes
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_available ON products(available);
CREATE INDEX idx_products_price_cash ON products(price_cash);
CREATE INDEX idx_products_price_installment ON products(price_installment);
CREATE INDEX idx_products_source ON products(source);
CREATE INDEX idx_products_sponsored ON products(is_sponsored) WHERE is_sponsored = true;

-- Búsqueda por share token
CREATE INDEX idx_searches_share_token ON searches(share_token);
```

---

## Función de búsqueda híbrida

```sql
CREATE OR REPLACE FUNCTION hybrid_search(
  query_embedding vector(1536),
  category_filter TEXT,
  max_price_cash NUMERIC DEFAULT NULL,
  max_price_installment NUMERIC DEFAULT NULL,
  require_gpu BOOLEAN DEFAULT FALSE,
  min_ram_gb INT DEFAULT NULL,
  require_ssd BOOLEAN DEFAULT FALSE,
  limit_results INT DEFAULT 10,
  offset_results INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  similarity NUMERIC,
  is_sponsored BOOLEAN
)
LANGUAGE SQL
AS $$
  SELECT 
    p.id,
    (1 - (p.embedding <=> query_embedding))::NUMERIC AS similarity,
    p.is_sponsored
  FROM products p
  WHERE 
    p.available = true
    AND p.embedding IS NOT NULL
    AND (category_filter IS NULL OR p.category = category_filter)
    AND (max_price_cash IS NULL OR p.price_cash <= max_price_cash)
    AND (max_price_installment IS NULL OR p.price_installment <= max_price_installment)
    AND (require_gpu = false OR (p.specs->>'gpu') = 'dedicated')
    AND (min_ram_gb IS NULL OR (p.specs->>'ram_gb')::INT >= min_ram_gb)
    AND (require_ssd = false OR (p.specs->>'storage_type') LIKE 'SSD%')
  ORDER BY similarity DESC
  LIMIT limit_results
  OFFSET offset_results;
$$;
```
