import { Printer, History as HistoryIcon, ArrowRightLeft, AlertTriangle, Clock, Wallet, UserX, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { deriveStatus, computeAlertas, STATUS_META } from "./status-utils";

export type OrcV2 = {
  id: string;
  numero: number;
  paciente_id?: string | null;
  paciente_nome: string;
  paciente_telefone: string | null;
  paciente_cpf?: string | null;
  medico_nome: string | null;
  forma_pagamento: string | null;
  validade_dias: number | null;
  aprovado?: boolean | null;
  valor_total: number;
  status: string;
  created_at: string;
  categoria: "laboratorio" | "demais" | null | string;
  agendamentos_total: number;
  agendamentos_realizados: number;
  itens_total: number;
  itens_consumidos: number;
  procedimentos_txt?: string;
};

const BRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Deriva um label de pagador exibível sem usar "Convênio". */
export function pagadorLabel(forma: string | null): "Particular" | "Associado" | "Cartão de Benefícios" {
  const s = (forma ?? "").toLowerCase();
  if (s.includes("cart") && s.includes("benef")) return "Cartão de Benefícios";
  if (s.includes("associado")) return "Associado";
  return "Particular";
}

function relativeTime(iso: string): string {
  const d = new Date(iso).getTime();
  const diff = (Date.now() - d) / 1000;
  if (diff < 60) return "agora";
  if (diff < 3600) return `há ${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)}h`;
  if (diff < 2592000) return `há ${Math.floor(diff / 86400)}d`;
  return new Date(iso).toLocaleDateString("pt-BR");
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

interface Props {
  o: OrcV2;
  compact?: boolean;
  onOpen: () => void;
  onPrint: () => void;
  onConverter: () => void;
  onHistorico?: () => void;
  podeHistorico?: boolean;
}

export function OrcamentoCard({ o, compact, onOpen, onPrint, onConverter, onHistorico, podeHistorico }: Props) {
  const pagador = pagadorLabel(o.forma_pagamento);
  const status = deriveStatus(o);
  const meta = STATUS_META[status];
  const alertas = computeAlertas(o);

  return (
    <div
      className={cn(
        "group border-b border-border bg-card hover:bg-accent/30 transition-colors cursor-pointer border-l-4",
        meta.border,
        compact ? "px-3 py-2" : "px-4 py-3",
      )}
      onClick={onOpen}
      data-testid="orcamento-card"
      data-status={status}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className={cn("h-2 w-2 rounded-full shrink-0", meta.dot)} aria-hidden />
            <span className="font-medium truncate">{o.paciente_nome}</span>
            <span className="text-xs text-muted-foreground shrink-0">#ORC-{o.numero}</span>
            <span className="text-xs text-muted-foreground shrink-0">· {shortDate(o.created_at)}</span>
            <span className="text-[10px] text-muted-foreground shrink-0 hidden sm:inline">({relativeTime(o.created_at)})</span>
          </div>
          {!compact && (
            <>
              <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-muted-foreground">
                <span>{o.itens_total || 0} {o.itens_total === 1 ? "proc." : "procs."}</span>
                {o.medico_nome && <span>· {o.medico_nome}</span>}
                <Badge variant="outline" className={cn("text-[10px] font-normal border", meta.badge)}>{meta.label}</Badge>
                <Badge variant="outline" className="text-[10px] font-normal">{pagador}</Badge>
                {o.categoria === "laboratorio" && <Badge variant="secondary" className="text-[10px] font-normal">Laboratório</Badge>}
                {status === "convertido" && (
                  <Badge variant="secondary" className="text-[10px] font-normal">
                    {o.agendamentos_realizados}/{o.agendamentos_total} realizados
                  </Badge>
                )}
              </div>
              {(alertas.expirando || alertas.altoValor || alertas.parcial || alertas.aguardaPagto || alertas.cadastroIncompleto) && (
                <div className="flex flex-wrap items-center gap-1 mt-1.5">
                  {alertas.expirando && (
                    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200" title="Vence em até 3 dias">
                      <Clock className="h-3 w-3" /> Expirando
                    </span>
                  )}
                  {alertas.altoValor && (
                    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-900 dark:bg-violet-900/30 dark:text-violet-200" title="Alto valor">
                      <TrendingUp className="h-3 w-3" /> Alto valor
                    </span>
                  )}
                  {alertas.parcial && (
                    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-900 dark:bg-orange-900/30 dark:text-orange-200" title="Parcialmente convertido">
                      <AlertTriangle className="h-3 w-3" /> Parcial
                    </span>
                  )}
                  {alertas.aguardaPagto && (
                    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-900 dark:bg-blue-900/30 dark:text-blue-200" title="Aguardando pagamento">
                      <Wallet className="h-3 w-3" /> Aguarda pagto
                    </span>
                  )}
                  {alertas.cadastroIncompleto && (
                    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200" title="Cadastro incompleto (telefone/CPF)">
                      <UserX className="h-3 w-3" /> Cadastro
                    </span>
                  )}
                </div>
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="text-right">
            <div className={cn("font-semibold tabular-nums", compact ? "text-sm" : "text-base")}>{BRL(Number(o.valor_total))}</div>
            {compact && (
              <div className="text-[10px] mt-0.5">
                <span className={cn("inline-block px-1.5 rounded border", meta.badge)}>{meta.label}</span>
              </div>
            )}
          </div>
          <div className="hidden md:flex items-center gap-1">
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); onPrint(); }} title="Imprimir">
              <Printer className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); onConverter(); }} title="Converter em pagamento" data-testid="card-converter">
              <ArrowRightLeft className="h-4 w-4" />
            </Button>
            {podeHistorico && onHistorico && (
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); onHistorico(); }} title="Histórico">
                <HistoryIcon className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}