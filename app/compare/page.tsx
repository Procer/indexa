"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CompareExperience } from "@/components/CompareExperience";

// Wrapper fino: la lógica/UI real vive en CompareExperience (compartida con
// el popup que se abre desde la barra pegajosa de /search/[token]) — esta
// ruta sigue funcionando igual para acceso directo o links compartidos.
function CompareContent() {
  const searchParams = useSearchParams();
  const ids = searchParams.get("ids")?.split(",").filter(Boolean) ?? [];
  const searchToken = searchParams.get("search");

  return <CompareExperience ids={ids} searchToken={searchToken} mode="page" />;
}

export default function ComparePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gathering-primary-fixed-dim border-t-transparent" />
        </div>
      }
    >
      <CompareContent />
    </Suspense>
  );
}
