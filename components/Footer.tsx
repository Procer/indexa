import Link from "next/link";
import { LogoBrand } from "@/components/LogoBrand";

export function Footer() {
  return (
    <footer className="mt-4 border-t border-gathering-outline-variant/50 bg-gathering-surface-container-lowest">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-6">
        <div className="flex items-center gap-3">
          <LogoBrand logoClass="h-6" />
          <span className="font-brand text-sm text-gathering-on-surface-variant">© 2025 indexa — Tu asesor tecnológico personal</span>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-2">
          <Link
            href="/tiendas"
            className="font-brand text-sm text-gathering-on-surface-variant transition-colors hover:text-gathering-on-surface"
          >
            Tiendas
          </Link>
          <Link
            href="/guias"
            className="font-brand text-sm text-gathering-on-surface-variant transition-colors hover:text-gathering-on-surface"
          >
            Guías
          </Link>
          <Link
            href="/privacy"
            className="font-brand text-sm text-gathering-on-surface-variant transition-colors hover:text-gathering-on-surface"
          >
            Privacidad
          </Link>
          <Link
            href="/terms"
            className="font-brand text-sm text-gathering-on-surface-variant transition-colors hover:text-gathering-on-surface"
          >
            Términos
          </Link>
          <Link
            href="/contact"
            className="font-brand text-sm text-gathering-on-surface-variant transition-colors hover:text-gathering-on-surface"
          >
            Contacto
          </Link>
          <Link
            href="/help"
            className="font-brand text-sm text-gathering-on-surface-variant transition-colors hover:text-gathering-on-surface"
          >
            Ayuda
          </Link>
        </nav>
      </div>
    </footer>
  );
}
