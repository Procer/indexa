import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db/sql";
import { getSearchByShareToken } from "@/lib/db/queries";
import type { SavedSearchListItem } from "@/types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/searches/manage/[token] — búsquedas asociadas a un manage_token
// (sin login), mismo patrón que app/api/alerts/manage/[token]/route.ts.
export async function GET(
  _request: NextRequest,
  { params }: { params: { token: string } }
) {
  if (!UUID_RE.test(params.token)) {
    return NextResponse.json({ searches: [] });
  }

  let contact: { share_tokens: string[] } | undefined;
  try {
    [contact] = await sql<{ share_tokens: string[] }[]>`
      SELECT share_tokens
      FROM saved_search_contacts
      WHERE manage_token = ${params.token}::uuid
    `;
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
  if (!contact) {
    return NextResponse.json({ searches: [] });
  }

  const shareTokens = (contact.share_tokens ?? []) as string[];
  const resolved = await Promise.all(
    shareTokens.map((t) => getSearchByShareToken(t))
  );

  const searches: SavedSearchListItem[] = resolved
    .filter((s): s is NonNullable<typeof s> => s !== null)
    .map((s) => ({
      share_token: s.share_token,
      raw_input: s.raw_input,
      result_count: s.result_count,
      created_at: s.created_at,
    }))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return NextResponse.json({ searches });
}
