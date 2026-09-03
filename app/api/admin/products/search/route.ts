import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db/sql";
import { getAdminSession } from "@/lib/auth/adminSession";

// GET /api/admin/products/search?q=... — busca productos por título para el panel de patrocinados
export async function GET(request: NextRequest) {
  if (!(await getAdminSession(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ products: [] });
  }

  try {
    const data = await sql<
      {
        id: string;
        title: string;
        brand: string | null;
        category: string;
        price_cash: number | null;
        image_url: string | null;
      }[]
    >`
      SELECT id, title, brand, category, price_cash, image_url
      FROM products
      WHERE title ILIKE ${"%" + q + "%"}
        AND available = true
      ORDER BY click_count DESC
      LIMIT 10
    `;
    return NextResponse.json({ products: data });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
