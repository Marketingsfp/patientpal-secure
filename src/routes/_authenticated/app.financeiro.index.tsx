import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Calendar,
  Coins,
  CreditCard,
  FileSpreadsheet,
  FlaskConical,
  Handshake,
  Minus,
  Plus,
  Printer,
  Receipt,
  Stethoscope,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useClinica } from "@/hooks/use-clinica";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { brl, fmtDate, rangeFromPeriodo, type Periodo } from "@/lib/financeiro/format";
import { hojeBR } from "@/lib/date-utils";
import { mostrarErro } from "@/lib/traduzir-erro";
import { cn } from "@/lib/utils";
import {
  carregarContextoRateio,
  type RateioContexto,
  type RateioLinha,
} from "@/lib/financeiro/rateio-receita";
import { COR_FORMA } from "@/lib/financeiro/receita-por-forma";
import { classificarForma, LABEL_FORMA } from "@/lib/financeiro/formas-pagamento";
import {
  categoriaDoAtendimento,
  repassePorMedico,
  resumoPainel,
  somarPorCategoria,
  type CategoriaAtendimento,
  type ResumoPainel,
} from "@/lib/financeiro/painel-financeiro";
import {
  carregarPainelFinanceiro,
  type DadosPainel,
} from "@/lib/financeiro/painel-financeiro-carregar";
import { imprimirRelatorio } from "@/lib/print-relatorio-financeiro";
import { exportarRelatorioXlsx } from "@/lib/exportar-xlsx";
import { LancamentoDialog } from "@/components/financeiro/lancamento-dialog";
import { CardPendenciasRepasse } from "@/components/financeiro/card-pendencias-repasse";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/app/financeiro/")({
  component: FinDashboard,
});

/**
 * O período do dashboard nunca passa de hoje.
 *
 * A base tem centenas de milhares de parcelas de carnê importadas do sistema
 * anterior, já gravadas como "confirmado" com a data de cada vencimento futuro.
 * Somando o mês inteiro, o card de Receitas mostrava dinheiro que ainda não
 * entrou (em 01/09/2026 eram R$ 9.547,00 de vencimentos de 02/09 a 29/09).
 */
function periodoAteHoje(periodo: Periodo) {
  const { from, to } = rangeFromPeriodo(periodo);
  const hoje = hojeBR();
  return { de: from, ate: to > hoje ? hoje : to };
}

/**
 * Detalhamento aberto pelo clique em um card. Os de atendimento ("cartao",
 * "particular"…) são a mesma lista do Rateio, recortada pelo tipo.
 */
type Drill =
  | "receita"
  | "repasse"
  | "operacionais"
  | "totais"
  | "outras"
  | "saldo"
  | "atendimentos"
  | "ticket"
  | CategoriaAtendimento;

type Visao = "sintetico" | "analitico";

const pct = (v: number) => `${v.toFixed(1).replace(".", ",")}%`;
const int = (n: number) => n.toLocaleString("pt-BR");

/**
 * Financeiro → Dashboard.
 *
 * Os cards seguem a MESMA conta do relatório Rateio da Receita (Relatórios):
 * receita bruta, repasse e atendimentos saem de `carregarRateio`, e as
 * despesas são separadas entre repasse e operacional. A regra de cada card e
 * o porquê estão em `@/lib/financeiro/painel-financeiro`.
 */
