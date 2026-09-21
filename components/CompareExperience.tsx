"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CompareTable } from "@/components/CompareTable";
import { LogoBrand } from "@/components/LogoBrand";
import { Portal } from "@/components/Portal";
import { ProductCompareCard } from "@/components/ProductCompareCard";
import { SpecGlossary } from "@/components/SpecGlossary";
import { ChatMessageText } from "@/components/ChatMessageText";
import { SpecDisplayModeToggle } from "@/components/SpecDisplayModeToggle";
import type { SpecDisplayMode } from "@/components/SpecHighlights";
import { trackEvent } from "@/lib/analytics/track";
import { getOrCreateVisitId } from "@/lib/analytics/visit";
import {
  buildGroupVerdicts,
  explainBatteryMeaningShort,
  explainCameraMeaning,
  explainGpuMeaning,
  explainProcessorMeaning,
  explainRamMeaning,
  explainScreenMeaningShort,
  explainStorageMeaning,
} from "@/lib/domain/specExplainer";
import { withBasePath } from "@/lib/basePath";
import { addRecentProducts, getRecentProducts } from "@/lib/storage/localStorage";
import { TIER_RANK } from "@/lib/domain/usageToSpecs";
import { describeBudgetForChat } from "@/lib/domain/budgetTiers";
import type { AlternativeProduct, CompareItem, NotebookSpecs, PhoneSpecs, Product, Search, SimilarStoreVariant, TabletSpecs, UseCase } from "@/types";

// Extraído de app/compare/page.tsx para poder montarse en dos modos: como la
// página completa /compare (acceso directo/compartible, sin cambios) o como
// popup sobre la pantalla de resultados (disparado desde la barra pegajosa de
// comparar) — ver CompareExperienceProps más abajo. Toda la lógica de datos y
// las vistas (grilla 3+/"duelo" de 2) son las mismas de siempre.

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPrice(p: number) {
  return `$${Math.round(p).toLocaleString("es-AR")}`;
}

const GENERIC_PREFIXES = ["celular", "notebook", "laptop", "tablet", "pc", "computadora", "smart", "tv", "televisor"];

function shortName(item: CompareItem): string {
  const words = item.product.title.split(" ");
  const filtered = words.filter((w) => !GENERIC_PREFIXES.includes(w.toLowerCase()));
  const name = filtered.slice(0, 4).join(" ");
  return name || (item.product.brand ?? item.product.title);
}

interface SpecSection {
  label: string;
  icon: React.ReactNode;
  decorIcon: React.ReactNode;
  p1Value: string;
  p2Value: string;
  p1Wins: boolean | null;
  note?: string;
  winnerLabel?: string;
  p1Simple?: string;
  p2Simple?: string;
}

