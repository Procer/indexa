"use client";

import { useEffect, useState } from "react";
import { useUser } from "@/hooks/useUser";
import { getSupabaseBrowser } from "@/lib/db/supabaseClient";
import { adminFetch } from "@/lib/auth/adminClient";
import { withBasePath } from "@/lib/basePath";

type GateStatus = "checking" | "anon" | "denied" | "admin";

const NEXT_PATH = "/admin";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus("loading");
    setErrorMsg("");

    const sb = getSupabaseBrowser();
    const origin = window.location.origin;
    const { error } = await sb.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: `${origin}${withBasePath("/auth/callback")}?next=${encodeURIComponent(NEXT_PATH)}`,
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
      options: { redirectTo: `${origin}${withBasePath("/auth/callback")}?next=${encodeURIComponent(NEXT_PATH)}` },
    });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="text-lg font-bold text-gray-900">Panel de administración</h1>
        <p className="mt-1 text-sm text-gray-500">Acceso restringido a cuentas con permiso de administrador.</p>

        {status === "sent" ? (
          <div className="mt-5 space-y-2 text-center">
            <div className="text-2xl">✉️</div>
            <p className="text-sm text-gray-600">
              Te enviamos un link de acceso a <strong>{email}</strong>.
            </p>
          </div>
        ) : (
          <>
            <form onSubmit={handleMagicLink} className="mt-5 space-y-3">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
                required
                className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
              {status === "error" && <p className="text-xs text-red-500">{errorMsg}</p>}
              <button
                type="submit"
                disabled={status === "loading"}
                className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {status === "loading" ? "Enviando..." : "Enviar link de acceso"}
              </button>
            </form>

            <div className="my-4 flex items-center gap-3">
              <div className="h-px flex-1 bg-gray-100" />
              <span className="text-xs text-gray-400">o</span>
              <div className="h-px flex-1 bg-gray-100" />
            </div>

            <button
              type="button"
              onClick={handleGoogle}
              className="w-full rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Continuar con Google
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function DeniedScreen({ email }: { email: string }) {
  const handleLogout = async () => {
    await getSupabaseBrowser().auth.signOut();
    window.location.reload();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-sm">
        <p className="text-3xl">🔒</p>
        <h1 className="mt-3 text-lg font-bold text-gray-900">Sin permisos de administrador</h1>
        <p className="mt-1 text-sm text-gray-500">
          <strong>{email}</strong> no tiene acceso al panel de administración.
        </p>
        <button
          type="button"
          onClick={handleLogout}
          className="mt-5 text-sm font-semibold text-blue-600 hover:underline"
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}

const NAV_LINKS = [
  { href: "/admin/analytics", label: "Analítica" },
  { href: "/admin/sponsors", label: "Patrocinados" },
  { href: "/admin/connect-ml", label: "Conectar ML" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading: userLoading } = useUser();
  const [status, setStatus] = useState<GateStatus>("checking");
  const [adminEmail, setAdminEmail] = useState("");

  useEffect(() => {
    if (userLoading) return;
    if (!user) {
      setStatus("anon");
      return;
    }

    let cancelled = false;
    adminFetch("/api/admin/me").then(async (res) => {
      if (cancelled) return;
      if (res.ok) {
        const data = (await res.json()) as { email: string };
        setAdminEmail(data.email);
        setStatus("admin");
      } else {
        setAdminEmail(user.email ?? "");
        setStatus("denied");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [user, userLoading]);

  const handleLogout = async () => {
    await getSupabaseBrowser().auth.signOut();
    window.location.href = withBasePath("/admin");
  };

  if (status === "checking") {
    return <div className="flex min-h-screen items-center justify-center text-sm text-gray-400">Cargando...</div>;
  }

  if (status === "anon") return <LoginForm />;
  if (status === "denied") return <DeniedScreen email={adminEmail} />;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <span className="text-sm font-bold text-gray-900">indexa admin</span>
            <nav className="flex items-center gap-4">
              {NAV_LINKS.map((link) => (
                <a
                  key={link.href}
                  href={withBasePath(link.href)}
                  className="text-sm text-gray-500 hover:text-gray-900"
                >
                  {link.label}
                </a>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">{adminEmail}</span>
            <button type="button" onClick={handleLogout} className="text-sm text-gray-500 hover:text-gray-900">
              Cerrar sesión
            </button>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
