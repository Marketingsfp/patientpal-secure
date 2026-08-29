import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Info } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Card de indicador dos blocos temáticos do Painel Executivo.
 *
 * Nasceu do card da faixa de indicadores do Cartão Benefícios
 * (`contratos-cards.tsx`), que a clínica já reconhece: faixa colorida à
 * esquerda, rótulo em caixa alta, número grande e uma linha de detalhe. Os três
 * blocos usam o MESMO card para que a tela leia como um sistema só, e não como
 * três pedaços colados.
 *
 * ------------------------------ SEM CORTES --------------------------------
 * Nenhum texto usa `truncate`. Num painel de gestão, "R$ 202.730,7…" ou
 * "Inadimplência Rea…" é pior que uma linha a mais de altura: o número cortado
 * é lido errado e o rótulo cortado é lido pela metade. O rótulo quebra em até
 * duas linhas, o valor diminui de corpo nas telas estreitas e o detalhe quebra
 * livremente.
 */

export type TomIndicador = "neutro" | "verde" | "ambar" | "vermelho" | "azul" | "roxo";

const TONS: Record<TomIndicador, { faixa: string; fundo: string; borda: string; texto: string }> = {
  neutro: {
    faixa: "bg-slate-400",
    fundo: "bg-slate-50 dark:bg-slate-900/40",
    borda: "border-slate-200 dark:border-slate-800",
    texto: "text-slate-700 dark:text-slate-200",
  },
  verde: {
    faixa: "bg-emerald-500",
    fundo: "bg-emerald-50 dark:bg-emerald-950/30",
    borda: "border-emerald-200 dark:border-emerald-900",
    texto: "text-emerald-700 dark:text-emerald-300",
  },
  ambar: {
    faixa: "bg-amber-500",
    fundo: "bg-amber-50 dark:bg-amber-950/30",
    borda: "border-amber-200 dark:border-amber-900",
    texto: "text-amber-700 dark:text-amber-300",
  },
  vermelho: {
    faixa: "bg-red-500",
    fundo: "bg-red-50 dark:bg-red-950/30",
    borda: "border-red-200 dark:border-red-900",
    texto: "text-red-700 dark:text-red-300",
  },
  azul: {
    faixa: "bg-blue-500",
    fundo: "bg-blue-50 dark:bg-blue-950/30",
    borda: "border-blue-200 dark:border-blue-900",
    texto: "text-blue-700 dark:text-blue-300",
  },
  roxo: {
    faixa: "bg-violet-500",
    fundo: "bg-violet-50 dark:bg-violet-950/30",
    borda: "border-violet-200 dark:border-violet-900",
    texto: "text-violet-700 dark:text-violet-300",
  },
};

export interface CardIndicadorProps {
  titulo: string;
  /** Número já formatado. Use "—" quando ainda não há valor. */
  valor: string;
  /** Linha de apoio embaixo do número (ex.: "Receita prevista R$ 202.730,70"). */
  detalhe?: string;
  tom?: TomIndicador;
  icone?: LucideIcon;
  /** Explica em uma frase o que exatamente este número conta. */
  ajuda?: string;
  /** Card grande (topo executivo) ou compacto (grade de seis). */
  destaque?: boolean;
  /** Enquanto carrega, o valor vira uma tarja cinza no lugar do número. */
  carregando?: boolean;
  className?: string;
  /** Conteúdo extra abaixo do detalhe (ex.: barra de proporção). */
  children?: ReactNode;
}

export function CardIndicador({
  titulo,
  valor,
  detalhe,
  tom = "neutro",
  icone: Icone,
  ajuda,
  destaque = false,
  carregando = false,
  className,
  children,
}: CardIndicadorProps) {
  const t = TONS[tom];
  return (
    <Card
      className={cn("relative overflow-hidden p-4", t.fundo, t.borda, className)}
      aria-busy={carregando || undefined}
    >
      <span className={cn("absolute inset-y-0 left-0 w-1", t.faixa)} aria-hidden />
      <div className="flex min-w-0 flex-col gap-1 pl-2">
        <div className="flex items-start gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {Icone && <Icone className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />}
          {/* `break-words`, nunca `truncate`: rótulo cortado é rótulo perdido. */}
          <span className="min-w-0 break-words leading-snug">{titulo}</span>
          {ajuda ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  tabIndex={0}
                  aria-label={`O que entra em ${titulo}`}
                  className="mt-px shrink-0 cursor-help text-muted-foreground/70 hover:text-foreground"
                >
                  <Info className="h-3.5 w-3.5" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[280px] text-xs leading-snug">
                {ajuda}
              </TooltipContent>
            </Tooltip>
          ) : null}
        </div>

        {carregando ? (
          <div
            className="mt-1 h-8 w-24 animate-pulse rounded bg-slate-200/80 dark:bg-slate-700/60"
            role="status"
            aria-label="Carregando"
          />
        ) : (
          <div
            className={cn(
              "mt-0.5 font-semibold tabular-nums leading-tight",
              // O corpo cai nas telas estreitas em vez de o número ser cortado.
              destaque ? "text-2xl sm:text-3xl" : "text-xl sm:text-2xl",
              t.texto,
            )}
          >
            {valor}
          </div>
        )}

        {detalhe ? (
          <div className="break-words text-xs leading-snug text-muted-foreground">{detalhe}</div>
        ) : null}
        {children}
      </div>
    </Card>
  );
}
