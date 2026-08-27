import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db/supabase";

const ALLOWED_EVENT_TYPES = new Set([
  "session_start",
  "product_view_details",
  "product_compare_add",
  "time_on_page",
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

  const { error } = await supabase.from("site_events").insert({
    event_type: body.eventType,
    visit_id: body.visitId,
    product_id: body.productId ?? null,
    path: typeof body.path === "string" ? body.path.slice(0, 500) : null,
    duration_ms: typeof body.durationMs === "number" && body.durationMs >= 0 ? Math.round(body.durationMs) : null,
    metadata: body.metadata ?? null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
