import { withBasePath } from "@/lib/basePath";

export default function AuthPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-4 text-center">
        <div className="text-4xl">✉️</div>
        <h1 className="text-xl font-semibold text-gray-900">
          Revisá tu casilla de email
        </h1>
        <p className="text-sm text-gray-500">
          Te enviamos un link para ingresar. Hacé clic en el link y listo —
          sin contraseñas.
        </p>
        <a
          href={withBasePath("/")}
          className="inline-block text-sm text-blue-600 hover:underline"
        >
          Volver al inicio
        </a>
      </div>
    </div>
  );
}
