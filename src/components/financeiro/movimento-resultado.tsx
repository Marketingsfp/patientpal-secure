/**
 * Cards do Movimento de Caixa: resultado do caixa, formas de pagamento,
 * atendimentos por condição e mensalidades.
 *
 * A composição dos cards é a do Financeiro → Dashboard (receita de
 * atendimento, repasse, despesas operacionais, outras receitas, despesas
 * totais e saldo), mas pela régua da GAVETA — o que passou pelo caixa no
 * período, que é o que o cupom impresso confere. A conta vive em
 * `@/lib/financeiro/movimento-resultado`; aqui só se desenha.
 *
 * Dois tipos de clique, de propósito:
 *  - os seis cards de resultado abrem o detalhamento em tela cheia (agrupado
 *    e linha a linha, com Imprimir e Baixar Excel), o mesmo do Dashboard;
 *  - os cards menores (Consultas/Exames de cada condição, mensalidades,
 *    avulsos) filtram a lista de lançamentos logo abaixo, como já faziam.
 */
import { useState } from "react";
import {
  Coins,
  Handshake,
  Receipt,
  TrendingDown,
  TrendingUp,
  Wallet,
  X,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { brl } from "@/lib/financeiro/format";
import { LABEL_FORMA } from "@/lib/financeiro/formas-pagamento";
import { barraDeFormas, totaisPorForma } from "@/lib/financeiro/composicao-receita";
import { somarPorCategoria } from "@/lib/financeiro/painel-financeiro";
import {
  CONDICOES,
  GRUPOS_OUTRAS,
  LABEL_CONDICAO,
  LABEL_GRUPO_MOV,
  ehAtendimento,
  favorecidoDoRepasse,
  mesmoFiltro,
  resumoMovimento,
  rotuloFiltro,
  type FiltroCard,
  type GrupoMovimento,
  type LinhaClassificada,
  type ResumoMovimento,
  type TotalQtd,
} from "@/lib/financeiro/movimento-resultado";
import {
  DetalhamentoDialog,
  int,
  KpiCard,
  pct,
  type Celula,
  type Detalhe,
  type Visao,
} from "@/components/financeiro/painel-detalhamento";

type Drill = "receita" | "repasse" | "operacionais" | "outras" | "totais" | "saldo";

const ROTULO_SINTETICO: Record<Drill, string> = {
  receita: "Por condição",
  repasse: "Por profissional",
  operacionais: "Por categoria",
  outras: "Por tipo",
  totais: "Por conta",
  saldo: "",
};

const margem = (valor: number, base: number) => (base === 0 ? 0 : (valor / base) * 100);
const plural = (n: number, um: string, varios: string) => `${int(n)} ${n === 1 ? um : varios}`;

/**
 * Cores dos cards de mensalidade, na convenção que a diretoria já lê nos
 * relatórios: verde é o que está em dia, âmbar é atraso, azul é adiantamento.
 * A cor nunca é a única informação — o rótulo e a legenda dizem o mesmo.
 */
const TOM = {
  neutro: {
    base: "border-border",
    ativo: "border-primary bg-primary/5 ring-1 ring-primary",
    valor: "",
  },
  verde: {
    base: "border-emerald-300 bg-emerald-50/60",
    ativo: "border-emerald-500 bg-emerald-100 ring-1 ring-emerald-500",
    valor: "text-emerald-700",
  },
  ambar: {
    base: "border-amber-300 bg-amber-50/60",
    ativo: "border-amber-500 bg-amber-100 ring-1 ring-amber-500",
    valor: "text-amber-700",
  },
  azul: {
    base: "border-sky-300 bg-sky-50/60",
    ativo: "border-sky-500 bg-sky-100 ring-1 ring-sky-500",
    valor: "text-sky-700",
  },
} as const;

const LEGENDA: Partial<Record<GrupoMovimento, string>> = {
  adesao: "entrou agora no cartão",
  mensalidade_periodo: "mensalidade do mês atual",
  mensalidade_atrasada: "quitou mês passado agora",
  mensalidade_antecipada: "pagou adiantado",
  avulso: "sem atendimento nem mensalidade",
};

/**
 * Card que filtra a lista. É um `button` de verdade, e não uma div clicável,
 * para funcionar no teclado — a recepção usa esta tela o dia inteiro.
 */
function BotaoFiltro({
  rotulo,
  valor,
  ativo,
  onClick,
  tom = "neutro",
  legenda,
}: {
  rotulo: string;
  valor: TotalQtd;
  ativo: boolean;
  onClick: () => void;
  tom?: keyof typeof TOM;
  legenda?: string;
}) {
  const cores = TOM[tom];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      title="Clique para filtrar a lista de lançamentos"
      className={`text-left rounded-md border px-3 py-2 transition hover:brightness-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        ativo ? cores.ativo : cores.base
      }`}
    >
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground truncate">{rotulo}</p>
      <p className={`text-lg font-semibold tabular-nums ${cores.valor}`}>{brl(valor.total)}</p>
      <p className="text-[10px] text-muted-foreground">
        {plural(valor.qtd, "pagamento", "pagamentos")}
        {legenda ? ` · ${legenda}` : ""}
      </p>
    </button>
  );
}

