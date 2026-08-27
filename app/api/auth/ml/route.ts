import { NextResponse } from "next/server";

export async function GET() {
  const redirectUri =
    process.env.ML_REDIRECT_URI ??
    "http://localhost:3000/api/auth/ml/callback";

  const url = new URL("https://auth.mercadolibre.com.ar/authorization");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", process.env.ML_APP_ID!);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", "offline_access read write");

  return NextResponse.redirect(url.toString());
}
