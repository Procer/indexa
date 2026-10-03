"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
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
    <div className="relative z-10 flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-white to-blue-50 px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg ring-1 ring-gray-100">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-lg font-bold text-white">i</span>
          <div>
            <h1 className="text-lg font-bold leading-tight text-gray-900">indexa admin</h1>
            <p className="text-xs text-gray-400">Panel de administración</p>
          </div>
        </div>
        <p className="mt-5 text-sm text-gray-500">Ingresá con tu email y contraseña.</p>

        <div className="mt-4 space-y-3">
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

// Íconos de línea (24x24) — inline para no sumar dependencias.
const ICONS: Record<string, ReactNode> = {
  analytics: <path d="M4 20V10m6 10V4m6 16v-7m4 7H2" strokeLinecap="round" strokeLinejoin="round" />,
  stores: (
    <path
      d="M3 9l1.5-5h15L21 9M3 9v11h18V9M3 9h18M9 20v-6h6v6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  sponsors: (
    <path
      d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.5 6.6 19.5l1.2-6L3.3 9.3l6.1-.7L12 3z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  live: <path d="M3 12h4l3-8 4 16 3-8h4" strokeLinecap="round" strokeLinejoin="round" />,
  users: (
    <path
      d="M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1m13-11a3 3 0 1 0 0-6M21 20v-1a4 4 0 0 0-3-3.9M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
};

const NAV_LINKS: { href: string; label: string; icon: keyof typeof ICONS; superOnly?: boolean }[] = [
  { href: "/admin/analytics", label: "Analítica", icon: "analytics" },
  { href: "/admin/stores", label: "Tiendas", icon: "stores" },
  { href: "/admin/sponsors", label: "Patrocinados", icon: "sponsors" },
  { href: "/admin/sessions", label: "Actividad en vivo", icon: "live" },
  { href: "/admin/users", label: "Usuarios", icon: "users", superOnly: true },
];

function NavIcon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
      {ICONS[name]}
    </svg>
  );
}

export default function AdminLayout({ children }: { children: ReactNode }) {
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
    return (
      <div className="relative z-10 flex min-h-screen items-center justify-center text-sm text-gray-400">Cargando...</div>
    );
  }
  if (status === "anon") return <LoginForm onSuccess={check} />;

  const links = NAV_LINKS.filter((l) => !l.superOnly || role === "super_admin");
  const isActive = (href: string) => !!pathname && (pathname === href || pathname.endsWith(href));
  const initial = (email[0] ?? "?").toUpperCase();

  return (
    <div className="relative z-10 min-h-screen bg-gray-50 lg:flex">
      {/* Barra lateral (desktop) */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-gray-200 bg-white print:hidden lg:sticky lg:top-0 lg:flex lg:h-screen">
        <div className="flex items-center gap-2 px-5 py-5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-base font-bold text-white">i</span>
          <span className="text-sm font-bold text-gray-900">indexa admin</span>
        </div>
        <nav className="flex-1 space-y-0.5 px-3">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive(link.href) ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              <NavIcon name={link.icon} />
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-gray-100 p-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-semibold text-gray-600">
              {initial}
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-gray-700" title={email}>
                {email}
              </p>
              <p className="text-[11px] text-gray-400">{role === "super_admin" ? "Super admin" : "Admin"}</p>
            </div>
          </div>
          <div className="mt-3 flex gap-3 text-xs">
            <a href={withBasePath("/")} target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-gray-900">
              Ver sitio ↗
            </a>
            <button type="button" onClick={handleLogout} className="text-gray-500 hover:text-gray-900">
              Cerrar sesión
            </button>
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Barra superior (mobile) */}
        <header className="sticky top-0 z-20 border-b border-gray-200 bg-white print:hidden lg:hidden">
          <div className="flex items-center justify-between px-4 py-2.5">
            <span className="flex items-center gap-2 text-sm font-bold text-gray-900">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">i</span>
              admin
            </span>
            <button type="button" onClick={handleLogout} className="text-xs text-gray-500">
              Salir
            </button>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 pb-2">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${
                  isActive(link.href) ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600"
                }`}
              >
                <NavIcon name={link.icon} />
                {link.label}
              </Link>
            ))}
          </nav>
        </header>

        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</div>
      </div>
    </div>
  );
}
