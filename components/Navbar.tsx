import Link from "next/link";
import { LogoBrand } from "@/components/LogoBrand";

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/90 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center px-4 py-3">
        <div className="flex items-center gap-6">
          <Link href="/">
            <LogoBrand logoClass="h-12" />
          </Link>
          <span className="hidden text-sm text-gray-400 md:block">
            Tu guía inteligente para comprar tecnología en Argentina.
          </span>
        </div>
      </div>
    </header>
  );
}
