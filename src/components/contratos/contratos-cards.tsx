import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ChevronDown,
  ChevronRight,
  CreditCard,
  DollarSign,
  Loader2,
  Pencil,
  Power,
  Users,
} from "lucide-react";

/**
 * Visão em CARDS da lista de contratos do Cartão Benefício.
 *
 * Espelha o modelo enviado pela equipe (tela de mensalistas): faixa de
 * indicadores no topo e um card por contrato. Cada card segue a mesma ordem da
 * referência — cabeçalho com avatar e identificação, linha de dependentes,
 * quadro cinza com os quatro números da cobrança e a barra de ações na base.
 *
 * Só apresentação: não altera nenhuma regra de contrato, cobrança ou carência.
 * As ações da barra apenas chamam o que a tela de contratos já fazia (abrir o
 * recebimento da parcela, imprimir cartão, editar, cancelar).
 */

export interface ContratoCardItem {
  id: string;
  numero: number | null;
  paciente_nome: string;
  paciente_id?: string | null;
  codigo_prontuario?: string | null;
  convenio_nome: string | null;
  status: string;
  data_inicio: string;
  data_fim?: string | null;
  created_at?: string | null;
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
  /** Botão verde: abre o recebimento da próxima parcela em aberto. */
  onPagar?: (id: string) => void;
  /** Botão secundário: imprime a carteirinha do titular e dos dependentes. */
  onCartao?: (id: string) => void | Promise<void>;
  /** Lápis: abre o contrato na aba de dados, para edição. */
  onEditar?: (id: string) => void;
  /** Power: abre o cancelamento do contrato. */
  onInativar?: (id: string) => void;
  /** Sem permissão de escrita, as ações que gravam ficam desabilitadas. */
  podeEscrever?: boolean;
}

interface Dependente {
  contrato_id: string;
  paciente_nome: string;
  parentesco: string | null;
  tipo: string | null;
}

/** Situação de cobrança de um contrato, resumida para o quadro cinza. */
interface Cobranca {
  proximoVencimento: string | null;
  ultimoPagamento: string | null;
  diasEmAberto: number;
}