function getSpecSections(a: CompareItem, b: CompareItem): SpecSection[] {
  const sa = a.product.specs as Record<string, unknown>;
  const sb = b.product.specs as Record<string, unknown>;
  const cat = a.product.category;
  const sections: SpecSection[] = [];

  // ── Pantalla ──
  const aInch = Number(sa.screen_inches ?? 0);
  const bInch = Number(sb.screen_inches ?? 0);
  const aType = cat === "phone"
    ? String((sa as Partial<PhoneSpecs>).screen_type ?? "")
    : String((sa as Partial<NotebookSpecs>).screen_type ?? "");
  const bType = cat === "phone"
    ? String((sb as Partial<PhoneSpecs>).screen_type ?? "")
    : String((sb as Partial<NotebookSpecs>).screen_type ?? "");
  const aRes = (sa as Partial<NotebookSpecs>).screen_resolution;
  const bRes = (sb as Partial<NotebookSpecs>).screen_resolution;
  const aScreen = [aInch ? `${aInch}"` : "", aType, aRes ? `(${aRes})` : ""].filter(Boolean).join(" ");
  const bScreen = [bInch ? `${bInch}"` : "", bType, bRes ? `(${bRes})` : ""].filter(Boolean).join(" ");
  const aWeight = cat === "notebook" || cat === "desktop" ? (sa as Partial<NotebookSpecs>).weight_kg ?? null : null;
  const bWeight = cat === "notebook" || cat === "desktop" ? (sb as Partial<NotebookSpecs>).weight_kg ?? null : null;

  sections.push({
    label: "Pantalla",
    icon: <PhoneIconSm />,
    decorIcon: <PhoneIconLg />,
    p1Value: aScreen || "—",
    p2Value: bScreen || "—",
    p1Wins: aInch !== bInch ? aInch > bInch : null,
    note: "El tamaño y tipo de pantalla determinan la experiencia visual diaria.",
    p1Simple: aInch ? explainScreenMeaningShort(aInch, cat, aWeight) : undefined,
    p2Simple: bInch ? explainScreenMeaningShort(bInch, cat, bWeight) : undefined,
  });

  // ── Procesador ──
  const aTier = (sa as Partial<NotebookSpecs & TabletSpecs>).processor_tier;
  const bTier = (sb as Partial<NotebookSpecs & TabletSpecs>).processor_tier;
  const aProcModel = cat === "phone"
    ? [String((sa as Partial<PhoneSpecs>).processor_chip ?? ""), String((sa as Partial<PhoneSpecs>).processor_model ?? "")].filter(Boolean).join(" ")
    : String((sa as Partial<NotebookSpecs>).processor_model ?? "");
  const bProcModel = cat === "phone"
    ? [String((sb as Partial<PhoneSpecs>).processor_chip ?? ""), String((sb as Partial<PhoneSpecs>).processor_model ?? "")].filter(Boolean).join(" ")
    : String((sb as Partial<NotebookSpecs>).processor_model ?? "");
  const procWins = aTier && bTier && aTier !== bTier ? TIER_RANK[aTier] > TIER_RANK[bTier] : null;

  sections.push({
    label: "Procesador",
    icon: <CpuIconSm />,
    decorIcon: <CpuIconLg />,
    p1Value: aProcModel || "—",
    p2Value: bProcModel || "—",
    p1Wins: procWins,
    note: "El procesador determina qué tan rápido corren tus programas y cuántas tareas soporta a la vez.",
    p1Simple: aTier ? explainProcessorMeaning(aTier) : undefined,
    p2Simple: bTier ? explainProcessorMeaning(bTier) : undefined,
  });

  // ── Memoria RAM ──
  const aRam = Number((sa as Partial<NotebookSpecs & TabletSpecs & PhoneSpecs>).ram_gb ?? 0);
  const bRam = Number((sb as Partial<NotebookSpecs & TabletSpecs & PhoneSpecs>).ram_gb ?? 0);

  sections.push({
    label: "Memoria RAM",
    icon: <RamIconSm />,
    decorIcon: <RamIconLg />,
    p1Value: aRam ? `${aRam} GB` : "—",
    p2Value: bRam ? `${bRam} GB` : "—",
    p1Wins: aRam !== bRam ? aRam > bRam : null,
    note: "Más memoria RAM permite tener más programas y pestañas abiertas sin que se trabe.",
    p1Simple: aRam ? explainRamMeaning(aRam) : undefined,
    p2Simple: bRam ? explainRamMeaning(bRam) : undefined,
  });

  // ── Almacenamiento ──
  const aStorage = Number((sa as Partial<NotebookSpecs & TabletSpecs>).storage_gb ?? 0);
  const bStorage = Number((sb as Partial<NotebookSpecs & TabletSpecs>).storage_gb ?? 0);
  const aStorageType = (sa as Partial<NotebookSpecs>).storage_type;
  const bStorageType = (sb as Partial<NotebookSpecs>).storage_type;
  const STORAGE_TYPE_LABEL: Record<string, string> = { HDD: "HDD", SSD_SATA: "SSD", SSD_NVME: "SSD NVMe" };

  sections.push({
    label: "Almacenamiento",
    icon: <StorageIconSm />,
    decorIcon: <StorageIconLg />,
    p1Value: aStorage ? `${aStorage} GB${aStorageType ? ` ${STORAGE_TYPE_LABEL[aStorageType]}` : ""}` : "—",
    p2Value: bStorage ? `${bStorage} GB${bStorageType ? ` ${STORAGE_TYPE_LABEL[bStorageType]}` : ""}` : "—",
    p1Wins: aStorage !== bStorage ? aStorage > bStorage : null,
    note: "El espacio de almacenamiento define cuántos archivos, fotos y programas podés guardar.",
    p1Simple: aStorage ? explainStorageMeaning(aStorage, aStorageType) : undefined,
    p2Simple: bStorage ? explainStorageMeaning(bStorage, bStorageType) : undefined,
  });

  // ── Gráfica (solo notebook/desktop) ──
  if (cat === "notebook" || cat === "desktop") {
    const aGpu = (sa as Partial<NotebookSpecs>).gpu;
    const bGpu = (sb as Partial<NotebookSpecs>).gpu;
    const aGpuModel = (sa as Partial<NotebookSpecs>).gpu_model ?? null;
    const bGpuModel = (sb as Partial<NotebookSpecs>).gpu_model ?? null;
    const gpuWins = aGpu && bGpu && aGpu !== bGpu ? aGpu === "dedicated" : null;

    sections.push({
      label: "Gráfica",
      icon: <GpuIconSm />,
      decorIcon: <GpuIconLg />,
      p1Value: aGpu === "dedicated" ? (aGpuModel ?? "Dedicada") : aGpu === "integrated" ? "Integrada" : "—",
      p2Value: bGpu === "dedicated" ? (bGpuModel ?? "Dedicada") : bGpu === "integrated" ? "Integrada" : "—",
      p1Wins: gpuWins,
      note: "La placa de video determina qué tan bien corre juegos y edición de video o fotos.",
      p1Simple: aGpu ? explainGpuMeaning(aGpu) : undefined,
      p2Simple: bGpu ? explainGpuMeaning(bGpu) : undefined,
    });
  }

  // ── Cámara (solo celulares) ──
  if (cat === "phone") {
    const aCam = Number((sa as Partial<PhoneSpecs>).main_camera_mp ?? 0);
    const bCam = Number((sb as Partial<PhoneSpecs>).main_camera_mp ?? 0);

    sections.push({
      label: "Cámara",
      icon: <CameraIconSm />,
      decorIcon: <CameraIconLg />,
      p1Value: aCam ? `${aCam} MP` : "—",
      p2Value: bCam ? `${bCam} MP` : "—",
      p1Wins: aCam !== bCam ? aCam > bCam : null,
      note: "La cámara principal define la calidad de fotos y videos que vas a poder tomar.",
      p1Simple: aCam ? explainCameraMeaning(aCam) : undefined,
      p2Simple: bCam ? explainCameraMeaning(bCam) : undefined,
    });
  }

  // ── Batería & Carga (solo celulares/notebooks — desktop y tablet no tienen batería propia) ──
  if (cat === "phone" || cat === "notebook" || cat === "desktop") {
    let aBat = 0, bBat = 0;
    if (cat === "phone") {
      aBat = Number((sa as Partial<PhoneSpecs>).battery_mah ?? 0);
      bBat = Number((sb as Partial<PhoneSpecs>).battery_mah ?? 0);
    } else {
      aBat = Number((sa as Partial<NotebookSpecs>).battery_wh ?? 0);
      bBat = Number((sb as Partial<NotebookSpecs>).battery_wh ?? 0);
    }

    if (aBat || bBat) {
      const batUnit = cat === "phone" ? "mAh" : "Wh";
      const batWins = aBat !== bBat ? aBat > bBat : null;
      const batCategory = cat;

      sections.push({
        label: "Batería & Carga",
        icon: <BatteryIconSm />,
        decorIcon: <BoltIconLg />,
        p1Value: aBat ? `${aBat.toLocaleString("es-AR")} ${batUnit}` : "—",
        p2Value: bBat ? `${bBat.toLocaleString("es-AR")} ${batUnit}` : "—",
        p1Wins: batWins,
        winnerLabel: batWins !== null
          ? `El ${batWins ? shortName(a) : shortName(b)} gana por amplia ventaja`
          : undefined,
        p1Simple: aBat ? explainBatteryMeaningShort(aBat, batCategory) : undefined,
        p2Simple: bBat ? explainBatteryMeaningShort(bBat, batCategory) : undefined,
      });
    }
  }

  // ── Inversión ──
  const aPrice = a.product.price_cash ?? 0;
  const bPrice = b.product.price_cash ?? 0;
  const priceWins = aPrice !== bPrice ? aPrice < bPrice : null;
  const pctDiff = aPrice && bPrice
    ? Math.round(Math.abs(aPrice - bPrice) / Math.max(aPrice, bPrice) * 100)
    : 0;

  sections.push({
    label: "Inversión",
    icon: <PriceIconSm />,
    decorIcon: <CameraIconLg />,
    p1Value: aPrice ? `Desde ${formatPrice(aPrice)}` : "—",
    p2Value: bPrice ? `Desde ${formatPrice(bPrice)}` : "—",
    p1Wins: priceWins,
    note: pctDiff > 0
      ? `Una diferencia de ~${pctDiff}% que debés evaluar según tus necesidades.`
      : "Precios similares — el diferencial está en las especificaciones.",
  });

  return sections;
}