function FinDashboard() {
  const { clinicaAtual } = useClinica();
  const podeEscrever = usePodeEscrever("financeiro");
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [open, setOpen] = useState<null | "receita" | "despesa">(null);
  const [reload, setReload] = useState(0);
  const [dados, setDados] = useState<DadosPainel | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [drill, setDrill] = useState<Drill | null>(null);

  /**
   * Grade de repasse e catálogos: pesados e iguais para qualquer período, então
   * são buscados uma vez por clínica e reaproveitados ao trocar Hoje/Semana/Mês.
   */
  const ctxRef = useRef<{ clinicaId: string; ctx: RateioContexto } | null>(null);

  const { de, ate } = periodoAteHoje(periodo);

  useEffect(() => {
    if (!clinicaAtual) return;
    const clinicaId = clinicaAtual.clinica_id;
    let cancelado = false;
    setCarregando(true);
    (async () => {
      try {
        let ctx = ctxRef.current?.clinicaId === clinicaId ? ctxRef.current.ctx : null;
        if (!ctx) {
          ctx = await carregarContextoRateio(clinicaId);
          ctxRef.current = { clinicaId, ctx };
        }
        const d = await carregarPainelFinanceiro(ctx, clinicaId, de, ate);
        if (!cancelado) setDados(d);
      } catch (e) {
        if (!cancelado) {
          setDados(null);
          mostrarErro(e, "falha ao carregar os números do período");
        }
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [clinicaAtual, de, ate, reload]);

  const resumo = useMemo(() => (dados ? resumoPainel(dados) : null), [dados]);
  const v = (n: (r: ResumoPainel) => number, formato: (x: number) => string = brl) =>
    carregando || !resumo ? "…" : formato(n(resumo));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Financeiro — {clinicaAtual?.clinica.nome}</h1>
          <p className="text-sm text-muted-foreground">Visão geral do período</p>
        </div>
        {podeEscrever && (
          <div className="flex gap-2">
            <Button
              onClick={() => setOpen("receita")}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-4 w-4 mr-1" /> Receita
            </Button>
            <Button onClick={() => setOpen("despesa")} variant="destructive">
              <Minus className="h-4 w-4 mr-1" /> Despesa
            </Button>
          </div>
        )}
      </div>

      {/* Fila de repasses de dias anteriores. Fica no topo, antes dos números
          do período, porque é a primeira coisa que a tesouraria resolve de
          manhã — e some sozinho quando não há nada pendente. */}
      <CardPendenciasRepasse />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex gap-2">
          {(["hoje", "semana", "mes"] as Periodo[]).map((p) => (
            <Button
              key={p}
              size="sm"
              variant={periodo === p ? "default" : "outline"}
              onClick={() => setPeriodo(p)}
            >
              {p === "hoje" ? "Hoje" : p === "semana" ? "Semana" : "Mês"}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {fmtDate(de)}
          {de !== ate && ` a ${fmtDate(ate)}`} · receita, repasse e atendimentos pela mesma conta do
          Rateio da Receita (Relatórios), no dia do atendimento. Clique em um card para ver o
          detalhamento.
        </p>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Resultado do período
        </h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <KpiCard
            onClick={() => setDrill("receita")}
            icon={TrendingUp}
            label="Receita bruta"
            value={v((r) => r.receitaBruta)}
            accent="success"
            detalhe="Atendimentos do período"
          >
            {resumo && !carregando && (
              <ul className="mt-2 space-y-0.5 border-t border-border/60 pt-2">
                {resumo.formas.map((f) => (
                  <li key={f.forma} className="flex items-center justify-between gap-2 text-xs">
                    <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                      <span
                        aria-hidden
                        className={cn("h-2 w-2 shrink-0 rounded-full", COR_FORMA[f.forma])}
                      />
                      <span className="truncate">{f.rotulo}</span>
                    </span>
                    <span className="shrink-0 tabular-nums">{brl(f.valor)}</span>
                  </li>
                ))}
              </ul>
            )}
          </KpiCard>
          <KpiCard
            onClick={() => setDrill("repasse")}
            icon={Handshake}
            label="Repasse a médicos / prestadores"
            value={v((r) => r.repasse)}
            accent="warning"
            detalhe={
              resumo && !carregando
                ? [
                    "Custo direto dos atendimentos",
                    resumo.terceiro > 0 && `+ ${brl(resumo.terceiro)} de terceiros`,
                    resumo.complementoMedico > 0 &&
                      `+ ${brl(resumo.complementoMedico)} de complemento médico`,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : "Custo direto dos atendimentos"
            }
          />
          <KpiCard
            onClick={() => setDrill("operacionais")}
            icon={Receipt}
            label="Despesas operacionais"
            value={v((r) => r.despesasOperacionais)}
            accent="destructive"
            detalhe="Contas, folha, compras — sem repasse médico"
          />
          <KpiCard
            onClick={() => setDrill("outras")}
            icon={Coins}
            label="Outras receitas"
            value={v((r) => r.outrasReceitas)}
            accent="success"
            detalhe="Mensalidades do Cartão, adesões e avulsos"
          />
          <KpiCard
            onClick={() => setDrill("totais")}
            icon={TrendingDown}
            label="Despesas totais"
            value={v((r) => r.despesasTotais)}
            accent="destructive"
            detalhe="Repasse + despesas operacionais"
          />
          <KpiCard
            onClick={() => setDrill("saldo")}
            icon={Wallet}
            label="Líquido da clínica / Saldo"
            value={v((r) => r.saldo)}
            accent={resumo && resumo.saldo < 0 ? "destructive" : "primary"}
            detalhe={
              resumo && !carregando
                ? `Margem de ${pct(margem(resumo.saldo, resumo.receitaBruta + resumo.outrasReceitas))} · receitas − despesas totais`
                : "Receitas − despesas totais"
            }
          />
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Atendimentos
        </h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <KpiCard
            onClick={() => setDrill("atendimentos")}
            icon={Users}
            label="Atendimentos (total)"
            value={v((r) => r.producao.total, int)}
            accent="primary"
          />
          <KpiCard
            onClick={() => setDrill("cartao")}
            icon={CreditCard}
            label="Consultas Cartão"
            value={v((r) => r.producao.consultasCartao, int)}
            accent="primary"
          />
          <KpiCard
            onClick={() => setDrill("particular")}
            icon={Stethoscope}
            label="Consultas Particulares"
            value={v((r) => r.producao.consultasParticulares, int)}
            accent="success"
            detalhe={
              resumo && resumo.producao.consultasConvenio > 0
                ? `Inclui ${int(resumo.producao.consultasConvenio)} de convênio`
                : undefined
            }
          />
          <KpiCard
            onClick={() => setDrill("exame")}
            icon={FlaskConical}
            label="Exames"
            value={v((r) => r.producao.exames, int)}
            accent="warning"
          />
          {/* Procedimento e serviço fora do cadastro. Sem este card a soma dos
              cards de contagem não fecharia com o total. */}
          {resumo && resumo.producao.outros > 0 && (
            <KpiCard
              onClick={() => setDrill("outro")}
              icon={Activity}
              label="Procedimentos e outros"
              value={v((r) => r.producao.outros, int)}
              accent="primary"
            />
          )}
          <KpiCard
            onClick={() => setDrill("ticket")}
            icon={Calendar}
            label="Ticket médio"
            value={v((r) => r.ticketMedio)}
            accent="primary"
            detalhe="Receita bruta ÷ atendimentos"
          />
        </div>
      </section>

      <LancamentoDialog
        open={open !== null}
        onOpenChange={(o) => !o && setOpen(null)}
        tipo={open ?? "receita"}
        onSaved={() => setReload((r) => r + 1)}
      />

      {drill && dados && resumo && (
        <DetalhamentoDialog
          drill={drill}
          dados={dados}
          resumo={resumo}
          de={de}
          ate={ate}
          clinicaNome={clinicaAtual?.clinica.nome ?? "Clínica"}
          onClose={() => setDrill(null)}
        />
      )}
    </div>
  );
}

const margem = (valor: number, base: number) => (base === 0 ? 0 : (valor / base) * 100);

// ============================================================================
// Detalhamento em tela cheia
// ----------------------------------------------------------------------------
// Cada card abre uma tabela montada por `montarDetalhe`. A MESMA tabela é
// desenhada na tela, impressa em A4 e exportada para Excel — é o que garante
// que o papel e a planilha mostram exatamente o que a tela mostrou.
// ============================================================================

type TipoCol = "texto" | "moeda" | "numero" | "data";
type Celula = string | number | null;

interface Detalhe {
  titulo: string;
  explicacao: string;
  colunas: Array<{ rotulo: string; tipo: TipoCol }>;
  linhas: Celula[][];
  totais?: Celula[];
  /** Quadro de fechamento, abaixo da tabela e no papel. */
  resumo?: Array<{ rotulo: string; valor: number }>;
  /** Quebra por forma de pagamento (só na receita). */
  composicao?: Array<{ rotulo: string; valor: number }>;
  /** Existe visão sintética (agrupada) além da lista. */
  temSintetico: boolean;
}

const TITULO_ATENDIMENTO: Record<CategoriaAtendimento, string> = {
  cartao: "Consultas Cartão",
  particular: "Consultas Particulares",
  exame: "Exames",
  outro: "Procedimentos e outros",
};

const formasDaLinha = (l: RateioLinha) =>
  l.formas
    .filter((f) => f.valor !== 0)
    .map((f) => LABEL_FORMA[f.forma])
    .join(" + ") || "—";

function montarDetalhe(drill: Drill, dados: DadosPainel, r: ResumoPainel, visao: Visao): Detalhe {
  const operacionais = dados.despesas.filter((d) => d.grupo === "operacional");
  const complementos = dados.despesas.filter((d) => d.grupo === "complemento_medico");

  // --- Listas de atendimento (Receita, Atendimentos, Ticket e os tipos) -----
  if (
    drill === "receita" ||
    drill === "atendimentos" ||
    drill === "ticket" ||
    drill === "cartao" ||
    drill === "particular" ||
    drill === "exame" ||
    drill === "outro"
  ) {
    const recorte =
      drill === "cartao" || drill === "particular" || drill === "exame" || drill === "outro"
        ? dados.rateio.filter((l) => categoriaDoAtendimento(l) === drill)
        : dados.rateio;
    const titulo =
      drill === "receita"
        ? "Receita bruta"
        : drill === "atendimentos"
          ? "Atendimentos"
          : drill === "ticket"
            ? "Ticket médio"
            : TITULO_ATENDIMENTO[drill];
    const receita = recorte.reduce((s, l) => s + l.receita, 0);
    const repasse = recorte.reduce((s, l) => s + l.repasse, 0);
    const terceiro = recorte.reduce((s, l) => s + l.terceiro, 0);
    const liquido = recorte.reduce((s, l) => s + l.liquido, 0);
    const resumo = [
      { rotulo: "Receita bruta", valor: receita },
      { rotulo: "Repasse a médicos", valor: repasse },
      ...(terceiro > 0 ? [{ rotulo: "Terceiros (dono do equipamento)", valor: terceiro }] : []),
      ...(drill === "ticket" || drill === "atendimentos"
        ? [{ rotulo: "Ticket médio", valor: recorte.length ? receita / recorte.length : 0 }]
        : []),
      { rotulo: "Líquido da clínica", valor: liquido },
    ];
    const explicacao =
      "Mesma lista do Rateio da Receita (Financeiro → Relatórios): cada atendimento no dia em que foi atendido, com o repasse pela grade do médico.";
    if (visao === "sintetico") {
      const porMedico = new Map<
        string,
        { nome: string; esp: string; qtd: number; rec: number; rep: number; liq: number }
      >();
      for (const l of recorte) {
        const k = l.medico_id ?? "sem";
        const g = porMedico.get(k) ?? {
          nome: l.medico_nome,
          esp: l.especialidade_nome,
          qtd: 0,
          rec: 0,
          rep: 0,
          liq: 0,
        };
        g.qtd += 1;
        g.rec += l.receita;
        g.rep += l.repasse + l.terceiro;
        g.liq += l.liquido;
        porMedico.set(k, g);
      }
      const grupos = Array.from(porMedico.values()).sort((a, b) => b.rec - a.rec);
      return {
        titulo,
        explicacao,
        colunas: [
          { rotulo: "Profissional", tipo: "texto" },
          { rotulo: "Especialidade", tipo: "texto" },
          { rotulo: "Qtd.", tipo: "numero" },
          { rotulo: "Receita", tipo: "moeda" },
          { rotulo: "Repasse", tipo: "moeda" },
          { rotulo: "Líquido clínica", tipo: "moeda" },
        ],
        linhas: grupos.map((g) => [g.nome, g.esp, g.qtd, g.rec, g.rep, g.liq]),
        totais: ["TOTAL", "", recorte.length, receita, repasse + terceiro, liquido],
        resumo,
        composicao:
          drill === "receita"
            ? r.formas.map((f) => ({ rotulo: f.rotulo, valor: f.valor }))
            : undefined,
        temSintetico: true,
      };
    }
    return {
      titulo,
      explicacao,
      colunas: [
        { rotulo: "Data", tipo: "data" },
        { rotulo: "Profissional", tipo: "texto" },
        { rotulo: "Serviço", tipo: "texto" },
        { rotulo: "Condição", tipo: "texto" },
        { rotulo: "Forma de pagamento", tipo: "texto" },
        { rotulo: "Receita", tipo: "moeda" },
        { rotulo: "Repasse", tipo: "moeda" },
        { rotulo: "Líquido clínica", tipo: "moeda" },
      ],
      linhas: recorte.map((l) => [
        l.data,
        l.medico_nome,
        l.servico_nome,
        l.condicao,
        formasDaLinha(l),
        l.receita,
        l.repasse + l.terceiro,
        l.liquido,
      ]),
      totais: [
        `${int(recorte.length)} atendimento(s)`,
        "",
        "",
        "",
        "",
        receita,
        repasse + terceiro,
        liquido,
      ],
      resumo,
      composicao:
        drill === "receita"
          ? r.formas.map((f) => ({ rotulo: f.rotulo, valor: f.valor }))
          : undefined,
      temSintetico: true,
    };
  }

  // --- Repasse ---------------------------------------------------------------
  if (drill === "repasse") {
    const resumo = [
      { rotulo: "Repasse a médicos (grade)", valor: r.repasse },
      ...(r.terceiro > 0 ? [{ rotulo: "Terceiros (dono do equipamento)", valor: r.terceiro }] : []),
      ...(r.complementoMedico > 0
        ? [{ rotulo: "Complemento médico lançado", valor: r.complementoMedico }]
        : []),
      {
        rotulo: "Custo total com prestadores",
        valor: r.repasse + r.terceiro + r.complementoMedico,
      },
      { rotulo: "Já pago no caixa no período (informativo)", valor: r.repassePagoNoPeriodo },
    ];
    const explicacao =
      "Repasse devido pelos atendimentos do período, calculado pela grade de cada médico — o mesmo número do Rateio da Receita. O valor já pago no caixa aparece só para conferência: ele quita atendimentos de dias anteriores e por isso não entra de novo nas despesas.";
    if (visao === "sintetico") {
      const grupos = repassePorMedico(dados.rateio);
      return {
        titulo: "Repasse a médicos / prestadores",
        explicacao,
        colunas: [
          { rotulo: "Profissional", tipo: "texto" },
          { rotulo: "Especialidade", tipo: "texto" },
          { rotulo: "Qtd.", tipo: "numero" },
          { rotulo: "Receita", tipo: "moeda" },
          { rotulo: "Repasse", tipo: "moeda" },
          { rotulo: "Terceiro", tipo: "moeda" },
          { rotulo: "Total a pagar", tipo: "moeda" },
        ],
        linhas: grupos.map((g) => [
          g.medico,
          g.especialidade,
          g.qtd,
          g.receita,
          g.repasse,
          g.terceiro,
          g.repasse + g.terceiro,
        ]),
        totais: [
          "TOTAL",
          "",
          grupos.reduce((s, g) => s + g.qtd, 0),
          grupos.reduce((s, g) => s + g.receita, 0),
          r.repasse,
          r.terceiro,
          r.repasse + r.terceiro,
        ],
        resumo,
        temSintetico: true,
      };
    }
    const comRepasse = dados.rateio.filter((l) => l.repasse > 0 || l.terceiro > 0);
    return {
      titulo: "Repasse a médicos / prestadores",
      explicacao,
      colunas: [
        { rotulo: "Data", tipo: "data" },
        { rotulo: "Profissional", tipo: "texto" },
        { rotulo: "Serviço", tipo: "texto" },
        { rotulo: "Condição", tipo: "texto" },
        { rotulo: "Receita", tipo: "moeda" },
        { rotulo: "Repasse", tipo: "moeda" },
        { rotulo: "Terceiro", tipo: "moeda" },
      ],
      linhas: comRepasse.map((l) => [
        l.data,
        l.medico_nome,
        l.servico_nome,
        l.condicao,
        l.receita,
        l.repasse,
        l.terceiro,
      ]),
      totais: [
        `${int(comRepasse.length)} atendimento(s)`,
        "",
        "",
        "",
        comRepasse.reduce((s, l) => s + l.receita, 0),
        r.repasse,
        r.terceiro,
      ],
      resumo,
      temSintetico: true,
    };
  }

  // --- Listas de lançamento (operacionais, outras receitas) -----------------
  if (drill === "operacionais" || drill === "outras") {
    const itens = drill === "operacionais" ? operacionais : dados.outrasReceitas;
    const total = drill === "operacionais" ? r.despesasOperacionais : r.outrasReceitas;
    const titulo = drill === "operacionais" ? "Despesas operacionais" : "Outras receitas";
    const explicacao =
      drill === "operacionais"
        ? "Despesas confirmadas no período, sem os pagamentos de repasse (categorias REPASSE MEDICO e REPASSE TERCEIRO) e sem o complemento médico — esses já estão no card de Repasse. Pagamento a médico lançado em outra categoria (COMISSIONAMENTO, por exemplo) continua aqui."
        : "Receitas confirmadas no período que não são atendimento — mensalidade do Cartão, adesão, recebimento avulso. Ficam fora do Rateio porque não têm médico a repassar, mas entram no saldo da clínica.";
    if (visao === "sintetico") {
      const grupos = somarPorCategoria(itens);
      return {
        titulo,
        explicacao,
        colunas: [
          { rotulo: "Categoria", tipo: "texto" },
          { rotulo: "Qtd.", tipo: "numero" },
          { rotulo: "Valor", tipo: "moeda" },
          { rotulo: "% do total", tipo: "texto" },
        ],
        linhas: grupos.map((g) => [g.rotulo, g.qtd, g.valor, pct(margem(g.valor, total))]),
        totais: ["TOTAL", itens.length, total, "100,0%"],
        resumo: [{ rotulo: titulo, valor: total }],
        temSintetico: true,
      };
    }
    return {
      titulo,
      explicacao,
      colunas: [
        { rotulo: "Data", tipo: "data" },
        { rotulo: "Categoria", tipo: "texto" },
        { rotulo: "Descrição", tipo: "texto" },
        { rotulo: "Forma", tipo: "texto" },
        { rotulo: "Valor", tipo: "moeda" },
      ],
      linhas: itens.map((i) => [
        i.data,
        i.categoria_nome,
        i.descricao,
        LABEL_FORMA[classificarForma(i.forma_pagamento)],
        i.valor,
      ]),
      totais: [`${int(itens.length)} lançamento(s)`, "", "", "", total],
      resumo: [{ rotulo: titulo, valor: total }],
      temSintetico: true,
    };
  }

  // --- Despesas totais ------------------------------------------------------
  if (drill === "totais") {
    const resumo = [
      { rotulo: "Repasse a médicos (grade)", valor: r.repasse },
      ...(r.terceiro > 0 ? [{ rotulo: "Terceiros (dono do equipamento)", valor: r.terceiro }] : []),
      ...(r.complementoMedico > 0
        ? [{ rotulo: "Complemento médico", valor: r.complementoMedico }]
        : []),
      { rotulo: "Despesas operacionais", valor: r.despesasOperacionais },
      { rotulo: "Despesas totais", valor: r.despesasTotais },
    ];
    const explicacao =
      "Tudo o que o período custou: o repasse devido aos médicos (grade), a parte de terceiros, o complemento médico e as despesas operacionais.";
    if (visao === "sintetico") {
      const linhas: Celula[][] = [
        [
          "Repasse",
          "Repasse a médicos (grade)",
          dados.rateio.filter((l) => l.repasse > 0).length,
          r.repasse,
        ],
      ];
      if (r.terceiro > 0)
        linhas.push([
          "Repasse",
          "Terceiros (dono do equipamento)",
          dados.rateio.filter((l) => l.terceiro > 0).length,
          r.terceiro,
        ]);
      if (r.complementoMedico > 0)
        linhas.push(["Repasse", "COMPLEMENTO MEDICO", complementos.length, r.complementoMedico]);
      for (const g of somarPorCategoria(operacionais))
        linhas.push(["Operacional", g.rotulo, g.qtd, g.valor]);
      return {
        titulo: "Despesas totais",
        explicacao,
        colunas: [
          { rotulo: "Grupo", tipo: "texto" },
          { rotulo: "Conta", tipo: "texto" },
          { rotulo: "Qtd.", tipo: "numero" },
          { rotulo: "Valor", tipo: "moeda" },
        ],
        linhas,
        totais: ["TOTAL", "", "", r.despesasTotais],
        resumo,
        temSintetico: true,
      };
    }
    const linhas: Celula[][] = repassePorMedico(dados.rateio).map((g) => [
      "",
      "Repasse",
      g.medico,
      `${int(g.qtd)} atendimento(s)`,
      g.repasse + g.terceiro,
    ]);
    for (const d of [...complementos, ...operacionais])
      linhas.push([
        d.data,
        d.grupo === "operacional" ? "Operacional" : "Repasse",
        d.categoria_nome,
        d.descricao,
        d.valor,
      ]);
    return {
      titulo: "Despesas totais",
      explicacao,
      colunas: [
        { rotulo: "Data", tipo: "data" },
        { rotulo: "Grupo", tipo: "texto" },
        { rotulo: "Profissional / Categoria", tipo: "texto" },
        { rotulo: "Descrição", tipo: "texto" },
        { rotulo: "Valor", tipo: "moeda" },
      ],
      linhas,
      totais: [`${int(linhas.length)} linha(s)`, "", "", "", r.despesasTotais],
      resumo,
      temSintetico: true,
    };
  }

  // --- Saldo: demonstrativo --------------------------------------------------
  const receitaTotal = r.receitaBruta + r.outrasReceitas;
  const linha = (rotulo: string, valor: number): Celula[] => [
    rotulo,
    valor,
    pct(margem(valor, receitaTotal)),
  ];
  const linhas: Celula[][] = [
    linha("Receita bruta (atendimentos)", r.receitaBruta),
    linha("(+) Outras receitas", r.outrasReceitas),
    linha("(=) Receita total", receitaTotal),
    linha("(−) Repasse a médicos", -r.repasse),
  ];
  if (r.terceiro > 0) linhas.push(linha("(−) Terceiros (dono do equipamento)", -r.terceiro));
  if (r.complementoMedico > 0) linhas.push(linha("(−) Complemento médico", -r.complementoMedico));
  linhas.push(linha("(−) Despesas operacionais", -r.despesasOperacionais));
  return {
    titulo: "Líquido da clínica / Saldo",
    explicacao:
      "Demonstrativo do período. O repasse entra pelo valor devido dos atendimentos (grade), não pelo que foi pago no caixa, para cada atendimento pesar no dia em que aconteceu.",
    colunas: [
      { rotulo: "Conta", tipo: "texto" },
      { rotulo: "Valor", tipo: "moeda" },
      { rotulo: "% da receita", tipo: "texto" },
    ],
    linhas,
    totais: ["(=) Saldo do período", r.saldo, pct(margem(r.saldo, receitaTotal))],
    resumo: [
      { rotulo: "Líquido dos atendimentos (Rateio)", valor: r.liquidoAtendimentos },
      {
        rotulo: "Repasse já pago no caixa no período (informativo)",
        valor: r.repassePagoNoPeriodo,
      },
      { rotulo: "Saldo do período", valor: r.saldo },
    ],
    temSintetico: false,
  };
}

function textoCelula(tipo: TipoCol, c: Celula): string {
  if (c === null || c === "") return "";
  // O rodapé usa a primeira coluna (a de data) para "N atendimento(s)".
  if (typeof c === "string")
    return tipo === "data" && /^\d{4}-\d{2}-\d{2}$/.test(c) ? fmtDate(c) : c;
  if (tipo === "moeda") return brl(c);
  if (tipo === "numero") return int(c);
  return String(c);
}

/** Nome de aba aceito pelo Excel: até 31 caracteres, sem : \ / ? * [ ]. */
const nomeDeAba = (s: string) => s.replace(/[:\\/?*[\]]/g, "-").slice(0, 31);

function DetalhamentoDialog({
  drill,
  dados,
  resumo: r,
  de,
  ate,
  clinicaNome,
  onClose,
}: {
  drill: Drill;
  dados: DadosPainel;
  resumo: ResumoPainel;
  de: string;
  ate: string;
  clinicaNome: string;
  onClose: () => void;
}) {
  // Abre agrupado: é a leitura que a diretoria faz primeiro (quem recebeu
  // quanto, qual conta pesou). A lista linha a linha fica a um clique.
  const [visao, setVisao] = useState<Visao>("sintetico");
  const det = useMemo(() => montarDetalhe(drill, dados, r, visao), [drill, dados, r, visao]);
  const periodo = de === ate ? fmtDate(de) : `${fmtDate(de)} a ${fmtDate(ate)}`;
  const numerica = (t: TipoCol) => t === "moeda" || t === "numero";

  const imprimir = () => {
    if (det.linhas.length === 0) {
      toast.info("Nada a imprimir no período");
      return;
    }
    imprimirRelatorio({
      clinicaNome,
      titulo: det.titulo,
      periodo: [
        periodo,
        det.temSintetico ? (visao === "sintetico" ? "Sintético" : "Analítico") : "",
      ]
        .filter(Boolean)
        .join(" · "),
      colunas: det.colunas.map((c) => ({ rotulo: c.rotulo, numerica: numerica(c.tipo) })),
      linhas: det.linhas.map((l) => l.map((c, i) => textoCelula(det.colunas[i].tipo, c))),
      totais: (det.totais ?? []).map((c, i) => textoCelula(det.colunas[i].tipo, c)),
      resumo: det.resumo?.map((x) => ({ rotulo: x.rotulo, valor: brl(x.valor) })),
      composicao: det.composicao && {
        titulo: "Composição da receita bruta",
        itens: det.composicao.map((x) => ({ rotulo: x.rotulo, valor: brl(x.valor) })),
      },
      assinaturas: [{ cargo: "Responsável Financeiro" }],
    });
  };

  const baixarExcel = async () => {
    if (det.linhas.length === 0) {
      toast.info("Nada a exportar no período");
      return;
    }
    try {
      await exportarRelatorioXlsx({
        arquivo: `financeiro_${drill}_${visao}_${de}_${ate}`,
        aba: nomeDeAba(det.titulo),
        cabecalho: [`${det.titulo} — ${clinicaNome}`, `Período: ${periodo}`, det.explicacao],
        // Data vai como texto já no formato brasileiro: é assim que o
        // financeiro lê e filtra, e evita a data andar um dia no fuso do Excel.
        colunas: det.colunas.map((c) => ({
          rotulo: c.rotulo,
          tipo: c.tipo === "data" ? "texto" : c.tipo,
        })),
        linhas: det.linhas.map((l) =>
          l.map((c, i) => (det.colunas[i].tipo === "data" ? textoCelula("data", c) : c)),
        ),
        totais: det.totais,
        resumo: det.resumo && {
          titulo: "Resumo",
          itens: [...det.resumo, ...(det.composicao ?? [])].map((x) => ({
            rotulo: x.rotulo,
            valor: x.valor,
            tipo: "moeda" as const,
          })),
        },
      });
      toast.success(`Planilha gerada (${det.linhas.length} linhas)`);
    } catch (e) {
      mostrarErro(e);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex h-[94dvh] w-[96vw] max-w-[1400px] flex-col gap-3 overflow-hidden">
        <DialogHeader className="space-y-1 pr-8">
          <DialogTitle>
            {det.titulo} — {periodo}
          </DialogTitle>
          <DialogDescription className="text-xs">{det.explicacao}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center justify-between gap-2">
          {det.temSintetico ? (
            <div className="flex gap-1 rounded-lg border bg-muted/50 p-1">
              {(["sintetico", "analitico"] as Visao[]).map((vv) => (
                <Button
                  key={vv}
                  size="sm"
                  variant={visao === vv ? "default" : "ghost"}
                  className="h-7"
                  onClick={() => setVisao(vv)}
                >
                  {vv === "sintetico"
                    ? drill === "operacionais" || drill === "outras"
                      ? "Por categoria"
                      : drill === "totais"
                        ? "Por conta"
                        : "Por profissional"
                    : "Linha a linha"}
                </Button>
              ))}
            </div>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={baixarExcel}>
              <FileSpreadsheet className="mr-1 h-4 w-4" /> Baixar Excel
            </Button>
            <Button size="sm" variant="outline" onClick={imprimir}>
              <Printer className="mr-1 h-4 w-4" /> Imprimir
            </Button>
          </div>
        </div>

        {det.resumo && (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {det.resumo.map((x) => (
              <div key={x.rotulo} className="rounded-lg border bg-muted/30 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {x.rotulo}
                </p>
                <p className="text-base font-semibold tabular-nums">{brl(x.valor)}</p>
              </div>
            ))}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-auto rounded-md border">
          {det.linhas.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Nada no período.</p>
          ) : (
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  {det.colunas.map((c) => (
                    <TableHead key={c.rotulo} className={numerica(c.tipo) ? "text-right" : ""}>
                      {c.rotulo}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {det.linhas.map((l, i) => (
                  <TableRow key={i}>
                    {l.map((c, j) => (
                      <TableCell
                        key={j}
                        className={cn(
                          "py-1.5",
                          numerica(det.colunas[j].tipo) && "text-right tabular-nums",
                          det.colunas[j].tipo === "data" && "whitespace-nowrap",
                          typeof c === "number" && c < 0 && "text-destructive",
                        )}
                      >
                        {textoCelula(det.colunas[j].tipo, c)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
              {det.totais && (
                <TableFooter className="sticky bottom-0 bg-muted">
                  <TableRow>
                    {det.totais.map((c, j) => (
                      <TableCell
                        key={j}
                        className={cn(
                          "font-semibold",
                          numerica(det.colunas[j].tipo) && "text-right tabular-nums",
                        )}
                      >
                        {textoCelula(det.colunas[j].tipo, c)}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          )}
        </div>

        {det.composicao && (
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
            <span className="font-medium">Composição da receita bruta:</span>
            {det.composicao.map((x) => (
              <span key={x.rotulo} className="tabular-nums">
                {x.rotulo} {brl(x.valor)}
              </span>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  accent,
  detalhe,
  onClick,
  children,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  accent: "primary" | "success" | "destructive" | "warning";
  /** Linha curta abaixo do valor, dizendo o que o número inclui. */
  detalhe?: string;
  onClick?: () => void;
  children?: React.ReactNode;
}) {
  const colorMap = {
    primary: "text-primary bg-primary/10",
    success: "text-success bg-success/10",
    destructive: "text-destructive bg-destructive/10",
    warning: "text-warning bg-warning/10",
  };
  return (
    <Card
      onClick={onClick}
      // Teclado também abre o detalhamento: o card é o único caminho até ele.
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={
        onClick
          ? "cursor-pointer hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          : ""
      }
    >
      <CardContent className="pt-6 flex items-start gap-3">
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg ${colorMap[accent]}`}
        >
          <Icon className="h-6 w-6" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] uppercase tracking-wide text-muted-foreground leading-tight line-clamp-2">
            {label}
          </p>
          <p
            className="mt-1 text-lg xl:text-xl font-semibold tabular-nums whitespace-nowrap overflow-hidden text-ellipsis leading-tight"
            title={value}
          >
            {value}
          </p>
          {detalhe && <p className="mt-1 text-xs text-muted-foreground">{detalhe}</p>}
          {children}
        </div>
      </CardContent>
    </Card>
  );
}
