"use client";

import { SidebarBrand, SidebarNav, SidebarFooter } from "./Sidebar";

export function MobileNav() {
  return (
    // O painel ocupa a tela inteira (inset-y-0), então a marca ficava coberta
    // pelo relógio e pela bateria na PWA, e o usuário do rodapé pela barra de gestos.
    <div className="flex flex-col h-full bg-sidebar text-sidebar-foreground pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <SidebarBrand />
      <SidebarNav className="flex-1" />
      <SidebarFooter />
    </div>
  );
}
