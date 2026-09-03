"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { adminFetch } from "@/lib/auth/adminClient";
import { withBasePath } from "@/lib/basePath";

function SetPasswordContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [state, setState] = useState<"checking" | "ready" | "invalid" | "saving" | "done">(
    "checking"
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!token) {
      setState("invalid");
      return;
    }
    adminFetch(`/api/admin/auth/invite-info?token=${encodeURIComponent(token)}`).then(async (res) => {
      if (res.ok) {
        const data = (await res.json()) as { email: string };
        setEmail(data.email);
        setState("ready");
      } else {
        setState("invalid");
      }
    });
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    if (password.length < 8) {
      setErrorMsg("La contraseña tiene que tener al menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      setErrorMsg("Las contraseñas no coinciden.");
      return;
    }
    setState("saving");
    const res = await adminFetch("/api/admin/auth/accept-invite", {
      method: "POST",
      body: JSON.stringify({ token, password }),
    });
    if (res.ok) {
      setState("done");
      window.location.href = withBasePath("/admin");
      return;
    }
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setErrorMsg(data.error || "No se pudo guardar la contraseña.");
    setState("ready");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="text-lg font-bold text-gray-900">Definí tu contraseña</h1>

        {state === "checking" && <p className="mt-3 text-sm text-gray-400">Verificando el link...</p>}

        {state === "invalid" && (
          <p className="mt-3 text-sm text-red-500">
            El link es inválido o venció. Pedile al administrador que te genere uno nuevo.
          </p>
        )}

        {(state === "ready" || state === "saving" || state === "done") && (
          <form onSubmit={handleSubmit} className="mt-4 space-y-3">
            <p className="text-sm text-gray-500">
              Cuenta: <strong>{email}</strong>
            </p>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Contraseña nueva (mín. 8)"
              autoComplete="new-password"
              required
              className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repetir contraseña"
              autoComplete="new-password"
              required
              className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
            {errorMsg && <p className="text-xs text-red-500">{errorMsg}</p>}
            <button
              type="submit"
              disabled={state === "saving" || state === "done"}
              className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {state === "saving" ? "Guardando..." : "Guardar y entrar"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function SetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-gray-400">
          Cargando...
        </div>
      }
    >
      <SetPasswordContent />
    </Suspense>
  );
}
