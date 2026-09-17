import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db/sql";

const ALLOWED_EVENT_TYPES = new Set([
  "session_start",
  "product_view_details",
  "product_compare_add",
  "product_ask_about",
  "product_buy_click",
  "time_on_page",
  "client_error",
  "visitor_label",
]);

// POST /api/events — tracking anónimo genérico (entrada al sitio, ver
// detalles, agregar a comparar, tiempo en página). No requiere auth: es
// telemetría de uso, no una acción sobre datos del usuario. Validación
// mínima para no dejar pasar basura al recibir sendBeacon del cliente.
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    eventType?: string;
    visitId?: string;
    productId?: string;
    path?: string;
    durationMs?: number;
    metadata?: Record<string, unknown>;
  } | null;

  if (!body || !ALLOWED_EVENT_TYPES.has(body.eventType ?? "")) {
    return NextResponse.json({ error: "invalid eventType" }, { status: 400 });
  }
  if (typeof body.visitId !== "string" || body.visitId.length < 8 || body.visitId.length > 100) {
    return NextResponse.json({ error: "invalid visitId" }, { status: 400 });
  }

  try {
    await sql`
      INSERT INTO site_events (event_type, visit_id, product_id, path, duration_ms, metadata)
      VALUES (
        ${body.eventType!},
        ${body.visitId},
        ${body.productId ?? null},
        ${typeof body.path === "string" ? body.path.slice(0, 500) : null},
        ${typeof body.durationMs === "number" && body.durationMs >= 0 ? Math.round(body.durationMs) : null},
        ${body.metadata ? sql.json(body.metadata as never) : null}
      )
    `;
  } catch (error) {
    // Antes fallaba en silencio (sin console.error) — el CHECK desactualizado
    // de site_events rechazaba product_ask_about/product_buy_click y nadie lo
    // notaba porque el cliente hace .catch(() => {}) sobre este endpoint.
    // Con esto, un 500 real (ej. un event_type nuevo que se olvidó agregar al
    // CHECK de la DB) sí queda en el log del servidor.
    console.error(`[POST /api/events] eventType=${body.eventType}`, error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
