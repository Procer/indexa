"use client";

import { useState } from "react";
import { getSupabaseBrowser } from "@/lib/db/supabaseClient";
import { withBasePath } from "@/lib/basePath";
import { Portal } from "@/components/Portal";

const DISMISSED_KEY = "techsearch_auth_dismissed";

interface AuthModalProps {
  onClose: () => void;
}

export function AuthModal({ onClose }: AuthModalProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, "1");
    onClose();
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setStatus("loading");
    setErrorMsg("");

    const sb = getSupabaseBrowser();
    const { error } = await sb.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: `${window.location.origin}${withBasePath("/auth/callback")}`,
        shouldCreateUser: true,
      },
    });

    if (!error) {
      setStatus("sent");
    } else {
      setErrorMsg(error.message || "Ocurrió un error. Intentá de nuevo.");
      setStatus("error");
    }
  };

  const handleGoogle = async () => {
    const sb = getSupabaseBrowser();
    const origin = window.location.origin;
    await sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${origin}/auth/callback` },
    });
  };

  return (
    <Portal>
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={handleDismiss}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="gathering-glass-panel relative w-full max-w-md rounded-t-2xl bg-gathering-surface-container p-6 shadow-2xl ring-1 ring-black/5 sm:rounded-2xl">
        <button
          type="button"
          onClick={handleDismiss}
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
              Te enviamos un link para ingresar a <strong>{email}</strong>.
            </p>
            <button
              type="button"
              onClick={handleDismiss}
              className="font-brand text-sm text-gathering-primary-fixed-dim hover:underline"
            >
              Cerrar
            </button>
          </div>
        ) : (
          <>
            <h2 className="font-brand text-lg font-semibold text-gathering-on-surface">
              Guardá tus búsquedas
            </h2>
            <p className="mt-1 font-brand text-sm text-gathering-on-surface-variant">
              Registrate gratis para guardar tu historial y recibir alertas cuando bajen los precios.
            </p>

            <form onSubmit={handleMagicLink} className="mt-5 space-y-3">
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
                {status === "loading" ? "Enviando..." : "Enviar link de acceso"}
              </button>
            </form>

            <div className="my-4 flex items-center gap-3">
              <div className="h-px flex-1 bg-gathering-outline-variant/50" />
              <span className="font-brand text-xs text-gathering-on-surface-variant">o</span>
              <div className="h-px flex-1 bg-gathering-outline-variant/50" />
            </div>

            <button
              type="button"
              onClick={handleGoogle}
              className="gathering-interactive-card flex w-full items-center justify-center gap-2 rounded-lg py-2.5 font-brand text-sm font-medium text-gathering-on-surface"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Continuar con Google
            </button>

            <p className="mt-4 text-center font-brand text-xs text-gathering-on-surface-variant">
              Sin contraseñas. Podés cerrar esto y seguir usando sin cuenta.
            </p>
          </>
        )}
      </div>
    </div>
    </Portal>
  );
}

export function shouldShowAuthModal(): boolean {
  if (typeof window === "undefined") return false;
  return !localStorage.getItem(DISMISSED_KEY);
}
