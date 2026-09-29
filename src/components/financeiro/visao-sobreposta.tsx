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
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "@tanstack/react-router";
import { Columns2, Square, X, type LucideIcon } from "lucide-react";
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
 * Espaço na barra de cima (ou na barra do painel, no Comparar) onde a tela
 * aberta pode pôr os próprios controles — ex.: as abas de tipo do Relatórios.
 * `null` fora da tela cheia: aí a tela mostra o controle no lugar de sempre.
 */
const SlotDoCabecalhoContext = createContext<HTMLElement | null>(null);

export function useSlotDoCabecalho() {
  return useContext(SlotDoCabecalhoContext);
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
  "/app/financeiro/estorno",
] as const;

const PILULA =
  "group flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-[14px] font-medium transition-colors duration-200";
const PILULA_ATIVA = "border-primary bg-primary text-primary-foreground shadow-sm";
const PILULA_INATIVA =
  "border-border/60 bg-muted/40 text-muted-foreground hover:border-primary/30 hover:bg-primary/5 hover:text-foreground";

function ConteudoPilula({ a, selecionado }: { a: AtalhoFinanceiro; selecionado: boolean }) {
  return (
    <>
      <a.icon
        className={cn(
          "h-4 w-4 shrink-0",
          selecionado ? "" : "text-muted-foreground/70 group-hover:text-primary",
        )}
      />
      {a.label}
    </>
  );
}

/** Atalhos que trocam de aba pelo endereço (tela única e painel esquerdo). */
function AtalhosDeRota({
  atalhos,
  ativo,
  onEscolher,
}: {
  atalhos: readonly AtalhoFinanceiro[];
  ativo: string;
  onEscolher?: (to: string) => void;
}) {
  return (
    <>
      {atalhos.map((a) => (
        <Link
          key={a.to}
          to={a.to}
          onClick={() => onEscolher?.(a.to)}
          className={cn(PILULA, a.to === ativo ? PILULA_ATIVA : PILULA_INATIVA)}
        >
          <ConteudoPilula a={a} selecionado={a.to === ativo} />
        </Link>
      ))}
    </>
  );
}

/**
 * Painel direito do modo Comparar (pedido do dono em 29/09/2026): escolhe a
 * tela por estado, sem mexer no endereço — o esquerdo segue o endereço.
 */
export type PainelDireito = {
  ativo: string;
  onEscolher: (to: string) => void;
  conteudo: ReactNode;
};

function BarraDoPainel({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border/70 bg-muted/30 px-3 py-2">
      <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {rotulo}
      </span>
      {children}
    </div>
  );
}

export function VisaoSobreposta({
  titulo,
  icone: Icone,
  atalhos,
  ativo,
  onEscolher,
  onFechar,
  comparar = false,
  onAlternarComparar,
  direita,
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
  /** Modo lado a lado ligado. */
  comparar?: boolean;
  onAlternarComparar?: () => void;
  direita?: PainelDireito;
  children: ReactNode;
}) {
  const ladoALado = comparar && !!direita;
  const [slotEsquerda, setSlotEsquerda] = useState<HTMLDivElement | null>(null);
  const [slotDireita, setSlotDireita] = useState<HTMLDivElement | null>(null);
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
          {ladoALado ? (
            <Columns2 className="h-5 w-5 shrink-0 text-primary" />
          ) : (
            Icone && <Icone className="h-5 w-5 shrink-0 text-primary" />
          )}
          <h1 className="truncate text-lg font-semibold">
            {ladoALado ? "Comparar lado a lado" : titulo}
          </h1>
        </div>
        <nav className="flex flex-1 flex-wrap items-center justify-center gap-1.5">
          {ladoALado ? null : (
            <AtalhosDeRota atalhos={atalhos} ativo={ativo} onEscolher={onEscolher} />
          )}
          {ladoALado ? null : <div ref={setSlotEsquerda} className="ml-2 empty:hidden" />}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          {onAlternarComparar && (
            <Button
              variant="outline"
              size="sm"
              onClick={onAlternarComparar}
              className={cn("gap-1.5", ladoALado && "border-primary text-primary")}
            >
              {ladoALado ? <Square className="h-4 w-4" /> : <Columns2 className="h-4 w-4" />}
              {ladoALado ? "Visão única" : "Comparar"}
            </Button>
          )}
          <span className="hidden text-xs text-muted-foreground lg:inline">Esc para fechar</span>
          <Button variant="default" size="sm" onClick={onFechar} className="gap-1.5">
            <X className="h-4 w-4" />
            Fechar
          </Button>
        </div>
      </header>
      {/*
        A estrutura do painel esquerdo é a mesma com ou sem Comparar: ligar e
        desligar o modo não desmonta a tela aberta nem perde os filtros dela.
        Estreito, os painéis ficam um sobre o outro; cada um rola sozinho.
      */}
      <div
        className={cn(
          "min-h-0 flex-1",
          ladoALado
            ? "grid grid-cols-1 grid-rows-2 divide-y divide-border/70 lg:grid-cols-2 lg:grid-rows-1 lg:divide-x lg:divide-y-0"
            : "flex flex-col",
        )}
      >
        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          {ladoALado ? (
            <BarraDoPainel rotulo="Esquerda">
              <AtalhosDeRota atalhos={atalhos} ativo={ativo} onEscolher={onEscolher} />
              <div ref={setSlotEsquerda} className="ml-2 empty:hidden" />
            </BarraDoPainel>
          ) : null}
          {/* A chave troca a cada aba: o conteúdo novo entra com um fade curto. */}
          <div
            key={ativo}
            className={cn(
              "min-h-0 min-w-0 flex-1 overflow-auto p-3 animate-in fade-in-0 slide-in-from-bottom-1 duration-200",
              // Cards cabem pela largura do painel (ver styles.css).
              ladoALado && "painel-comparado",
            )}
          >
            <SlotDoCabecalhoContext.Provider value={slotEsquerda}>
              {children}
            </SlotDoCabecalhoContext.Provider>
          </div>
        </section>
        {ladoALado && direita ? (
          <section className="flex min-h-0 min-w-0 flex-col">
            <BarraDoPainel rotulo="Direita">
              {atalhos.map((a) => (
                <button
                  key={a.to}
                  type="button"
                  onClick={() => direita.onEscolher(a.to)}
                  className={cn(PILULA, a.to === direita.ativo ? PILULA_ATIVA : PILULA_INATIVA)}
                >
                  <ConteudoPilula a={a} selecionado={a.to === direita.ativo} />
                </button>
              ))}
              <div ref={setSlotDireita} className="ml-2 empty:hidden" />
            </BarraDoPainel>
            <div
              key={direita.ativo}
              className="painel-comparado min-h-0 min-w-0 flex-1 overflow-auto p-3 animate-in fade-in-0 slide-in-from-bottom-1 duration-200"
            >
              <SlotDoCabecalhoContext.Provider value={slotDireita}>
                {direita.conteudo}
              </SlotDoCabecalhoContext.Provider>
            </div>
          </section>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
