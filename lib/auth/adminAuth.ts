import { NextRequest } from "next/server";
import { supabase } from "@/lib/db/supabase";

export interface AdminUser {
  id: string;
  email: string;
}

// Valida el JWT de Supabase Auth mandado en `Authorization: Bearer <token>`
// y confirma que el usuario tiene role='admin' en profiles. Reemplaza el
// chequeo de x-admin-secret compartido.
export async function getAdminUser(request: NextRequest): Promise<AdminUser | null> {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) return null;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .single();

  if (profileError || profile?.role !== "admin") return null;

  return { id: userData.user.id, email: userData.user.email ?? "" };
}
