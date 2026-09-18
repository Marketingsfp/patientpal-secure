import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Casca do menu lateral, em dois modos.
 *
 * "coluna" (OS ZAP): menu e conteúdo dividem a largura disponível, sem camada
 * sobreposta — abrir o menu desloca o atendimento em vez de cobri-lo.
 * "gaveta" (demais portais): o menu é uma camada presa à janela, do topo ao
 * rodapé da tela, com fundo escuro atrás; o conteúdo continua ocupando 100%
 * da largura em qualquer estado.
 */
export function AppSidebarLayout({
  aberta,
  modo,
  onFechar,
  sidebar,
  children,
}: {
  aberta: boolean;
  modo: "coluna" | "gaveta";
  onFechar: () => void;
  sidebar: ReactNode;
  children: ReactNode;
}) {
  if (modo === "gaveta") {
    return (
      <div className="flex flex-1 min-h-0 min-w-0">
        {/* Fundo escuro: cobre o sistema inteiro, cabeçalho incluído. Clicar fecha. */}
        <div
          aria-hidden
          onClick={onFechar}
          className={cn(
            "fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]",
            "transition-opacity ease-out motion-reduce:transition-none",
            aberta ? "opacity-100 duration-200" : "opacity-0 duration-200 pointer-events-none",
          )}
        />
        {/* Gaveta presa à janela: fechada não ocupa espaço nenhum no layout,
            e o conteúdo fica com a largura inteira. */}
        <div
          aria-hidden={!aberta}
          inert={!aberta}
          className={cn(
            "fixed inset-y-0 left-0 z-50 w-60 2xl:w-64 max-w-[85vw]",
            "flex flex-col overflow-hidden shadow-2xl transform-gpu",
            "transition-[translate,visibility] duration-[200ms,0ms] ease-out motion-reduce:transition-none",
            aberta
              ? "translate-x-0 visible delay-0"
              : "-translate-x-full invisible [transition-delay:0ms,200ms]",
          )}
        >
          {sidebar}
        </div>
        <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">{children}</div>
      </div>
    );
  }

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
