import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Calendar,
  CreditCard,
  FlaskConical,
  Handshake,
  Minus,
  Plus,
  Receipt,
  RefreshCw,
  Stethoscope,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
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
  categoriaDaOutraReceita,
  ehCortesia,

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
function periodoAteHoje(periodo: Periodo, custom?: { de: string; ate: string }) {
  if (periodo === "personalizado") {
    // O intervalo digitado é usado como está, só ordenado e limitado a hoje —
    // pela mesma razão dos períodos prontos: vencimento futuro não é receita.
    const hoje = hojeBR();
    const de = custom?.de || hoje;
    const ate = custom?.ate || hoje;
    const [ini, fim] = de <= ate ? [de, ate] : [ate, de];
    return { de: ini, ate: fim > hoje ? hoje : fim };
  }
  const { from, to } = rangeFromPeriodo(periodo);
  const hoje = hojeBR();
  return { de: from, ate: to > hoje ? hoje : to };
}

/** Rótulo de cada botão do filtro de período do dashboard. */
const ROTULO_PERIODO: Record<Periodo, string> = {
  hoje: "Hoje",
  ontem: "Ontem",
  semana: "Semana",
  mes: "Mês",
  personalizado: "Período",
};

/**
 * De quanto em quanto tempo os números se atualizam sozinhos, sem F5. A tela
 * mostra a contagem regressiva até a próxima (`ContagemAtualizacao`).
 *
 * Dois minutos porque cada atualização refaz o Rateio do período inteiro — no
 * "Mês" são milhares de atendimentos —, e um intervalo menor multiplicaria a
 * carga no banco sem mudar o que a tesouraria decide olhando a tela. A aba
 * escondida não atualiza; ao voltar para ela, a tela atualiza na hora se a
 * última leitura tiver mais de um minuto.
 */
const ATUALIZAR_A_CADA_MS = 2 * 60_000;
const ATUALIZAR_AO_VOLTAR_APOS_MS = 60_000;

/**
 * Detalhamento aberto pelo clique em um card. Os de atendimento ("cartao",
 * "particular"…) são a mesma lista do Rateio, recortada pelo tipo.
 */
type Drill =
  | "receita"
  | "repasse"
  | "operacionais"
  | "totais"
  | "saldo"
  | "atendimentos"
  | "ticket"
  | "mensalidade"
  | "adesao"
  | "cortesia"
  | CategoriaAtendimento;


/**
 * O detalhamento guarda os números do momento em que foi aberto: a
 * atualização automática continua por trás, mas a tabela que a pessoa está
 * lendo, imprimindo ou exportando não muda sozinha no meio da conferência.
 */