export function MovimentoResultado({
  linhas,
  totaisPeriodo,
  pronto,
  filtro,
  onFiltro,
  filterForma,
  onFilterForma,
  de,
  ate,
  clinicaNome,
}: {
  /** Linhas visíveis do período (sem os retroativos escondidos), já classificadas. */
  linhas: LinhaClassificada[];
  /** Receitas e despesas do período pelo agregado da tela, para conferência. */
  totaisPeriodo: { r: number; d: number };
  /** Cadastro de serviços carregado — sem ele os atendimentos não têm tipo. */
  pronto: boolean;
  filtro: FiltroCard | null;
  onFiltro: (f: FiltroCard | null) => void;
  filterForma: string;
  onFilterForma: (f: string) => void;
  de: string;
  ate: string;
  clinicaNome: string;
}) {
  const [drill, setDrill] = useState<Drill | null>(null);
  const r = resumoMovimento(linhas);
  const v = (n: number) => (pronto ? brl(n) : "…");
  const alternar = (f: FiltroCard) => onFiltro(mesmoFiltro(filtro, f) ? null : f);

  const receitas = linhas.filter((l) => l.tipo === "receita");
  const formasRecebidas = totaisPorForma(receitas.map((l) => ({ balde: l.forma, valor: l.valor })));
  const recorrentes: TotalQtd = {
    total:
      r.outras.porGrupo.mensalidade_periodo.total +
      r.outras.porGrupo.mensalidade_atrasada.total +
      r.outras.porGrupo.mensalidade_antecipada.total,
    qtd:
      r.outras.porGrupo.mensalidade_periodo.qtd +
      r.outras.porGrupo.mensalidade_atrasada.qtd +
      r.outras.porGrupo.mensalidade_antecipada.qtd,
  };
  const mensalidades: TotalQtd = {
    total: recorrentes.total + r.outras.porGrupo.adesao.total,
    qtd: recorrentes.qtd + r.outras.porGrupo.adesao.qtd,
  };
  // Convênio só aparece quando existe: hoje todo convênio da clínica é da
  // modalidade Cartão, e um card fixo em R$ 0,00 só ocupa espaço.
  const condicoesVisiveis = CONDICOES.filter(
    (c) => c !== "convenio" || r.atendimentos.porCondicao.convenio.qtd > 0,
  );
  // Os cards somam as linhas carregadas; o agregado da tela soma no banco.
  // Diferença entre os dois significa lista cortada, e isso tem que ser dito.
  const divergente =
    pronto &&
    (Math.abs(r.receitas - totaisPeriodo.r) > 0.009 ||
      Math.abs(r.despesas - totaisPeriodo.d) > 0.009);

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <KpiCard
          onClick={() => abrir("receita")}
          icon={TrendingUp}
          label="Receita bruta (atendimentos)"
          value={v(r.atendimentos.total)}
          accent="success"
          detalhe={
            pronto
              ? `${plural(r.atendimentos.fichas, "ficha", "fichas")} · Particular, Cartão e Convênio`
              : "Atendimentos recebidos no caixa"
          }
        >
          {pronto && (
            <ul className="mt-2 space-y-0.5 border-t border-border/60 pt-2">
              {r.atendimentos.formas.map((f) => (
                <li key={f.rotulo} className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-muted-foreground">{f.rotulo}</span>
                  <span className="tabular-nums">{brl(f.valor)}</span>
                </li>
              ))}
            </ul>
          )}
        </KpiCard>
        <KpiCard
          onClick={() => abrir("repasse")}
          icon={Handshake}
          label="Repasse médico pago no caixa"
          value={brl(r.repassePago.total)}
          accent="warning"
          detalhe={[
            plural(r.repassePago.qtd, "pagamento", "pagamentos"),
            r.complementoMedico.total > 0 &&
              `+ ${brl(r.complementoMedico.total)} de complemento médico`,
          ]
            .filter(Boolean)
            .join(" · ")}
        />
        <KpiCard
          onClick={() => abrir("operacionais")}
          icon={Receipt}
          label="Despesas operacionais"
          value={brl(r.operacionais.total)}
          accent="destructive"
          detalhe="Contas, folha, compras — sem repasse médico"
        />
        <KpiCard
          onClick={() => abrir("outras")}
          icon={Coins}
          label="Outras receitas"
          value={v(r.outras.total)}
          accent="success"
          detalhe="Mensalidades do Cartão, adesões e avulsos"
        />
        <KpiCard
          onClick={() => abrir("totais")}
          icon={TrendingDown}
          label="Despesas totais"
          value={brl(r.despesas)}
          accent="destructive"
          detalhe="Repasse + despesas operacionais"
        />
        <KpiCard
          onClick={() => abrir("saldo")}
          icon={Wallet}
          label="Saldo líquido do caixa"
          value={brl(r.saldo)}
          accent={r.saldo < 0 ? "destructive" : "primary"}
          detalhe="Receitas − despesas · sangria e suprimento não contam"
        />
      </div>

      {divergente && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <span>
            Os cards somam {brl(r.receitas)} de receitas e {brl(r.despesas)} de despesas, mas o
            período tem {brl(totaisPeriodo.r)} e {brl(totaisPeriodo.d)}: a lista não trouxe todos os
            lançamentos. Diminua o período para conferir o caixa.
          </span>
        </div>
      )}

      {receitas.length > 0 && pronto && (
        <>
          <Card>
            <CardContent className="pt-5 space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Total recebido por forma de pagamento
                </p>
                <p className="text-sm font-semibold tabular-nums">{brl(formasRecebidas.total)}</p>
              </div>
              {/* Três colunas fixas. Débito e crédito aparecem somados em
                  "Cartão"; a separação exata continua no relatório impresso. */}
              <div className="grid grid-cols-3 gap-2">
                {barraDeFormas(formasRecebidas.formas).map((c) => (
                  <button
                    key={c.chave}
                    type="button"
                    onClick={() => onFilterForma(filterForma === c.filtro ? "todos" : c.filtro)}
                    aria-pressed={filterForma === c.filtro}
                    title={`Filtrar a lista por ${c.label}`}
                    className={`text-left rounded-md border px-3 py-2 transition hover:brightness-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      filterForma === c.filtro
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border"
                    }`}
                  >
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      {c.label}
                    </p>
                    <p className="text-lg font-semibold tabular-nums">{brl(c.total)}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {plural(c.qtd, "transação", "transações")}
                    </p>
                  </button>
                ))}
              </div>
              {/* Formas fora das três colunas (boleto, sistema anterior…),
                  para a barra fechar com o total. */}
              {formasRecebidas.formas.some(
                (f) => !["dinheiro", "pix", "debito", "credito", "legado_cartao"].includes(f.forma),
              ) && (
                <p className="text-[11px] text-muted-foreground">
                  Também recebido:{" "}
                  {formasRecebidas.formas
                    .filter(
                      (f) =>
                        !["dinheiro", "pix", "debito", "credito", "legado_cartao"].includes(
                          f.forma,
                        ),
                    )
                    .map((f) => `${LABEL_FORMA[f.forma]} ${brl(f.total)}`)
                    .join(" · ")}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5 space-y-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-sm font-medium">Atendimentos recebidos no caixa</p>
                  <p className="text-xs text-muted-foreground">
                    Todas as fichas pagas no período — Particular, Cartão Benefícios e Convênio
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold tabular-nums">{brl(r.atendimentos.total)}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {plural(r.atendimentos.fichas, "ficha", "fichas")} ·{" "}
                    {plural(r.atendimentos.qtd, "pagamento", "pagamentos")}
                  </p>
                </div>
              </div>
              <div
                className={`grid gap-3 ${condicoesVisiveis.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}
              >
                {condicoesVisiveis.map((c) => {
                  const dados = r.atendimentos.porCondicao[c];
                  return (
                    <div key={c} className="rounded-lg border border-border/70 p-3 space-y-2">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          {LABEL_CONDICAO[c]}
                        </p>
                        <p className="text-sm font-semibold tabular-nums">{brl(dados.total)}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <BotaoFiltro
                          rotulo="Consultas"
                          valor={dados.consulta}
                          ativo={mesmoFiltro(filtro, { grupo: "consulta", condicao: c })}
                          onClick={() => alternar({ grupo: "consulta", condicao: c })}
                        />
                        <BotaoFiltro
                          rotulo="Exames e proced."
                          valor={dados.exame}
                          ativo={mesmoFiltro(filtro, { grupo: "exame_procedimento", condicao: c })}
                          onClick={() => alternar({ grupo: "exame_procedimento", condicao: c })}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5 space-y-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-sm font-medium">Detalhamento de mensalidades no período</p>
                  <p className="text-xs text-muted-foreground">
                    Quanto entrou no caixa × a qual mês cada pagamento se refere
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Total recebido
                  </p>
                  <p className="text-lg font-semibold tabular-nums">{brl(mensalidades.total)}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {plural(mensalidades.qtd, "pagamento", "pagamentos")}
                  </p>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <BotaoFiltro
                  rotulo={LABEL_GRUPO_MOV.adesao}
                  legenda={LEGENDA.adesao}
                  valor={r.outras.porGrupo.adesao}
                  ativo={mesmoFiltro(filtro, { grupo: "adesao" })}
                  onClick={() => alternar({ grupo: "adesao" })}
                />
                <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground truncate">
                    Mensalidades (recorrentes)
                  </p>
                  <p className="text-lg font-semibold tabular-nums">{brl(recorrentes.total)}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {plural(recorrentes.qtd, "pagamento", "pagamentos")} · detalhado abaixo por mês
                    de competência
                  </p>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                {(
                  [
                    ["mensalidade_periodo", "verde"],
                    ["mensalidade_atrasada", "ambar"],
                    ["mensalidade_antecipada", "azul"],
                  ] as const
                ).map(([g, tom]) => (
                  <BotaoFiltro
                    key={g}
                    rotulo={LABEL_GRUPO_MOV[g]}
                    legenda={LEGENDA[g]}
                    tom={tom}
                    valor={r.outras.porGrupo[g]}
                    ativo={mesmoFiltro(filtro, { grupo: g })}
                    onClick={() => alternar({ grupo: g })}
                  />
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {r.outras.porGrupo.avulso.qtd > 0 && (
                <BotaoFiltro
                  rotulo={LABEL_GRUPO_MOV.avulso}
                  legenda={LEGENDA.avulso}
                  valor={r.outras.porGrupo.avulso}
                  ativo={mesmoFiltro(filtro, { grupo: "avulso" })}
                  onClick={() => alternar({ grupo: "avulso" })}
                />
              )}
              {filtro && (
                <Button variant="outline" size="sm" onClick={() => onFiltro(null)}>
                  <X className="h-3.5 w-3.5 mr-1" />
                  Limpar filtro · {rotuloFiltro(filtro)}
                </Button>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Atendimentos + outras receitas:{" "}
              <span className="tabular-nums font-medium">{brl(r.receitas)}</span> — o mesmo total
              recebido no período.
            </p>
          </div>
        </>
      )}

      {drill && (
        <DetalhamentoDialog
          montar={(visao) => montarDetalhe(drill, linhas, r, visao)}
          rotuloSintetico={ROTULO_SINTETICO[drill]}
          arquivo={`movimento_caixa_${drill}`}
          de={de}
          ate={ate}
          clinicaNome={clinicaNome}
          onClose={() => setDrill(null)}
        />
      )}
    </div>
  );
}

// ============================================================================
// Detalhamento em tela cheia de cada card de resultado
// ============================================================================

const ROTULO_GRUPO_DESPESA = {
  repasse_pago: "Repasse pago",
  complemento_medico: "Complemento médico",
  operacional: "Operacional",
} as const;

function montarDetalhe(
  drill: Drill,
  linhas: LinhaClassificada[],
  r: ResumoMovimento,
  visao: Visao,
): Detalhe {
  const receitas = linhas.filter((l) => l.tipo === "receita");
  const despesas = linhas.filter((l) => l.tipo === "despesa");
  const hora = (l: LinhaClassificada) => l.hora ?? "";

  if (drill === "receita") {
    const atend = receitas.filter((l) => ehAtendimento(l.grupo));
    const resumo = [
      { rotulo: "Receita de atendimentos", valor: r.atendimentos.total },
      ...CONDICOES.filter((c) => r.atendimentos.porCondicao[c].qtd > 0).map((c) => ({
        rotulo: LABEL_CONDICAO[c],
        valor: r.atendimentos.porCondicao[c].total,
      })),
    ];
    const base = {
      titulo: "Receita bruta (atendimentos)",
      explicacao:
        "Pagamentos de atendimento que passaram pelo caixa no período, separados em Particular, Cartão Benefícios e Convênio. Mensalidades, adesões e recebimentos avulsos estão em Outras receitas.",
      resumo,
      composicao: r.atendimentos.formas,
      temSintetico: true,
    };
    if (visao === "sintetico") {
      const linhasSint: Celula[][] = [];
      for (const c of CONDICOES) {
        const d = r.atendimentos.porCondicao[c];
        if (d.qtd === 0) continue;
        if (d.consulta.qtd > 0)
          linhasSint.push([LABEL_CONDICAO[c], "Consultas", d.consulta.qtd, d.consulta.total]);
        if (d.exame.qtd > 0)
          linhasSint.push([
            LABEL_CONDICAO[c],
            "Exames e procedimentos",
            d.exame.qtd,
            d.exame.total,
          ]);
      }
      return {
        ...base,
        colunas: [
          { rotulo: "Condição", tipo: "texto" },
          { rotulo: "Tipo", tipo: "texto" },
          { rotulo: "Pagamentos", tipo: "numero" },
          { rotulo: "Valor", tipo: "moeda" },
        ],
        linhas: linhasSint,
        totais: ["TOTAL", "", r.atendimentos.qtd, r.atendimentos.total],
      };
    }
    return {
      ...base,
      colunas: [
        { rotulo: "Data", tipo: "data" },
        { rotulo: "Hora", tipo: "texto" },
        { rotulo: "Descrição", tipo: "texto" },
        { rotulo: "Profissional", tipo: "texto" },
        { rotulo: "Condição", tipo: "texto" },
        { rotulo: "Tipo", tipo: "texto" },
        { rotulo: "Forma", tipo: "texto" },
        { rotulo: "Lançado por", tipo: "texto" },
        { rotulo: "Valor", tipo: "moeda" },
      ],
      linhas: atend.map((l) => [
        l.data,
        hora(l),
        l.descricao,
        l.medico_nome ?? "",
        l.condicao ? LABEL_CONDICAO[l.condicao] : "",
        l.grupo ? LABEL_GRUPO_MOV[l.grupo] : "",
        LABEL_FORMA[l.forma],
        l.usuario_nome,
        Number(l.valor),
      ]),
      totais: [
        plural(r.atendimentos.qtd, "pagamento", "pagamentos"),
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        r.atendimentos.total,
      ],
    };
  }

  if (drill === "repasse") {
    const pagos = despesas.filter(
      (l) => l.grupoDespesa === "repasse_pago" || l.grupoDespesa === "complemento_medico",
    );
    const total = r.repassePago.total + r.complementoMedico.total;
    const base = {
      titulo: "Repasse médico pago no caixa",
      explicacao:
        "Dinheiro entregue aos médicos e prestadores no período: pagamentos de repasse (categorias REPASSE MEDICO e REPASSE TERCEIRO) e complemento médico. Pagamento a médico lançado em outra categoria, como COMISSIONAMENTO, aparece nas despesas operacionais.",
      resumo: [
        { rotulo: "Repasse pago", valor: r.repassePago.total },
        ...(r.complementoMedico.total > 0
          ? [{ rotulo: "Complemento médico", valor: r.complementoMedico.total }]
          : []),
        { rotulo: "Total pago a médicos", valor: total },
      ],
      temSintetico: true,
    };
    if (visao === "sintetico") {
      const acc = new Map<string, { nome: string; tipo: string; qtd: number; valor: number }>();
      for (const l of pagos) {
        const nome = favorecidoDoRepasse(l);
        const tipo = ROTULO_GRUPO_DESPESA[l.grupoDespesa ?? "operacional"];
        const k = `${nome}|${tipo}`;
        const g = acc.get(k) ?? { nome, tipo, qtd: 0, valor: 0 };
        g.qtd += 1;
        g.valor += Number(l.valor);
        acc.set(k, g);
      }
      const grupos = Array.from(acc.values()).sort((a, b) => b.valor - a.valor);
      return {
        ...base,
        colunas: [
          { rotulo: "Profissional", tipo: "texto" },
          { rotulo: "Tipo", tipo: "texto" },
          { rotulo: "Pagamentos", tipo: "numero" },
          { rotulo: "Valor", tipo: "moeda" },
        ],
        linhas: grupos.map((g) => [g.nome, g.tipo, g.qtd, g.valor]),
        totais: ["TOTAL", "", pagos.length, total],
      };
    }
    return {
      ...base,
      colunas: [
        { rotulo: "Data", tipo: "data" },
        { rotulo: "Hora", tipo: "texto" },
        { rotulo: "Categoria", tipo: "texto" },
        { rotulo: "Descrição", tipo: "texto" },
        { rotulo: "Forma", tipo: "texto" },
        { rotulo: "Lançado por", tipo: "texto" },
        { rotulo: "Valor", tipo: "moeda" },
      ],
      linhas: pagos.map((l) => [
        l.data,
        hora(l),
        l.categoria_nome,
        l.descricao,
        LABEL_FORMA[l.forma],
        l.usuario_nome,
        Number(l.valor),
      ]),
      totais: [plural(pagos.length, "pagamento", "pagamentos"), "", "", "", "", "", total],
    };
  }

  if (drill === "operacionais" || drill === "outras") {
    const itens =
      drill === "operacionais"
        ? despesas.filter((l) => l.grupoDespesa === "operacional")
        : receitas.filter((l) => !ehAtendimento(l.grupo));
    const total = drill === "operacionais" ? r.operacionais.total : r.outras.total;
    const titulo = drill === "operacionais" ? "Despesas operacionais" : "Outras receitas";
    const base = {
      titulo,
      explicacao:
        drill === "operacionais"
          ? "Despesas confirmadas no período, sem os pagamentos de repasse e sem o complemento médico — esses estão no card de Repasse. Sangria e suprimento não são despesa e não entram aqui."
          : "Receitas que não são atendimento: mensalidade do Cartão Benefícios (do mês, atrasada ou adiantada), taxa de adesão e recebimento avulso.",
      resumo: [{ rotulo: titulo, valor: total }],
      temSintetico: true,
    };
    if (visao === "sintetico") {
      if (drill === "outras") {
        const grupos = GRUPOS_OUTRAS.filter((g) => r.outras.porGrupo[g].qtd > 0);
        return {
          ...base,
          colunas: [
            { rotulo: "Tipo", tipo: "texto" },
            { rotulo: "Pagamentos", tipo: "numero" },
            { rotulo: "Valor", tipo: "moeda" },
            { rotulo: "% do total", tipo: "texto" },
          ],
          linhas: grupos.map((g) => [
            LABEL_GRUPO_MOV[g],
            r.outras.porGrupo[g].qtd,
            r.outras.porGrupo[g].total,
            pct(margem(r.outras.porGrupo[g].total, total)),
          ]),
          totais: ["TOTAL", r.outras.qtd, total, "100,0%"],
        };
      }
      const grupos = somarPorCategoria(itens);
      return {
        ...base,
        colunas: [
          { rotulo: "Categoria", tipo: "texto" },
          { rotulo: "Qtd.", tipo: "numero" },
          { rotulo: "Valor", tipo: "moeda" },
          { rotulo: "% do total", tipo: "texto" },
        ],
        linhas: grupos.map((g) => [g.rotulo, g.qtd, g.valor, pct(margem(g.valor, total))]),
        totais: ["TOTAL", itens.length, total, "100,0%"],
      };
    }
    return {
      ...base,
      colunas: [
        { rotulo: "Data", tipo: "data" },
        { rotulo: "Hora", tipo: "texto" },
        { rotulo: drill === "outras" ? "Tipo" : "Categoria", tipo: "texto" },
        { rotulo: "Descrição", tipo: "texto" },
        { rotulo: "Forma", tipo: "texto" },
        { rotulo: "Lançado por", tipo: "texto" },
        { rotulo: "Valor", tipo: "moeda" },
      ],
      linhas: itens.map((l) => [
        l.data,
        hora(l),
        drill === "outras" && l.grupo ? LABEL_GRUPO_MOV[l.grupo] : l.categoria_nome,
        l.descricao,
        LABEL_FORMA[l.forma],
        l.usuario_nome,
        Number(l.valor),
      ]),
      totais: [plural(itens.length, "lançamento", "lançamentos"), "", "", "", "", "", total],
    };
  }

  if (drill === "totais") {
    const base = {
      titulo: "Despesas totais",
      explicacao:
        "Tudo o que saiu como despesa no período: repasse pago aos médicos, complemento médico e despesas operacionais. Sangria e suprimento não entram — são troca de custódia do dinheiro, não gasto.",
      resumo: [
        { rotulo: "Repasse pago", valor: r.repassePago.total },
        ...(r.complementoMedico.total > 0
          ? [{ rotulo: "Complemento médico", valor: r.complementoMedico.total }]
          : []),
        { rotulo: "Despesas operacionais", valor: r.operacionais.total },
        { rotulo: "Despesas totais", valor: r.despesas },
      ],
      temSintetico: true,
    };
    if (visao === "sintetico") {
      const linhasSint: Celula[][] = [];
      for (const grupo of ["repasse_pago", "complemento_medico", "operacional"] as const) {
        for (const g of somarPorCategoria(despesas.filter((l) => l.grupoDespesa === grupo)))
          linhasSint.push([ROTULO_GRUPO_DESPESA[grupo], g.rotulo, g.qtd, g.valor]);
      }
      return {
        ...base,
        colunas: [
          { rotulo: "Grupo", tipo: "texto" },
          { rotulo: "Conta", tipo: "texto" },
          { rotulo: "Qtd.", tipo: "numero" },
          { rotulo: "Valor", tipo: "moeda" },
        ],
        linhas: linhasSint,
        totais: ["TOTAL", "", despesas.length, r.despesas],
      };
    }
    return {
      ...base,
      colunas: [
        { rotulo: "Data", tipo: "data" },
        { rotulo: "Hora", tipo: "texto" },
        { rotulo: "Grupo", tipo: "texto" },
        { rotulo: "Categoria", tipo: "texto" },
        { rotulo: "Descrição", tipo: "texto" },
        { rotulo: "Forma", tipo: "texto" },
        { rotulo: "Lançado por", tipo: "texto" },
        { rotulo: "Valor", tipo: "moeda" },
      ],
      linhas: despesas.map((l) => [
        l.data,
        hora(l),
        ROTULO_GRUPO_DESPESA[l.grupoDespesa ?? "operacional"],
        l.categoria_nome,
        l.descricao,
        LABEL_FORMA[l.forma],
        l.usuario_nome,
        Number(l.valor),
      ]),
      totais: [
        plural(despesas.length, "lançamento", "lançamentos"),
        "",
        "",
        "",
        "",
        "",
        "",
        r.despesas,
      ],
    };
  }

  // Saldo: demonstrativo do caixa.
  const linha = (rotulo: string, valor: number): Celula[] => [
    rotulo,
    valor,
    pct(margem(valor, r.receitas)),
  ];
  const linhasSaldo: Celula[][] = [
    linha("Receita de atendimentos", r.atendimentos.total),
    linha("(+) Outras receitas", r.outras.total),
    linha("(=) Receitas do caixa", r.receitas),
    linha("(−) Repasse médico pago", -r.repassePago.total),
  ];
  if (r.complementoMedico.total > 0)
    linhasSaldo.push(linha("(−) Complemento médico", -r.complementoMedico.total));
  linhasSaldo.push(linha("(−) Despesas operacionais", -r.operacionais.total));
  return {
    titulo: "Saldo líquido do caixa",
    explicacao:
      "Demonstrativo do que passou pelo caixa no período. Sangria e suprimento não entram, e os lançamentos retroativos seguem a chave da tela (ocultos por padrão), para o número continuar batendo com o cupom.",
    colunas: [
      { rotulo: "Conta", tipo: "texto" },
      { rotulo: "Valor", tipo: "moeda" },
      { rotulo: "% das receitas", tipo: "texto" },
    ],
    linhas: linhasSaldo,
    totais: ["(=) Saldo do período", r.saldo, pct(margem(r.saldo, r.receitas))],
    resumo: [
      { rotulo: "Receitas do caixa", valor: r.receitas },
      { rotulo: "Despesas totais", valor: r.despesas },
      { rotulo: "Saldo do período", valor: r.saldo },
    ],
    temSintetico: false,
  };
}
