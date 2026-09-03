"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "@/lib/auth/adminClient";
import { withBasePath } from "@/lib/basePath";

type AdminRole = "admin" | "super_admin";

interface AdminUser {
  id: string;
  email: string;
  role: AdminRole;
  active: boolean;
  created_at: string;
  last_login_at: string | null;
  has_password: boolean;
}

const ROLE_LABEL: Record<AdminRole, string> = {
  admin: "Admin",
  super_admin: "Super admin",
};

function fullInviteUrl(path: string): string {
  return `${window.location.origin}${withBasePath(path)}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function UsersPage() {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState("");
  const [forbidden, setForbidden] = useState(false);

  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<AdminRole>("admin");
  const [creating, setCreating] = useState(false);
  const [inviteLink, setInviteLink] = useState<{ email: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setError("");
    const res = await adminFetch("/api/admin/users");
    if (res.status === 403) {
      setForbidden(true);
      return;
    }
    if (!res.ok) {
      setError("No se pudo cargar la lista de usuarios.");
      return;
    }
    const data = (await res.json()) as { users: AdminUser[] };
    setUsers(data.users);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim()) return;
    setCreating(true);
    setError("");
    setInviteLink(null);
    const res = await adminFetch("/api/admin/users", {
      method: "POST",
      body: JSON.stringify({ email: newEmail.trim(), role: newRole }),
    });
    setCreating(false);
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error || "No se pudo crear el usuario.");
      return;
    }
    const data = (await res.json()) as { user: AdminUser; invitePath: string };
    setInviteLink({ email: data.user.email, url: fullInviteUrl(data.invitePath) });
    setNewEmail("");
    setNewRole("admin");
    load();
  };

  const patchUser = async (id: string, body: { role?: AdminRole; active?: boolean }) => {
    setError("");
    const res = await adminFetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error || "No se pudo actualizar.");
      return;
    }
    load();
  };

  const regenInvite = async (id: string, email: string) => {
    setError("");
    const res = await adminFetch(`/api/admin/users/${id}/invite`, { method: "POST" });
    if (!res.ok) {
      setError("No se pudo generar el link.");
      return;
    }
    const data = (await res.json()) as { invitePath: string };
    setInviteLink({ email, url: fullInviteUrl(data.invitePath) });
  };

  const copyLink = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* el usuario copia a mano */
    }
  };

  const superAdmins = (users ?? []).filter((u) => u.role === "super_admin" && u.active);
  const isLastSuper = (u: AdminUser) =>
    u.role === "super_admin" && u.active && superAdmins.length <= 1;

  if (forbidden) {
    return (
      <main className="min-h-screen bg-gray-50 px-4 py-8">
        <div className="mx-auto max-w-5xl">
          <div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-gray-100">
            <p className="text-3xl">🔒</p>
            <h1 className="mt-3 text-lg font-bold text-gray-900">Solo para super admins</h1>
            <p className="mt-1 text-sm text-gray-500">
              La gestión de usuarios está reservada al super administrador.
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Usuarios del panel</h1>
          <p className="mt-1 text-sm text-gray-500">
            Alta por link de invitación de un solo uso. Vos se lo hacés llegar a la persona.
          </p>
        </div>

        {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        {/* Crear usuario */}
        <form onSubmit={handleCreate} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Crear usuario</h2>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex-1 text-xs font-medium text-gray-500">
              Email
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="persona@empresa.com"
                required
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </label>
            <label className="text-xs font-medium text-gray-500">
              Rol
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as AdminRole)}
                className="mt-1 block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-400 sm:w-40"
              >
                <option value="admin">Admin</option>
                <option value="super_admin">Super admin</option>
              </select>
            </label>
            <button
              type="submit"
              disabled={creating}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {creating ? "Creando..." : "Crear"}
            </button>
          </div>
        </form>

        {/* Link de invitación recién generado */}
        {inviteLink && (
          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
            <p className="text-sm font-semibold text-blue-900">
              Link para <strong>{inviteLink.email}</strong> (vence en 48 h, un solo uso)
            </p>
            <div className="mt-2 flex gap-2">
              <input
                readOnly
                value={inviteLink.url}
                onFocus={(e) => e.target.select()}
                className="w-full flex-1 rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs text-gray-700 outline-none"
              />
              <button
                type="button"
                onClick={copyLink}
                className="shrink-0 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                {copied ? "Copiado" : "Copiar"}
              </button>
            </div>
          </div>
        )}

        {/* Lista */}
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-100">
          {users === null ? (
            <p className="py-16 text-center text-sm text-gray-400">Cargando...</p>
          ) : users.length === 0 ? (
            <p className="py-16 text-center text-sm text-gray-400">Todavía no hay usuarios.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
                  <th className="px-5 py-3 font-medium">Email</th>
                  <th className="px-3 py-3 font-medium">Rol</th>
                  <th className="px-3 py-3 font-medium">Estado</th>
                  <th className="px-3 py-3 font-medium">Último ingreso</th>
                  <th className="px-5 py-3 text-right font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-gray-50 last:border-0">
                    <td className="px-5 py-3">
                      <p className="font-medium text-gray-800">{u.email}</p>
                      {!u.has_password && (
                        <p className="text-xs text-amber-600">Sin contraseña definida</p>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <select
                        value={u.role}
                        disabled={isLastSuper(u)}
                        onChange={(e) => patchUser(u.id, { role: e.target.value as AdminRole })}
                        className="rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-800 outline-none focus:border-blue-400 disabled:opacity-50"
                      >
                        <option value="admin">{ROLE_LABEL.admin}</option>
                        <option value="super_admin">{ROLE_LABEL.super_admin}</option>
                      </select>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          u.active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {u.active ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-gray-500">{fmtDate(u.last_login_at)}</td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-3">
                        <button
                          type="button"
                          onClick={() => regenInvite(u.id, u.email)}
                          className="text-xs font-semibold text-blue-600 hover:underline"
                        >
                          {u.has_password ? "Resetear clave" : "Link de clave"}
                        </button>
                        <button
                          type="button"
                          disabled={isLastSuper(u)}
                          onClick={() => patchUser(u.id, { active: !u.active })}
                          className="text-xs font-semibold text-gray-500 hover:underline disabled:opacity-40"
                        >
                          {u.active ? "Desactivar" : "Activar"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </main>
  );
}
