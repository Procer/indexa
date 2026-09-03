import { withBasePath } from "@/lib/basePath";

interface LogoBrandProps {
  className?: string;
  logoClass?: string;
  // `icon`: solo el isotipo (la lupa), sin el wordmark. Para lugares chicos
  // donde el lockup completo no entra o queda ilegible (ej. el círculo de 40px
  // en la cabecera del chat).
  icon?: boolean;
}

export function LogoBrand({ className, logoClass = "h-12", icon = false }: LogoBrandProps) {
  return (
    <img
      src={withBasePath(icon ? "/logo-indexa-icon.png" : "/logo-indexa.png")}
      alt="indexa"
      className={`${logoClass} w-auto shrink-0 object-contain ${className ?? ""}`}
    />
  );
}
