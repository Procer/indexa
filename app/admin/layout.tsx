"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { adminFetch } from "@/lib/auth/adminClient";
import { withBasePath } from "@/lib/basePath";

type GateStatus = "checking" | "anon" | "admin";
type AdminRole = "admin" | "super_admin";

function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setStatus("loading");
    setErrorMsg("");
    const res = await adminFetch("/api/admin/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: email.trim(), password }),
    });
    if (res.ok) {
      onSuccess();
      return;
    }
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setErrorMsg(data.error || "No se pudo iniciar sesión.");
    setStatus("error");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="text-lg font-bold text-gray-900">Panel de administración</h1>
        <p className="mt-1 text-sm text-gray-500">Ingresá con tu email y contraseña.</p>

        <div className="mt-5 space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@email.com"
            autoComplete="username"
            required
            className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Contraseña"
            autoComplete="current-password"
            required
            className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
          {status === "error" && <p className="text-xs text-red-500">{errorMsg}</p>}
          <button
            type="submit"
            disabled={status === "loading"}
            className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {status === "loading" ? "Ingresando..." : "Ingresar"}
          </button>
        </div>
      </form>
    </div>
  );
}

const NAV_LINKS: { href: string; label: string; superOnly?: boolean }[] = [
  { href: "/admin/analytics", label: "Analítica" },
  { href: "/admin/sponsors", label: "Patrocinados" },
  { href: "/admin/users", label: "Usuarios", superOnly: true },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [status, setStatus] = useState<GateStatus>("checking");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AdminRole>("admin");

  // La página de "definir contraseña" se abre desde un link de invitación, sin
  // sesión — no puede pasar por el gate.
  const isSetPassword = pathname?.endsWith("/admin/set-password") ?? false;

  const check = useCallback(async () => {
    const res = await adminFetch("/api/admin/auth/me");
    if (res.ok) {
      const data = (await res.json()) as { email: string; role: AdminRole };
      setEmail(data.email);
      setRole(data.role);
      setStatus("admin");
    } else {
      setStatus("anon");
    }
  }, []);

  useEffect(() => {
    if (isSetPassword) return;
    check();
  }, [check, isSetPassword]);

  const handleLogout = async () => {
    await adminFetch("/api/admin/auth/logout", { method: "POST" });
    window.location.href = withBasePath("/admin");
  };

  if (isSetPassword) return <>{children}</>;

  if (status === "checking") {
    return <div className="flex min-h-screen items-center justify-center text-sm text-gray-400">Cargando...</div>;
  }
  if (status === "anon") return <LoginForm onSuccess={check} />;

  const links = NAV_LINKS.filter((l) => !l.superOnly || role === "super_admin");

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <span className="text-sm font-bold text-gray-900">indexa admin</span>
            <nav className="flex items-center gap-4">
              {links.map((link) => (
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
            <span className="text-xs text-gray-400">{email}</span>
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
