# PHASE_2.md — Fase 2: Datos reales + Features de retención

## Prerequisito

Fase 1 completada y validada. Al menos 100 búsquedas reales de usuarios
para tener datos propios de popularidad y comportamiento.

---

## Objetivo de la fase

Reemplazar datos mock con datos reales de MercadoLibre.
Agregar registro de usuarios y alertas de precio.
Expandir catálogo a tablets y TVs.
Activar boost de popularidad con datos propios.

---

## Tareas

### TASK-201: Integración MercadoLibre API oficial

```
Registrar aplicación en MercadoLibre Developers.
Implementar /lib/sources/mercadolibre.ts:
  - OAuth 2.0 para autenticación
  - Endpoint de búsqueda por categoría
  - Endpoint de detalle de producto (specs, fotos, cuotas)
  - Rate limiting: respetar límites de la API oficial
  - Manejo de errores y reintentos

Crear /scripts/syncFromML.ts:
  - Buscar notebooks y PCs en categorías correctas de ML Argentina
  - Normalizar specs desde atributos de ML (inconsistentes por vendedor)
  - Si los atributos no tienen datos suficientes → usar LLM para extraer del título
  - Actualizar precios de productos existentes
  - Marcar como unavailable los que ya no existen
  - Generar embeddings para productos nuevos
  - Ejecutar una vez al día (cron en Railway o Vercel Cron)

Investigar si Frávega y Garbarino tienen APIs públicas.
Si tienen: implementar conectores similares.
Si no tienen: documentar para Fase 3 (Playwright).
```

### TASK-202: Normalización de specs con pipeline híbrido

```
Implementar /lib/normalizer/specsExtractor.ts:
  - Paso 1: intentar extraer specs de atributos oficiales de ML
  - Paso 2: si faltan campos críticos → extraer del título con regex
  - Paso 3: si regex falla → llamar LLM (GPT-4o mini) para extraer
  - Guardar resultado normalizado en products.specs

El LLM solo se llama cuando los pasos 1 y 2 fallan.
Esto minimiza costo: la mayoría de productos se normalizan sin LLM.
```

### TASK-203: Registro de usuarios y auth

```
Configurar Supabase Auth:
  - Magic link (email, sin contraseña)
  - Google OAuth

Crear /app/auth/ páginas mínimas.
Crear /components/AuthModal.tsx:
  - Se muestra después del primer resultado útil
  - Propuesta de valor clara: "Guardá tus búsquedas y recibí alertas de precio"
  - No bloquea el uso sin registro

Implementar sincronización de búsquedas locales al registrarse.
```

### TASK-204: Alertas de precio

```
Crear /app/api/alerts/route.ts:
  - Suscribir usuario a alertas de un producto
  - Requiere email (con o sin cuenta completa)

Crear /scripts/checkPriceAlerts.ts (cron diario):
  - Para cada producto con suscriptores, comparar precio actual vs precio al guardar
  - Si bajó más de 5% → enviar email de alerta
  - Usar Resend o similar para emails transaccionales

Crear /app/api/alerts/unsubscribe/route.ts:
  - Link de unsuscribe en cada email
```

### TASK-205: Tablets y TVs

```
Agregar categorías tablet y tv al sistema:
  - Extender DOMAIN_KNOWLEDGE.md con specs y use_cases específicos
  - Agregar a tabla de uso → specs
  - Extender slot-filling prompt para reconocer estas categorías
  - Agregar 30 tablets mock (hasta tener datos reales de ML)
  - Agregar 20 TVs mock

Para TVs, agregar specs específicas:
  - panel_type: OLED | QLED | LED | NanoCell
  - refresh_rate_hz: 60 | 120 | 144
  - hdr_support: boolean
  - smart_os: webOS | Tizen | Google TV | Android TV
  - screen_inches: number
  - resolution: HD | FHD | 4K | 8K
```

### TASK-206: Boost de popularidad

```
Una vez que haya datos propios de clicks:
Activar en /lib/search/scorer.ts:
  score += Math.log(product.click_count + 1) * 0.015

Crear endpoint para registrar clicks:
  POST /api/analytics/click
  Body: { productId, searchId, position }
  
Esto alimenta el campo click_count en products.
```

### TASK-207: Patrocinados — panel básico

```
Crear interfaz mínima de administración para patrocinados:
  /admin/sponsored (protegida por auth de admin)
  - Ver placements activos
  - Crear/pausar placement
  - Configurar score_boost y min_relevance

No necesita ser un producto completo, solo funcional para vos.
```