interface DetalheAberto {
  drill: Drill;
  dados: DadosPainel;
  resumo: ResumoPainel;
  de: string;
  ate: string;
}

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
  /** Datas do botão "Período" (intervalo escolhido pela pessoa). */
  const [custom, setCustom] = useState<{ de: string; ate: string }>(() => ({
    de: hojeBR(),
    ate: hojeBR(),
  }));
  const [open, setOpen] = useState<null | "receita" | "despesa">(null);
  const [reload, setReload] = useState(0);
  const [dados, setDados] = useState<DadosPainel | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [aberto, setAberto] = useState<DetalheAberto | null>(null);
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);
  /** Quando a próxima atualização automática vai acontecer (relógio da tela). */
  const [proximaEm, setProximaEm] = useState<number | null>(null);
  const [atualizando, setAtualizando] = useState(false);
  /** A última atualização automática falhou; a tela segue com os números anteriores. */
  const [falhouAtualizar, setFalhouAtualizar] = useState(false);

  /**
   * Grade de repasse e catálogos: pesados e iguais para qualquer período, então
   * são buscados uma vez por clínica e reaproveitados ao trocar Hoje/Semana/Mês.
   */
  const ctxRef = useRef<{ clinicaId: string; ctx: RateioContexto } | null>(null);
  /** Clínica + período dos números na tela, e quando foram lidos. */
  const ultimaCarga = useRef<{ chave: string; em: number } | null>(null);

  const { de, ate } = periodoAteHoje(periodo, custom);

  useEffect(() => {
    if (!clinicaAtual) return;
    const clinicaId = clinicaAtual.clinica_id;
    const chave = `${clinicaId}|${de}|${ate}`;
    // Atualização do mesmo período (automática ou depois de lançar receita ou
    // despesa) troca os números sem piscar "…" nos cards. Trocar de período ou
    // de clínica mostra o "…", para ninguém ler o número do período anterior
    // debaixo do botão novo.
    const silenciosa = ultimaCarga.current?.chave === chave;
    let cancelado = false;
    if (silenciosa) setAtualizando(true);
    else setCarregando(true);
    (async () => {
      try {
        let ctx = ctxRef.current?.clinicaId === clinicaId ? ctxRef.current.ctx : null;
        if (!ctx) {
          ctx = await carregarContextoRateio(clinicaId);
          ctxRef.current = { clinicaId, ctx };
        }
        const d = await carregarPainelFinanceiro(ctx, clinicaId, de, ate);
        if (!cancelado) {
          setDados(d);
          setAtualizadoEm(new Date());
          setFalhouAtualizar(false);
        }
      } catch (e) {
        // Falha na atualização automática não vira alerta a cada dois minutos:
        // os números anteriores ficam, e o relógio avisa que a última
        // tentativa falhou. Guardar a chave também na falha (no `finally`) faz
        // as próximas tentativas deste período serem silenciosas — o alerta
        // aparece uma vez só.
        if (!cancelado) {
          if (silenciosa) {
            setFalhouAtualizar(true);
          } else {
            setDados(null);
            mostrarErro(e, "falha ao carregar os números do período");
          }
        }
      } finally {
        if (!cancelado) {
          // A contagem da próxima atualização recomeça a cada leitura — também
          // depois de lançar receita ou despesa, que já relê os números.
          ultimaCarga.current = { chave, em: Date.now() };
          setProximaEm(Date.now() + ATUALIZAR_A_CADA_MS);
          setCarregando(false);
          setAtualizando(false);
        }
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [clinicaAtual, de, ate, reload]);

  // Atualização automática, na hora que o relógio da tela marca. O `reload`
  // refaz a leitura; como a data de hoje é recalculada a cada render, a tela
  // aberta de um dia para o outro também passa sozinha para o dia novo.
  useEffect(() => {
    if (proximaEm === null) return;
    const atualizar = () => {
      if (document.visibilityState === "visible") setReload((r) => r + 1);
    };
    const aoVoltar = () => {
      const ultima = ultimaCarga.current;
      if (ultima && Date.now() - ultima.em >= ATUALIZAR_AO_VOLTAR_APOS_MS) atualizar();
    };
    const id = window.setTimeout(atualizar, Math.max(0, proximaEm - Date.now()));
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [proximaEm]);

  const resumo = useMemo(() => (dados ? resumoPainel(dados) : null), [dados]);
  const v = (n: (r: ResumoPainel) => number, formato: (x: number) => string = brl) =>
    carregando || !resumo ? "…" : formato(n(resumo));

  /**
   * Abre o detalhamento do card em tela cheia, dentro do próprio sistema — o
   * dono pediu em 11/09/2026 que o clique não abrisse outra guia do navegador.
   */
  const abrir = (drill: Drill) => {
    if (!dados || !resumo || carregando) return;
    setAberto({ drill, dados, resumo, de, ate });
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
      <CardPendenciasRepasse atualizacao={reload} />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {(["hoje", "ontem", "semana", "mes", "personalizado"] as Periodo[]).map((p) => (
            <Button
              key={p}
              size="sm"
              variant={periodo === p ? "default" : "outline"}
              onClick={() => setPeriodo(p)}
            >
              {ROTULO_PERIODO[p]}
            </Button>
          ))}
          {periodo === "personalizado" && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                aria-label="Início do período"
                className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                value={custom.de}
                max={hojeBR()}
                onChange={(e) => setCustom((c) => ({ ...c, de: e.target.value || c.de }))}
              />
              <span className="text-sm text-muted-foreground">até</span>
              <input
                type="date"
                aria-label="Fim do período"
                className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                value={custom.ate}
                max={hojeBR()}
                onChange={(e) => setCustom((c) => ({ ...c, ate: e.target.value || c.ate }))}
              />
            </div>
          )}
        </div>
        <ContagemAtualizacao
          atualizadoEm={atualizadoEm}
          proximaEm={proximaEm}
          atualizando={atualizando || carregando}
          falhou={falhouAtualizar}
          onAtualizarAgora={() => setReload((r) => r + 1)}
        />
        <p className="text-xs text-muted-foreground">
          {fmtDate(de)}
          {de !== ate && ` a ${fmtDate(ate)}`} · tudo que entrou no caixa, pelo dia do pagamento —
          mesma conta do Movimento de Caixa e do Rateio da Receita (Relatórios). Clique em um card
          para ver o detalhamento em tela cheia.
        </p>

      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Resultado do período
        </h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {/* Ocupa duas linhas: é o card mais alto (quebra por forma), e assim
              os outros quatro fecham um quadro 2×2 ao lado dele. */}
          <KpiCard
            onClick={() => abrir("receita")}
            icon={TrendingUp}
            label="Receita bruta"
            value={v((r) => r.receitaTotal)}
            accent="success"
            detalhe="Atendimentos + mensalidades do Cartão, adesões e avulsos"
            className="md:row-span-2"
          >
            {resumo && !carregando && (
              <ul className="mt-2 space-y-0.5 border-t border-border/60 pt-2">
                <li className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-muted-foreground">Atendimentos</span>
                  <span className="shrink-0 tabular-nums">{brl(resumo.receitaBruta)}</span>
                </li>
                <li className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-muted-foreground">Mensalidades, adesões e avulsos</span>
                  <span className="shrink-0 tabular-nums">{brl(resumo.outrasReceitas)}</span>
                </li>
              </ul>
            )}
            {resumo && !carregando && (
              <ul className="mt-2 space-y-0.5 border-t border-border/60 pt-2">
                {resumo.formasReceitaTotal.map((f) => (
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
          {/* Repasse em duas leituras lado a lado (decisão de 12/09/2026):
              o DEVIDO pelos atendimentos do período e o PAGO no caixa. A
              despesa e o saldo usam o pago; o devido serve para conferência. */}
          <KpiCard
            onClick={() => abrir("repasse")}
            icon={Handshake}
            label="Repasse a médicos / prestadores"
            value={v((r) => r.repassePagoNoPeriodo)}
            accent="warning"
            detalhe="Pago no caixa no período"
          >
            {resumo && !carregando && (
              <ul className="mt-2 space-y-0.5 border-t border-border/60 pt-2">
                <li className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-muted-foreground">Devido pelos atendimentos</span>
                  <span className="shrink-0 tabular-nums">{brl(resumo.custoPrestadores)}</span>
                </li>
                <li className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-muted-foreground">
                    Grade {brl(resumo.repasse)}
                    {resumo.terceiro > 0 && ` · terceiros ${brl(resumo.terceiro)}`}
                    {resumo.complementoMedico > 0 &&
                      ` · complemento ${brl(resumo.complementoMedico)}`}
                  </span>
                </li>
              </ul>
            )}
          </KpiCard>
          <KpiCard
            onClick={() => abrir("operacionais")}
            icon={Receipt}
            label="Despesas operacionais"
            value={v((r) => r.despesasOperacionais)}
            accent="destructive"
            detalhe="Contas, folha, compras — sem repasse médico"
          />
          <KpiCard
            onClick={() => abrir("totais")}
            icon={TrendingDown}
            label="Despesas totais"
            value={v((r) => r.despesasTotais)}
            accent="destructive"
            detalhe="Repasse e complemento pagos no caixa + despesas operacionais"
          />
          <KpiCard
            onClick={() => abrir("saldo")}
            icon={Wallet}
            label="Líquido da clínica / Saldo"
            value={v((r) => r.saldo)}
            accent={resumo && resumo.saldo < 0 ? "destructive" : "primary"}
            detalhe={
              resumo && !carregando
                ? `Margem de ${pct(margem(resumo.saldo, resumo.receitaTotal))} · receitas − despesas pagas no caixa`
                : "Receitas − despesas pagas no caixa"
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
            onClick={() => abrir("atendimentos")}
            icon={Users}
            label="Atendimentos (total)"
            value={v((r) => r.producao.total, int)}
            accent="primary"
          />
          <KpiCard
            onClick={() => abrir("cartao")}
            icon={CreditCard}
            label="Consultas Cartão"
            value={v((r) => r.producao.consultasCartao, int)}
            accent="primary"
          />
          <KpiCard
            onClick={() => abrir("particular")}
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
            onClick={() => abrir("exame")}
            icon={FlaskConical}
            label="Exames"
            value={v((r) => r.producao.exames, int)}
            accent="warning"
          />
          {/* Procedimento e serviço fora do cadastro. Sem este card a soma dos
              cards de contagem não fecharia com o total. */}
          {resumo && resumo.producao.outros > 0 && (
            <KpiCard
              onClick={() => abrir("outro")}
              icon={Activity}
              label="Procedimentos e outros"
              value={v((r) => r.producao.outros, int)}
              accent="primary"
            />
          )}
          {/* Mensalidade e adesão do Cartão: recebimentos sem agendamento que
              também contam como atendimento no total. */}
          <KpiCard
            onClick={() => abrir("mensalidade")}
            icon={Calendar}
            label="Mensalidades"
            value={v((r) => r.producao.mensalidades, int)}
            accent="success"
          />
          <KpiCard
            onClick={() => abrir("adesao")}
            icon={Users}
            label="Adesões"
            value={v((r) => r.producao.adesoes, int)}
            accent="warning"
          />
          {/* Atendido sem cobrança: revisão de cortesia e gratuidade do plano
              da casa. Conta no total e vale R$ 0,00. */}
          {resumo && resumo.producao.cortesias > 0 && (
            <KpiCard
              onClick={() => abrir("cortesia")}
              icon={Stethoscope}
              label="Cortesias e gratuidades"
              value={v((r) => r.producao.cortesias, int)}
              accent="primary"
              detalhe="Atendidos sem cobrança (R$ 0,00)"
            />
          )}



          <KpiCard
            onClick={() => abrir("ticket")}
            icon={Calendar}
            label="Ticket médio"
            value={v((r) => r.ticketMedio)}
            accent="primary"
            detalhe="Receita dos atendimentos ÷ atendimentos"
          />
        </div>
      </section>

      <LancamentoDialog
        open={open !== null}
        onOpenChange={(o) => !o && setOpen(null)}
        tipo={open ?? "receita"}
        onSaved={() => setReload((r) => r + 1)}
      />

      {aberto && (
        <DetalhamentoDialog
          montar={(visao) => montarDetalhe(aberto.drill, aberto.dados, aberto.resumo, visao)}
          rotuloSintetico={rotuloSinteticoDe(aberto.drill)}
          arquivo={`financeiro_${aberto.drill}`}
          de={aberto.de}
          ate={aberto.ate}
          clinicaNome={clinicaAtual?.clinica.nome ?? "Clínica"}
          onClose={() => setAberto(null)}
        />
      )}
    </div>
  );
}

const margem = (valor: number, base: number) => (base === 0 ? 0 : (valor / base) * 100);

/**
 * Relógio da atualização automática: quando foi a última leitura e quanto
 * falta para a próxima, contando de segundo em segundo — o dono pediu ver a
 * contagem para ter certeza de que a tela está viva. Clicar atualiza na hora.
 *
 * Fica num componente à parte porque bate a cada segundo: se o segundo
 * redesenhasse o Dashboard inteiro, redesenharia junto a tabela do
 * detalhamento aberto, que no "Mês" tem milhares de linhas.
 */
function ContagemAtualizacao({
  atualizadoEm,
  proximaEm,
  atualizando,
  falhou,
  onAtualizarAgora,
}: {
  atualizadoEm: Date | null;
  proximaEm: number | null;
  atualizando: boolean;
  falhou: boolean;
  onAtualizarAgora: () => void;
}) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setAgora(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  if (proximaEm === null) return null;
  const faltam = Math.max(0, Math.ceil((proximaEm - agora) / 1000));
  const relogio = `${Math.floor(faltam / 60)}:${String(faltam % 60).padStart(2, "0")}`;

  return (
    <button
      type="button"
      onClick={onAtualizarAgora}
      disabled={atualizando}
      title="Atualizar agora"
      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-xs tabular-nums text-muted-foreground hover:bg-muted/50 disabled:cursor-default"
    >
      <RefreshCw aria-hidden className={cn("h-3.5 w-3.5", atualizando && "animate-spin")} />
      {atualizadoEm && (
        <span>
          Atualizado às{" "}
          {atualizadoEm.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
        </span>
      )}
      <span aria-hidden>·</span>
      <span className="font-medium text-foreground">
        {atualizando ? "atualizando…" : `próxima em ${relogio}`}
      </span>
      {falhou && !atualizando && <span className="text-warning">· a última tentativa falhou</span>}
    </button>
  );
}


/** Nome do botão da visão agrupada de cada detalhamento. */
const rotuloSinteticoDe = (d: Drill) =>
  d === "operacionais" ? "Por categoria" : d === "totais" ? "Por conta" : "Por profissional";

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
  const repassesPagos = dados.despesas.filter((d) => d.grupo === "repasse_pago");

  // --- Listas de atendimento (Receita, Atendimentos, Ticket e os tipos) -----
  if (
    drill === "receita" ||
    drill === "atendimentos" ||
    drill === "ticket" ||
    drill === "cartao" ||
    drill === "particular" ||
    drill === "exame" ||
    drill === "outro" ||
    drill === "mensalidade" ||
    drill === "adesao" ||
    drill === "cortesia"
  ) {
    // A cortesia/gratuidade sai dos cards por tipo e tem lista própria — é
    // assim que a soma dos cards continua fechando com o total.
    const recorte =
      drill === "cartao" || drill === "particular" || drill === "exame" || drill === "outro"
        ? dados.rateio.filter((l) => !ehCortesia(l) && categoriaDoAtendimento(l) === drill)
        : drill === "cortesia"
          ? dados.rateio.filter(ehCortesia)
          : drill === "mensalidade" || drill === "adesao"
            ? []
            : dados.rateio;
    const titulo =
      drill === "receita"
        ? "Receita bruta"
        : drill === "atendimentos"
          ? "Atendimentos"
          : drill === "ticket"
            ? "Ticket médio"
            : drill === "mensalidade"
              ? "Mensalidades"
              : drill === "adesao"
                ? "Adesões"
                : drill === "cortesia"
                  ? "Cortesias e gratuidades"
                  : TITULO_ATENDIMENTO[drill];
    // Os recebimentos sem agendamento (mensalidade, adesão, avulso) entram na
    // lista sem repasse, inteiros no líquido da clínica. Eles aparecem na
    // Receita bruta, no total de Atendimentos e nos cards próprios de cada tipo
    // — é assim que a soma dos cards fecha com o total.
    const outras =
      drill === "receita" || drill === "atendimentos" || drill === "ticket"
        ? dados.outrasReceitas
        : drill === "mensalidade" || drill === "adesao"
          ? dados.outrasReceitas.filter(
              (o) => categoriaDaOutraReceita(o) === (drill === "adesao" ? "adesao" : "mensalidade"),
            )
          : drill === "outro"
            ? dados.outrasReceitas.filter((o) => categoriaDaOutraReceita(o) === "avulso")
            : [];

    const receitaAtend = recorte.reduce((s, l) => s + l.receita, 0);
    const receitaOutras = outras.reduce((s, i) => s + i.valor, 0);
    const receita = receitaAtend + receitaOutras;
    const repasse = recorte.reduce((s, l) => s + l.repasse, 0);
    const terceiro = recorte.reduce((s, l) => s + l.terceiro, 0);
    const liquido = recorte.reduce((s, l) => s + l.liquido, 0) + receitaOutras;
    const resumo = [
      ...(drill === "receita"
        ? [
            { rotulo: "Atendimentos", valor: receitaAtend },
            { rotulo: "Mensalidades, adesões e avulsos", valor: receitaOutras },
          ]
        : []),
      { rotulo: "Receita bruta", valor: receita },
      { rotulo: "Repasse a médicos", valor: repasse },
      ...(terceiro > 0 ? [{ rotulo: "Terceiros (dono do equipamento)", valor: terceiro }] : []),
      ...(drill === "ticket" || drill === "atendimentos"
        ? [{ rotulo: "Ticket médio", valor: recorte.length ? receita / recorte.length : 0 }]
        : []),
      { rotulo: "Líquido da clínica", valor: liquido },
    ];
    const explicacao =
      drill === "receita"
        ? "Atendimentos pela mesma lista do Rateio da Receita (Financeiro → Relatórios), cada um no dia em que foi atendido e com o repasse pela grade do médico, mais as receitas que não são atendimento — mensalidade do Cartão, adesão, recebimento avulso —, que não têm repasse e entram inteiras no líquido da clínica."
        : "Mesma lista do Rateio da Receita (Financeiro → Relatórios): cada atendimento no dia em que foi atendido, com o repasse pela grade do médico.";
    const composicao =
      drill === "receita"
        ? r.formasReceitaTotal.map((f) => ({ rotulo: f.rotulo, valor: f.valor }))
        : undefined;
    // Rótulo da linha das outras receitas na coluna de profissional.
    const OUTRAS = "MENSALIDADES, ADESÕES E AVULSOS";
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
      const linhas: Celula[][] = grupos.map((g) => [g.nome, g.esp, g.qtd, g.rec, g.rep, g.liq]);
      for (const g of somarPorCategoria(outras))
        linhas.push([OUTRAS, g.rotulo, g.qtd, g.valor, 0, g.valor]);
      return {
        titulo,
        explicacao,
        colunas: [
          { rotulo: "Profissional", tipo: "texto" },
          { rotulo: outras.length ? "Especialidade / Categoria" : "Especialidade", tipo: "texto" },
          { rotulo: "Qtd.", tipo: "numero" },
          { rotulo: "Receita", tipo: "moeda" },
          { rotulo: "Repasse", tipo: "moeda" },
          { rotulo: "Líquido clínica", tipo: "moeda" },
        ],
        linhas,
        totais: ["TOTAL", "", recorte.length + outras.length, receita, repasse + terceiro, liquido],
        resumo,
        composicao,
        temSintetico: true,
      };
    }
    const linhas: Celula[][] = recorte.map((l) => [
      l.data,
      l.medico_nome,
      l.servico_nome,
      l.condicao,
      formasDaLinha(l),
      l.receita,
      l.repasse + l.terceiro,
      l.liquido,
    ]);
    for (const i of outras)
      linhas.push([
        i.data,
        OUTRAS,
        i.descricao,
        i.categoria_nome,
        LABEL_FORMA[classificarForma(i.forma_pagamento)],
        i.valor,
        0,
        i.valor,
      ]);
    return {
      titulo,
      explicacao,
      colunas: [
        { rotulo: "Data", tipo: "data" },
        { rotulo: "Profissional", tipo: "texto" },
        { rotulo: outras.length ? "Serviço / Descrição" : "Serviço", tipo: "texto" },
        { rotulo: outras.length ? "Condição / Categoria" : "Condição", tipo: "texto" },
        { rotulo: "Forma de pagamento", tipo: "texto" },
        { rotulo: "Receita", tipo: "moeda" },
        { rotulo: "Repasse", tipo: "moeda" },
        { rotulo: "Líquido clínica", tipo: "moeda" },
      ],
      linhas,
      totais: [
        outras.length
          ? `${int(recorte.length)} atendimento(s) + ${int(outras.length)} lançamento(s)`
          : `${int(recorte.length)} atendimento(s)`,
        "",
        "",
        "",
        "",
        receita,
        repasse + terceiro,
        liquido,
      ],
      resumo,
      composicao,
      temSintetico: true,
    };
  }

  // --- Repasse ---------------------------------------------------------------
  if (drill === "repasse") {
    const resumo = [
      { rotulo: "Repasse pago no caixa no período", valor: r.repassePagoNoPeriodo },
      ...(r.complementoMedico > 0
        ? [{ rotulo: "Complemento médico pago", valor: r.complementoMedico }]
        : []),
      { rotulo: "Total pago no caixa", valor: r.custoPrestadoresPago },
      { rotulo: "Repasse a médicos devido (grade)", valor: r.repasse },
      ...(r.terceiro > 0 ? [{ rotulo: "Terceiros (dono do equipamento)", valor: r.terceiro }] : []),
      { rotulo: "Total devido pelos atendimentos", valor: r.custoPrestadores },
    ];
    const explicacao =
      "Duas leituras do mesmo repasse. PAGO NO CAIXA é o que saiu da gaveta no período — é ele que forma as despesas e o saldo, igual ao Movimento de Caixa. DEVIDO é o que os atendimentos do período geraram pela grade de cada médico, mais terceiros — é o número do Rateio da Receita. Eles quase nunca são iguais, porque o pagamento de hoje quita atendimentos de dias anteriores. A tabela abaixo lista o devido, atendimento por atendimento.";
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

  // --- Despesas operacionais -------------------------------------------------
  if (drill === "operacionais") {
    const itens = operacionais;
    const total = r.despesasOperacionais;
    const titulo = "Despesas operacionais";
    const explicacao =
      "Despesas confirmadas no período, sem os pagamentos de repasse (categorias REPASSE MEDICO e REPASSE TERCEIRO) e sem o complemento médico — esses já estão no card de Repasse. Pagamento a médico lançado em outra categoria (COMISSIONAMENTO, por exemplo) continua aqui.";
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
      { rotulo: "Repasse pago no caixa", valor: r.repassePagoNoPeriodo },
      ...(r.complementoMedico > 0
        ? [{ rotulo: "Complemento médico pago", valor: r.complementoMedico }]
        : []),
      { rotulo: "Despesas operacionais", valor: r.despesasOperacionais },
      { rotulo: "Despesas totais (caixa)", valor: r.despesasTotais },
      { rotulo: "Repasse devido pelos atendimentos (conferência)", valor: r.custoPrestadores },
    ];
    const explicacao =
      "Tudo o que saiu do caixa no período: o repasse pago aos médicos e prestadores, o complemento médico e as despesas operacionais — a mesma conta do Movimento de Caixa. O repasse devido pelos atendimentos do período aparece só no resumo, para conferência.";
    if (visao === "sintetico") {
      const linhas: Celula[][] = [];
      for (const g of somarPorCategoria(repassesPagos))
        linhas.push(["Repasse", g.rotulo, g.qtd, g.valor]);
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
  const receitaTotal = r.receitaTotal;
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
