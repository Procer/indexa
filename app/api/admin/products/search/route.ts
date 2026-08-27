import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db/supabase";
import { getAdminUser } from "@/lib/auth/adminAuth";

// GET /api/admin/products/search?q=... — busca productos por título para el panel de patrocinados
export async function GET(request: NextRequest) {
  if (!(await getAdminUser(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ products: [] });
  }

  const { data, error } = await supabase
    .from("products")
    .select("id, title, brand, category, price_cash, image_url")
    .ilike("title", `%${q}%`)
    .eq("available", true)
    .order("click_count", { ascending: false })
    .limit(10);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ products: data ?? [] });
}
