import type { MetadataRoute } from "next";
import { GUIDES } from "@/lib/content/guides";
import { getStoreSummaries } from "@/lib/db/queries";
import { absoluteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let stores: string[] = [];
  try {
    stores = (await getStoreSummaries()).map((s) => s.source);
  } catch {
    // Sin DB (ej. build local): el sitemap sale igual con las páginas estáticas.
  }
  return [
    { url: absoluteUrl("/"), changeFrequency: "weekly", priority: 1 },
    { url: absoluteUrl("/tiendas"), changeFrequency: "daily", priority: 0.7 },
    ...stores.map((s) => ({
      url: absoluteUrl(`/tiendas/${s}`),
      changeFrequency: "daily" as const,
      priority: 0.6,
    })),
    { url: absoluteUrl("/guias"), changeFrequency: "monthly", priority: 0.6 },
    ...GUIDES.map((g) => ({
      url: absoluteUrl(`/guias/${g.slug}`),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];
}
