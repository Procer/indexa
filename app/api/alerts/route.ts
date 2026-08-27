import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db/sql";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/alerts — crea o actualiza una alerta de precio anónima, identificada por email.
// Reusa el manage_token de otras alertas del mismo email para que un solo link
// de "ver mis alertas" muestre todas.
export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    product_id?: string;
    target_price?: number;
    email?: string;
  };

  const email = body.email?.trim().toLowerCase();

  if (!body.product_id || body.target_price == null || body.target_price <= 0) {
    return NextResponse.json(
      { error: "product_id y target_price son requeridos" },
      { status: 400 }
    );
  }
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Email inválido" }, { status: 400 });
  }
  if (!UUID_RE.test(body.product_id)) {
    return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
  }

  try {
    const [product] = await sql<{ id: string }[]>`
      SELECT id FROM products WHERE id = ${body.product_id}::uuid
    `;
    if (!product) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    }

    const [existing] = await sql<{ manage_token: string }[]>`
      SELECT manage_token FROM price_alerts WHERE email = ${email} LIMIT 1
    `;
    const manageToken = existing?.manage_token ?? randomUUID();

    const [alert] = await sql`
      INSERT INTO price_alerts (email, product_id, target_price, manage_token, is_active)
      VALUES (${email}, ${body.product_id}::uuid, ${body.target_price}, ${manageToken}::uuid, true)
      ON CONFLICT (email, product_id) DO UPDATE SET
        target_price = EXCLUDED.target_price,
        manage_token = EXCLUDED.manage_token,
        is_active    = true
      RETURNING *
    `;

    return NextResponse.json(
      { alert, manage_token: manageToken },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
