import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Menu e conteúdo dividem a largura disponível, sem camada sobreposta. */
export function AppSidebarLayout({
  aberta,
  sidebar,
  children,
}: {
  aberta: boolean;
  sidebar: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid flex-1 min-h-0 min-w-0 overflow-hidden",
        "transition-[grid-template-columns] duration-300 ease-out motion-reduce:transition-none",
        // Em telas pequenas, o menu desloca o conteúdo para fora da área
        // visível. Fechar devolve o atendimento sem desmontar a conversa.
        aberta
          ? "grid-cols-[100%_minmax(0,1fr)] lg:grid-cols-[15rem_minmax(0,1fr)] 2xl:grid-cols-[16rem_minmax(0,1fr)]"
          : "grid-cols-[0px_minmax(0,1fr)]",
      )}
    >
      <div
        aria-hidden={!aberta}
        inert={!aberta}
        className={cn("min-h-0 min-w-0 overflow-hidden", !aberta && "invisible")}
      >
        {sidebar}
      </div>
      <div
        className={cn(
          "flex flex-col min-h-0 min-w-0 overflow-hidden",
          // Também retira os controles fora da tela da navegação por teclado.
          aberta && "invisible lg:visible",
        )}
      >
        {children}
      </div>
    </div>
  );
}
