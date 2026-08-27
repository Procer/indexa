import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db/sql";
import { withBasePath } from "@/lib/basePath";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/searches/sync — asocia búsquedas guardadas (share_token, ya en el
// localStorage del navegador) a un email, sin cuenta ni login. Mismo patrón
// que app/api/alerts/route.ts: upsert por email reusando el manage_token si
// ya existía. A diferencia de las alertas, acá SÍ mandamos el link por mail
// de una — es el punto central de la feature (verlo en otro dispositivo).
export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    email?: string;
    shareTokens?: string[];
  };

  const email = body.email?.trim().toLowerCase();
  const shareTokens = (body.shareTokens ?? []).filter(Boolean);

  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Email inválido" }, { status: 400 });
  }

  const [existing] = await sql<
    { manage_token: string; share_tokens: string[] }[]
  >`
    SELECT manage_token, share_tokens
    FROM saved_search_contacts
    WHERE email = ${email}
  `;

  const manageToken = existing?.manage_token ?? randomUUID();
  const mergedTokens = Array.from(
    new Set([...(existing?.share_tokens ?? []), ...shareTokens])
  );

  try {
    await sql`
      INSERT INTO saved_search_contacts (email, manage_token, share_tokens, updated_at)
      VALUES (
        ${email}, ${manageToken}::uuid, ${mergedTokens}::text[], ${new Date().toISOString()}
      )
      ON CONFLICT (email) DO UPDATE SET
        manage_token = EXCLUDED.manage_token,
        share_tokens = EXCLUDED.share_tokens,
        updated_at   = EXCLUDED.updated_at
    `;
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }

  const link = `${request.nextUrl.origin}${withBasePath(`/mis-busquedas/${manageToken}`)}`;

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: "TechSearch AR <alertas@techsearch.ar>",
      to: email,
      subject: "Tus búsquedas guardadas",
      html: buildEmailHtml(link, mergedTokens.length),
    });
  } catch {
    // No bloqueamos la respuesta si el mail falla — el manage_token igual
    // queda guardado y el usuario puede reintentar.
  }

  return NextResponse.json({ manage_token: manageToken }, { status: 201 });
}

function buildEmailHtml(link: string, count: number): string {
  return `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:sans-serif">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
    <div style="background:#2563eb;padding:24px 32px">
      <p style="margin:0;color:#fff;font-size:13px;letter-spacing:.05em;text-transform:uppercase">TechSearch AR · Tus búsquedas</p>
    </div>
    <div style="padding:32px">
      <h1 style="margin:0 0 8px;font-size:18px;color:#111">Accedé a tus búsquedas guardadas</h1>
      <p style="margin:0 0 24px;color:#6b7280;font-size:14px">
        Tenés ${count} búsqueda${count === 1 ? "" : "s"} guardada${count === 1 ? "" : "s"}. Abrí este link desde cualquier dispositivo para verlas.
      </p>
      <a href="${link}" style="display:block;background:#2563eb;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:8px;font-weight:600;font-size:15px">Ver mis búsquedas →</a>
    </div>
    <div style="padding:16px 32px;background:#f9fafb;text-align:center">
      <p style="margin:0;font-size:12px;color:#9ca3af">Guardá este link — es tu acceso, no hace falta contraseña.</p>
    </div>
  </div>
</body>
</html>`;
}
