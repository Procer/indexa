"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { HOME_SEED_PHRASE } from "@/lib/domain/homeSeed";

// El home ya no tiene su propio buscador ni chrome — arranca directo el
// mismo chat guiado que antes se activaba con el botón "¿No sabés bien qué
// buscar?" (ver app/search/[token]/page.tsx, fase de preguntas). Se dispara
// con una frase deliberadamente vaga para que category/use_cases salgan
// vacíos del slot-filling y arranque preguntando tipo de equipo — mismo
// mecanismo que ya existía, solo que ahora es lo único que hace el home.
// HOME_SEED_PHRASE se comparte con esa página porque ahí se la reconoce para
// mostrar la primera pregunta al toque, sin esperar el round-trip al LLM.

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    sessionStorage.setItem(
      "pending_search",
      JSON.stringify({ input: HOME_SEED_PHRASE, refinements: [] })
    );
    router.replace("/search/loading");
  }, [router]);

  return null;
}
