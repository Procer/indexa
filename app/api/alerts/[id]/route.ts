import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db/supabase";

// DELETE /api/alerts/[id]?token=... — desactiva una alerta (requiere el manage_token del dueño)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Falta el token" }, { status: 400 });
  }

  const { error } = await supabase
    .from("price_alerts")
    .update({ is_active: false })
    .eq("id", params.id)
    .eq("manage_token", token);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
