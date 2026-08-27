"use client";

import { Suspense, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/db/supabaseClient";
import { getSavedSearches } from "@/lib/storage/localStorage";
import { withBasePath } from "@/lib/basePath";

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const code = searchParams.get("code");
    const next = searchParams.get("next") ?? "/";
    if (!code) {
      router.replace(next);
      return;
    }

    const sb = getSupabaseBrowser();

    sb.auth.exchangeCodeForSession(code).then(async ({ data, error }) => {
      if (error || !data.session) {
        router.replace(next);
        return;
      }

      const saved = getSavedSearches();
      if (saved.length > 0) {
        const ids = saved.map((s) => s.share_token);
        fetch(withBasePath("/api/auth/sync-searches"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            searchIds: ids,
            accessToken: data.session.access_token,
          }),
        }).catch(() => null);
      }

      router.replace(next);
    });
  }, [router, searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-sm text-gray-400">Iniciando sesión...</p>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-sm text-gray-400">Iniciando sesión...</p>
        </div>
      }
    >
      <AuthCallbackContent />
    </Suspense>
  );
}
