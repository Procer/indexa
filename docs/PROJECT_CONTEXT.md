# PROJECT_CONTEXT.md — Contexto completo del producto

## Problema que resuelve

La mayoría de las personas en Argentina no sabe qué notebook, PC o tablet comprar. No porque no quieran informarse, sino porque el lenguaje técnico es una barrera real. Buscan en MercadoLibre o Frávega y se enfrentan a especificaciones que no entienden: "Ryzen 5 5500U", "IPS 144Hz", "NVMe PCIe". El resultado es que compran mal, o no compran.

Este producto traduce la intención de uso real del usuario en una recomendación técnica concreta, devuelve productos disponibles para comprar hoy en tiendas argentinas, y explica en lenguaje simple por qué cada opción fue seleccionada.

---

## Usuario objetivo

Dos perfiles principales:

**Perfil A — Usuario no técnico (mayoría):**
No conoce specs. Sabe qué quiere hacer con el equipo. Puede decir "quiero algo rápido para trabajar" o "para mi hijo que estudia". No puede decir cuánta RAM necesita.

**Perfil B — Usuario semi-técnico:**
Conoce algunos términos. Puede filtrar por SSD, o saber que quiere "algo con buena pantalla para diseño". El sistema debe responderle también en ese nivel si lo pide.

El sistema prioriza el Perfil A en UX pero no limita al Perfil B.

---

## Cómo funciona para el usuario

### Flujo principal (input directo):

```
Usuario escribe:
"Quiero una notebook para trabajar con Excel y Word todo el día,
ver películas a la noche. Por mes puedo pagar hasta $200.000"

Sistema responde:
→ 10 tarjetas de productos reales con precio, cuotas y link de compra
→ Cada tarjeta con análisis calidad/precio
→ Cada tarjeta con explicación de por qué fue seleccionada
→ Tags de refinamiento para ajustar los resultados
```

### Flujo guiado (input ambiguo):

```
Usuario escribe:
"Quiero cambiar mi notebook"

Sistema responde con pregunta + tags funcionales:
"¿Para qué la vas a usar principalmente?"
[Trabajo y oficina] [Estudio] [Diseño o video] [Gaming] [Solo navegar y redes]

Usuario selecciona [Trabajo y oficina]

Sistema pregunta:
"¿Cuánto podés invertir por mes en cuotas?"
[Hasta $100.000] [Hasta $200.000] [Hasta $400.000] [Prefiero pagar en efectivo]

→ Con 2-3 respuestas, el sistema tiene suficiente para buscar
```

### Tags de refinamiento sobre resultados:

Después de mostrar resultados, el usuario puede refinar sin saber de tecnología:

```
[Que encienda más rápido] → SSD NVMe, más RAM
[Más liviana para llevar] → menos de 1.5kg, factor de forma
[Con mejor pantalla]      → resolución, tipo de panel
[Más económica]           → filtro de precio hacia abajo
[De otra marca]           → excluir marcas mostradas
[Que dure más la batería] → filtro autonomía
```

Nunca aparece un tag como [SSD 512GB] o [16GB RAM DDR5]. Siempre funcional.

---

## Tarjeta de producto — contenido exacto

```
┌────────────────────────────────────────────────┐
│ [PATROCINADO]  ← solo si aplica, con badge     │
│                                                │
│ [Foto]  Lenovo IdeaPad 3 15.6"                 │
│         AMD Ryzen 5 | 16GB RAM | SSD 512GB     │
│                                                │
│ Precio contado:     $284.999                   │
│ En cuotas:          12x $28.750 sin interés    │
│                     (Tarjeta Naranja X)        │
│                                                │
│ ★ Análisis calidad/precio: MUY BUENO           │
│ "Buena relación precio/prestación para uso     │
│  de oficina. El procesador maneja sin          │
│  problemas múltiples pestañas y Office.        │
│  La pantalla Full HD es adecuada para          │
│  trabajo diario."                              │
│                                                │
│ ✓ Seleccionada porque:                         │
│ "Tiene SSD (enciende en segundos), RAM         │
│  suficiente para Office y navegación, y        │
│  pantalla cómoda para ver contenido."          │
│                                                │
│ ⚠️ A tener en cuenta:                          │
│ "La RAM es ampliable si en el futuro           │
│  necesitás más velocidad."                     │
│                                                │
│ [Ver en MercadoLibre ↗]  [+ Comparar]         │
└────────────────────────────────────────────────┘
```

---

## Comparación de productos

- Hasta 5 productos simultáneos
- Layout: una columna por producto, filas por atributo
- Filas en lenguaje mixto: funcional para el usuario no técnico, técnico disponible
- Atributos comparados:

```
Precio contado / en cuotas
Velocidad general (procesador traducido)
Memoria de trabajo (RAM traducida)
Almacenamiento (tipo y tamaño)
Pantalla (tamaño, calidad)
Peso y portabilidad
Duración de batería estimada
Qué se puede mejorar después
Análisis calidad/precio
Puntaje general para tu uso [calculado según slots del usuario]
```

---

## Guardar búsquedas y alertas

**Sin registro:**
- La búsqueda se guarda automáticamente en localStorage
- Se genera una URL única: `techsearch.ar/b/a3f9x2`
- El usuario puede bookmarkearla o compartirla

**Con registro (email o Google):**
- Búsquedas sincronizadas entre dispositivos
- Alerta de cambio de precio en productos guardados
- Historial de búsquedas

El sistema sugiere registrarse solo después de que el usuario obtiene su primer resultado útil, no antes.

---

## Monetización

**Resultados patrocinados:**
- Tiendas o marcas pagan para que sus productos aparezcan primero
- El patrocinado solo aparece si es relevante para la búsqueda (score mínimo de relevancia)
- Badge visible "Patrocinado" en la tarjeta
- Aparecen en las primeras 1-2 posiciones, el resto son resultados orgánicos
- No hay sección separada: están integrados pero claramente identificados

**Regla de negocio:** un producto patrocinado con baja relevancia para la búsqueda no aparece, aunque el anunciante pague. Protege la credibilidad del sistema.

---

## Mercado y fases de expansión

**MVP:** Argentina, notebooks y PCs de escritorio
**Fase 2:** Tablets y TVs (misma geografía)
**Fase 3:** Celulares
**Fase 4:** Expansión regional (Chile, Uruguay, Colombia)

---

## Fuentes de datos

**MVP:** MercadoLibre API oficial
**Fase 2:** + Frávega API (si disponible) + Garbarino API (si disponible)
**Fase 3:** Playwright como fallback para sitios sin API

Los precios se actualizan una vez al día. Cada tarjeta muestra timestamp de última actualización. Al hacer click en "Ver producto" se abre el link directo a la tienda donde el precio es en tiempo real.
