import { NextRequest, NextResponse } from "next/server";

const ALLOWED_HOSTS = [
  "images.fravega.com",
  "cetrogar.vteximg.com.br",
  "musimundo.vteximg.com.br",
  "garbarino.vteximg.com.br",
  "compumundo.vteximg.com.br",
  "megatone.net",
  "coppelar.vteximg.com.br",
  "naldoar.vteximg.com.br",
  "jumboargentina.vteximg.com.br",
  "carrefourar.vteximg.com.br",
  "aremsaprod.vteximg.com.br",
  "masonlineprod.vteximg.com.br",
  "pardohogar.vteximg.com.br",
  "http2.mlstatic.com",
  "mlstatic.com",
  "placehold.co",
];

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return new NextResponse("Missing url", { status: 400 });

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return new NextResponse("Invalid url", { status: 400 });
  }

  if (!ALLOWED_HOSTS.some((h) => parsed.hostname === h || parsed.hostname.endsWith(`.${h}`))) {
    return new NextResponse("Forbidden host", { status: 403 });
  }

  try {
    const upstream = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "Accept-Language": "es-AR,es;q=0.9",
        Referer: "https://www.fravega.com/",
        Origin: "https://www.fravega.com",
      },
      cache: "force-cache",
    });

    if (!upstream.ok) {
      return new NextResponse(null, { status: upstream.status });
    }

    const blob = await upstream.arrayBuffer();
    const contentType = upstream.headers.get("content-type") ?? "image/jpeg";

    return new NextResponse(blob, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=3600",
      },
    });
  } catch {
    return new NextResponse("Upstream error", { status: 502 });
  }
}
