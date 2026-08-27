# PHASE_3.md — Fase 3: Celulares + Expansión de tiendas

## Prerequisito

Fase 2 completada. Producto validado con usuarios reales.
Datos reales de ML funcionando. Alertas de precio activas.

---

## Objetivo de la fase

Agregar celulares (mercado más complejo y competitivo).
Agregar fuentes de datos adicionales vía scraping cuando no hay API.
Explorar expansión regional.

---

## Tareas

### TASK-301: Celulares

```
Celulares requieren un modelo de recomendación diferente:
  - El uso es más personal (cámara, batería, tamaño)
  - La oferta es enorme (cientos de modelos)
  - Las cuotas y precios varían mucho por operadora vs libre

Extender DOMAIN_KNOWLEDGE.md con:
  use_cases para celulares: photography, battery_life, gaming_mobile, 
  basic_use, social_media, professional
  
Specs específicas de celulares:
  - processor_chip: Snapdragon | Dimensity | Apple A | Exynos | Tensor
  - ram_gb
  - storage_gb (no upgradeable en la mayoría)
  - main_camera_mp
  - battery_mah
  - screen_inches
  - screen_type: AMOLED | IPS | LTPO
  - refresh_rate_hz
  - nfc: boolean
  - 5g: boolean
  - os: Android | iOS
  - brand (muy relevante en celulares: Apple, Samsung, Motorola, Xiaomi)
```

### TASK-302: Scraping con Playwright (tiendas sin API)

```
Crear /lib/sources/playwright/ para tiendas sin API oficial.
Targets iniciales: Frávega, Garbarino (si no tienen API en Fase 2).

Implementar con:
  - Rotación de user agents
  - Delays aleatorios entre requests
  - Manejo de CAPTCHAs si aparecen
  - Respeto de robots.txt
  - Rate limiting conservador

Deploy del scraper en Railway (separado del frontend).
Ejecutar en horarios de baja carga del sitio scrapeado.

IMPORTANTE: Verificar términos de uso de cada sitio antes de scrapear.
Priorizar siempre acuerdos formales sobre scraping.
```

### TASK-303: Expansión regional (investigación)

```
Evaluar viabilidad para Chile, Uruguay, Colombia:
  - ¿MercadoLibre tiene API diferente por país? (Sí, por site_id)
  - ¿Los competidores locales tienen API?
  - ¿El modelo de precios/cuotas aplica igual?
  - ¿El lenguaje de los tags funciona igual (es el mismo español)?

Para expandir a un nuevo país:
  - Agregar site_id de ML para ese país
  - Agregar moneda y símbolo
  - Ajustar formato de precios
  - Revisar si los use_cases y tags aplican culturalmente
```
