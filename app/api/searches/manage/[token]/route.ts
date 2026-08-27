import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db/supabase";
import { getSearchByShareToken } from "@/lib/db/queries";
import type { SavedSearchListItem } from "@/types";

// GET /api/searches/manage/[token] — búsquedas asociadas a un manage_token
// (sin login), mismo patrón que app/api/alerts/manage/[token]/route.ts.
export async function GET(
  _request: NextRequest,
  { params }: { params: { token: string } }
) {
  const { data: contact, error } = await supabase
    .from("saved_search_contacts")
    .select("share_tokens")
    .eq("manage_token", params.token)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
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
