"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { adminFetch } from "@/lib/auth/adminClient";
import { downloadCsv, downloadJson, stampedName } from "@/lib/admin/export";
import { Card, EmptyState, ExportMenu, Notice, PageHeader, PageSkeleton, StatCard } from "@/components/admin/ui";

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
  // Último texto que buscó cada visita (para etiquetar cuando no dejó nombre)
  lastSearch: Record<string, string>;
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
function visitLabel(id: string, names: Record<string, string>, lastSearch?: Record<string, string>): string {
  if (names[id]) return names[id];
  const search = lastSearch?.[id];
  return search ? `“${search}”` : shortVisit(id);
}

function KpiCard({ label, value, tone }: { label: string; value: number; tone?: "danger" }) {
  const accent = tone === "danger" ? (value > 0 ? "red" : "green") : "blue";
  return <StatCard label={label} value={value.toLocaleString("es-AR")} accent={accent} />;
}

function ActivityLine({ entry, names, lastSearch }: { entry: ActivityEntry; names: Record<string, string>; lastSearch: Record<string, string> }) {
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
      <span className="shrink-0 text-xs text-gray-400">{visitLabel(entry.visit_id, names, lastSearch)}</span>
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

function exportVisitsCsv(d: DashboardData) {
  downloadCsv(stampedName(`visitas-${d.hours}h`, "csv"), [
    ["Visita", "Nombre", "Última búsqueda", "Búsquedas", "Chats", "Clicks", "Errores", "Primera actividad", "Última actividad"],
    ...d.visits.map((v) => [
      v.visit_id, d.names[v.visit_id] ?? "", d.lastSearch[v.visit_id] ?? "", v.searches, v.chats, v.clicks, v.errors,
      v.first_seen, v.last_seen,
    ]),
  ]);
}

function activityText(e: ActivityEntry): string {
  if (e.kind === "search") return `Buscó: ${String(e.data.raw_input)} (${String(e.data.result_count ?? 0)} resultados)`;
  if (e.kind === "chat") return e.data.greeting ? "Abrió el chat" : `Preguntó: ${String(e.data.user_message ?? "")}`;
  return `Click en: ${String(e.data.product_title ?? "producto")}`;
}

function exportActivityCsv(d: DashboardData) {
  downloadCsv(stampedName(`actividad-${d.hours}h`, "csv"), [
    ["Fecha", "Tipo", "Detalle", "Visita", "Nombre"],
    ...d.recentActivity.map((e) => [e.created_at, e.kind, activityText(e), e.visit_id, d.names[e.visit_id] ?? ""]),
  ]);
}

function exportErrorsCsv(d: DashboardData) {
  downloadCsv(stampedName("errores", "csv"), [
    ["Fecha", "Tipo", "Mensaje", "Página", "Navegador", "Visita"],
    ...d.recentErrors.map((e) => [
      e.created_at, e.metadata?.kind ?? "", e.metadata?.message ?? "", e.path ?? "", e.metadata?.userAgent ?? "", e.visit_id,
    ]),
  ]);
}

function exportTimelineCsv(visitId: string, timeline: TimelineEntry[]) {
  downloadCsv(stampedName(`visita-${visitId.slice(0, 8)}`, "csv"), [
    ["Fecha", "Tipo", "Detalle"],
    ...timeline.map((t) => [t.created_at, t.kind, JSON.stringify(t.data)]),
  ]);
}

export default function AdminSessionsPage() {
  const [hours, setHours] = useState(24);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
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
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setSelected(null)}
          className="text-sm font-medium text-blue-600 hover:underline print:hidden"
        >
          ← Volver a la actividad
        </button>
        <PageHeader
          title={data?.names[selected] ?? (data?.lastSearch[selected] ? `“${data.lastSearch[selected]}”` : "Recorrido de la visita")}
          subtitle={<span className="font-mono text-xs">visit_id: {selected}</span>}
          actions={
            <ExportMenu
              options={[
                { label: "Recorrido (CSV)", hint: "Cada paso con fecha y detalle", onSelect: () => exportTimelineCsv(selected, timeline) },
                { label: "Recorrido (JSON)", onSelect: () => downloadJson(stampedName(`visita-${selected.slice(0, 8)}`, "json"), timeline) },
                { label: "Imprimir / PDF", onSelect: () => window.print() },
              ]}
            />
          }
        />
        {loadingTimeline ? (
          <PageSkeleton stats={0} blocks={2} />
        ) : timeline.length === 0 ? (
          <EmptyState title="Sin actividad registrada para esta visita" />
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

  const q = query.trim().toLowerCase();
  const visitMatches = (id: string) =>
    !q ||
    id.toLowerCase().includes(q) ||
    (data?.names[id] ?? "").toLowerCase().includes(q) ||
    (data?.lastSearch[id] ?? "").toLowerCase().includes(q);
  const visitsF = (data?.visits ?? []).filter((v) => visitMatches(v.visit_id));
  const activityF = (data?.recentActivity ?? []).filter(
    (a) => !q || visitMatches(a.visit_id) || JSON.stringify(a.data).toLowerCase().includes(q)
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Actividad en vivo"
        subtitle="Qué está haciendo la gente ahora mismo en el sitio: cada búsqueda, pregunta al chat, click y error."
        actions={
          <>
            <ExportMenu
              options={[
                { label: "Visitas (CSV)", hint: "Una fila por visita, con lo último que buscó", onSelect: () => data && exportVisitsCsv(data) },
                { label: "Actividad reciente (CSV)", onSelect: () => data && exportActivityCsv(data) },
                { label: "Errores (CSV)", onSelect: () => data && exportErrorsCsv(data) },
              ]}
            />
          </>
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nombre, texto buscado o visita…"
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 sm:max-w-xs"
        />
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
        <PageSkeleton stats={5} blocks={2} />
      ) : (
        <>
          <Notice>
            <strong>Cómo leerlo:</strong> una <em>visita</em> es una persona (un navegador) entrando al sitio. Abajo, a la
            derecha, cada fila es una visita con lo que hizo; hacé click en una para ver su recorrido completo, paso a
            paso. Si la persona dejó su nombre se ve el nombre; si no, se ve lo último que buscó. Esta pantalla sirve
            para revisar pruebas y detectar errores — para números del negocio usá <em>Analítica</em> y <em>Tiendas</em>.
          </Notice>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            <KpiCard label="Visitas" value={data.summary.visits} />
            <KpiCard label="Búsquedas" value={data.summary.searches} />
            <KpiCard label="Mensajes de chat" value={data.summary.chats} />
            <KpiCard label="Clicks" value={data.summary.clicks} />
            <KpiCard label="Errores" value={data.summary.errors} tone="danger" />
          </div>

          {/* Errores primero y bien visible — es lo que más importa revisar
              de una prueba con varias personas. */}
          <Card title={`🚨 Errores recientes${data.recentErrors.length > 0 ? ` (${data.recentErrors.length})` : ""}`}>
            {data.recentErrors.length === 0 ? (
              <p className="text-sm text-gray-400">Sin errores registrados. 🎉</p>
            ) : (
              <div className="max-h-80 space-y-1.5 overflow-y-auto">
                {data.recentErrors.map((e, i) => (
                  <div key={i} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-red-700">{e.metadata?.kind ?? "error"}</span>
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        <span>{visitLabel(e.visit_id, data.names, data.lastSearch)}</span>
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
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Actividad reciente" subtitle={q ? `Filtrando por “${query}”` : undefined}>
              <div className="max-h-[32rem] overflow-y-auto">
                {activityF.length === 0 ? (
                  <p className="py-6 text-center text-sm text-gray-400">Sin actividad en este período.</p>
                ) : (
                  activityF.map((entry, i) => (
                    <ActivityLine key={i} entry={entry} names={data.names} lastSearch={data.lastSearch} />
                  ))
                )}
              </div>
            </Card>

            <Card title={`Por visita (${visitsF.length}${q ? ` de ${data.visits.length}` : ""})`}>
              <div className="-mx-2 max-h-[32rem] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
                      <th className="px-2 py-2 font-medium">Visita</th>
                      <th className="px-2 py-2 font-medium">Búsq.</th>
                      <th className="px-2 py-2 font-medium">Chats</th>
                      <th className="px-2 py-2 font-medium">Clicks</th>
                      <th className="px-2 py-2 font-medium">Err.</th>
                      <th className="px-2 py-2 font-medium">Última</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visitsF.map((v) => (
                      <tr
                        key={v.visit_id}
                        onClick={() => openVisit(v.visit_id)}
                        className="cursor-pointer border-b border-gray-50 hover:bg-blue-50/50"
                      >
                        <td className="max-w-[12rem] truncate px-2 py-2 text-xs text-gray-600" title={v.visit_id}>
                          {visitLabel(v.visit_id, data.names, data.lastSearch)}
                        </td>
                        <td className="px-2 py-2 tabular-nums">{v.searches}</td>
                        <td className="px-2 py-2 tabular-nums">{v.chats}</td>
                        <td className="px-2 py-2 tabular-nums">{v.clicks}</td>
                        <td className={`px-2 py-2 tabular-nums ${v.errors > 0 ? "font-semibold text-red-600" : "text-gray-400"}`}>
                          {v.errors}
                        </td>
                        <td className="px-2 py-2 text-xs text-gray-400">{fmtRelative(v.last_seen)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {visitsF.length === 0 && <p className="py-6 text-center text-sm text-gray-400">Ninguna visita coincide.</p>}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
