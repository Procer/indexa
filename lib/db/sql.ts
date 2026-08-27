import postgres from "postgres";

// Cliente Postgres directo (postgres.js) contra la base en el VPS —
// reemplaza al cliente Supabase/PostgREST. Todas las llamadas del server
// van por acá: sin hop HTTP, sin São Paulo, conexión por socket local.
//
// El pool se crea de forma PEREZOSA (en la primera query real), no al
// importar el módulo — así `next build` no rompe si DATABASE_URL todavía no
// está en el entorno de build. Se cachea en globalThis para sobrevivir el
// hot-reload de `next dev`.

type Sql = ReturnType<typeof postgres>;

declare global {
  // eslint-disable-next-line no-var
  var __techsearch_sql__: Sql | undefined;
}

let pool: Sql | undefined = globalThis.__techsearch_sql__;

function getPool(): Sql {
  if (pool) return pool;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL no está seteada — ver db/vps/README.md (Fase 3)."
    );
  }

  pool = postgres(url, {
    max: 12, // pool chico: la app corre en el mismo box que Postgres
    idle_timeout: 20, // cerrar conexiones ociosas a los 20 s
    connect_timeout: 10,
    // localhost → sin SSL salvo que la URL lo pida explícitamente
    ssl: url.includes("sslmode=require") ? "require" : false,
    types: {
      // NUMERIC/DECIMAL (OID 1700) → number. PostgREST los devolvía como
      // number y toda la app los trata así (price_cash, target_price, etc.).
      // Precisión de float alcanza de sobra para pesos argentinos.
      numeric: {
        to: 0,
        from: [1700],
        serialize: (x: number | string) => String(x),
        parse: (x: string) => parseFloat(x),
      },
      // date/timestamp/timestamptz → string ISO, igual que devolvía PostgREST.
      // (postgres.js por default los convierte a Date; la app espera strings.)
      date: {
        to: 1184,
        from: [1082, 1083, 1114, 1184],
        serialize: (x: string | Date) =>
          x instanceof Date ? x.toISOString() : x,
        parse: (x: string) => new Date(x).toISOString(),
      },
    },
  });

  if (process.env.NODE_ENV !== "production") {
    globalThis.__techsearch_sql__ = pool;
  }
  return pool;
}

// `sql` se comporta igual que el cliente de postgres.js (tagged template,
// sql(obj) para helpers, sql.json(), sql.begin(), etc.) pero difiere la
// creación del pool al primer uso.
export const sql: Sql = new Proxy(function () {} as unknown as Sql, {
  apply(_target, _thisArg, args: unknown[]) {
    return (getPool() as unknown as (...a: unknown[]) => unknown)(...args);
  },
  get(_target, prop: string | symbol) {
    const client = getPool() as unknown as Record<string | symbol, unknown>;
    const value = client[prop];
    return typeof value === "function"
      ? (value as (...a: unknown[]) => unknown).bind(client)
      : value;
  },
});

// Serializa un embedding (number[]) al literal que espera una columna/param
// `vector(1536)` de pgvector: '[0.1,0.2,...]'. Usar así:
//   await sql`... hybrid_search(${toVector(emb)}::vector(1536), ...)`
export function toVector(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

// pgvector devuelve los vectores como texto ('[0.1,0.2,...]'). Lo volvemos
// a number[] cuando la app lo necesita (re-derivar el pool en /more).
export function parseVector(value: unknown): number[] {
  if (Array.isArray(value)) return value as number[];
  if (typeof value === "string") {
    return JSON.parse(value) as number[];
  }
  return [];
}
