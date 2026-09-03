import { NextRequest, NextResponse } from "next/server";
import { getValidInvite } from "@/lib/auth/adminSession";

// GET /api/admin/auth/invite-info?token=... — para que la página de
// set-password muestre a quién pertenece el link, sin exponer nada más.
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const invite = await getValidInvite(token);
  if (!invite) {
    return NextResponse.json({ error: "Link inválido o vencido" }, { status: 404 });
  }
  return NextResponse.json({ email: invite.email, purpose: invite.purpose });
}
