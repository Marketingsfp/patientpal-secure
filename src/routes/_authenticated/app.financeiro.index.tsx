import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Calendar,
  Coins,
  CreditCard,
  FlaskConical,
  Handshake,
  Minus,
  Plus,
  Receipt,
  Stethoscope,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { abrirDetalheEmNovaAba } from "@/lib/financeiro/detalhe-aba";
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
import { LancamentoDialog } from "@/components/financeiro/lancamento-dialog";
import { CardPendenciasRepasse } from "@/components/financeiro/card-pendencias-repasse";
import {
  DetalhamentoDialog,
  int,
  KpiCard,
  pct,
  type Celula,
  type Detalhe,
  type Visao,
} from "@/components/financeiro/painel-detalhamento";

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

  /**
   * Abre o detalhamento do card em NOVA ABA, como a diretoria pediu: a visão
   * geral fica numa aba e o detalhamento em outra. As duas visões vão prontas
   * para a aba nova (ver `@/lib/financeiro/detalhe-aba`). Se o navegador
   * bloquear a aba, o detalhamento abre por cima da tela, como era antes.
   */
  const abrir = (d: Drill) => {
    if (!dados || !resumo || carregando) return;
    const sintetico = montarDetalhe(d, dados, resumo, "sintetico");
    const abriu = abrirDetalheEmNovaAba("/app/financeiro/detalhe", {
      sintetico: sintetico.temSintetico ? sintetico : null,
      analitico: montarDetalhe(d, dados, resumo, "analitico"),
      rotuloSintetico: rotuloSinteticoDe(d),
      arquivo: `financeiro_${d}`,
      de,
      ate,
      clinicaNome: clinicaAtual?.clinica.nome ?? "Clínica",
    });
    if (!abriu) {
      toast.info("O navegador não abriu a nova aba — o detalhamento abriu aqui mesmo.");
      setDrill(d);
    }
  };

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
          Rateio da Receita (Relatórios), no dia do atendimento. Clique em um card para abrir o
          detalhamento em nova aba.
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
          montar={(visao) => montarDetalhe(drill, dados, resumo, visao)}
          rotuloSintetico={rotuloSinteticoDe(drill)}
          arquivo={`financeiro_${drill}`}
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

/** Nome do botão da visão agrupada de cada detalhamento. */
const rotuloSinteticoDe = (d: Drill) =>
  d === "operacionais" || d === "outras"
    ? "Por categoria"
    : d === "totais"
      ? "Por conta"
      : "Por profissional";

// ============================================================================
// Detalhamento em tela cheia
// ----------------------------------------------------------------------------
// Cada card abre uma tabela montada por `montarDetalhe` e desenhada pelo
// `DetalhamentoDialog` compartilhado com o Movimento de Caixa
// (`@/components/financeiro/painel-detalhamento`).
// ============================================================================

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
