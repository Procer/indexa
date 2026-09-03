"use client";

import { withBasePath } from "@/lib/basePath";

// Fetch a las rutas /api/admin/*. La sesión viaja en la cookie httpOnly
// `indexa_admin_session` (same-origin, se manda sola). Ver lib/auth/adminSession.ts.
export async function adminFetch(path: string, options: RequestInit = {}): Promise<Response> {
  return fetch(withBasePath(path), {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    },
  });
}
