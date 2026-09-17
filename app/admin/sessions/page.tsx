"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { adminFetch } from "@/lib/auth/adminClient";

interface VisitSummary {
  visit_id: string;
  searches: number;
  chats: number;
  clicks: number;
  errors: number;
  first_seen: string;
  last_seen: string;
}

interface TimelineEntry {
  kind: "search" | "chat" | "click" | "event";
  created_at: string;
  data: Record<string, unknown>;
}

interface ActivityEntry {
  kind: "search" | "chat" | "click";
  created_at: string;
  visit_id: string;
  data: Record<string, unknown>;
}

interface ErrorEntry {
  visit_id: string;
  path: string | null;
  metadata: { kind?: string; message?: string; userAgent?: string } | null;
  created_at: string;
}

interface Summary {
  visits: number;
  searches: number;
  chats: number;
  clicks: number;
  errors: number;
}

interface DashboardData {
  hours: number;
  summary: Summary;
  recentErrors: ErrorEntry[];
  recentActivity: ActivityEntry[];
  visits: VisitSummary[];
  names: Record<string, string>;
}

const HOUR_OPTIONS = [
  { value: 1, label: "Última hora" },
  { value: 6, label: "Últimas 6h" },
  { value: 24, label: "Últimas 24h" },
  { value: 72, label: "Últimos 3 días" },
  { value: 168, label: "Última semana" },
];

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "medium" });
}
function fmtRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diffMs / 1000);
  if (s < 60) return "recién";
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  return `hace ${Math.floor(h / 24)}d`;
}
function shortVisit(id: string): string {
  return id.length > 10 ? `${id.slice(0, 10)}…` : id;
}
// Nombre que la persona tipeó una vez (VisitorNamePrompt) si existe, si no el
// visit_id acortado — así el dashboard es legible ("Juan") en vez de ids.
function visitLabel(id: string, names: Record<string, string>): string {
  return names[id] || shortVisit(id);
}

