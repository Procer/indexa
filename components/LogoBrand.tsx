import { withBasePath } from "@/lib/basePath";

interface LogoBrandProps {
  className?: string;
  logoClass?: string;
}

export function LogoBrand({ className, logoClass = "h-12" }: LogoBrandProps) {
  return (
    <img
      src={withBasePath("/logo-indexa.png")}
      alt="Indexa"
      className={`${logoClass} w-auto shrink-0 object-contain ${className ?? ""}`}
    />
  );
}
