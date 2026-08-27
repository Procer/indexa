import type { ProductCategory, ProductSpecs, NotebookSpecs, PhoneSpecs, Upgradeable } from "@/types";

function isNotebookSpecs(specs: ProductSpecs): specs is NotebookSpecs {
  return "weight_kg" in specs;
}

// Guía de prioridades por categoría (a pedido explícito del usuario, contenido
// curado a mano — no es una simple lectura de `upgradeable`, sino la
// estrategia de compra: qué priorizar AHORA porque no se puede cambiar
// después, y qué se puede resolver más adelante sin gastar de más hoy).
//
// - Notebook/PC: 1) CPU/GPU (soldados) 2) RAM (barata de ampliar) 3) Disco (modular)
// - Celular/Tablet: nada se actualiza nunca → 1) Procesador 2) Almacenamiento
//   (+ nube) 3) Batería/Pantalla 4) RAM (el SO ya la gestiona solo)
// - TV: 1) Panel (nunca cambia) 2) Puertos/conectividad 3) Smart OS (se
//   arregla después y barato con un Chromecast/Fire TV/Apple TV)
export function getUpgradeNote(
  category: ProductCategory,
  specs: ProductSpecs,
  upgradeable: Upgradeable
): string | null {
  if (category === "desktop") {
    const parts: string[] = [];
    if (upgradeable.ram) parts.push("RAM ampliable");
    if (upgradeable.storage) parts.push("almacenamiento ampliable");
    if (upgradeable.gpu) parts.push("GPU reemplazable");
    if (upgradeable.processor) parts.push("procesador actualizable según socket");
    return parts.length > 0 ? `A futuro: ${parts.join(", ")}.` : null;
  }

  if (category === "notebook") {
    if (!isNotebookSpecs(specs)) return null;
    const upgrades: string[] = [];
    if (upgradeable.ram) upgrades.push(`la RAM (hoy ${specs.ram_gb}GB)`);
    if (upgradeable.storage) upgrades.push("el disco SSD");
    if (upgrades.length > 0) {
      return `A futuro podés ampliar ${upgrades.join(" y ")} — el procesador y la placa de video vienen soldados, priorizalos al elegir.`;
    }
    return "El procesador y la placa de video vienen soldados y no se pueden cambiar — priorizalos al elegir.";
  }

  if (category === "phone") {
    const s = specs as Partial<PhoneSpecs>;
    if (s.storage_gb && s.storage_gb < 128) {
      return `Ningún componente se actualiza después. Este modelo tiene ${s.storage_gb}GB — poco margen si no pensás usar la nube para fotos y videos.`;
    }
    return "Ningún componente se actualiza después: priorizá el procesador y el almacenamiento por sobre la RAM, que el sistema ya gestiona solo.";
  }

  if (category === "tablet") {
    return "Ningún componente se actualiza después — priorizá procesador y almacenamiento según cuánto uso local (fotos, video, apps) le vayas a dar.";
  }

  if (category === "tv") {
    return "El panel y los puertos no se pueden cambiar nunca. Si el sistema Smart se pone lento con los años, se soluciona barato con un Chromecast, Fire TV Stick o Apple TV — no hace falta cambiar la TV por eso.";
  }

  return null;
}

export function getFixedComponentsWarning(
  category: ProductCategory,
  specs: ProductSpecs,
  upgradeable: Upgradeable
): string | null {
  if (category !== "notebook") return null;
  if (!isNotebookSpecs(specs)) return null;

  const warnings: string[] = [];

  if (!upgradeable.processor) {
    warnings.push("procesador");
  }
  if (!upgradeable.screen) {
    warnings.push("pantalla");
  }
  if (!upgradeable.gpu || !upgradeable.gpu) {
    // GPU is always fixed on notebooks
    if (specs.gpu === "integrated") {
      warnings.push("GPU integrada (no se puede agregar dedicada)");
    }
  }

  return warnings.length > 0
    ? `Componentes fijos: ${warnings.join(", ")}.`
    : null;
}
