import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db/supabase";

export async function POST(request: NextRequest) {
  const { searchIds, accessToken } = (await request.json()) as {
    searchIds?: string[];
    accessToken?: string;
  };

  if (!searchIds?.length || !accessToken) {
    return NextResponse.json({ ok: true, updated: 0 });
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Token inválido" }, { status: 401 });
  }

  await supabase
    .from("searches")
    .update({ user_id: userData.user.id })
    .in("share_token", searchIds)
    .is("user_id", null);

  return NextResponse.json({ ok: true });
}
