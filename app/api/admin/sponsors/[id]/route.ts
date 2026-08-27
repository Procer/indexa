import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db/supabase";
import { getAdminUser } from "@/lib/auth/adminAuth";

// PATCH /api/admin/sponsors/[id] — toggle active o actualizar campos
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!(await getAdminUser(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as Record<string, unknown>;

  const { data, error } = await supabase
    .from("sponsored_placements")
    .update(body)
    .eq("id", params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ placement: data });
}

// DELETE /api/admin/sponsors/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!(await getAdminUser(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await supabase
    .from("sponsored_placements")
    .delete()
    .eq("id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