const BRL = (v: number) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtData = (s?: string | null) => {
  if (!s) return "—";
  const d = new Date(s.slice(0, 10) + "T00:00:00");
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

const fmtCPF = (s?: string | null) => {
  const d = (s ?? "").replace(/\D/g, "");
  if (d.length !== 11) return null;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
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

/** Dias corridos entre o vencimento e hoje (0 quando ainda não venceu). */
function diasDeAtraso(vencimento: string, hojeIso: string): number {
  if (vencimento >= hojeIso) return 0;
  const a = new Date(vencimento.slice(0, 10) + "T00:00:00").getTime();
  const b = new Date(hojeIso + "T00:00:00").getTime();
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/** Tons usados no modelo enviado: faixa colorida + fundo suave. */
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

/** Indicador do topo escolhido como filtro da relação de cards. */
type FiltroKpi = "ativos" | "pagos" | "avencer" | "inadimplentes" | "novos" | "inativos";

const ROTULO_FILTRO: Record<FiltroKpi, string> = {
  ativos: "Contratos ativos",
  pagos: "Pagos no mês",
  avencer: "A vencer",
  inadimplentes: "Inadimplentes",
  novos: "Novos contratos",
  inativos: "Cancelados / inativos",
};


function KpiCard({
  titulo,
  valor,
  detalhe,
  tom,
  ativo = false,
  onClick,
}: {
  titulo: string;
  valor: string;
  detalhe: string;
  tom: TomNome;
  ativo?: boolean;
  onClick?: () => void;
}) {
  const t = TONS[tom];
  const clicavel = Boolean(onClick);
  return (
    <Card
      role={clicavel ? "button" : undefined}
      tabIndex={clicavel ? 0 : undefined}
      aria-pressed={clicavel ? ativo : undefined}
      onClick={onClick}
      onKeyDown={
        clicavel
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      className={`relative overflow-hidden p-4 transition ${t.fundo} ${t.borda} ${
        clicavel ? "cursor-pointer hover:shadow-md" : ""
      } ${ativo ? "ring-2 ring-primary ring-offset-1" : ""}`}
    >
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


/** Um dos quatro números do quadro cinza do card. */
function CampoFinanceiro({ rotulo, valor, cor }: { rotulo: string; valor: string; cor?: string }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {rotulo}
      </div>
      <div className={`truncate text-sm font-semibold tabular-nums ${cor ?? ""}`}>{valor}</div>
    </div>
  );
}

export function ContratosCards({
  itens,
  todos,
  clinicaId,
  onAbrir,
  onPagar,
  onCartao,
  onEditar,
  onInativar,
  podeEscrever = true,
}: Props) {
  const [deps, setDeps] = useState<Record<string, Dependente[]>>({});
  const [aberto, setAberto] = useState<Record<string, boolean>>({});
  const [cpfs, setCpfs] = useState<Record<string, string | null>>({});
  const [cobrancas, setCobrancas] = useState<Record<string, Cobranca>>({});
  const [imprimindo, setImprimindo] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<FiltroKpi | null>(null);

  const [mes, setMes] = useState<{
    pagos: number;
    pagosValor: number;
    aVencer: number;
    aVencerValor: number;
    atrasados: number;
    atrasadosValor: number;
  } | null>(null);

  const ids = useMemo(() => itens.map((i) => i.id).join(","), [itens]);
  const pacIds = useMemo(
    () =>
      Array.from(new Set(itens.map((i) => i.paciente_id).filter((v): v is string => !!v))).join(
        ",",
      ),
    [itens],
  );

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

  // CPF do titular: o contrato guarda só o nome, o documento vem do paciente.
  useEffect(() => {
    const lista = pacIds ? pacIds.split(",") : [];
    if (lista.length === 0) {
      setCpfs({});
      return;
    }
    let cancelado = false;
    void (async () => {
      const { data } = await supabase.from("pacientes").select("id, cpf").in("id", lista);
      if (cancelado) return;
      const mapa: Record<string, string | null> = {};
      ((data ?? []) as Array<{ id: string; cpf: string | null }>).forEach((p) => {
        mapa[p.id] = p.cpf;
      });
      setCpfs(mapa);
    })();
    return () => {
      cancelado = true;
    };
  }, [pacIds]);

  // Próximo vencimento, último pagamento e dias em aberto de cada card. As
  // parcelas vão em lotes de contratos porque o PostgREST corta a resposta em
  // 1000 linhas — 50 contratos já renovados passariam desse teto e alguns
  // cards mostrariam datas erradas.
  useEffect(() => {
    const lista = ids ? ids.split(",") : [];
    if (lista.length === 0) {
      setCobrancas({});
      return;
    }
    let cancelado = false;
    void (async () => {
      const { hojeIso } = limitesDoMes();
      const LOTE = 20;
      const lotes: string[][] = [];
      for (let i = 0; i < lista.length; i += LOTE) lotes.push(lista.slice(i, i + LOTE));
      const respostas = await Promise.all(
        lotes.map((slice) =>
          supabase
            .from("contrato_mensalidades")
            .select("contrato_id, vencimento, status, pago_em, numero_parcela")
            .in("contrato_id", slice)
            .gt("numero_parcela", 0),
        ),
      );
      if (cancelado) return;
      const linhas = respostas.flatMap(
        (r) =>
          (r.data ?? []) as Array<{
            contrato_id: string;
            vencimento: string;
            status: string | null;
            pago_em: string | null;
          }>,
      );
      const vazia = (): Cobranca => ({
        proximoVencimento: null,
        ultimoPagamento: null,
        diasEmAberto: 0,
      });
      const mapa: Record<string, Cobranca> = {};
      for (const id of lista) mapa[id] = vazia();
      linhas.forEach((l) => {
        const alvo = (mapa[l.contrato_id] ??= vazia());
        const status = (l.status ?? "").toLowerCase();
        if (status === "pago") {
          const pago = l.pago_em?.slice(0, 10) ?? null;
          if (pago && (!alvo.ultimoPagamento || pago > alvo.ultimoPagamento)) {
            alvo.ultimoPagamento = pago;
          }
          return;
        }
        if (status === "cancelado") return;
        const venc = l.vencimento?.slice(0, 10) ?? null;
        if (venc && (!alvo.proximoVencimento || venc < alvo.proximoVencimento)) {
          alvo.proximoVencimento = venc;
        }
      });
      Object.values(mapa).forEach((c) => {
        c.diasEmAberto = c.proximoVencimento ? diasDeAtraso(c.proximoVencimento, hojeIso) : 0;
      });
      setCobrancas(mapa);
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

  // Clicar num indicador filtra a relação de cards logo abaixo. É só um
  // recorte visual da página atual — não altera nenhuma regra de cobrança.
  const visiveis = useMemo(() => {
    if (!filtro) return itens;
    const { ini, fim, hojeIso } = limitesDoMes();
    return itens.filter((c) => {
      const status = (c.status ?? "").toLowerCase();
      const cob = cobrancas[c.id];
      switch (filtro) {
        case "ativos":
          return status === "ativo";
        case "inativos":
          return ["cancelado", "inativo", "encerrado"].includes(status);
        case "novos":
          return (c.data_inicio ?? "").slice(0, 10) >= ini;
        case "pagos":
          return Boolean(
            cob?.ultimoPagamento && cob.ultimoPagamento >= ini && cob.ultimoPagamento <= fim,
          );
        case "avencer":
          return Boolean(
            cob?.proximoVencimento &&
              cob.proximoVencimento >= hojeIso &&
              cob.proximoVencimento <= fim,
          );
        case "inadimplentes":
          return (cob?.diasEmAberto ?? 0) > 0 || Boolean(c.parcelas?.temAtrasada);
        default:
          return true;
      }
    });
  }, [itens, filtro, cobrancas]);

  const imprimirCartao = async (id: string) => {
    if (!onCartao) return;
    setImprimindo(id);
    try {
      await onCartao(id);
    } finally {
      setImprimindo(null);
    }
  };

  const alternar = (f: FiltroKpi) => setFiltro((atual) => (atual === f ? null : f));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          titulo="Contratos ativos"
          valor={String(kpis.ativos)}
          detalhe={`Receita prevista ${BRL(kpis.receita)}`}
          tom="azul"
          ativo={filtro === "ativos"}
          onClick={() => alternar("ativos")}
        />
        <KpiCard
          titulo="Pagos no mês"
          valor={mes ? String(mes.pagos) : "—"}
          detalhe={mes ? BRL(mes.pagosValor) : "Carregando…"}
          tom="verde"
          ativo={filtro === "pagos"}
          onClick={() => alternar("pagos")}
        />
        <KpiCard
          titulo="A vencer"
          valor={mes ? String(mes.aVencer) : "—"}
          detalhe={mes ? BRL(mes.aVencerValor) : "Carregando…"}
          tom="ambar"
          ativo={filtro === "avencer"}
          onClick={() => alternar("avencer")}
        />
        <KpiCard
          titulo="Inadimplentes"
          valor={mes ? String(mes.atrasados) : "—"}
          detalhe={mes ? BRL(mes.atrasadosValor) : "Carregando…"}
          tom="vermelho"
          ativo={filtro === "inadimplentes"}
          onClick={() => alternar("inadimplentes")}
        />
        <KpiCard
          titulo="Novos contratos"
          valor={String(kpis.novos)}
          detalhe={`Neste mês · ${BRL(kpis.novosValor)}`}
          tom="azul"
          ativo={filtro === "novos"}
          onClick={() => alternar("novos")}
        />
        <KpiCard
          titulo="Cancelados / inativos"
          valor={String(kpis.inativos)}
          detalhe="Fora de uso"
          tom="neutro"
          ativo={filtro === "inativos"}
          onClick={() => alternar("inativos")}
        />
      </div>

      {filtro && (
        <div className="flex items-center gap-2 text-sm">
          <Badge variant="secondary">
            Filtro: {ROTULO_FILTRO[filtro]} · {visiveis.length} contrato(s)
          </Badge>
          <Button size="sm" variant="ghost" className="h-7" onClick={() => setFiltro(null)}>
            Limpar filtro
          </Button>
        </div>
      )}

      {visiveis.length === 0 ? (
        <div className="rounded-md border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          {filtro
            ? "Nenhum contrato desta página se encaixa no indicador escolhido."
            : "Nenhum contrato para mostrar."}
        </div>
      ) : (

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {visiveis.map((c) => {
            const lista = deps[c.id] ?? [];
            const expandido = Boolean(aberto[c.id]);
            const cobranca = cobrancas[c.id];
            const dias = cobranca?.diasEmAberto ?? 0;
            const emDia = dias === 0 && (!c.parcelas || !c.parcelas.temAtrasada);
            const cancelado = (c.status ?? "").toLowerCase() !== "ativo";
            const tom = cancelado
              ? TONS.neutro
              : emDia
                ? TONS.verde
                : dias > 5
                  ? TONS.vermelho
                  : TONS.ambar;
            const corDias = cancelado
              ? "text-muted-foreground"
              : emDia
                ? "text-emerald-600 dark:text-emerald-400"
                : dias > 5
                  ? "text-red-600 dark:text-red-400"
                  : "text-amber-600 dark:text-amber-400";
            const cpf = c.paciente_id ? fmtCPF(cpfs[c.paciente_id]) : null;
            return (
              <Card
                key={c.id}
                className={`relative flex flex-col gap-3 overflow-hidden p-4 pt-5 ${tom.borda}`}
              >
                {/* Faixa de status no topo do card. */}
                <span className={`absolute inset-x-0 top-0 h-1.5 ${tom.faixa}`} aria-hidden />

                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold">
                    {iniciais(c.paciente_nome)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => onAbrir(c.id)}
                      className="block w-full truncate text-left text-sm font-bold uppercase leading-tight tracking-wide hover:underline"
                      title={c.paciente_nome}
                    >
                      {c.paciente_nome}
                    </button>
                    <div className="truncate text-xs tabular-nums text-muted-foreground">
                      {cpf ? `CPF ${cpf}` : "CPF —"}
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
                      {c.convenio_nome ? <Badge variant="outline">{c.convenio_nome}</Badge> : null}
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

                {/* Linha de dependentes: fechada mostra a contagem, ao clicar
                    abre a lista com os nomes. */}
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

                {/* Quadro cinza: os quatro números da cobrança. */}
                <div className="rounded-md bg-muted/50 p-3">
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                    <CampoFinanceiro rotulo="Mensalidade" valor={BRL(c.valor_mensal)} />
                    <CampoFinanceiro
                      rotulo="Vencimento"
                      valor={fmtData(cobranca?.proximoVencimento)}
                    />
                    <CampoFinanceiro
                      rotulo="Último pagamento"
                      valor={fmtData(cobranca?.ultimoPagamento)}
                    />
                    <CampoFinanceiro
                      rotulo="Dias em aberto"
                      valor={
                        !cobranca ? "…" : emDia ? "Em dia" : `${dias} dia${dias === 1 ? "" : "s"}`
                      }
                      cor={corDias}
                    />
                  </div>
                </div>

                {/* Barra de ações da base. */}
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700"
                    disabled={!podeEscrever || cancelado || !onPagar}
                    title={
                      cancelado
                        ? "Contrato cancelado — não há parcela a receber."
                        : "Receber a próxima mensalidade em aberto"
                    }
                    onClick={() => onPagar?.(c.id)}
                  >
                    <DollarSign className="mr-1 h-4 w-4" />
                    Pagar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!onCartao || imprimindo === c.id}
                    title="Imprimir cartão do titular e dos dependentes"
                    onClick={() => void imprimirCartao(c.id)}
                  >
                    {imprimindo === c.id ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : (
                      <CreditCard className="mr-1 h-4 w-4" />
                    )}
                    Cartão
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="px-2"
                    title="Editar dados do contrato"
                    aria-label="Editar dados do contrato"
                    onClick={() => (onEditar ? onEditar(c.id) : onAbrir(c.id))}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="px-2 text-destructive hover:text-destructive"
                    disabled={!podeEscrever || cancelado || !onInativar}
                    title={cancelado ? "Contrato já está cancelado." : "Cancelar contrato"}
                    aria-label="Cancelar contrato"
                    onClick={() => onInativar?.(c.id)}
                  >
                    <Power className="h-4 w-4" />
                  </Button>
                </div>

                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>Cadastrado em {fmtData(c.created_at ?? c.data_inicio)}</span>
                  <span className="tabular-nums">Nº {c.numero ?? "—"}</span>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
