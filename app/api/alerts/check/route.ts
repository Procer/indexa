import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db/sql";

interface AlertRow {
  id: string;
  user_id: string;
  target_price: number;
  product: {
    id: string;
    title: string;
    price_cash: number;
    url: string;
    image_url: string | null;
  };
  user_email: string;
}

// Fila plana del JOIN price_alerts + profiles + products.
interface RawAlert {
  id: string;
  user_id: string | null;
  email: string | null;
  target_price: number;
  profile_email: string | null;
  product_id: string | null;
  product_title: string | null;
  product_price_cash: number | null;
  product_url: string | null;
  product_image_url: string | null;
}

// Vercel Cron pega un GET con "Authorization: Bearer <CRON_SECRET>" automáticamente.
// Se acepta también "x-cron-secret" para disparos manuales o desde Railway.
function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const bearer = request.headers.get("authorization");
  if (bearer === `Bearer ${secret}`) return true;
  return request.headers.get("x-cron-secret") === secret;
}

// GET /api/alerts/check — endpoint que pega Vercel Cron (ver vercel.json)
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return runAlertsCheck();
}

// POST /api/alerts/check — mismo chequeo, para disparos manuales o desde Railway
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return runAlertsCheck();
}

async function runAlertsCheck() {
  // Un solo JOIN: alertas activas + producto + email del usuario vía profiles
  let alerts: RawAlert[];
  try {
    alerts = await sql<RawAlert[]>`
      SELECT
        pa.id,
        pa.user_id,
        pa.email,
        pa.target_price,
        pr.email      AS profile_email,
        p.id          AS product_id,
        p.title       AS product_title,
        p.price_cash  AS product_price_cash,
        p.url         AS product_url,
        p.image_url   AS product_image_url
      FROM price_alerts pa
      LEFT JOIN profiles pr ON pr.id = pa.user_id
      LEFT JOIN products p  ON p.id  = pa.product_id
      WHERE pa.is_active = true
    `;
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }

  const toNotify: AlertRow[] = [];

  for (const raw of alerts) {
    if (!raw.product_id || raw.product_price_cash == null) continue;
    // Alertas nuevas guardan el email directo; las viejas (atadas a user_id) lo sacan del profile.
    const recipientEmail = raw.email ?? raw.profile_email;
    if (!recipientEmail) continue;
    if (raw.product_price_cash > raw.target_price) continue;

    toNotify.push({
      id: raw.id,
      user_id: raw.user_id ?? "",
      target_price: raw.target_price,
      product: {
        id: raw.product_id,
        title: raw.product_title ?? "",
        price_cash: raw.product_price_cash,
        url: raw.product_url ?? "",
        image_url: raw.product_image_url,
      },
      user_email: recipientEmail,
    });
  }

  if (toNotify.length === 0) {
    return NextResponse.json({ notified: 0 });
  }

  // Enviar emails vía Resend
  const { Resend } = await import("resend");
  const resend = new Resend(process.env.RESEND_API_KEY);

  const results = await Promise.allSettled(
    toNotify.map((alert) =>
      resend.emails.send({
        from: "TechSearch AR <alertas@techsearch.ar>",
        to: alert.user_email,
        subject: `Bajó el precio: ${alert.product.title}`,
        html: buildEmailHtml(alert),
      })
    )
  );

  // Marcar como notificadas las que se enviaron correctamente
  const notifiedIds = toNotify
    .filter((_, i) => results[i].status === "fulfilled")
    .map((a) => a.id);

  if (notifiedIds.length > 0) {
    await sql`
      UPDATE price_alerts
      SET last_notified_at = ${new Date().toISOString()}
      WHERE id = ANY(${notifiedIds}::uuid[])
    `;
  }

  return NextResponse.json({ notified: notifiedIds.length, total: toNotify.length });
}

function buildEmailHtml(alert: AlertRow): string {
  const precio = new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  });

  return `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:sans-serif">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
    <div style="background:#2563eb;padding:24px 32px">
      <p style="margin:0;color:#fff;font-size:13px;letter-spacing:.05em;text-transform:uppercase">TechSearch AR · Alerta de precio</p>
    </div>
    <div style="padding:32px">
      ${alert.product.image_url ? `<img src="${alert.product.image_url}" alt="" style="width:100%;max-height:200px;object-fit:contain;border-radius:8px;margin-bottom:24px">` : ""}
      <h1 style="margin:0 0 8px;font-size:18px;color:#111">${alert.product.title}</h1>
      <p style="margin:0 0 24px;color:#6b7280;font-size:14px">El precio bajó a tu objetivo</p>
      <div style="display:flex;gap:16px;margin-bottom:24px">
        <div style="flex:1;background:#f0fdf4;border-radius:8px;padding:16px;text-align:center">
          <p style="margin:0 0 4px;font-size:12px;color:#16a34a;font-weight:600">PRECIO ACTUAL</p>
          <p style="margin:0;font-size:24px;font-weight:700;color:#15803d">${precio.format(alert.product.price_cash)}</p>
        </div>
        <div style="flex:1;background:#f9fafb;border-radius:8px;padding:16px;text-align:center">
          <p style="margin:0 0 4px;font-size:12px;color:#6b7280;font-weight600">TU OBJETIVO</p>
          <p style="margin:0;font-size:24px;font-weight:700;color:#374151">${precio.format(alert.target_price)}</p>
        </div>
      </div>
      <a href="${alert.product.url}" style="display:block;background:#2563eb;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:8px;font-weight:600;font-size:15px">Ver producto →</a>
    </div>
    <div style="padding:16px 32px;background:#f9fafb;text-align:center">
      <p style="margin:0;font-size:12px;color:#9ca3af">Para dejar de recibir alertas, ingresá a TechSearch AR y desactivá la alerta.</p>
    </div>
  </div>
</body>
</html>`;
}
