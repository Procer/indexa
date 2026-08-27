"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

// Monta los hijos directo en document.body en vez de en el punto del árbol
// donde se llama — necesario para cualquier overlay "fixed inset-0" (modales,
// popups) porque un ancestro con transform/animación (ej. animate-fade-up con
// fill-mode forwards, o las clases scale-*/translate-x-* de las transiciones
// de fase) crea un containing block para position:fixed y "atrapa" el overlay
// dentro de ese ancestro en vez de cubrir toda la pantalla — exactamente el
// bug reportado ("el popup se abre adentro del chat"). Portal lo evita de raíz,
// sin depender de que ningún ancestro presente o futuro deje de usar transform.
export function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}
