import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CalendarDays, ChevronDown, ChevronRight, Users } from "lucide-react";

/**
 * Visão em CARDS da lista de contratos do Cartão Benefício.
 *
 * Espelha o modelo enviado pela equipe (tela de mensalistas): faixa de
 * indicadores no topo e um card por contrato. No lugar das placas do modelo
 * entra o card de DEPENDENTES — fechado mostra a contagem, e ao clicar abre a
 * lista com os nomes.
 *
 * Só apresentação: não altera nenhuma regra de contrato, cobrança ou carência.
 */

export interface ContratoCardItem {
  id: string;
  numero: number | null;
  paciente_nome: string;
  codigo_prontuario?: string | null;
  convenio_nome: string | null;
  status: string;
  data_inicio: string;
  data_fim?: string | null;
  valor_mensal: number;
  vendedor?: string | null;
  parcelas?: { pagas: number; total: number; temAtrasada: boolean } | undefined;
}

interface Props {
  /** Contratos da página atual (os que aparecem em card). */
  itens: ContratoCardItem[];
  /** Todos os contratos filtrados — base dos indicadores do topo. */
  todos: ContratoCardItem[];
  clinicaId: string;
  onAbrir: (id: string) => void;
}

interface Dependente {
  contrato_id: string;
  paciente_nome: string;
  parentesco: string | null;
  tipo: string | null;
}

