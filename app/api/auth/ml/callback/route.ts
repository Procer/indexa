import { NextRequest, NextResponse } from "next/server";
import { saveMLTokens } from "@/lib/sources/mlTokens";
import { withBasePath } from "@/lib/basePath";

interface MLTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user_id: number;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error || !code) {
    return NextResponse.json(
      { error: error ?? "Sin código de autorización" },
      { status: 400 }
    );
  }

  const res = await fetch("https://api.mercadolibre.com/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: process.env.ML_APP_ID!,
      client_secret: process.env.ML_CLIENT_SECRET!,
      code,
      redirect_uri:
        process.env.ML_REDIRECT_URI ??
        "http://localhost:3000/api/auth/ml/callback",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json(
      { error: `Intercambio de token falló: ${text.slice(0, 300)}` },
      { status: 500 }
    );
  }

  const data = (await res.json()) as MLTokenResponse;
  saveMLTokens(data);

  return NextResponse.redirect(
    new URL(withBasePath("/admin/connect-ml?success=true"), request.url)
  );
}
