import { NextResponse } from "next/server";
import { getHomeSponsor } from "@/lib/db/queries";
import type { HomeSponsor, ProductCategory } from "@/types";

// Sin esto Next lo prerenderiza estático en el build (no lee cookies/params) y
// sirve para siempre el estado que hubiera al compilar.
export const dynamic = "force-dynamic";

// GET /api/sponsored/home — colocación patrocinada a mostrar en la pantalla de
// entrada (chat guiado). Público, sin auth. { sponsor: null } si no hay ninguna.
export async function GET() {
  try {
    const row = await getHomeSponsor();
    if (!row) {
      return NextResponse.json({ sponsor: null });
    }
    const sponsor: HomeSponsor = {
      advertiser: row.advertiser,
      source: row.target_source,
      categories: row.categories as ProductCategory[],
    };
    return NextResponse.json({ sponsor });
  } catch {
    return NextResponse.json({ sponsor: null });
  }
}
