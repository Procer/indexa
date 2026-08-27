"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { withBasePath } from "@/lib/basePath";

function ConnectContent() {
  const params = useSearchParams();
  const success = params.get("success") === "true";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm space-y-6 rounded-2xl bg-white p-8 shadow-sm">
        <div className="text-center">
          <h1 className="text-xl font-bold text-gray-900">
            Conectar MercadoLibre
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Panel de administración
          </p>
        </div>

        {success ? (
          <div className="rounded-xl bg-green-50 p-5 text-center">
            <p className="font-semibold text-green-800">¡Conectado! ✓</p>
            <p className="mt-2 text-sm text-green-700">
              Token guardado. Corré el sync desde la terminal:
            </p>
            <code className="mt-2 block rounded-lg bg-green-100 px-3 py-2 text-xs text-green-900">
              npm run sync-ml
            </code>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
              <p className="font-medium">Antes de continuar:</p>
              <p className="mt-1">
                Asegurate de haber agregado{" "}
                <code className="rounded bg-amber-100 px-1 text-xs">
                  http://localhost:3000/api/auth/ml/callback
                </code>{" "}
                como Redirect URI en tu app de ML Developers.
              </p>
            </div>

            <a
              href={withBasePath("/api/auth/ml")}
              className="block w-full rounded-xl bg-yellow-400 px-6 py-3 text-center font-semibold text-gray-900 transition-colors hover:bg-yellow-500"
            >
              Autorizar con MercadoLibre →
            </a>

            <p className="text-center text-xs text-gray-400">
              Solo necesitás hacerlo una vez. El token se renueva automáticamente.
            </p>
          </div>
        )}

        <a
          href={withBasePath("/")}
          className="block text-center text-xs text-gray-400 hover:underline"
        >
          Volver al inicio
        </a>
      </div>
    </main>
  );
}

export default function ConnectMLPage() {
  return (
    <Suspense>
      <ConnectContent />
    </Suspense>
  );
}
