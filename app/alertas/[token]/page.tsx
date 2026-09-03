"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { LogoBrand } from "@/components/LogoBrand";
import { withBasePath } from "@/lib/basePath";
import type { PriceAlertWithProduct } from "@/types";

function formatPrice(price: number): string {
  return `$${Math.round(price).toLocaleString("es-AR")}`;
}

export default function MyAlertsPage() {
  const params = useParams();
  const token = params.token as string;

  const [alerts, setAlerts] = useState<PriceAlertWithProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    fetch(withBasePath(`/api/alerts/manage/${token}`))
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: { alerts: PriceAlertWithProduct[] }) => setAlerts(data.alerts))
      .catch(() => setAlerts([]))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleRemove(id: string) {
    setRemovingId(id);
    await fetch(withBasePath(`/api/alerts/${id}?token=${token}`), { method: "DELETE" }).catch(() => {});
    setAlerts((prev) => prev.filter((a) => a.id !== id));
    setRemovingId(null);
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-gathering-outline-variant/50 bg-gathering-surface-container/80 px-4 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <a href={withBasePath("/")} className="flex items-center gap-2">
            <LogoBrand logoClass="h-11" />
          </a>
          <h1 className="font-brand text-sm font-semibold text-gathering-on-surface">Mis alertas de precio</h1>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gathering-primary-fixed-dim border-t-transparent" />
          </div>
        ) : alerts.length === 0 ? (
          <div className="py-16 text-center font-brand text-gathering-on-surface-variant">
            <p>No tenés alertas activas.</p>
            <a href={withBasePath("/")} className="mt-2 inline-block text-sm text-gathering-primary-fixed-dim hover:underline">Buscar productos</a>
          </div>
        ) : (
          <div className="space-y-3">
            {alerts.map((alert) => (
              <div key={alert.id} className="gathering-glass-card flex items-center gap-4 rounded-2xl p-4">
                {alert.product.image_url && (
                  <img src={alert.product.image_url} alt="" className="h-16 w-16 shrink-0 object-contain" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-brand text-sm font-semibold text-gathering-on-surface">{alert.product.title}</p>
                  <p className="mt-0.5 font-brand text-xs text-gathering-on-surface-variant">
                    Precio actual: {alert.product.price_cash ? formatPrice(alert.product.price_cash) : "—"}
                    {" · "}Te avisamos si baja de {formatPrice(alert.target_price)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemove(alert.id)}
                  disabled={removingId === alert.id}
                  className="shrink-0 rounded-xl border border-gathering-outline-variant px-3 py-2 font-brand text-xs font-medium text-gathering-on-surface-variant hover:border-gathering-error/50 hover:bg-gathering-error/10 hover:text-gathering-error disabled:opacity-50"
                >
                  {removingId === alert.id ? "..." : "Eliminar"}
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
