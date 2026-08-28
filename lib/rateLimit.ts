// Rate limiting en memoria del proceso — reemplaza a Upstash Redis, que se
// sacó junto con Supabase (ver db/vps/README.md). La app corre en un solo
// proceso PM2 (`indexa`, fork mode) en el VPS, así que un Map en memoria
// alcanza: no necesitamos estado compartido entre instancias.
//
// Ventana fija por (prefix, identifier): se cuenta cuántas requests entraron
// en la ventana actual; al vencer, el contador se reinicia. Simple y sin
// dependencias. Si en el futuro la app escala a varias instancias, migrar a
// un contador en Postgres o volver a un Redis.

interface Bucket {
  count: number;
  resetAt: number; // epoch ms
}

const buckets = new Map<string, Bucket>();

// Limpieza perezosa: cada tanto barremos los buckets vencidos para que el
// Map no crezca sin límite con IPs que no vuelven.
let lastSweep = Date.now();
function sweepIfNeeded(now: number): void {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, b] of Array.from(buckets.entries())) {
    if (b.resetAt <= now) buckets.delete(key);
  }
}

export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

export async function checkRateLimit(
  prefix: string,
  identifier: string,
  requests: number,
  windowSeconds: number
): Promise<{ success: boolean }> {
  const now = Date.now();
  sweepIfNeeded(now);

  const key = `${prefix}:${identifier}`;
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { success: true };
  }

  if (bucket.count >= requests) {
    return { success: false };
  }

  bucket.count++;
  return { success: true };
}
