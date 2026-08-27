import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db/supabase";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

  const { data: product } = await supabase
    .from("products")
    .select("id")
    .eq("id", body.product_id)
    .single();

  if (!product) {
    return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
  }

  const { data: existing } = await supabase
    .from("price_alerts")
    .select("manage_token")
    .eq("email", email)
    .limit(1)
    .maybeSingle();

  const manageToken = existing?.manage_token ?? randomUUID();

  const { data, error } = await supabase
    .from("price_alerts")
    .upsert(
      {
        email,
        product_id: body.product_id,
        target_price: body.target_price,
        manage_token: manageToken,
        is_active: true,
      },
      { onConflict: "email,product_id" }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ alert: data, manage_token: manageToken }, { status: 201 });
}
