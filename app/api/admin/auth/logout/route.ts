import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, adminCookieOptions, destroySession } from "@/lib/auth/adminSession";

// POST /api/admin/auth/logout
export async function POST(request: NextRequest) {
  await destroySession(request.cookies.get(ADMIN_COOKIE)?.value);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, "", adminCookieOptions(0));
  return res;
}
