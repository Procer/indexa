import { NextRequest, NextResponse } from "next/server";
import { getProductsByIds } from "@/lib/db/queries";

// Un producto completo por id — lo usa el flujo de "agregar un modelo parecido
// al comparador" (ver OtherStoresButton / app/search/[token]/page.tsx), donde
// solo se tiene el id que devolvió /api/products/[id]/other-stores.
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const [product] = await getProductsByIds([params.id]);
    if (!product) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    }
    return NextResponse.json(product);
  } catch (error) {
    console.error("[GET /api/products/[id]]", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