// ─── Small icons (para los círculos con acento) ──────────────────────────────

function PhoneIconSm() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18h3" />
    </svg>
  );
}
function BatteryIconSm() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
    </svg>
  );
}
function PriceIconSm() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
    </svg>
  );
}

// ─── Large decorative ghost icons ─────────────────────────────────────────────

function PhoneIconLg() {
  return (
    <svg className="h-24 w-24 text-gathering-outline-variant" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={0.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18h3" />
    </svg>
  );
}
function BoltIconLg() {
  return (
    <svg className="h-24 w-24 text-gathering-outline-variant" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={0.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
    </svg>
  );
}
function CameraIconLg() {
  return (
    <svg className="h-24 w-24 text-gathering-outline-variant" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={0.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
    </svg>
  );
}

function CameraIconSm() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
    </svg>
  );
}

function CpuIconSm() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25z" />
    </svg>
  );
}
function CpuIconLg() {
  return (
    <svg className="h-24 w-24 text-gathering-outline-variant" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={0.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25z" />
    </svg>
  );
}

function RamIconSm() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 17.25v-.228a4.5 4.5 0 00-.12-1.03l-2.268-9.64a3.375 3.375 0 00-3.285-2.602H7.923a3.375 3.375 0 00-3.285 2.602l-2.268 9.64a4.5 4.5 0 00-.12 1.03v.228m19.5 0a3 3 0 01-3 3H5.25a3 3 0 01-3-3m19.5 0a3 3 0 00-3-3H5.25a3 3 0 00-3 3m16.5 0h.008v.008h-.008v-.008zm-3 0h.008v.008h-.008v-.008z" />
    </svg>
  );
}
function RamIconLg() {
  return (
    <svg className="h-24 w-24 text-gathering-outline-variant" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={0.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 17.25v-.228a4.5 4.5 0 00-.12-1.03l-2.268-9.64a3.375 3.375 0 00-3.285-2.602H7.923a3.375 3.375 0 00-3.285 2.602l-2.268 9.64a4.5 4.5 0 00-.12 1.03v.228m19.5 0a3 3 0 01-3 3H5.25a3 3 0 01-3-3m19.5 0a3 3 0 00-3-3H5.25a3 3 0 00-3 3m16.5 0h.008v.008h-.008v-.008zm-3 0h.008v.008h-.008v-.008z" />
    </svg>
  );
}

function StorageIconSm() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
    </svg>
  );
}
function StorageIconLg() {
  return (
    <svg className="h-24 w-24 text-gathering-outline-variant" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={0.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
    </svg>
  );
}

function GpuIconSm() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 8.25v10.5a1.5 1.5 0 001.5 1.5h16.5a1.5 1.5 0 001.5-1.5V8.25M2.25 8.25V6a1.5 1.5 0 011.5-1.5h16.5A1.5 1.5 0 0121.75 6v2.25M6 13.5h2.25M6 16.5h5.25" />
    </svg>
  );
}
function GpuIconLg() {
  return (
    <svg className="h-24 w-24 text-gathering-outline-variant" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={0.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 8.25v10.5a1.5 1.5 0 001.5 1.5h16.5a1.5 1.5 0 001.5-1.5V8.25M2.25 8.25V6a1.5 1.5 0 011.5-1.5h16.5A1.5 1.5 0 0121.75 6v2.25M6 13.5h2.25M6 16.5h5.25" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg className="h-8 w-8 text-gathering-primary-fixed-dim" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
    </svg>
  );
}

// ─── Chat compartido (duelo de 2 y comparaciones de 3-5) ─────────────────────

function ChatIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 9.75a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 01.778-.332 48.294 48.294 0 005.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
    </svg>
  );
}

function ChatCTAButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="relative mt-4 inline-flex">
      <span className="pointer-events-none absolute inset-0 animate-ping rounded-full bg-gathering-primary-fixed-dim opacity-30" />
      <button
        type="button"
        onClick={onClick}
        className="gathering-btn-primary-gradient relative flex animate-card-glow items-center gap-1.5 rounded-full px-4 py-2.5 font-brand text-sm font-bold text-white transition-all duration-150 hover:scale-105 active:scale-100"
      >
        <ChatIcon />
        Hablar con el Asistente IA
      </button>
    </div>
  );
}

// Efecto llamativo (mismo patrón que ChatCTAButton más abajo: anillo
// animate-ping + glow) para que el usuario note que el botón es interactivo —
// pedido en vivo 2026-09-10, el botón pasaba desapercibido.
export function ChatFAB({ onClick, pending }: { onClick: () => void; pending?: boolean }) {
  return (
    <div className="fixed bottom-4 right-4 z-30">
      <span className="pointer-events-none absolute inset-0 animate-ping rounded-full bg-gathering-primary-fixed-dim opacity-30" />
      <button
        type="button"
        onClick={onClick}
        aria-label="Hablar con el Asistente IA"
        className="gathering-btn-primary-gradient relative flex h-14 w-14 animate-card-glow items-center justify-center rounded-full text-white transition-all duration-150 hover:scale-105 active:scale-95"
      >
        <ChatIcon className="h-6 w-6" />
      </button>
      {pending && (
        <span
          aria-label="Tenés una pregunta para responder"
          className="pointer-events-none absolute -right-1 -top-1 flex h-5 w-5 animate-bounce items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white"
        >
          1
        </span>
      )}
    </div>
  );
}

// ─── Compare Content ──────────────────────────────────────────────────────────

