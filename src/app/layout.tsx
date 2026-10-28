import type { Metadata, Viewport } from "next";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { NotificationChecker } from "@/components/shared/NotificationChecker";
import { PWARegister } from "@/components/shared/PWARegister";
import { AppShell } from "@/components/layout/AppShell";
import { getConfig, cssVariablesMarca } from "@/lib/config";
import { ID_CONFIG_PUBLICA, configPublicaSerializada } from "@/lib/config-publica";

// Tudo o que é visível da marca sai de config/cliente.ts (zona do cliente).
export function generateMetadata(): Metadata {
  const { marca, idioma } = getConfig();
  return {
    title: { default: marca.nombre, template: `%s · ${marca.nombre}` },
    description: marca.descripcion,
    manifest: "/manifest.webmanifest",
    icons: { icon: marca.icono, apple: marca.icono },
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: marca.nombreCorto,
    },
    other: { "x-idioma": idioma },
  };
}

export function generateViewport(): Viewport {
  const { marca } = getConfig();
  return {
    themeColor: marca.colorSidebar,
    width: "device-width",
    initialScale: 1,
    // Deixa pintar debaixo do notch; os paddings usam env(safe-area-inset-*).
    viewportFit: "cover",
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { idioma } = getConfig();
  return (
    <html lang={idioma} className="h-full antialiased">
      <head>
        {/* Cores da marca no SSR: sem flash da cor padrão. */}
        <style dangerouslySetInnerHTML={{ __html: cssVariablesMarca() }} />
        {/* Config pública em tempo de execução: ver src/lib/config-publica.ts. */}
        <script
          id={ID_CONFIG_PUBLICA}
          type="application/json"
          dangerouslySetInnerHTML={{ __html: configPublicaSerializada() }}
        />
      </head>
      <body className="min-h-full bg-background">
        <TooltipProvider>
          <AppShell>{children}</AppShell>
          <Toaster />
          <NotificationChecker />
          <PWARegister />
        </TooltipProvider>
      </body>
    </html>
  );
}
