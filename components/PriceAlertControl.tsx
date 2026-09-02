"use client";

import { useEffect, useState } from "react";
import { withBasePath } from "@/lib/basePath";
import { getAlertContact, saveAlertContact } from "@/lib/storage/localStorage";
import { formatPrice } from "@/lib/domain/productDisplay";

// Jugada #16 de PLAN_MEJORAS: gesto "Avisame si baja de $X" desde la tarjeta.
// La tabla price_alerts y el endpoint de check ya existían; esto es solo la
// UI. Push/PWA queda pendiente aparte — hoy el aviso es por email.
// Autocontenido: su propio estado + POST a /api/alerts, reusa el email
// recordado (getAlertContact) entre visitas.

type Status = "idle" | "open" | "loading" | "saved" | "error";

export function PriceAlertControl({
  productId,
  currentPrice,
}: {
  productId: string;
  currentPrice: number | null;
}) {
  const suggested = currentPrice ? Math.round((currentPrice * 0.9) / 1000) * 1000 : 0;
  const [status, setStatus] = useState<Status>("idle");
  const [target, setTarget] = useState(String(suggested || ""));
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [manageToken, setManageToken] = useState<string | null>(null);

  useEffect(() => {
    const c = getAlertContact();
    if (c?.email) setEmail(c.email);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const price = Number(target);
    const mail = email.trim();
    if (!price || price <= 0 || !mail) return;
    setStatus("loading");
    setError("");
    try {
      const res = await fetch(withBasePath("/api/alerts"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: productId, target_price: price, email: mail }),
      });
      const body = await res.json();
      if (res.ok) {
        if (body.manage_token) {
          saveAlertContact({ email: mail, manage_token: body.manage_token });
          setManageToken(body.manage_token);
        }
        setStatus("saved");
      } else {
        setError(body.error ?? "No se pudo guardar la alerta");
        setStatus("error");
      }
    } catch {
      setError("Error de conexión");
      setStatus("error");
    }
  }

  if (status === "idle") {
    return (
      <button
        type="button"
        onClick={() => setStatus("open")}
        className="flex w-full items-center justify-center gap-1 rounded-full border border-gathering-outline-variant py-1.5 font-brand text-xs font-semibold text-gathering-on-surface-variant transition-colors hover:bg-black/5 active:scale-[0.97]"
      >
        <span className="material-symbols-outlined text-[16px]">notifications</span>
        Avisame si baja de precio
      </button>
    );
  }

  if (status === "saved") {
    return (
      <div className="flex flex-col gap-1 rounded-lg bg-emerald-600/10 px-3 py-2 font-brand text-[11px] text-emerald-700">
        <div className="flex items-center gap-1.5">
          <span aria-hidden>✓</span>
          <span>Te avisamos por email si baja de {formatPrice(Number(target))}</span>
          <button type="button" onClick={() => setStatus("idle")} className="ml-auto shrink-0">
            ✕
          </button>
        </div>
        {manageToken && (
          <a
            href={withBasePath(`/alertas/${manageToken}`)}
            className="font-semibold underline hover:text-emerald-800"
          >
            Ver mis alertas
          </a>
        )}
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-1.5 rounded-lg border border-amber-500/40 bg-amber-50 p-2.5"
    >
      <p className="font-brand text-[11px] font-semibold text-amber-800">Avisame por email si baja de:</p>
      <div className="flex gap-1.5">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 font-brand text-xs text-gathering-on-surface-variant">
            $
          </span>
          <input
            type="number"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            min={1}
            required
            className="w-full rounded-md border border-amber-400/40 bg-gathering-surface py-1.5 pl-5 pr-2 font-brand text-xs text-gathering-on-surface outline-none focus:border-amber-400"
          />
        </div>
        <button
          type="button"
          onClick={() => setStatus("idle")}
          className="shrink-0 rounded-md border border-gathering-outline-variant px-2 font-brand text-xs text-gathering-on-surface-variant hover:bg-black/5"
        >
          ✕
        </button>
      </div>
      <div className="flex gap-1.5">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tu@email.com"
          required
          className="w-full flex-1 rounded-md border border-amber-400/40 bg-gathering-surface px-2 py-1.5 font-brand text-xs text-gathering-on-surface outline-none focus:border-amber-400"
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className="shrink-0 rounded-md bg-amber-700 px-2.5 py-1.5 font-brand text-xs font-semibold text-white hover:bg-amber-800 disabled:opacity-60"
        >
          {status === "loading" ? "..." : "Activar"}
        </button>
      </div>
      {status === "error" && <p className="font-brand text-[11px] text-gathering-error">{error}</p>}
    </form>
  );
}
