import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth/adminSession";

// GET /api/admin/auth/me — datos del admin logueado o 401.
export async function GET(request: NextRequest) {
  const user = await getAdminSession(request);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  return NextResponse.json({ email: user.email, role: user.role });
}
