"use client";

import { useState } from "react";
import { withBasePath } from "@/lib/basePath";
import { Portal } from "@/components/Portal";
import { getSavedSearches, getSyncContact, saveSyncContact } from "@/lib/storage/localStorage";

interface SyncSearchesModalProps {
  onClose: () => void;
}

export function SyncSearchesModal({ onClose }: SyncSearchesModalProps) {
  const [email, setEmail] = useState(() => getSyncContact()?.email ?? "");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setStatus("loading");
    setErrorMsg("");

    const shareTokens = getSavedSearches().map((s) => s.share_token);

    try {
      const res = await fetch(withBasePath("/api/searches/sync"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), shareTokens }),
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { manage_token: string };
      saveSyncContact({ email: email.trim(), manage_token: data.manage_token });
      setStatus("sent");
    } catch {
      setErrorMsg("No pudimos enviar el link. Intentá de nuevo.");
      setStatus("error");
    }
  };

  return (
    <Portal>
      <div
        className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
        role="dialog"
        aria-modal="true"
      >
        <div
          className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          onClick={onClose}
          aria-hidden="true"
        />

        <div className="gathering-glass-panel relative w-full max-w-md rounded-t-2xl bg-gathering-surface-container p-6 shadow-2xl ring-1 ring-black/5 sm:rounded-2xl">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 text-gathering-on-surface-variant hover:text-gathering-on-surface"
            aria-label="Cerrar"
          >
            ✕
          </button>

          {status === "sent" ? (
            <div className="space-y-3 py-4 text-center">
              <div className="text-3xl">✉️</div>
              <p className="font-brand font-semibold text-gathering-on-surface">Revisá tu email</p>
              <p className="font-brand text-sm text-gathering-on-surface-variant">
                Te mandamos un link a <strong>{email}</strong> para ver tus búsquedas desde cualquier dispositivo.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="font-brand text-sm text-gathering-primary-fixed-dim hover:underline"
              >
                Cerrar
              </button>
            </div>
          ) : (
            <>
              <h2 className="font-brand text-lg font-semibold text-gathering-on-surface">
                Ver en otro dispositivo
              </h2>
              <p className="mt-1 font-brand text-sm text-gathering-on-surface-variant">
                Te mandamos un link a tu email con tus búsquedas guardadas — abrilo desde el celular o la compu para verlas ahí también.
              </p>

              <form onSubmit={handleSubmit} className="mt-5 space-y-3">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@email.com"
                  required
                  className="w-full rounded-lg border border-gathering-outline-variant bg-gathering-surface px-4 py-2.5 font-brand text-sm text-gathering-on-surface outline-none focus:border-gathering-primary-fixed-dim"
                />
                {status === "error" && (
                  <p className="font-brand text-xs text-gathering-error">{errorMsg}</p>
                )}
                <button
                  type="submit"
                  disabled={status === "loading"}
                  className="gathering-btn-primary-gradient w-full rounded-lg py-2.5 font-brand text-sm font-semibold text-white disabled:opacity-60"
                >
                  {status === "loading" ? "Enviando..." : "Mandarme el link"}
                </button>
              </form>

              <p className="mt-4 text-center font-brand text-xs text-gathering-on-surface-variant">
                Sin contraseñas ni cuenta — solo un link a tu email.
              </p>
            </>
          )}
        </div>
      </div>
    </Portal>
  );
}
