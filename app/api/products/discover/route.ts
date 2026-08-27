import { NextResponse } from "next/server";
import { supabase } from "@/lib/db/supabase";
import { ACCESSORY_KEYWORDS } from "@/lib/search/pipeline";
import type { NotebookSpecs, Product, ProductCategory } from "@/types";

// GET /api/products/discover — vidriera de productos al azar para el home,
// agrupados por categoría. Sin pipeline de IA (sin LLM, sin embeddings): trae
// un pool disponible por categoría directo de Supabase y lo mezcla acá mismo
// (PostgREST no tiene ORDER BY random() nativo sin un RPC nuevo, y no hace
// falta esa precisión para una vidriera de "mirá lo que hay").

// Bug real encontrado en vivo (2026-08-24): sin esto, Next.js trata esta
// ruta como estática (sin fetch()/cookies/headers dinámicos detectables) y
// la sirve como una foto congelada de lo que devolvió Supabase en el momento
// del build — puede quedar mostrando datos de días atrás (ej. una categoría
// que ya se corrigió en la DB real) hasta el próximo deploy que toque este
// archivo. `force-dynamic` fuerza a Next a ejecutar el handler en cada
// request, cumpliendo la intención real del comentario de `shuffle` de abajo
// ("se repite en cada request, así que ya varía por visita").
export const dynamic = "force-dynamic";

// Celular primero a pedido explícito del usuario (antes: notebook primero).
const DISCOVER_CATEGORIES: ProductCategory[] = ["phone", "notebook", "desktop", "tablet", "tv"];
const SAMPLE_POOL = 40;
const PER_CATEGORY = 4;

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Mismo guard que usa el pipeline de búsqueda real (lib/search/pipeline.ts)
// contra muebles/accesorios colados en notebook/desktop (ej. "Escritorio
// Orlandi para Notebook") — acá hacía falta repetirlo porque esta ruta
// consulta la DB directo, sin pasar por ese pipeline.
function isRealEquipment(product: Product): boolean {
  if (product.category === "notebook" || product.category === "desktop") {
    const specs = product.specs as Partial<NotebookSpecs>;
    if (specs.processor_tier == null) return false;
  }
  return !ACCESSORY_KEYWORDS.test(product.title);
}

async function getRandomSection(category: ProductCategory): Promise<{ category: ProductCategory; products: Product[] } | null> {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("category", category)
    .eq("available", true)
    .limit(SAMPLE_POOL);

  if (error) throw error;
  if (!data) return null;

  const realEquipment = (data as Product[]).filter(isRealEquipment);
  if (realEquipment.length === 0) return null;

  return { category, products: shuffle(realEquipment).slice(0, PER_CATEGORY) };
}

export async function GET() {
  const sections = await Promise.all(DISCOVER_CATEGORIES.map(getRandomSection));
  return NextResponse.json({
    sections: sections.filter((s): s is { category: ProductCategory; products: Product[] } => s !== null),
  });
}
