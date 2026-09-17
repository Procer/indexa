import type { Metadata } from "next";
import localFont from "next/font/local";
import { Josefin_Sans } from "next/font/google";
import { SiteAnalyticsBeacon } from "@/components/SiteAnalyticsBeacon";
import { VisitorNamePrompt } from "@/components/VisitorNamePrompt";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});
const josefinSans = Josefin_Sans({
  subsets: ["latin"],
  variable: "--font-josefin",
  weight: ["300", "400", "600", "700"],
});

export const metadata: Metadata = {
  title: "indexa — Encontrá tu notebook o PC ideal",
  description:
    "Buscador de tecnología con IA para Argentina. Describí para qué lo vas a usar y te recomendamos el mejor equipo según tu presupuesto.",
  // Sin bloque `icons` explícito: Next.js App Router ya sirve /favicon.ico
  // automáticamente por convención de archivo (app/favicon.ico) — declararlo
  // acá A LA VEZ que existe en public/favicon.ico causaba un 500 ("conflicting
  // public file and page file"). Un solo dueño: app/favicon.ico.
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <head>
        {/* Solo para los íconos de la pantalla de preguntas guiadas (ver
            .material-symbols-outlined en globals.css) — next/font no cubre
            fuentes de íconos variables como esta. */}
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${josefinSans.variable} min-h-screen bg-background antialiased`}
      >
        {/* Glow ambiente — fixed para cubrir el viewport entero, igual en
            cualquier pantalla del sitio (mismo patrón que ya se usaba por
            página en la fase de resultados, ahora a nivel raíz). */}
        <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
          <div className="gathering-ambient-glow-primary -left-24 -top-16" />
          <div className="gathering-ambient-glow-secondary -right-20 bottom-0" />
        </div>
        <SiteAnalyticsBeacon />
        <VisitorNamePrompt />
        <div className="relative z-10">
          {children}
        </div>
      </body>
    </html>
  );
}
