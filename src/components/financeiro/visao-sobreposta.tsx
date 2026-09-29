/**
 * Abas do Financeiro abertas em tela cheia POR CIMA do Dashboard.
 *
 * Pedido do dono em 29/09/2026: clicar numa aba (Mov. Caixa, A Receber,
 * Relatórios…) não pode "trocar de página" — o Dashboard fica montado no
 * fundo, a aba abre numa camada em tela cheia com título e botão Fechar (ou
 * Esc), e ao fechar o Dashboard volta exatamente como estava (período,
 * botão de retroativos, detalhamento aberto).
 *
 * O endereço continua mudando por baixo (/app/financeiro/movimento etc.):
 * assim o voltar do navegador, o F5 e a permissão por aba seguem valendo.
 */
import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * `true` enquanto uma aba cobre o Dashboard. O Dashboard usa para pausar a
 * atualização automática (ninguém está vendo) e atualizar ao ser descoberto.
 */
const FinanceiroCobertoContext = createContext(false);

export const FinanceiroCobertoProvider = FinanceiroCobertoContext.Provider;

export function useFinanceiroCoberto() {
  return useContext(FinanceiroCobertoContext);
}

/**
 * Esc fecha a camada — mas só quando não há nada "por cima" dela: diálogo,
 * menu ou lista aberta fecham primeiro (é o que o Esc faz neles), e quem
 * está digitando num campo não perde a tela por engano.
 */
function escPertenceAOutroElemento(e: KeyboardEvent): boolean {
  const alvo = e.target as HTMLElement | null;
  if (alvo?.closest("input, textarea, select, [contenteditable='true']")) return true;
  return !!document.querySelector(
    [
      "[role='dialog'][data-state='open']",
      "[role='alertdialog'][data-state='open']",
      "[role='menu'][data-state='open']",
      "[role='listbox'][data-state='open']",
      "[data-radix-popper-content-wrapper]",
    ].join(", "),
  );
}

export function VisaoSobreposta({
  titulo,
  icone: Icone,
  onFechar,
  children,
}: {
  titulo: string;
  icone?: LucideIcon;
  onFechar: () => void;
  children: ReactNode;
}) {
  const fecharRef = useRef(onFechar);
  fecharRef.current = onFechar;

  useEffect(() => {
    // Captura na janela: roda antes do Radix tratar o Esc, enquanto o
    // diálogo aberto ainda está marcado como aberto.
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (escPertenceAOutroElemento(e)) return;
      fecharRef.current();
    };
    window.addEventListener("keydown", aoTeclar, true);
    return () => window.removeEventListener("keydown", aoTeclar, true);
  }, []);

  return createPortal(
    <div
      role="region"
      aria-label={titulo}
      className="fixed inset-0 z-50 flex flex-col bg-background animate-in fade-in-0 slide-in-from-bottom-2 duration-200"
    >
      <header className="flex shrink-0 items-center gap-3 border-b border-border/70 bg-card px-4 py-2.5 shadow-sm">
        {Icone && <Icone className="h-5 w-5 shrink-0 text-primary" />}
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">{titulo}</h1>
        <span className="hidden text-xs text-muted-foreground sm:inline">Esc para fechar</span>
        <Button variant="default" size="sm" onClick={onFechar} className="gap-1.5">
          <X className="h-4 w-4" />
          Fechar
        </Button>
      </header>
      <div className="min-w-0 flex-1 overflow-auto p-3">{children}</div>
    </div>,
    document.body,
  );
}
