import { NextResponse } from "next/server";
import { sql } from "@/lib/db/sql";

export const dynamic = "force-dynamic";

// GET /api/health — para monitoreo externo (UptimeRobot, etc.) y chequeos de deploy.
// 200 si la app y la base responden; 503 si la base no contesta.
export async function GET() {
  const startedAt = Date.now();
  try {
    await sql`SELECT 1`;
    return NextResponse.json({ status: "ok", db: "ok", ms: Date.now() - startedAt });
  } catch {
    return NextResponse.json({ status: "error", db: "down" }, { status: 503 });
  }
}
