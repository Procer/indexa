import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db/sql";
import { getAdminSession } from "@/lib/auth/adminSession";

const ALLOWED_HOURS = [1, 6, 24, 72, 168];

// GET /api/admin/sessions — panel de revisión de una prueba con varias
// personas (2026-09-11).
//
// - `?visitId=X`: línea de tiempo completa de esa visita (searches +
//   chat_messages + product_clicks + site_events intercalados por fecha),
//   para reconstruir qué hizo/preguntó/vio esa persona puntual.
// - sin parámetros: dashboard — resumen (`summary`), errores recientes
//   (`recentErrors`, siempre los últimos 30 sin importar `hours`, para no
//   perder de vista un error viejo si la ventana es corta) y un feed de
//   actividad reciente mezclando TODAS las visitas (`recentActivity`), más
//   la tabla por visita de siempre (`visits`).
export async function GET(request: NextRequest) {
  if (!(await getAdminSession(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const visitId = request.nextUrl.searchParams.get("visitId");

  if (visitId) {
    const rows = await sql<{ kind: string; created_at: string; data: Record<string, unknown> }[]>`
      SELECT 'search' AS kind, s.created_at,
        jsonb_build_object('raw_input', s.raw_input, 'share_token', s.share_token, 'result_count', s.result_count) AS data
      FROM searches s WHERE s.visit_id = ${visitId}
      UNION ALL
      SELECT 'chat' AS kind, c.created_at,
        jsonb_build_object(
          'user_message', c.user_message, 'assistant_reply', c.assistant_reply,
          'greeting', c.greeting, 'factual_answer', c.factual_answer, 'context', c.context,
          'share_token', c.share_token, 'duration_ms', c.duration_ms
        ) AS data
      FROM chat_messages c WHERE c.visit_id = ${visitId}
      UNION ALL
      SELECT 'click' AS kind, pc.created_at,
        jsonb_build_object('product_title', p.title, 'product_id', pc.product_id, 'search_share_token', pc.search_share_token) AS data
      FROM product_clicks pc LEFT JOIN products p ON p.id = pc.product_id
      WHERE pc.visit_id = ${visitId}
      UNION ALL
      SELECT 'event' AS kind, e.created_at,
        jsonb_build_object('event_type', e.event_type, 'path', e.path, 'metadata', e.metadata, 'duration_ms', e.duration_ms) AS data
      FROM site_events e WHERE e.visit_id = ${visitId}
      ORDER BY created_at ASC
    `;
    return NextResponse.json({ visitId, timeline: rows });
  }

  const hoursParam = Number(request.nextUrl.searchParams.get("hours"));
  const hours = ALLOWED_HOURS.includes(hoursParam) ? hoursParam : 24;
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  const [summaryRows, recentErrors, recentActivity, visits, names] = await Promise.all([
    sql<{ visits: number; searches: number; chats: number; clicks: number; errors: number }[]>`
      SELECT
        (SELECT count(DISTINCT visit_id) FROM (
          SELECT visit_id FROM searches WHERE visit_id IS NOT NULL AND created_at >= ${cutoff}
          UNION
          SELECT visit_id FROM chat_messages WHERE visit_id IS NOT NULL AND created_at >= ${cutoff}
          UNION
          SELECT visit_id FROM site_events WHERE visit_id IS NOT NULL AND created_at >= ${cutoff}
        ) v)::int AS visits,
        (SELECT count(*) FROM searches WHERE created_at >= ${cutoff})::int AS searches,
        (SELECT count(*) FROM chat_messages WHERE created_at >= ${cutoff})::int AS chats,
        (SELECT count(*) FROM product_clicks WHERE created_at >= ${cutoff})::int AS clicks,
        (SELECT count(*) FROM site_events WHERE event_type = 'client_error' AND created_at >= ${cutoff})::int AS errors
    `,
    sql<{ visit_id: string; path: string | null; metadata: Record<string, unknown> | null; created_at: string }[]>`
      SELECT visit_id, path, metadata, created_at
      FROM site_events
      WHERE event_type = 'client_error'
      ORDER BY created_at DESC
      LIMIT 30
    `,
    sql<{ kind: string; created_at: string; visit_id: string; data: Record<string, unknown> }[]>`
      (
        SELECT 'search' AS kind, s.created_at, s.visit_id,
          jsonb_build_object('raw_input', s.raw_input, 'result_count', s.result_count) AS data
        FROM searches s WHERE s.visit_id IS NOT NULL AND s.created_at >= ${cutoff}
        ORDER BY s.created_at DESC LIMIT 50
      )
      UNION ALL
      (
        SELECT 'chat' AS kind, c.created_at, c.visit_id,
          jsonb_build_object('user_message', c.user_message, 'assistant_reply', c.assistant_reply, 'greeting', c.greeting) AS data
        FROM chat_messages c WHERE c.visit_id IS NOT NULL AND c.created_at >= ${cutoff}
        ORDER BY c.created_at DESC LIMIT 50
      )
      UNION ALL
      (
        SELECT 'click' AS kind, pc.created_at, pc.visit_id,
          jsonb_build_object('product_title', p.title) AS data
        FROM product_clicks pc LEFT JOIN products p ON p.id = pc.product_id
        WHERE pc.visit_id IS NOT NULL AND pc.created_at >= ${cutoff}
        ORDER BY pc.created_at DESC LIMIT 50
      )
      ORDER BY created_at DESC
      LIMIT 60
    `,
    sql<
      {
        visit_id: string;
        searches: number;
        chats: number;
        clicks: number;
        errors: number;
        first_seen: string;
        last_seen: string;
      }[]
    >`
      WITH combined AS (
        SELECT visit_id, created_at, 'search' AS kind, NULL::text AS event_type FROM searches WHERE visit_id IS NOT NULL
        UNION ALL
        SELECT visit_id, created_at, 'chat' AS kind, NULL::text FROM chat_messages WHERE visit_id IS NOT NULL
        UNION ALL
        SELECT visit_id, created_at, 'click' AS kind, NULL::text FROM product_clicks WHERE visit_id IS NOT NULL
        UNION ALL
        SELECT visit_id, created_at, 'event' AS kind, event_type FROM site_events WHERE visit_id IS NOT NULL
      )
      SELECT
        visit_id,
        count(*) FILTER (WHERE kind = 'search')::int AS searches,
        count(*) FILTER (WHERE kind = 'chat')::int AS chats,
        count(*) FILTER (WHERE kind = 'click')::int AS clicks,
        count(*) FILTER (WHERE event_type = 'client_error')::int AS errors,
        min(created_at) AS first_seen,
        max(created_at) AS last_seen
      FROM combined
      GROUP BY visit_id
      ORDER BY max(created_at) DESC
      LIMIT 100
    `,
    // Nombre opcional que la persona tipeó una vez (VisitorNamePrompt) — el
    // más reciente por visit_id, para que el dashboard muestre "Juan" en vez
    // de un visit_id anónimo. DISTINCT ON requiere el mismo orden en
    // ORDER BY que la columna de desempate (visit_id, created_at DESC).
    sql<{ visit_id: string; name: string }[]>`
      SELECT DISTINCT ON (visit_id) visit_id, metadata->>'name' AS name
      FROM site_events
      WHERE event_type = 'visitor_label'
      ORDER BY visit_id, created_at DESC
    `,
  ]);

  return NextResponse.json({
    hours,
    summary: summaryRows[0],
    recentErrors,
    recentActivity,
    visits,
    names: Object.fromEntries(names.map((n) => [n.visit_id, n.name])),
  });
}
