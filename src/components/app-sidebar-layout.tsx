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
        "[--largura-menu:100vw] lg:[--largura-menu:15rem] 2xl:[--largura-menu:16rem]",
        "transition-[grid-template-columns] duration-200 ease-out motion-reduce:transition-none",
        // Em telas pequenas, o menu desloca o conteúdo para fora da área
        // visível. Fechar devolve o atendimento sem desmontar a conversa.
        aberta
          ? "grid-cols-[var(--largura-menu)_minmax(0,1fr)]"
          : "grid-cols-[0px_minmax(0,1fr)]",
      )}
    >
      <div
        aria-hidden={!aberta}
        inert={!aberta}
        className="min-h-0 min-w-0 overflow-hidden"
      >
        {/* A coluna abre espaço, mas o menu desliza com largura fixa: os
            textos não quebram novamente a cada quadro da animação.
            A visibilidade só é retirada ao terminar o fechamento. */}
        <div
          className={cn(
            "h-full w-[var(--largura-menu)] min-h-0 transform-gpu",
            "transition-[translate,visibility] duration-[200ms,0ms] ease-out motion-reduce:transition-none",
            aberta
              ? "translate-x-0 visible delay-0"
              : "-translate-x-full invisible [transition-delay:0ms,200ms]",
          )}
        >
          {sidebar}
        </div>
      </div>
      <div
        className={cn(
          "flex flex-col min-h-0 min-w-0 overflow-hidden w-screen lg:w-auto",
          // Também retira os controles fora da tela da navegação por teclado.
          aberta && "invisible lg:visible",
        )}
      >
        {children}
      </div>
    </div>
  );
}
