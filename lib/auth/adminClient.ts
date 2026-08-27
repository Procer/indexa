"use client";

import { getSupabaseBrowser } from "@/lib/db/supabaseClient";
import { withBasePath } from "@/lib/basePath";

// Fetch autenticado para las rutas /api/admin/*: agrega el JWT de la sesión
// de Supabase Auth actual como Authorization: Bearer. Reemplaza el viejo
// esquema de localStorage.getItem("admin_secret") + header x-admin-secret.
export async function adminFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const sb = getSupabaseBrowser();
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token ?? "";

  return fetch(withBasePath(path), {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers as Record<string, string>),
    },
  });
}
