"use client";

import { useEffect, useState } from "react";
import { dismissNamePrompt, getVisitorName, setVisitorName, wasNamePromptDismissed } from "@/lib/analytics/visitorName";

// Banner chico y descartable pidiendo un nombre opcional — solo aparece si
// todavía no se guardó ninguno y no se descartó antes en este navegador.
// Puramente para que quien analice la prueba después (/admin/sessions) pueda
// leer "Juan preguntó X" en vez de un visit_id sin sentido; no bloquea nada
// del sitio si se ignora.
export function VisitorNamePrompt() {
  const [visible, setVisible] = useState(false);
  const [name, setName] = useState("");

  useEffect(() => {
    if (!getVisitorName() && !wasNamePromptDismissed()) setVisible(true);
  }, []);

  if (!visible) return null;

  const submit = () => {
    if (name.trim()) setVisitorName(name);
    dismissNamePrompt();
    setVisible(false);
  };

  return (
    <div className="fixed bottom-4 left-4 z-40 flex max-w-xs items-center gap-2 rounded-xl border border-gathering-outline-variant bg-gathering-surface-bright p-3 text-xs shadow-lg">
      <div className="flex-1">
        <p className="font-semibold text-gathering-on-surface">¿Cómo te llamás?</p>
        <p className="mt-0.5 text-gathering-on-surface-variant">Opcional — ayuda a leer la prueba después.</p>
        <div className="mt-2 flex gap-1.5">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Tu nombre"
            className="w-full rounded-lg border border-gathering-outline-variant px-2 py-1 text-xs outline-none focus:border-gathering-primary-fixed-dim"
            autoFocus
          />
          <button
            type="button"
            onClick={submit}
            className="shrink-0 rounded-lg bg-gathering-primary-fixed-dim px-2.5 py-1 font-semibold text-white"
          >
            Listo
          </button>
        </div>
      </div>
      <button
        type="button"
        onClick={() => {
          dismissNamePrompt();
          setVisible(false);
        }}
        aria-label="Cerrar"
        className="shrink-0 self-start text-gathering-on-surface-variant hover:text-gathering-on-surface"
      >
        ✕
      </button>
    </div>
  );
}
