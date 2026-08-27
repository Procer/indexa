import { createClient } from "@supabase/supabase-js";

// Browser client uses the anon key — safe to expose publicly
let _client: ReturnType<typeof createClient> | null = null;

export function getSupabaseBrowser() {
  if (!_client) {
    _client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { flowType: "pkce" } }
    );
  }
  return _client;
}