function KpiCard({ label, value, tone }: { label: string; value: number; tone?: "danger" }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${tone === "danger" && value > 0 ? "text-red-600" : "text-gray-900"}`}>
        {value}
      </p>
    </div>
  );
}

function ActivityLine({ entry, names }: { entry: ActivityEntry; names: Record<string, string> }) {
  const icon = entry.kind === "search" ? "🔍" : entry.kind === "chat" ? "💬" : "🖱️";
  let text: string;
  if (entry.kind === "search") {
    text = `Buscó: "${String(entry.data.raw_input)}" (${String(entry.data.result_count ?? 0)} resultados)`;
  } else if (entry.kind === "chat") {
    text = entry.data.greeting
      ? "Abrió el chat de resultados"
      : `Preguntó: "${String(entry.data.user_message ?? "")}"`;
  } else {
    text = `Click en: ${String(entry.data.product_title ?? "producto")}`;
  }
  return (
    <div className="flex items-start gap-2 border-b border-gray-50 py-2 text-sm last:border-0">
      <span>{icon}</span>
      <p className="flex-1 truncate text-gray-700">{text}</p>
      <span className="shrink-0 text-xs text-gray-400">{visitLabel(entry.visit_id, names)}</span>
      <span className="shrink-0 text-xs text-gray-400">{fmtRelative(entry.created_at)}</span>
    </div>
  );
}

function TimelineRow({ entry }: { entry: TimelineEntry }) {
  const isError = entry.kind === "event" && entry.data.event_type === "client_error";
  return (
    <div className={`rounded-xl border p-3 text-sm ${isError ? "border-red-200 bg-red-50" : "border-gray-100 bg-white"}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-gray-700">
          {isError
            ? "🚨 Error del cliente"
            : { search: "🔍 Búsqueda", chat: "💬 Chat", click: "🖱️ Click", event: "📍 Evento" }[entry.kind]}
        </span>
        <span className="text-xs text-gray-400">{fmtTime(entry.created_at)}</span>
      </div>
      {entry.kind === "search" && (
        <p className="mt-1 text-gray-600">
          &ldquo;{String(entry.data.raw_input)}&rdquo;
          <span className="ml-1 text-xs text-gray-400">
            — {String(entry.data.result_count ?? 0)} resultados · token {String(entry.data.share_token)}
          </span>
        </p>
      )}
      {entry.kind === "chat" && (
        <div className="mt-1 space-y-1">
          {!!entry.data.user_message && (
            <p className="text-gray-700">
              <span className="font-medium text-gray-500">Usuario:</span> {String(entry.data.user_message)}
            </p>
          )}
          <p className="text-gray-600">
            <span className="font-medium text-gray-500">Asistente:</span> {String(entry.data.assistant_reply ?? "")}
          </p>
          <p className="text-xs text-gray-400">
            {String(entry.data.context)} {entry.data.greeting ? "· saludo" : ""}{" "}
            {entry.data.factual_answer ? "· respuesta factual" : ""} · {String(entry.data.duration_ms ?? "?")}ms
          </p>
        </div>
      )}
      {entry.kind === "click" && (
        <p className="mt-1 text-gray-600">{String(entry.data.product_title ?? entry.data.product_id)}</p>
      )}
      {entry.kind === "event" && (
        <div className="mt-1">
          {!isError && <p className="text-gray-600">{String(entry.data.event_type)}</p>}
          {isError && (
            <>
              <p className="text-red-700">
                {String((entry.data.metadata as Record<string, unknown> | null)?.kind ?? "")}:{" "}
                {String((entry.data.metadata as Record<string, unknown> | null)?.message ?? "")}
              </p>
              <p className="text-xs text-gray-400">{String(entry.data.path ?? "")}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminSessionsPage() {
  const [hours, setHours] = useState(24);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const res = await adminFetch(`/api/admin/sessions?hours=${hours}`);
    if (res.ok) setData((await res.json()) as DashboardData);
    if (!silent) setLoading(false);
  }, [hours]);

  useEffect(() => {
    load();
  }, [load]);

  // Auto-refresh cada 15s mientras la pestaña esté abierta y no se esté
  // viendo el detalle de una visita puntual — pedido implícito de "ver todo
  // de forma entendible" durante una prueba en curso, sin tener que apretar
  // "Actualizar" a mano cada rato (mismo rol que el tail de logs manual que
  // se usaba antes, ahora self-service para cualquiera con acceso al panel).
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (autoRefresh && !selected) {
      intervalRef.current = setInterval(() => load(true), 15000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh, selected, load]);

  const openVisit = async (visitId: string) => {
    setSelected(visitId);
    setLoadingTimeline(true);
    const res = await adminFetch(`/api/admin/sessions?visitId=${encodeURIComponent(visitId)}`);
    if (res.ok) {
      const d = (await res.json()) as { timeline: TimelineEntry[] };
      setTimeline(d.timeline);
    }
    setLoadingTimeline(false);
  };

  if (selected) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <button
          type="button"
          onClick={() => setSelected(null)}
          className="mb-3 text-sm font-medium text-blue-600 hover:underline"
        >
          ← Volver al dashboard
        </button>
        <p className="mb-3 text-sm text-gray-500">
          {data?.names[selected] ? (
            <>
              <span className="font-semibold text-gray-700">{data.names[selected]}</span>{" "}
              <span className="font-mono text-xs text-gray-400">({selected})</span>
            </>
          ) : (
            <span className="font-mono text-xs text-gray-400">visit_id: {selected}</span>
          )}
        </p>
        {loadingTimeline ? (
          <p className="text-sm text-gray-400">Cargando...</p>
        ) : timeline.length === 0 ? (
          <p className="text-sm text-gray-400">Sin actividad registrada para esta visita.</p>
        ) : (
          <div className="space-y-2">
            {timeline.map((entry, i) => (
              <TimelineRow key={i} entry={entry} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Dashboard de pruebas</h1>
          <p className="mt-1 text-sm text-gray-500">Errores, búsquedas, chats y clicks de todas las visitas.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
            className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm text-gray-600"
          >
            {HOUR_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-xs text-gray-500">
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
            Auto (15s)
          </label>
          <button
            type="button"
            onClick={() => load()}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            Actualizar
          </button>
        </div>
      </div>

      {loading || !data ? (
        <p className="mt-6 text-sm text-gray-400">Cargando...</p>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <KpiCard label="Visitas" value={data.summary.visits} />
            <KpiCard label="Búsquedas" value={data.summary.searches} />
            <KpiCard label="Mensajes de chat" value={data.summary.chats} />
            <KpiCard label="Clicks" value={data.summary.clicks} />
            <KpiCard label="Errores" value={data.summary.errors} tone="danger" />
          </div>

          {/* Errores primero y bien visible — es lo que más importa revisar
              de una prueba con varias personas. */}
          <div className="mt-6">
            <h2 className="text-sm font-bold text-gray-900">
              🚨 Errores recientes {data.recentErrors.length > 0 && `(${data.recentErrors.length})`}
            </h2>
            {data.recentErrors.length === 0 ? (
              <p className="mt-2 rounded-xl bg-white p-4 text-sm text-gray-400 shadow-sm ring-1 ring-gray-100">
                Sin errores registrados. 🎉
              </p>
            ) : (
              <div className="mt-2 space-y-1.5">
                {data.recentErrors.map((e, i) => (
                  <div key={i} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-red-700">{e.metadata?.kind ?? "error"}</span>
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        <span>{visitLabel(e.visit_id, data.names)}</span>
                        <span>{fmtRelative(e.created_at)}</span>
                      </div>
                    </div>
                    <p className="mt-0.5 text-red-800">{e.metadata?.message ?? "(sin mensaje)"}</p>
                    {e.path && <p className="text-xs text-gray-400">{e.path}</p>}
                    {e.metadata?.userAgent && (
                      <p className="truncate text-xs text-gray-400" title={e.metadata.userAgent}>
                        {e.metadata.userAgent}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div>
              <h2 className="text-sm font-bold text-gray-900">Actividad reciente</h2>
              <div className="mt-2 max-h-[32rem] overflow-y-auto rounded-xl bg-white p-3 shadow-sm ring-1 ring-gray-100">
                {data.recentActivity.length === 0 ? (
                  <p className="py-6 text-center text-sm text-gray-400">Sin actividad en este período.</p>
                ) : (
                  data.recentActivity.map((entry, i) => <ActivityLine key={i} entry={entry} names={data.names} />)
                )}
              </div>
            </div>

            <div>
              <h2 className="text-sm font-bold text-gray-900">Por visita ({data.visits.length})</h2>
              <div className="mt-2 max-h-[32rem] overflow-y-auto rounded-xl bg-white shadow-sm ring-1 ring-gray-100">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
                      <th className="px-3 py-2 font-medium">Visita</th>
                      <th className="px-3 py-2 font-medium">Búsq.</th>
                      <th className="px-3 py-2 font-medium">Chats</th>
                      <th className="px-3 py-2 font-medium">Clicks</th>
                      <th className="px-3 py-2 font-medium">Err.</th>
                      <th className="px-3 py-2 font-medium">Última</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.visits.map((v) => (
                      <tr
                        key={v.visit_id}
                        onClick={() => openVisit(v.visit_id)}
                        className="cursor-pointer border-b border-gray-50 hover:bg-gray-50"
                      >
                        <td className="px-3 py-2 text-xs text-gray-600">{visitLabel(v.visit_id, data.names)}</td>
                        <td className="px-3 py-2">{v.searches}</td>
                        <td className="px-3 py-2">{v.chats}</td>
                        <td className="px-3 py-2">{v.clicks}</td>
                        <td className={`px-3 py-2 ${v.errors > 0 ? "font-semibold text-red-600" : "text-gray-400"}`}>
                          {v.errors}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-400">{fmtRelative(v.last_seen)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
