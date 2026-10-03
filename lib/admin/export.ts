// Utilidades de exportación del panel /admin (solo cliente): CSV compatible con
// Excel (BOM + comillas), JSON, e impresión/PDF de un reporte en HTML.

export type CsvCell = string | number | boolean | null | undefined;

function csvCell(v: CsvCell): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  // Evita que Excel interprete una celda como fórmula (=, +, -, @) — el texto
  // de las búsquedas lo escribe el público.
  const safe = /^[=+\-@]/.test(s) && Number.isNaN(Number(s)) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function toCsv(rows: CsvCell[][]): string {
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
}

export function downloadText(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadCsv(filename: string, rows: CsvCell[][]): void {
  // BOM para que Excel respete los acentos.
  downloadText(filename, "﻿" + toCsv(rows), "text/csv;charset=utf-8");
}

export function downloadJson(filename: string, data: unknown): void {
  downloadText(filename, JSON.stringify(data, null, 2), "application/json");
}

// "analitica-30d-2026-10-02.csv"
export function stampedName(base: string, ext: string): string {
  const d = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
  return `${base}-${d}.${ext}`;
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Abre un reporte en HTML en una pestaña nueva y dispara el diálogo de
// impresión (de ahí "Guardar como PDF"). `bodyHtml` ya debe venir escapado.
export function openPrintReport(title: string, bodyHtml: string): void {
  const w = window.open("", "_blank");
  if (!w) {
    alert("El navegador bloqueó la ventana del reporte. Permití las ventanas emergentes para este sitio.");
    return;
  }
  w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  *{box-sizing:border-box} body{font-family:Inter,system-ui,sans-serif;color:#111827;margin:0;padding:32px;max-width:860px;margin-inline:auto}
  h1{font-size:22px;margin:0 0 4px} h2{font-size:14px;margin:24px 0 8px;text-transform:uppercase;letter-spacing:.05em;color:#6b7280}
  .sub{color:#6b7280;font-size:13px;margin-bottom:20px}
  .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
  .tile{border:1px solid #e5e7eb;border-radius:10px;padding:12px}
  .tile b{display:block;font-size:22px;margin-top:2px} .tile span{font-size:11px;color:#6b7280}
  table{width:100%;border-collapse:collapse;font-size:13px} td,th{padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:left}
  th{font-size:11px;color:#6b7280;text-transform:uppercase}
  .bars{display:flex;align-items:flex-end;gap:2px;height:70px;border-bottom:1px solid #d1d5db}
  .bars i{flex:1;background:#3b82f6;border-radius:2px 2px 0 0;min-height:2px}
  .foot{margin-top:28px;font-size:11px;color:#9ca3af}
  @media print{body{padding:0}}
</style></head><body>${bodyHtml}
<p class="foot">Generado el ${escapeHtml(new Date().toLocaleString("es-AR"))} · indexa</p>
<script>window.addEventListener("load",function(){setTimeout(function(){window.print()},300)})</script>
</body></html>`);
  w.document.close();
}
