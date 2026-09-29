"use client";

import { useEffect, useRef, useState } from "react";

interface ShareMenuProps {
  copied: boolean;
  onCopy: () => void;
  whatsappHref: string;
  onOtherDevice: () => void;
}

// Un solo botón "Compartir" que agrupa lo que antes eran tres enlaces sueltos
// (compartir búsqueda, WhatsApp, ver en otro dispositivo) en la barra de resultados.
export function ShareMenu({ copied, onCopy, whatsappHref, onOtherDevice }: ShareMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item =
    "flex w-full items-center gap-3 px-3.5 py-2.5 text-left font-brand text-sm font-medium text-gathering-on-surface transition-colors hover:bg-black/5";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full border border-gathering-outline-variant bg-gathering-surface-container px-3.5 py-2 font-brand text-sm font-semibold text-gathering-on-surface transition-colors hover:bg-black/5"
      >
        <span className="material-symbols-outlined text-[18px] text-gathering-primary" aria-hidden="true">
          {copied ? "check" : "share"}
        </span>
        {copied ? "¡Link copiado!" : "Compartir"}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 w-64 overflow-hidden rounded-2xl border border-gathering-outline-variant bg-gathering-surface-container-high py-1.5 shadow-xl"
        >
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => {
              onCopy();
              setOpen(false);
            }}
          >
            <span className="material-symbols-outlined text-[20px] text-gathering-primary" aria-hidden="true">
              link
            </span>
            Copiar link de la búsqueda
          </button>
          <a
            role="menuitem"
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className={item}
            onClick={() => setOpen(false)}
          >
            <span className="material-symbols-outlined text-[20px] text-[#128C7E]" aria-hidden="true">
              chat
            </span>
            Enviar por WhatsApp
          </a>
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => {
              onOtherDevice();
              setOpen(false);
            }}
          >
            <span className="material-symbols-outlined text-[20px] text-gathering-primary" aria-hidden="true">
              devices
            </span>
            Ver en otro dispositivo
          </button>
        </div>
      )}
    </div>
  );
}
