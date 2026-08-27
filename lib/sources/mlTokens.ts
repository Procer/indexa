import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const TOKEN_FILE = join(process.cwd(), ".ml_tokens.json");

interface MLTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user_id: number;
}

interface MLTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user_id: number;
}

export function isMLAuthorized(): boolean {
  return existsSync(TOKEN_FILE);
}

export function saveMLTokens(data: MLTokenResponse): void {
  const tokens: MLTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
    user_id: data.user_id,
  };
  writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2), "utf-8");
}

function loadTokens(): MLTokens | null {
  if (!existsSync(TOKEN_FILE)) return null;
  try {
    return JSON.parse(readFileSync(TOKEN_FILE, "utf-8")) as MLTokens;
  } catch {
    return null;
  }
}

async function doRefresh(refreshToken: string): Promise<string> {
  const res = await fetch("https://api.mercadolibre.com/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: process.env.ML_APP_ID!,
      client_secret: process.env.ML_CLIENT_SECRET!,
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Refresh token falló (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as MLTokenResponse;
  saveMLTokens(data);
  return data.access_token;
}

export async function getMLToken(): Promise<string> {
  const tokens = loadTokens();

  if (!tokens) {
    throw new Error(
      "MercadoLibre no autorizado. Ir a http://localhost:3000/admin/connect-ml"
    );
  }

  // Refresh if expires in less than 10 minutes
  if (Date.now() >= tokens.expires_at - 10 * 60 * 1000) {
    return doRefresh(tokens.refresh_token);
  }

  return tokens.access_token;
}
