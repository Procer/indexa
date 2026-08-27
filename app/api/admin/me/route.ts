import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/auth/adminAuth";

// GET /api/admin/me — confirma si el JWT mandado corresponde a un admin real.
export async function GET(request: NextRequest) {
  const admin = await getAdminUser(request);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ isAdmin: true, email: admin.email });
}