function ChatBubble({
  names,
  products,
  useCases,
  budgetMax,
  budgetLabel,
  recentProducts,
  onMinimize,
  onAddProduct,
  inline,
}: {
  names: string[];
  products: Product[];
  useCases?: UseCase[];
  budgetMax?: number | null;
  budgetLabel?: string | null;
  recentProducts?: { id: string; title: string }[];
  onMinimize: () => void;
  onAddProduct: (productId: string) => void;
  // El duelo de 2 productos lo muestra embebido en la sección del veredicto
  // (no como burbuja flotante fija) — mismo componente, distinto wrapper.
  inline?: boolean;
}) {
  type Message = { role: "user" | "ai"; text: string; suggestedProduct?: AlternativeProduct };
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const greetedRef = useRef(false);

  // Bug real reportado en vivo: scrollIntoView() en un elemento sube por
  // TODOS los ancestros con scroll hasta hacerlo visible — como este chat
  // vive embebido en el flujo normal de la página (no en un panel `fixed`),
  // terminaba scrolleando la PÁGINA entera cada vez que llegaba un mensaje
  // nuevo (ej. al apretar Enter), no solo la lista interna de mensajes.
  // Fix: mover el scrollTop del contenedor de mensajes directamente, nunca
  // toca el scroll de la página.
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  const defaultGreeting = `Hola! Puedo ayudarte a decidir entre ${names.join(", ")}. ¿Qué querés saber?`;

  // Al abrir el chat, el asistente arranca solo con un análisis inicial de los
  // productos comparados (en vez de esperar a que el usuario pregunte algo primero).
  useEffect(() => {
    if (greetedRef.current) return;
    greetedRef.current = true;

    (async () => {
      try {
        const res = await fetch(withBasePath("/api/compare/chat"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ products, messages: [], message: "", useCases, budgetMax, budgetLabel, greeting: true, recentProducts, visitId: getOrCreateVisitId().id }),
        });
        const data = (await res.json()) as { reply?: string; suggestedProduct?: AlternativeProduct; error?: string };
        setMessages([{
          role: "ai",
          text: data.reply ?? defaultGreeting,
          suggestedProduct: data.suggestedProduct,
        }]);
      } catch {
        setMessages([{ role: "ai", text: defaultGreeting }]);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setLoading(true);
    setMessages((m) => [...m, { role: "user", text }]);

    try {
      const res = await fetch(withBasePath("/api/compare/chat"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ products, messages, message: text, useCases, budgetMax, budgetLabel, recentProducts, visitId: getOrCreateVisitId().id }),
      });
      const data = (await res.json()) as { reply?: string; suggestedProduct?: AlternativeProduct; error?: string };
      setMessages((m) => [...m, { role: "ai", text: data.reply ?? "No pude responder. Intentá de nuevo.", suggestedProduct: data.suggestedProduct }]);
    } catch {
      setMessages((m) => [...m, { role: "ai", text: "Error de conexión. Intentá de nuevo." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className={
        inline
          ? "gathering-glass-panel animate-fade-up mx-auto flex h-[420px] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-gathering-surface-container"
          : "gathering-glass-panel animate-fade-up fixed bottom-4 right-4 z-30 flex h-[70vh] max-h-[600px] w-[92vw] max-w-sm flex-col overflow-hidden rounded-2xl bg-gathering-surface-container"
      }
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gathering-outline-variant/50 bg-gathering-surface-container-high px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gathering-primary-fixed-dim opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-gathering-primary-fixed-dim" />
          </span>
          <div>
            <p className="font-brand text-xs font-semibold uppercase tracking-widest text-gathering-primary-fixed-dim">Asistente IA</p>
            <p className="font-brand text-sm font-bold text-gathering-on-surface">{names.join(" vs ")}</p>
          </div>
        </div>
        <button onClick={onMinimize} aria-label="Minimizar chat" className="text-gathering-on-surface-variant hover:text-gathering-on-surface">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </button>
      </div>
      {/* Messages */}
      <div ref={messagesContainerRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
            <div className={`max-w-[80%] whitespace-pre-line rounded-2xl px-4 py-2.5 font-brand text-sm leading-relaxed ${
              m.role === "user"
                ? "gathering-btn-primary-gradient text-white"
                : "bg-gathering-surface-variant/60 text-gathering-on-surface"
            }`}>
              <ChatMessageText text={m.text} />
            </div>
            {m.suggestedProduct && (
              <button
                type="button"
                onClick={() => onAddProduct(m.suggestedProduct!.id)}
                className="gathering-glass-card mt-2 flex w-[80%] items-center gap-3 rounded-2xl p-3 text-left"
              >
                {m.suggestedProduct.image_url && (
                  <img
                    src={withBasePath(`/api/img?url=${encodeURIComponent(m.suggestedProduct.image_url)}`)}
                    alt={m.suggestedProduct.title}
                    className="h-12 w-12 shrink-0 rounded-lg object-contain"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-brand text-xs font-semibold text-gathering-on-surface">{m.suggestedProduct.title}</p>
                  {m.suggestedProduct.price_cash && (
                    <p className="font-brand text-xs text-gathering-on-surface-variant">{formatPrice(m.suggestedProduct.price_cash)}</p>
                  )}
                </div>
                <span className="gathering-btn-primary-gradient shrink-0 rounded-full px-3 py-1.5 font-brand text-xs font-semibold text-white">
                  Agregar
                </span>
              </button>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="flex items-center gap-1.5 rounded-2xl bg-gathering-surface-variant/60 px-4 py-3">
              <span className="h-2 w-2 animate-bounce rounded-full bg-gathering-on-surface-variant [animation-delay:-0.3s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-gathering-on-surface-variant [animation-delay:-0.15s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-gathering-on-surface-variant" />
            </div>
          </div>
        )}
      </div>
      {/* Input */}
      <div className="border-t border-gathering-outline-variant/50 p-3">
        <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Preguntá lo que quieras..."
            className="flex-1 rounded-xl border border-gathering-outline-variant bg-gathering-surface px-3 py-2 font-brand text-sm text-gathering-on-surface outline-none focus:border-gathering-primary-fixed-dim"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="gathering-btn-primary-gradient rounded-xl px-4 py-2 font-brand text-sm font-semibold text-white disabled:opacity-40"
          >
            {loading ? "..." : "Enviar"}
          </button>
        </form>
      </div>
    </div>
  );
}

// Jugada #6: "modelos parecidos" a los que se están comparando, con "+ Agregar"
// al toque. Junta los `similar` de /api/products/[id]/other-stores de cada
// producto comparado, dedupea y saca los que ya están en la comparación.
function SimilarInCompare({
  items,
  onAdd,
}: {
  items: CompareItem[];
  onAdd: (id: string) => void;
}) {
  const [similars, setSimilars] = useState<SimilarStoreVariant[]>([]);
  const idsKey = items.map((i) => i.product.id).join(",");
  const atMax = items.length >= 5;

  useEffect(() => {
    let cancelled = false;
    const ids = idsKey ? idsKey.split(",") : [];
    Promise.all(
      ids.map((id) =>
        fetch(withBasePath(`/api/products/${id}/other-stores`))
          .then((r) => (r.ok ? r.json() : { similar: [] }))
          .catch(() => ({ similar: [] }))
      )
    ).then((results: { similar?: SimilarStoreVariant[] }[]) => {
      if (cancelled) return;
      const seen = new Set(ids);
      const merged: SimilarStoreVariant[] = [];
      for (const r of results) {
        for (const s of r.similar ?? []) {
          if (seen.has(s.id)) continue;
          seen.add(s.id);
          merged.push(s);
        }
      }
      merged.sort((a, b) => (a.price_cash ?? Infinity) - (b.price_cash ?? Infinity));
      setSimilars(merged.slice(0, 6));
    });
    return () => {
      cancelled = true;
    };
  }, [idsKey]);

  if (similars.length === 0) return null;

  return (
    <div className="gathering-glass-card mx-auto mt-6 max-w-6xl rounded-2xl p-5">
      <h3 className="font-brand text-sm font-bold text-gathering-on-surface">Parecidos a los que estás viendo</h3>
      <p className="mt-1 font-brand text-xs text-gathering-on-surface-variant">
        Misma línea, con alguna diferencia. {atMax ? "Quitá uno para poder agregar otro." : "Agregá el que quieras a la comparación."}
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {similars.map((s) => (
          <div key={s.id} className="flex flex-col gap-2 rounded-xl border border-gathering-outline-variant/50 p-3">
            <p className="line-clamp-2 font-brand text-xs font-semibold text-gathering-on-surface">{s.title}</p>
            {s.differences.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {s.differences.map((d) => (
                  <span key={d} className="rounded-full bg-gathering-surface-container-high px-2 py-0.5 font-brand text-[10px] text-gathering-on-surface-variant">
                    {d}
                  </span>
                ))}
              </div>
            )}
            <div className="mt-auto flex items-center justify-between gap-2 pt-1">
              <span className="font-brand text-xs text-gathering-on-surface-variant">
                {s.price_cash ? formatPrice(s.price_cash) : s.price_installment ? `${formatPrice(s.price_installment)}/mes` : "—"}
              </span>
              <button
                type="button"
                disabled={atMax}
                onClick={() => onAdd(s.id)}
                className="flex items-center gap-1 rounded-full border border-gathering-primary-fixed-dim px-2.5 py-1 font-brand text-[11px] font-semibold text-gathering-primary-fixed-dim transition-colors hover:bg-gathering-primary/10 disabled:opacity-40"
              >
                <span className="material-symbols-outlined text-[14px]">add</span> Agregar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MultiCompareView({
  items,
  onRemove,
  searchContext,
  searchToken,
  goBack,
  onAddProduct,
  minHeightClass,
}: {
  items: CompareItem[];
  onRemove: (productId: string) => void;
  searchContext: { useCases: UseCase[]; budgetMax: number | null; budgetLabel: string | null } | null;
  searchToken: string | null;
  goBack: () => void;
  onAddProduct: (productId: string) => void;
  minHeightClass: string;
}) {
  const [showChat, setShowChat] = useState(false);
  const [chatMounted, setChatMounted] = useState(false);
  const [specMode, setSpecMode] = useState<SpecDisplayMode>("bar");
  const openChat = () => { setChatMounted(true); setShowChat(true); };
  const verdicts = useMemo(
    () =>
      buildGroupVerdicts(
        items.map((it) => ({ category: it.product.category, specs: it.product.specs }))
      ),
    [items]
  );
  const itemIds = items.map((i) => i.product.id).join(",");
  const recentProductsForChat = useMemo(
    () =>
      getRecentProducts()
        .filter((p) => !items.some((i) => i.product.id === p.id))
        .slice(0, 5)
        .map((p) => ({ id: p.id, title: p.title })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [itemIds]
  );

  return (
    <div className={minHeightClass}>
      <header className="border-b border-gathering-outline-variant/50 bg-gathering-surface-container/80 px-4 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-2">
            <LogoBrand logoClass="h-11" />
          </div>
          <h1 className="font-brand text-sm font-semibold text-gathering-on-surface">Comparando {items.length} productos</h1>
          <button type="button" onClick={goBack} className="font-brand text-sm text-gathering-primary-fixed-dim hover:underline">← Volver</button>
        </div>
      </header>

      {chatMounted && (
        <div className={showChat ? "" : "hidden"}>
          <ChatBubble
            names={items.map(shortName)}
            products={items.map((i) => i.product)}
            useCases={searchContext?.useCases}
            budgetMax={searchContext?.budgetMax}
            budgetLabel={searchContext?.budgetLabel}
            recentProducts={recentProductsForChat}
            onMinimize={() => setShowChat(false)}
            onAddProduct={onAddProduct}
          />
        </div>
      )}
      {!showChat && <ChatFAB onClick={openChat} />}

      <main className="mx-auto max-w-6xl px-4 py-6">
        <SpecGlossary categories={Array.from(new Set(items.map((i) => i.product.category)))} />

        <SpecDisplayModeToggle mode={specMode} onChange={setSpecMode} />

        {/* Tarjetas de producto (imagen + specs + "por qué te conviene") */}
        <div className="mb-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <ProductCompareCard key={item.product.id} item={item} align="left" searchToken={searchToken} specMode={specMode} />
          ))}
        </div>

        {/* Veredicto IA por producto */}
        <div className="gathering-glass-card mb-6 rounded-2xl p-6">
          <div className="flex items-center gap-2">
            <SparkleIcon />
            <h2 className="font-brand text-lg font-bold text-gathering-on-surface">Veredicto IA</h2>
          </div>
          <ChatCTAButton onClick={openChat} />
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item, i) => (
              <div key={item.product.id} className="rounded-xl bg-gathering-surface-variant/30 p-4">
                <p className="font-brand text-sm font-bold text-gathering-on-surface">{shortName(item)}</p>
                <p className="mt-1 font-brand text-sm leading-relaxed text-gathering-on-surface-variant">{verdicts[i]}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="gathering-glass-card rounded-2xl">
          <CompareTable items={items} onRemove={onRemove} />
        </div>

        <SimilarInCompare items={items} onAdd={onAddProduct} />
      </main>
    </div>
  );
}

interface CompareExperienceProps {
  ids: string[];
  searchToken?: string | null;
  mode: "page" | "modal";
  onClose?: () => void;
}

export function CompareExperience({ ids, searchToken = null, mode, onClose }: CompareExperienceProps) {
  const [currentIds, setCurrentIds] = useState(ids);
  useEffect(() => {
    setCurrentIds(ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join(",")]);

  const [items, setItems] = useState<CompareItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [chatMounted, setChatMounted] = useState(false);
  const [simpleMode, setSimpleMode] = useState(true);
  const [specMode, setSpecMode] = useState<SpecDisplayMode>("bar");
  const [searchContext, setSearchContext] = useState<{ useCases: UseCase[]; budgetMax: number | null; budgetLabel: string | null } | null>(null);

  const openChat = () => { setChatMounted(true); setShowChat(true); };

  const goBack = () => {
    if (mode === "modal" && onClose) onClose();
    else window.history.back();
  };

  // Volver / quitar / agregar productos actualizan `currentIds` local siempre;
  // en modo "page" además se sincroniza la URL (sin recargar), igual que
  // hacía la página standalone. En modo "modal" la URL de la pantalla de
  // resultados no se toca.
  function updateIds(newIds: string[]) {
    setCurrentIds(newIds);
    if (mode === "page") {
      window.history.replaceState(
        null,
        "",
        withBasePath(`/compare?ids=${newIds.join(",")}${searchToken ? `&search=${searchToken}` : ""}`)
      );
    }
  }

  function handleRemove(productId: string) {
    const remaining = currentIds.filter((id) => id !== productId);
    if (remaining.length < 2 && mode === "page") { window.history.back(); return; }
    updateIds(remaining);
  }

  function handleAddProduct(productId: string) {
    if (currentIds.includes(productId) || currentIds.length >= 5) return;
    trackEvent("product_compare_add", getOrCreateVisitId().id, { productId });
    updateIds([...currentIds, productId]);
  }

  useEffect(() => {
    if (currentIds.length < 2) { setLoading(false); return; }
    setLoading(true);
    fetch(withBasePath("/api/products/compare"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productIds: currentIds }),
    })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: { items: CompareItem[] }) => {
        setItems(data.items);
        setLoading(false);
        addRecentProducts(
          data.items.map((i) => ({
            id: i.product.id,
            title: i.product.title,
            category: i.product.category,
            price_cash: i.product.price_cash,
            viewed_at: new Date().toISOString(),
          }))
        );
      })
      .catch(() => { setError(true); setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIds.join(",")]);

  // Contexto opcional de la búsqueda que trajo a estos productos (use_cases + presupuesto),
  // para que el chat pueda hablar en términos de lo que el usuario buscaba. Si falla o no
  // hay token, el chat sigue funcionando igual, solo sin ese contexto extra.
  useEffect(() => {
    if (!searchToken) return;
    fetch(withBasePath(`/api/search/${searchToken}`))
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: { search: Search }) => {
        setSearchContext({
          useCases: data.search.slots.use_cases,
          budgetMax: data.search.slots.budget_cash_ars ?? data.search.slots.budget_monthly_ars,
          budgetLabel: describeBudgetForChat(data.search.slots),
        });
      })
      .catch(() => {});
  }, [searchToken]);

  const minHeightClass = mode === "page" ? "min-h-screen" : "";

  // ── Loading / error / empty ──
  let content: React.ReactNode;

  if (loading) {
    content = (
      <div className={`flex items-center justify-center ${mode === "page" ? "min-h-screen" : "py-24"}`}>
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gathering-primary-fixed-dim border-t-transparent" />
      </div>
    );
  } else if (error) {
    content = (
      <div className={`flex flex-col items-center justify-center gap-3 text-center ${mode === "page" ? "min-h-screen" : "py-24"}`}>
        <p className="font-brand text-gathering-on-surface-variant">No se pudieron cargar los productos.</p>
        <a href={withBasePath("/")} className="font-brand text-sm text-gathering-primary-fixed-dim hover:underline">Volver al inicio</a>
      </div>
    );
  } else if (currentIds.length < 2) {
    content = (
      <div className={`flex flex-col items-center justify-center gap-3 text-center ${mode === "page" ? "min-h-screen" : "py-24"}`}>
        <p className="font-brand text-gathering-on-surface-variant">Seleccioná al menos 2 productos para comparar.</p>
        <a href={withBasePath("/")} className="font-brand text-sm text-gathering-primary-fixed-dim hover:underline">Ir a buscar productos</a>
      </div>
    );
  } else if (items.length > 2) {
    // ── 3+ products → tabla + veredicto por producto ──
    content = (
      <MultiCompareView
        items={items}
        onRemove={handleRemove}
        searchContext={searchContext}
        searchToken={searchToken}
        goBack={goBack}
        onAddProduct={handleAddProduct}
        minHeightClass={minHeightClass}
      />
    );
  } else {
    // ── 2-product duel ──
    const [a, b] = items;
    const nameA = shortName(a);
    const nameB = shortName(b);
    const sections = getSpecSections(a, b);
    const [verdictA, verdictB] = buildGroupVerdicts([
      { category: a.product.category, specs: a.product.specs },
      { category: b.product.category, specs: b.product.specs },
    ]);
    const recentProductsForChat = getRecentProducts()
      .filter((p) => p.id !== a.product.id && p.id !== b.product.id)
      .slice(0, 5)
      .map((p) => ({ id: p.id, title: p.title }));

    content = (
      <div className={minHeightClass}>
        {/* ── Hero (reemplaza al navbar de arriba: esta sección es lo
            primero que se ve). Sin el badge "Duelo Tecnológico" — pedido
            explícito del usuario. ── */}
        <div>
          <section className="pb-8 pt-12 text-center">
            <h1 className="font-brand text-4xl font-bold tracking-tight text-gathering-on-surface">
              Veredicto Final: ¿Cuál es para vos?
            </h1>
            {/* max-w ancho + whitespace-nowrap en desktop: pedido explícito
                "en un solo renglón" — en mobile (sm:) se permite volver a
                envolver, ese ancho no entra en una pantalla chica. */}
            <p className="mx-auto mt-3 max-w-none whitespace-normal font-brand text-sm leading-relaxed text-gathering-on-surface-variant sm:whitespace-nowrap">
              Analizamos a fondo los dos buques insignia para ayudarte a
              elegir el equilibrio perfecto entre potencia y portabilidad.
            </p>
          </section>

          <div className="mx-auto max-w-5xl px-4 pb-16">
            <SpecDisplayModeToggle mode={specMode} onChange={setSpecMode} />
            {/* Columna del medio más ancha que las de los productos — pedido
                explícito ("ampliar este espacio... desplazar para los
                costados los productos") para que el chat tenga más lugar. */}
            <div className="grid grid-cols-[1fr_1.4fr_1fr] gap-5">
              <ProductCompareCard item={a} align="left" searchToken={searchToken} specMode={specMode} />

              <div className="gathering-glass-card flex flex-col items-center rounded-2xl p-6 text-center">
                <SparkleIcon />
                <h3 className="mt-3 font-brand text-lg font-bold text-gathering-on-surface">Veredicto IA</h3>
                <div className="mt-4 space-y-3 text-left font-brand text-sm leading-relaxed text-gathering-on-surface-variant">
                  <p>
                    <strong className="text-gathering-on-surface">{nameA}:</strong> {verdictA}
                  </p>
                  <p>
                    <strong className="text-gathering-on-surface">{nameB}:</strong> {verdictB}
                  </p>
                </div>
                {/* A pedido explícito del usuario (mockup anotado 2026-08-24):
                    el veredicto de texto queda siempre visible — al abrir el
                    chat SOLO desaparece el botón, el chat aparece debajo, no
                    reemplaza toda la tarjeta como antes. */}
                {chatMounted && showChat ? (
                  // text-left: la tarjeta contenedora es text-center, pero
                  // los mensajes del chat necesitan alinearse normal.
                  <div className="mt-4 w-full text-left">
                    <ChatBubble
                      inline
                      names={[nameA, nameB]}
                      products={[a.product, b.product]}
                      useCases={searchContext?.useCases}
                      budgetMax={searchContext?.budgetMax}
                      budgetLabel={searchContext?.budgetLabel}
                      recentProducts={recentProductsForChat}
                      onMinimize={() => setShowChat(false)}
                      onAddProduct={handleAddProduct}
                    />
                  </div>
                ) : (
                  <ChatCTAButton onClick={openChat} />
                )}
              </div>

              <ProductCompareCard item={b} align="right" searchToken={searchToken} specMode={specMode} />
            </div>
          </div>
        </div>

        {/* ── Spec comparison cards ── */}
        <div className="py-10">
          <div className="mx-auto max-w-5xl px-4">
            <SpecGlossary categories={Array.from(new Set([a.product.category, b.product.category]))} />

            <div className="mb-6 flex items-center justify-center">
              <div className="inline-flex rounded-full bg-gathering-surface-variant/50 p-1">
                <button
                  type="button"
                  onClick={() => setSimpleMode(true)}
                  className={`rounded-full px-4 py-1.5 font-brand text-sm font-semibold transition-colors ${
                    simpleMode ? "gathering-btn-primary-gradient text-white" : "text-gathering-on-surface-variant hover:text-gathering-on-surface"
                  }`}
                >
                  Explicación simple
                </button>
                <button
                  type="button"
                  onClick={() => setSimpleMode(false)}
                  className={`rounded-full px-4 py-1.5 font-brand text-sm font-semibold transition-colors ${
                    !simpleMode ? "gathering-btn-primary-gradient text-white" : "text-gathering-on-surface-variant hover:text-gathering-on-surface"
                  }`}
                >
                  Specs técnicas
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
              {sections.map((sec) => (
                <div key={sec.label} className="gathering-glass-card relative overflow-hidden rounded-2xl p-5">
                  <div className="pointer-events-none absolute -right-2 -top-2 opacity-40">
                    {sec.decorIcon}
                  </div>

                  <div className="relative mb-4 flex items-center gap-2.5">
                    <div className="gathering-btn-primary-gradient flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white">
                      {sec.icon}
                    </div>
                    <span className="font-brand font-semibold text-gathering-on-surface">{sec.label}</span>
                  </div>

                  <div className="relative py-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-brand text-sm text-gathering-on-surface-variant">{nameA}</span>
                      <span className={sec.p1Wins === true ? "rounded-full bg-gathering-primary/10 px-2.5 py-0.5 font-brand text-xs font-bold text-gathering-primary-fixed-dim" : "font-brand text-xs font-medium text-gathering-on-surface"}>
                        {sec.p1Value}
                      </span>
                    </div>
                    {simpleMode && sec.p1Simple && (
                      <p className="mt-1 font-brand text-xs leading-relaxed text-gathering-on-surface-variant">{sec.p1Simple}</p>
                    )}
                  </div>

                  <div className="py-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-brand text-sm text-gathering-on-surface-variant">{nameB}</span>
                      <span className={sec.p1Wins === false ? "rounded-full bg-gathering-primary/10 px-2.5 py-0.5 font-brand text-xs font-bold text-gathering-primary-fixed-dim" : "font-brand text-xs font-medium text-gathering-on-surface"}>
                        {sec.p2Value}
                      </span>
                    </div>
                    {simpleMode && sec.p2Simple && (
                      <p className="mt-1 font-brand text-xs leading-relaxed text-gathering-on-surface-variant">{sec.p2Simple}</p>
                    )}
                  </div>

                  {sec.winnerLabel && (
                    <p className="mt-3 text-center font-brand text-xs font-bold uppercase tracking-wide text-gathering-primary-fixed-dim">
                      {sec.winnerLabel}
                    </p>
                  )}

                  {!simpleMode && sec.note && (
                    <p className="mt-3 font-brand text-xs leading-relaxed text-gathering-on-surface-variant">{sec.note}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-5xl px-4 pb-10">
          <SimilarInCompare items={items} onAdd={handleAddProduct} />
        </div>

        {/* ── Footer: solo en modo página completa ── */}
        {mode === "page" && (
          <footer className="border-t border-gathering-outline-variant/50 bg-gathering-surface-container-lowest">
            <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-5">
              <div className="flex items-center gap-2">
                <LogoBrand logoClass="h-6" />
              </div>
              <nav className="flex gap-6">
                <a href={withBasePath("/privacy")} className="font-brand text-sm text-gathering-on-surface-variant hover:text-gathering-on-surface">Privacidad</a>
                <a href={withBasePath("/terms")}   className="font-brand text-sm text-gathering-on-surface-variant hover:text-gathering-on-surface">Términos</a>
                <a href={withBasePath("/method")}  className="font-brand text-sm text-gathering-on-surface-variant hover:text-gathering-on-surface">Metodología IA</a>
                <a href={withBasePath("/contact")} className="font-brand text-sm text-gathering-on-surface-variant hover:text-gathering-on-surface">Contacto</a>
              </nav>
              <span className="font-brand text-xs text-gathering-on-surface-variant">© 2025 indexa — Tu asesor tecnológico personal.</span>
            </div>
          </footer>
        )}
      </div>
    );
  }

  if (mode === "page") {
    return content;
  }

  return (
    <Portal>
      <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true">
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
        <div className="relative mx-auto my-4 max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-2xl bg-gathering-surface-container shadow-2xl ring-1 ring-black/5 sm:my-8">
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="sticky right-4 top-4 z-40 float-right flex h-9 w-9 items-center justify-center rounded-full bg-gathering-surface-container-high text-gathering-on-surface-variant hover:text-gathering-on-surface"
          >
            ✕
          </button>
          <div className="clear-both">{content}</div>
        </div>
      </div>
    </Portal>
  );
}
