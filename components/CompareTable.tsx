"use client";

import type { CompareItem, NotebookSpecs } from "@/types";

interface CompareTableProps {
  items: CompareItem[];
  onRemove: (productId: string) => void;
}

function formatPrice(price: number): string {
  return `$${Math.round(price).toLocaleString("es-AR")}`;
}

function getSpecValue(item: CompareItem, key: keyof NotebookSpecs): string {
  const s = item.product.specs as Partial<NotebookSpecs>;
  const val = s[key];
  return val !== undefined && val !== null ? String(val) : "—";
}

const ROWS: {
  label: string;
  render: (item: CompareItem) => string;
}[] = [
  {
    label: "Precio contado",
    render: (item) =>
      item.product.price_cash ? formatPrice(item.product.price_cash) : "—",
  },
  {
    label: "Precio en cuotas",
    render: (item) =>
      item.product.installment_info ??
      (item.product.price_installment && item.product.installment_count
        ? `${item.product.installment_count}x ${formatPrice(item.product.price_installment)}`
        : "—"),
  },
  {
    label: "Calidad / Precio",
    render: (item) => item.analysis?.quality_price_score ?? "—",
  },
  {
    label: "Velocidad general",
    render: (item) => getSpecValue(item, "processor_model"),
  },
  {
    label: "Memoria de trabajo",
    render: (item) => {
      const s = item.product.specs as Partial<NotebookSpecs>;
      return s.ram_gb ? `${s.ram_gb} GB RAM` : "—";
    },
  },
  {
    label: "Almacenamiento",
    render: (item) => {
      const s = item.product.specs as Partial<NotebookSpecs>;
      if (!s.storage_gb) return "—";
      const type =
        s.storage_type === "SSD_NVME"
          ? "SSD NVMe"
          : s.storage_type === "HDD"
            ? "HDD"
            : "SSD";
      return `${type} ${s.storage_gb} GB`;
    },
  },
  {
    label: "Pantalla",
    render: (item) => {
      const s = item.product.specs as Partial<NotebookSpecs>;
      const parts = [];
      if (s.screen_inches) parts.push(`${s.screen_inches}"`);
      if (s.screen_type) parts.push(s.screen_type);
      if (s.screen_resolution) parts.push(s.screen_resolution);
      return parts.join(" · ") || "—";
    },
  },
  {
    label: "Peso",
    render: (item) => {
      const s = item.product.specs as Partial<NotebookSpecs>;
      return s.weight_kg ? `${s.weight_kg} kg` : "—";
    },
  },
  {
    label: "Batería estimada",
    render: (item) => {
      const s = item.product.specs as Partial<NotebookSpecs>;
      return s.battery_wh ? `${s.battery_wh} Wh` : "—";
    },
  },
  {
    label: "GPU",
    render: (item) => {
      const s = item.product.specs as Partial<NotebookSpecs>;
      if (!s.gpu) return "—";
      return s.gpu === "dedicated"
        ? `Dedicada${s.gpu_model ? ` (${s.gpu_model})` : ""}`
        : "Integrada";
    },
  },
  {
    label: "Qué se puede mejorar",
    render: (item) => item.analysis?.upgrade_note ?? "—",
  },
  {
    label: "En palabras simples",
    render: (item) =>
      item.analysis?.spec_highlights?.length
        ? item.analysis.spec_highlights.join(" ")
        : "—",
  },
];

export function CompareTable({ items, onRemove }: CompareTableProps) {
  return (
    // table-fixed: la columna de característica tiene ancho fijo (abajo) y las
    // columnas de producto, al no tener ancho propio, se reparten el resto del
    // ancho del contenedor en partes iguales — así entran todas sin necesidad
    // de scroll horizontal, sea cual sea la cantidad de productos comparados.
    <table className="w-full table-fixed border-collapse font-brand text-xs sm:text-sm">
      <thead>
        <tr className="border-b border-gathering-outline-variant bg-gathering-surface-container-low">
          <th className="w-[76px] bg-gathering-surface-container-low py-3 pr-2 text-left text-[10px] font-medium uppercase tracking-wide text-gathering-on-surface-variant sm:w-[120px] sm:pr-4 sm:text-xs">
            Característica
          </th>
          {items.map((item) => (
            <th key={item.product.id} className="px-1.5 py-3 text-center sm:px-3">
              <div className="flex flex-col items-center gap-1">
                {item.product.image_url && (
                  <img
                    src={item.product.image_url}
                    alt={item.product.title}
                    className="h-9 w-9 object-contain sm:h-14 sm:w-14"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display =
                        "none";
                    }}
                  />
                )}
                <p className="line-clamp-2 text-[10px] font-semibold text-gathering-on-surface sm:text-xs">
                  {item.product.title}
                </p>
                <button
                  type="button"
                  onClick={() => onRemove(item.product.id)}
                  className="text-[10px] text-gathering-on-surface-variant hover:text-gathering-error sm:text-xs"
                >
                  Quitar
                </button>
              </div>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {ROWS.map((row) => (
          <tr key={row.label} className="border-b border-gathering-outline-variant/50 last:border-0">
            <td className="bg-gathering-surface-container py-3 pr-2 text-[10px] font-medium text-gathering-on-surface-variant sm:pr-4 sm:text-xs">
              {row.label}
            </td>
            {items.map((item) => (
              <td
                key={item.product.id}
                className="break-words px-1.5 py-3 text-center text-gathering-on-surface sm:px-3"
              >
                {row.render(item)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
