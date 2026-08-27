// Vacío en local (la app vive en la raíz) y "/indexa" en producción, vía
// NEXT_PUBLIC_BASE_PATH. Necesario porque basePath de Next.js solo prefija
// automáticamente next/link y next/navigation — NO prefija <a href>, <img src>,
// fetch() ni window.history.pushState con rutas absolutas hardcodeadas.
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function withBasePath(path: string): string {
  return `${BASE_PATH}${path}`;
}