const BRL = (v: number) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtData = (s?: string | null) => {
  if (!s) return "—";
  const d = new Date(s.slice(0, 10) + "T00:00:00");
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

const iniciais = (nome: string) =>
  nome
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("") || "?";

function limitesDoMes() {
  const hoje = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const ini = `${hoje.getFullYear()}-${pad(hoje.getMonth() + 1)}-01`;
  const fimD = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
  const fim = `${fimD.getFullYear()}-${pad(fimD.getMonth() + 1)}-${pad(fimD.getDate())}`;
  const hojeIso = `${hoje.getFullYear()}-${pad(hoje.getMonth() + 1)}-${pad(hoje.getDate())}`;
  return { ini, fim, hojeIso };
}

/** Tons usados no modelo enviado: faixa colorida à esquerda + fundo suave. */
const TONS = {
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
} as const;

type TomNome = keyof typeof TONS;

function KpiCard({
  titulo,
  valor,
  detalhe,
  tom,
}: {
  titulo: string;
  valor: string;
  detalhe: string;
  tom: TomNome;
}) {
  const t = TONS[tom];
  return (
    <Card className={`relative overflow-hidden p-4 ${t.fundo} ${t.borda}`}>
      <span className={`absolute inset-y-0 left-0 w-1 ${t.faixa}`} aria-hidden />
      <div className="pl-2">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {titulo}
        </div>
        <div className={`mt-1 text-3xl font-semibold tabular-nums ${t.texto}`}>{valor}</div>
        <div className="mt-1 text-xs text-muted-foreground">{detalhe}</div>
      </div>
    </Card>
  );
}


export function ContratosCards({ itens, todos, clinicaId, onAbrir }: Props) {
  const [deps, setDeps] = useState<Record<string, Dependente[]>>({});
  const [aberto, setAberto] = useState<Record<string, boolean>>({});
  const [mes, setMes] = useState<{
    pagos: number;
    pagosValor: number;
    aVencer: number;
    aVencerValor: number;
    atrasados: number;
    atrasadosValor: number;
  } | null>(null);

  const ids = useMemo(() => itens.map((i) => i.id).join(","), [itens]);

  useEffect(() => {
    const lista = ids ? ids.split(",") : [];
    if (lista.length === 0) {
      setDeps({});
      return;
    }
    let cancelado = false;
    void (async () => {
      const { data } = await supabase
        .from("contrato_dependentes")
        .select("contrato_id, paciente_nome, parentesco, tipo")
        .in("contrato_id", lista)
        .eq("ativo", true)
        .order("paciente_nome");
      if (cancelado) return;
      const mapa: Record<string, Dependente[]> = {};
      ((data ?? []) as Dependente[]).forEach((d) => {
        (mapa[d.contrato_id] ??= []).push(d);
      });
      setDeps(mapa);
    })();
    return () => {
      cancelado = true;
    };
  }, [ids]);

  useEffect(() => {
    if (!clinicaId) return;
    let cancelado = false;
    void (async () => {
      const { ini, fim, hojeIso } = limitesDoMes();
      const { data } = await supabase
        .from("contrato_mensalidades")
        .select("status, valor, valor_pago, vencimento")
        .eq("clinica_id", clinicaId)
        .gte("vencimento", ini)
        .lte("vencimento", fim);
      if (cancelado) return;
      const linhas = (data ?? []) as Array<{
        status: string | null;
        valor: number | null;
        valor_pago: number | null;
        vencimento: string;
      }>;
      const resumo = {
        pagos: 0,
        pagosValor: 0,
        aVencer: 0,
        aVencerValor: 0,
        atrasados: 0,
        atrasadosValor: 0,
      };
      linhas.forEach((l) => {
        const pago = (l.status ?? "").toLowerCase() === "pago";
        if (pago) {
          resumo.pagos += 1;
          resumo.pagosValor += Number(l.valor_pago ?? l.valor ?? 0);
          return;
        }
        if ((l.status ?? "").toLowerCase() === "cancelado") return;
        if (l.vencimento < hojeIso) {
          resumo.atrasados += 1;
          resumo.atrasadosValor += Number(l.valor ?? 0);
        } else {
          resumo.aVencer += 1;
          resumo.aVencerValor += Number(l.valor ?? 0);
        }
      });
      setMes(resumo);
    })();
    return () => {
      cancelado = true;
    };
  }, [clinicaId]);

  const kpis = useMemo(() => {
    const { ini } = limitesDoMes();
    const ativos = todos.filter((c) => (c.status ?? "").toLowerCase() === "ativo");
    const inativos = todos.filter((c) =>
      ["cancelado", "inativo", "encerrado"].includes((c.status ?? "").toLowerCase()),
    );
    const novos = todos.filter((c) => (c.data_inicio ?? "").slice(0, 10) >= ini);
    return {
      ativos: ativos.length,
      receita: ativos.reduce((s, c) => s + Number(c.valor_mensal || 0), 0),
      inativos: inativos.length,
      novos: novos.length,
      novosValor: novos.reduce((s, c) => s + Number(c.valor_mensal || 0), 0),
    };
  }, [todos]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          titulo="Contratos ativos"
          valor={String(kpis.ativos)}
          detalhe={`Receita prevista ${BRL(kpis.receita)}`}
          tom="azul"
        />
        <KpiCard
          titulo="Pagos no mês"
          valor={mes ? String(mes.pagos) : "—"}
          detalhe={mes ? BRL(mes.pagosValor) : "Carregando…"}
          tom="verde"
        />
        <KpiCard
          titulo="A vencer"
          valor={mes ? String(mes.aVencer) : "—"}
          detalhe={mes ? BRL(mes.aVencerValor) : "Carregando…"}
          tom="ambar"
        />
        <KpiCard
          titulo="Inadimplentes"
          valor={mes ? String(mes.atrasados) : "—"}
          detalhe={mes ? BRL(mes.atrasadosValor) : "Carregando…"}
          tom="vermelho"
        />
        <KpiCard
          titulo="Novos contratos"
          valor={String(kpis.novos)}
          detalhe={`Neste mês · ${BRL(kpis.novosValor)}`}
          tom="azul"
        />
        <KpiCard
          titulo="Cancelados / inativos"
          valor={String(kpis.inativos)}
          detalhe="Fora de uso"
          tom="neutro"
        />
      </div>

      {itens.length === 0 ? (
        <div className="rounded-md border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          Nenhum contrato para mostrar.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {itens.map((c) => {
            const lista = deps[c.id] ?? [];
            const expandido = Boolean(aberto[c.id]);
            const emDia = !c.parcelas || !c.parcelas.temAtrasada;
            const cancelado = (c.status ?? "").toLowerCase() !== "ativo";
            return (
              <Card key={c.id} className="flex flex-col gap-3 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold">
                    {iniciais(c.paciente_nome)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => onAbrir(c.id)}
                      className="text-left text-sm font-semibold leading-tight hover:underline"
                      title="Abrir contrato"
                    >
                      {c.paciente_nome}
                    </button>
                    <div className="text-xs tabular-nums text-muted-foreground">
                      Nº {c.numero ?? "—"}
                      {c.codigo_prontuario ? ` · Prontuário ${c.codigo_prontuario}` : ""}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <Badge
                        variant="secondary"
                        className={
                          cancelado
                            ? "text-muted-foreground"
                            : "bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300"
                        }
                      >
                        {c.status}
                      </Badge>
                      {c.convenio_nome ? (
                        <Badge variant="outline">{c.convenio_nome}</Badge>
                      ) : null}
                      {!cancelado ? (
                        <Badge
                          variant="outline"
                          className={
                            emDia
                              ? "border-emerald-300 text-emerald-700"
                              : "border-amber-300 text-amber-700"
                          }
                        >
                          {emDia ? "Em dia" : "Pendente"}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                </div>

                {/* Card de dependentes — no modelo era a lista de placas. */}
                <button
                  type="button"
                  onClick={() => setAberto((a) => ({ ...a, [c.id]: !a[c.id] }))}
                  className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50"
                  aria-expanded={expandido}
                >
                  <span className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">
                      {lista.length} dependente{lista.length === 1 ? "" : "s"}
                    </span>
                  </span>
                  {expandido ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
                {expandido ? (
                  <div className="-mt-1 rounded-md border bg-muted/20 px-3 py-2 text-xs">
                    {lista.length === 0 ? (
                      <span className="text-muted-foreground">
                        Nenhum dependente ativo neste cartão.
                      </span>
                    ) : (
                      <ul className="space-y-1">
                        {lista.map((d, i) => (
                          <li key={`${c.id}-${i}`} className="flex justify-between gap-2">
                            <span className="truncate">{d.paciente_nome}</span>
                            <span className="shrink-0 text-muted-foreground">
                              {d.parentesco || d.tipo || "—"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : null}

                <div className="rounded-md bg-muted/40 p-3 text-sm">
                  <div className="grid grid-cols-2 gap-y-2">
                    <div>
                      <div className="text-[11px] uppercase text-muted-foreground">Mensalidade</div>
                      <div className="font-semibold tabular-nums">{BRL(c.valor_mensal)}</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase text-muted-foreground">
                        Início do contrato
                      </div>
                      <div className="font-semibold tabular-nums">{fmtData(c.data_inicio)}</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase text-muted-foreground">Término</div>
                      <div className="tabular-nums">{fmtData(c.data_fim)}</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase text-muted-foreground">Parcelas</div>
                      <div className="tabular-nums">
                        {c.parcelas ? `${c.parcelas.pagas} / ${c.parcelas.total}` : "—"}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {c.vendedor ? `Vendedor: ${c.vendedor}` : "Sem vendedor"}
                  </span>
                  <Button size="sm" variant="outline" onClick={() => onAbrir(c.id)}>
                    Abrir
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
