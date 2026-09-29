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
import { Link } from "@tanstack/react-router";
import { X, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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

export type AtalhoFinanceiro = { to: string; label: string; icon: LucideIcon };

/**
 * Atalhos do topo da tela cheia (pedido do dono em 29/09/2026). Todos trocam
 * o conteúdo sem fechar a camada — inclusive "Dashboard", que mostra ali
 * dentro o mesmo Dashboard do fundo, intacto. Só Fechar/Esc saem dela.
 */
export const ATALHOS_TELA_CHEIA = [
  "/app/financeiro",
  "/app/financeiro/movimento",
  "/app/financeiro/atendimentos",
  "/app/financeiro/relatorios",
] as const;

export function VisaoSobreposta({
  titulo,
  icone: Icone,
  atalhos,
  ativo,
  onEscolher,
  onFechar,
  children,
}: {
  titulo: string;
  icone?: LucideIcon;
  /** Atalhos que o perfil pode ver, na ordem do cabeçalho. */
  atalhos: readonly AtalhoFinanceiro[];
  /** `to` da aba aberta, para destacar o atalho correspondente. */
  ativo: string;
  /** Avisado antes da navegação do atalho clicado. */
  onEscolher?: (to: string) => void;
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
      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border/70 bg-card px-4 py-2.5 shadow-sm">
        <div className="flex min-w-0 items-center gap-2">
          {Icone && <Icone className="h-5 w-5 shrink-0 text-primary" />}
          <h1 className="truncate text-lg font-semibold">{titulo}</h1>
        </div>
        <nav className="flex flex-1 flex-wrap items-center justify-center gap-1.5">
          {atalhos.map((a) => {
            const selecionado = a.to === ativo;
            return (
              <Link
                key={a.to}
                to={a.to}
                onClick={() => onEscolher?.(a.to)}
                className={cn(
                  "group flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-[14px] font-medium transition-colors duration-200",
                  selecionado
                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                    : "border-border/60 bg-muted/40 text-muted-foreground hover:border-primary/30 hover:bg-primary/5 hover:text-foreground",
                )}
              >
                <a.icon
                  className={cn(
                    "h-4 w-4 shrink-0",
                    selecionado ? "" : "text-muted-foreground/70 group-hover:text-primary",
                  )}
                />
                {a.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-xs text-muted-foreground lg:inline">Esc para fechar</span>
          <Button variant="default" size="sm" onClick={onFechar} className="gap-1.5">
            <X className="h-4 w-4" />
            Fechar
          </Button>
        </div>
      </header>
      {/* A chave troca a cada aba: o conteúdo novo entra com um fade curto. */}
      <div
        key={ativo}
        className="min-w-0 flex-1 overflow-auto p-3 animate-in fade-in-0 slide-in-from-bottom-1 duration-200"
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
