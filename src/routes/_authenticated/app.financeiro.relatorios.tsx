/**
 * Financeiro > Relatórios.
 *
 * A tela nasceu só como exportador de CSV: escolhia-se o tipo e o período e o
 * arquivo era baixado às cegas, sem que ninguém visse os dados antes. A equipe
 * pediu para conferir na própria tela, então hoje o fluxo é: "Buscar" carrega o
 * período e mostra a tabela paginada com os totais no rodapé; a partir daí o
 * mesmo resultado pode ser baixado em Excel/CSV ou impresso em A4.
 *
 * Os totais do rodapé são sempre do período INTEIRO, não da página exibida —
 * quem confere caixa precisa do consolidado, não da soma de 50 linhas.
 *
 * O tipo "Rateio da Receita" reproduz o relatório de mesmo nome do sistema
 * anterior (Clínica Total): quanto cada dia/profissional/especialidade rendeu,
 * quanto saiu de repasse e quanto sobrou para a clínica. Ele tem filtros
 * próprios (profissional, especialidade, grupo/serviço), comparação com outro
 * período e cards de fechamento. A conta em si vive em
 * `@/lib/financeiro/rateio-receita`; os períodos, em
 * `@/lib/financeiro/periodos`.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Download,
  FileBarChart,
  FileSpreadsheet,
  Minus,
  Printer,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { brl, fmtDate } from "@/lib/financeiro/format";
import { imprimirRelatorio } from "@/lib/print-relatorio-financeiro";
import { exportarRelatorioXlsx, type ColunaXlsx } from "@/lib/exportar-xlsx";
import {
  agruparRateio,
  carregarContextoRateio,
  carregarRateio,
  compararRateio,
  totaisRateio,
  type RateioAgruparPor,
  type RateioContexto,
  type RateioLinha,
  type RateioTipo,
  type RateioTotais,
} from "@/lib/financeiro/rateio-receita";
import {
  colunasRateio,
  ROTULO_AGRUPADOR,
  type ColunaRateio as Coluna,
} from "@/lib/financeiro/rateio-colunas";
// Quebra da receita bruta em Dinheiro / PIX / Débito / Crédito, mostrada
// debaixo do total do card e repetida na planilha e no papel.
import {
  COR_FORMA,
  receitaPorForma,
  type FatiaDaReceita,
} from "@/lib/financeiro/receita-por-forma";
import {
  diffDias,
  periodoComparacao,
  variacao,
  type ModoComparacao,
} from "@/lib/financeiro/periodos";
// Mesmo seletor de período do Dashboard/Estatísticas: as abas Dia, Semana,
// Quinzena e Mês aplicam o intervalo sozinhas e só "Período" abre os campos de
// data. Reusar o componente é o que mantém as duas telas idênticas.
import { computeRange, DateRangeFilter, type DatePreset } from "@/components/date-range-filter";
// Mesma normalização de nome usada no cálculo de repasse ("ultrassom" acha
// "ULTRASSONOGRAFIA"), para a busca do combobox casar com o cadastro.
import { normRepasse } from "@/lib/repasse-calc";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

import { DateInputBR } from "@/components/ui/date-input-br";
export const Route = createFileRoute("/_authenticated/app/financeiro/relatorios")({
  component: Page,
  head: () => ({ meta: [{ title: "Relatórios — Financeiro" }] }),
});

type Tipo = "lancamentos" | "atendimentos" | "notas" | "rateio";
type Linha = Record<string, unknown>;

/** Quantas linhas cabem por página sem transformar a conferência em rolagem. */
const POR_PAGINA = 50;

/** Quantos serviços o combobox desenha por vez — o cadastro tem milhares. */
const SERVICOS_VISIVEIS = 60;

/**
 * Altura e borda comuns de todo campo do card de filtros. São oito campos em
 * três blocos diferentes; sem uma classe única eles vinham com alturas
 * ligeiramente diferentes e as linhas do grid não fechavam.
 */
const CAMPO = "h-10 text-sm border-slate-200 focus:ring-2 focus:ring-primary/20";

/** Rótulo acima de cada campo: discreto, para o valor escolhido ter destaque. */
const ROTULO = "text-xs font-medium text-slate-600";

/**
 * Colunas de cada relatório. A ordem vale para a tela e para o papel — a lista
 * abaixo é a única fonte da verdade dos dois.
 */
const COLUNAS: Record<Exclude<Tipo, "rateio">, Coluna[]> = {
  lancamentos: [
    { chave: "data", rotulo: "Data", formato: "data" },
    { chave: "tipo", rotulo: "Tipo", formato: "texto" },
    { chave: "descricao", rotulo: "Descrição", formato: "texto" },
    { chave: "valor", rotulo: "Valor", formato: "moeda", somar: true },
    { chave: "status", rotulo: "Status", formato: "texto" },
    { chave: "forma_pagamento", rotulo: "Forma de pagamento", formato: "texto" },
  ],
  atendimentos: [
    { chave: "data", rotulo: "Data", formato: "data" },
    { chave: "procedimento", rotulo: "Procedimento", formato: "texto" },
    { chave: "valor_total", rotulo: "Valor total", formato: "moeda", somar: true },
    { chave: "valor_medico", rotulo: "Repasse médico", formato: "moeda", somar: true },
    { chave: "valor_clinica", rotulo: "Clínica", formato: "moeda", somar: true },
    { chave: "status", rotulo: "Status", formato: "texto" },
    { chave: "forma_pagamento", rotulo: "Forma de pagamento", formato: "texto" },
  ],
  notas: [
    { chave: "data_emissao", rotulo: "Emissão", formato: "data" },
    { chave: "numero", rotulo: "Número", formato: "texto" },
    { chave: "serie", rotulo: "Série", formato: "texto" },
    { chave: "valor", rotulo: "Valor", formato: "moeda", somar: true },
    { chave: "status", rotulo: "Status", formato: "texto" },
  ],
};

const TITULOS: Record<Tipo, string> = {
  lancamentos: "Lançamentos",
  atendimentos: "Atendimentos",
  notas: "Notas de pacientes",
  rateio: "Rateio da Receita",
};

const ROTULO_COMPARACAO: Record<ModoComparacao, string> = {
  anterior: "Período imediatamente anterior",
  "ano-anterior": "Mesmo período do ano anterior",
  personalizado: "Intervalo personalizado",
};

const num = (v: unknown) => Number(v ?? 0) || 0;

const pct = (v: number) => `${v.toFixed(1).replace(".", ",")}%`;

const comSinal = (v: number, texto: string) => (v > 0 ? `+${texto}` : texto);

/** Ordena o analítico pelo mesmo critério escolhido em "Agrupar por". */
function ordenarAnalitico(linhas: RateioLinha[], agruparPor: RateioAgruparPor): RateioLinha[] {
  const chave = (l: RateioLinha) =>
    agruparPor === "profissional"
      ? l.medico_nome
      : agruparPor === "especialidade"
        ? l.especialidade_nome
        : l.data;
  return [...linhas].sort(
    (a, b) => chave(a).localeCompare(chave(b), "pt-BR") || a.data.localeCompare(b.data),
  );
}

/** Formata uma célula para a tela e para o papel (o Excel leva o valor cru). */
function celula(coluna: Coluna, valor: unknown): string {
  if (coluna.formato === "moeda") return brl(num(valor));
  if (coluna.formato === "numero") return num(valor).toLocaleString("pt-BR");
  if (coluna.formato === "percentual") return pct(num(valor));
  if (coluna.formato === "variacao-moeda") return comSinal(num(valor), brl(num(valor)));
  if (coluna.formato === "variacao-percentual") {
    // `null` aqui não é zero: é "não havia nada no período anterior". Mostrar
    // 0,0% se leria como estabilidade e enganaria quem confere.
    if (valor === null || valor === undefined) return "—";
    return comSinal(num(valor), pct(num(valor)));
  }
  if (coluna.formato === "data") return valor ? fmtDate(String(valor).slice(0, 10)) : "—";
  const texto = String(valor ?? "").trim();
  return texto === "" ? "—" : texto;
}

const alinhaDireita = (c: Coluna) => c.formato !== "texto" && c.formato !== "data";

const ehVariacao = (c: Coluna) =>
  c.formato === "variacao-moeda" || c.formato === "variacao-percentual";

/** Verde para o que subiu, vermelho para o que caiu, cinza para o resto. */
function corDaVariacao(valor: unknown): string {
  if (valor === null || valor === undefined) return "text-muted-foreground";
  const v = num(valor);
  if (v > 0) return "text-emerald-600";
  if (v < 0) return "text-rose-600";
  return "text-muted-foreground";
}

/** Tipo da coluna na planilha do Excel. */
function tipoXlsx(c: Coluna): ColunaXlsx["tipo"] {
  if (c.formato === "moeda" || c.formato === "variacao-moeda") return "moeda";
  if (c.formato === "percentual" || c.formato === "variacao-percentual") return "percentual";
  if (c.formato === "numero") return "numero";
  return "texto";
}

/** Valor cru para a planilha: número onde é número, texto no resto. */
function valorXlsx(c: Coluna, valor: unknown): string | number | null {
  if (c.formato === "data") return valor ? fmtDate(String(valor).slice(0, 10)) : "";
  if (alinhaDireita(c)) {
    if (valor === null || valor === undefined) return null;
    return num(valor);
  }
  return String(valor ?? "");
}

function toCsv(rows: Record<string, unknown>[]) {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join(
    "\n",
  );
}
function download(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function fetchAll(builder: () => any): Promise<Record<string, unknown>[]> {
  const PAGE = 1000;
  let offset = 0;
  const all: Record<string, unknown>[] = [];
  while (true) {
    const { data, error } = await builder().range(offset, offset + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as Record<string, unknown>[];
    all.push(...rows);
    if (rows.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

/** Título do bloco de composição, igual na tela, na planilha e no papel. */
const TITULO_COMPOSICAO = "Composição da receita bruta";

/**
 * Mini-detalhamento por forma de pagamento, logo abaixo do valor do card.
 *
 * Tipografia compacta e cinza de propósito: o número grande do card continua
 * sendo o que se lê primeiro, e isto aqui é a conferência de quem quer saber
 * quanto passou na maquininha sem abrir outra tela. O pontinho colorido é
 * reforço — quem identifica a linha é o rótulo escrito ao lado, para o bloco
 * continuar legível impresso em preto e branco.
 */
function ComposicaoPorForma({ fatias }: { fatias: FatiaDaReceita[] }) {
  if (fatias.length === 0) return null;
  return (
    <ul className="mt-3 space-y-1 border-t border-slate-100 pt-2.5">
      {fatias.map((f) => (
        <li key={f.forma} className="flex items-center justify-between gap-2 text-xs">
          <span className="flex min-w-0 items-center gap-1.5 text-slate-500">
            <span aria-hidden className={cn("h-2 w-2 shrink-0 rounded-full", COR_FORMA[f.forma])} />
            <span className="truncate">{f.rotulo}</span>
          </span>
          <span className="shrink-0 font-medium tabular-nums text-slate-600">{brl(f.valor)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Card de fechamento do rateio, com a variação contra o período comparado. */
function CardResumo({
  titulo,
  valor,
  detalhe,
  delta,
  invertido = false,
  composicao,
}: {
  titulo: string;
  valor: string;
  detalhe?: string;
  /** Variação em %; `null` = sem base de comparação; `undefined` = não comparando. */
  delta?: number | null;
  /** Para repasse: subir não é boa notícia para a clínica. */
  invertido?: boolean;
  /** Quebra por forma de pagamento, listada abaixo do valor. */
  composicao?: FatiaDaReceita[];
}) {
  const bom = delta == null ? true : invertido ? delta <= 0 : delta >= 0;
  const Icone = delta == null || delta === 0 ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <Card className="border-slate-200/70 shadow-sm">
      <CardHeader className="border-b border-slate-100 bg-slate-50/60 px-4 py-2.5">
        <CardTitle className="text-[12px] font-semibold uppercase tracking-wider text-slate-600">
          {titulo}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 py-3">
        <p className="text-2xl font-semibold tabular-nums leading-none tracking-tight text-slate-900">
          {valor}
        </p>
        {detalhe && <p className="mt-1.5 text-xs text-muted-foreground">{detalhe}</p>}
        {delta !== undefined && (
          <div className="mt-2.5">
            {delta === null ? (
              <span className="text-xs text-muted-foreground">Sem base de comparação</span>
            ) : (
              <Badge
                variant="outline"
                className={cn(
                  "gap-1 font-medium",
                  bom
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-rose-200 bg-rose-50 text-rose-700",
                )}
              >
                <Icone className="h-3 w-3" />
                {comSinal(delta, pct(delta))}
              </Badge>
            )}
          </div>
        )}
        {composicao && <ComposicaoPorForma fatias={composicao} />}
      </CardContent>
    </Card>
  );
}

function Page() {
  const { clinicaAtual } = useClinica();
  const [tipo, setTipo] = useState<Tipo>("lancamentos");
  // A tela abre no mês corrente, que é a aba "Mês" do seletor. O intervalo e a
  // aba precisam nascer combinando: um intervalo solto deixaria uma aba acesa
  // mostrando outras datas.
  const [preset, setPreset] = useState<DatePreset>("mes");
  const [from, setFrom] = useState(() => computeRange("mes").from);
  const [to, setTo] = useState(() => computeRange("mes").to);
  const [loading, setLoading] = useState(false);
  const [pagina, setPagina] = useState(1);

  // --- Filtros exclusivos do Rateio da Receita -----------------------------
  const [rMedico, setRMedico] = useState("todos");
  const [rEspecialidade, setREspecialidade] = useState("todas");
  const [rGrupo, setRGrupo] = useState("todos");
  const [rServico, setRServico] = useState("todos");
  const [rTipo, setRTipo] = useState<RateioTipo>("sintetico");
  const [rAgrupar, setRAgrupar] = useState<RateioAgruparPor>("data");
  const [servicoAberto, setServicoAberto] = useState(false);
  const [buscaServico, setBuscaServico] = useState("");
  // --- Comparação de períodos ---------------------------------------------
  const [comparar, setComparar] = useState(false);
  const [modoComparacao, setModoComparacao] = useState<ModoComparacao>("anterior");
  const [compDe, setCompDe] = useState("");
  const [compAte, setCompAte] = useState("");
  /** Catálogos e grade de repasse; só carregam quando o Rateio é escolhido. */
  const [ctxRateio, setCtxRateio] = useState<RateioContexto | null>(null);
  const [ctxCarregando, setCtxCarregando] = useState(false);
  const ctxPedido = useRef(false);

  const periodoAtual = { de: from, ate: to };
  const periodoComp = periodoComparacao(periodoAtual, modoComparacao, {
    de: compDe || from,
    ate: compAte || to,
  });
  const comparandoAgora = tipo === "rateio" && comparar;

  /**
   * Resultado carregado junto com o filtro que o gerou. Guardar o filtro é o
   * que impede a tela de mostrar (ou imprimir) o período antigo depois que
   * alguém mexeu nas datas e ainda não clicou em "Buscar".
   */
  const [resultado, setResultado] = useState<{
    tipo: Tipo;
    chave: string;
    from: string;
    to: string;
    linhas: Linha[];
    /** Linhas cruas do rateio (uma por atendimento), para agrupar em memória. */
    rateio?: RateioLinha[];
    /** Mesmas linhas para o período de comparação, quando ligada. */
    rateioComp?: RateioLinha[];
  } | null>(null);

  // "Agrupar por" e "Sintético/Analítico" são recortes do MESMO resultado, então
  // ficam fora da chave: trocar qualquer um deles reorganiza a tabela na hora,
  // sem ir ao banco de novo. O período de comparação, não: ele é outra consulta.
  const chaveAtual =
    tipo === "rateio"
      ? [
          "rateio",
          from,
          to,
          rMedico,
          rEspecialidade,
          rGrupo,
          rServico,
          comparar ? `${periodoComp.de}:${periodoComp.ate}` : "sem-comparacao",
        ].join("|")
      : `${tipo}|${from}|${to}`;
  const atualizado = resultado !== null && resultado.chave === chaveAtual;

  // O `ref` marca que o cadastro já foi pedido. Sem ele, uma falha de rede
  // deixaria o efeito num ciclo: erro -> "carregando" volta a false -> efeito
  // dispara de novo -> erro. Falhando, o usuário sai do Rateio e volta para
  // tentar outra vez.
  useEffect(() => {
    if (tipo !== "rateio" || !clinicaAtual) {
      ctxPedido.current = false;
      return;
    }
    if (ctxRateio || ctxPedido.current) return;
    ctxPedido.current = true;
    let cancelado = false;
    setCtxCarregando(true);
    carregarContextoRateio(clinicaAtual.clinica_id)
      .then((ctx) => {
        if (!cancelado) setCtxRateio(ctx);
      })
      .catch((e) => {
        if (!cancelado) mostrarErro(e);
      })
      .finally(() => {
        if (!cancelado) setCtxCarregando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [tipo, clinicaAtual, ctxRateio]);

  const linhasRateio = useMemo(
    () => (atualizado && resultado?.rateio ? resultado.rateio : []),
    [atualizado, resultado],
  );
  const linhasRateioComp = useMemo(
    () => (atualizado && resultado?.rateioComp ? resultado.rateioComp : []),
    [atualizado, resultado],
  );
  const totaisR = useMemo(() => totaisRateio(linhasRateio), [linhasRateio]);
  const totaisComp = useMemo(() => totaisRateio(linhasRateioComp), [linhasRateioComp]);
  /**
   * Quebra da receita bruta por forma de pagamento. Sai das linhas cruas (uma
   * por atendimento), e não do agrupamento da tabela: "Agrupar por" e
   * "Sintético/Analítico" mudam a apresentação, nunca quanto entrou em cada
   * forma. A soma destas fatias é sempre `totaisR.receita`.
   */
  const fatiasReceita = useMemo(() => receitaPorForma(linhasRateio), [linhasRateio]);
  const comparacaoVisivel = comparandoAgora && atualizado;

  const linhas = useMemo<Linha[]>(() => {
    if (!atualizado || !resultado) return [];
    if (resultado.tipo !== "rateio") return resultado.linhas;
    // No analítico o "Agrupar por" não soma nada: ele manda na ORDEM em que os
    // atendimentos aparecem, para a folha sair na sequência que o usuário pediu.
    if (rTipo === "analitico") {
      return ordenarAnalitico(linhasRateio, rAgrupar) as unknown as Linha[];
    }
    const grupos = agruparRateio(linhasRateio, rAgrupar);
    if (!comparacaoVisivel) return grupos as unknown as Linha[];
    return compararRateio(
      grupos,
      agruparRateio(linhasRateioComp, rAgrupar),
      rAgrupar,
      // Distância entre os dois inícios: é ela que casa o 1º dia de um período
      // com o 1º dia do outro quando o agrupamento é por data. Só chega aqui
      // com o resultado "atualizado", ou seja, carregado com estas datas.
      diffDias(periodoComp.de, resultado.from),
    ) as unknown as Linha[];
  }, [
    atualizado,
    resultado,
    linhasRateio,
    linhasRateioComp,
    rTipo,
    rAgrupar,
    comparacaoVisivel,
    periodoComp.de,
  ]);

  const colunas = useMemo(
    () => (tipo === "rateio" ? colunasRateio(rTipo, rAgrupar, comparacaoVisivel) : COLUNAS[tipo]),
    [tipo, rTipo, rAgrupar, comparacaoVisivel],
  );

  // A troca de agrupamento pode encurtar a lista; voltar para a primeira página
  // evita a tela em branco de uma página que não existe mais.
  useEffect(() => {
    setPagina(1);
  }, [rTipo, rAgrupar]);

  // Ao escolher "Intervalo personalizado" os campos abrem preenchidos com o
  // período anterior — em branco, o comparativo nasceria comparando o período
  // com ele mesmo e mostrando 0% em tudo.
  useEffect(() => {
    if (modoComparacao !== "personalizado" || compDe || compAte) return;
    const sugestao = periodoComparacao({ de: from, ate: to }, "anterior");
    setCompDe(sugestao.de);
    setCompAte(sugestao.ate);
  }, [modoComparacao, compDe, compAte, from, to]);

  const totais = useMemo(() => {
    const somas: Record<string, number> = {};
    for (const c of colunas) if (c.somar) somas[c.chave] = 0;
    let receitas = 0;
    let despesas = 0;
    for (const linha of linhas) {
      for (const c of colunas) if (c.somar) somas[c.chave] += num(linha[c.chave]);
      if (tipo === "lancamentos") {
        const v = num(linha.valor);
        if (String(linha.tipo) === "despesa") despesas += v;
        else receitas += v;
      }
    }
    return { somas, receitas, despesas, saldo: receitas - despesas };
  }, [linhas, colunas, tipo]);

  const totalPaginas = Math.max(1, Math.ceil(linhas.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const inicio = (paginaAtual - 1) * POR_PAGINA;
  const linhasDaPagina = linhas.slice(inicio, inicio + POR_PAGINA);

  /**
   * Rodapé do Rateio. A margem NÃO é a soma das margens das linhas: é a margem
   * do período inteiro, calculada sobre os totais. O mesmo vale para a
   * variação — ela confronta os dois totais, não soma as variações.
   */
  const rodapeRateio = (cols: Coluna[], t: RateioTotais, anterior: RateioTotais) => {
    const v = variacao(t.receita, anterior.receita);
    return cols.map((c, i) => {
      if (c.chave === "qtd") return t.qtd.toLocaleString("pt-BR");
      if (c.chave === "receita") return brl(t.receita);
      if (c.chave === "receitaAnterior") return brl(anterior.receita);
      if (c.chave === "variacaoValor") return comSinal(v.valor, brl(v.valor));
      if (c.chave === "variacaoPercentual")
        return v.percentual === null ? "—" : comSinal(v.percentual, pct(v.percentual));
      if (c.chave === "repasse") return brl(t.repasse);
      if (c.chave === "liquido") return brl(t.liquido);
      if (c.chave === "margem") return pct(t.margem);
      if (i === 0) return "TOTAL GERAL";
      // No analítico a contagem não tem coluna própria; fica ao lado do rótulo.
      return i === 1 && rTipo === "analitico"
        ? `${t.qtd.toLocaleString("pt-BR")} atendimento(s)`
        : "";
    });
  };

  /** Rodapé da tabela: contagem na 1ª coluna e a soma em cada coluna de dinheiro. */
  const rodape =
    tipo === "rateio"
      ? rodapeRateio(colunas, totaisR, totaisComp)
      : colunas.map((c, i) => {
          if (c.somar) {
            // Em Lançamentos, somar receita com despesa não daria dinheiro nenhum:
            // o consolidado da coluna é o saldo do período.
            const valor =
              tipo === "lancamentos" && c.chave === "valor" ? totais.saldo : totais.somas[c.chave];
            return brl(valor);
          }
          return i === 0 ? `${linhas.length.toLocaleString("pt-BR")} registro(s)` : "";
        });

  /**
   * Mesma linha de totais, só que com números crus: na planilha o total tem
   * que continuar sendo número, senão o Excel não soma nem compara a coluna.
   */
  const totaisXlsxRateio = (cols: Coluna[], t: RateioTotais, anterior: RateioTotais) => {
    const v = variacao(t.receita, anterior.receita);
    const porChave: Record<string, number | null> = {
      qtd: t.qtd,
      receita: t.receita,
      receitaAnterior: anterior.receita,
      variacaoValor: v.valor,
      variacaoPercentual: v.percentual,
      repasse: t.repasse,
      liquido: t.liquido,
      margem: t.margem,
    };
    return cols.map((c, i) =>
      c.chave in porChave ? porChave[c.chave] : i === 0 ? "TOTAL GERAL" : "",
    );
  };

  /** Quadro de fechamento do rateio, igual na tela e no papel. */
  const resumoDoRateio = (t: RateioTotais) => [
    { rotulo: "Atendimentos", valor: t.qtd.toLocaleString("pt-BR") },
    { rotulo: "Receita bruta", valor: brl(t.receita) },
    { rotulo: "Repasse ao prestador", valor: brl(t.repasse) },
    { rotulo: "Líquido da clínica", valor: `${brl(t.liquido)} (${pct(t.margem)})` },
  ];

  /** Descrição dos filtros escolhidos, para o cabeçalho do papel e da planilha. */
  const descricaoFiltrosRateio = () => {
    if (tipo !== "rateio") return "";
    const partes: string[] = [];
    if (rMedico !== "todos") {
      partes.push(`Profissional: ${ctxRateio?.medicosById.get(rMedico)?.nome ?? rMedico}`);
    }
    if (rEspecialidade !== "todas") {
      const e = ctxRateio?.especialidades.find((x) => x.id === rEspecialidade);
      partes.push(`Especialidade: ${e?.nome ?? rEspecialidade}`);
    }
    if (rGrupo !== "todos") {
      const g = ctxRateio?.grupos.find((x) => x.chave === rGrupo);
      partes.push(`Grupo: ${g?.rotulo ?? rGrupo}`);
    }
    if (rServico !== "todos") partes.push(`Serviço: ${rServico}`);
    partes.push(rTipo === "sintetico" ? "Sintético" : "Analítico");
    partes.push(`Agrupado por ${ROTULO_AGRUPADOR[rAgrupar].toLowerCase()}`);
    return partes.join(" · ");
  };

  const textoPeriodoComparado = `Comparado com ${fmtDate(periodoComp.de)} a ${fmtDate(periodoComp.ate)} (${ROTULO_COMPARACAO[modoComparacao].toLowerCase()})`;

  /**
   * Devolve as linhas prontas para a tabela e, no rateio, também as linhas
   * cruas (uma por atendimento, dos dois períodos). O papel e a planilha
   * precisam das cruas porque os totais do `useMemo` só existem no render
   * seguinte — e exportar pode ser o primeiro clique, sem "Buscar" antes.
   */
  const carregar = async (): Promise<{
    linhas: Linha[];
    cruas: RateioLinha[];
    cruasComp: RateioLinha[];
  } | null> => {
    if (!clinicaAtual) return null;
    if (atualizado && resultado) {
      return { linhas, cruas: linhasRateio, cruasComp: linhasRateioComp };
    }
    if (tipo === "rateio" && !ctxRateio) {
      toast.info("Carregando o cadastro de médicos e serviços — tente de novo em instantes");
      return null;
    }
    setLoading(true);
    let data: Linha[] = [];
    let cruas: RateioLinha[] | undefined;
    let cruasComp: RateioLinha[] | undefined;
    try {
      if (tipo === "rateio" && ctxRateio) {
        const filtrosComuns = {
          clinicaId: clinicaAtual.clinica_id,
          medicoId: rMedico === "todos" ? null : rMedico,
          especialidadeId: rEspecialidade === "todas" ? null : rEspecialidade,
          grupo: rGrupo === "todos" ? null : rGrupo,
          servico: rServico === "todos" ? null : rServico,
        };
        const [atual, anterior] = await Promise.all([
          carregarRateio(ctxRateio, { ...filtrosComuns, de: from, ate: to }),
          comparar
            ? carregarRateio(ctxRateio, {
                ...filtrosComuns,
                de: periodoComp.de,
                ate: periodoComp.ate,
              })
            : Promise.resolve([] as RateioLinha[]),
        ]);
        cruas = atual;
        cruasComp = anterior;
        if (rTipo === "analitico") {
          data = ordenarAnalitico(atual, rAgrupar) as unknown as Linha[];
        } else {
          const grupos = agruparRateio(atual, rAgrupar);
          data = (comparar
            ? compararRateio(
                grupos,
                agruparRateio(anterior, rAgrupar),
                rAgrupar,
                diffDias(periodoComp.de, from),
              )
            : grupos) as unknown as Linha[];
        }
      } else if (tipo === "lancamentos") {
        data = await fetchAll(() =>
          supabase
            .from("fin_lancamentos")
            .select("data, tipo, descricao, valor, status, forma_pagamento")
            .eq("clinica_id", clinicaAtual.clinica_id)
            .gte("data", from)
            .lte("data", to)
            .order("data"),
        );
      } else if (tipo === "atendimentos") {
        data = await fetchAll(() =>
          supabase
            .from("fin_atendimentos")
            .select(
              "data, procedimento, valor_total, valor_medico, valor_clinica, status, forma_pagamento",
            )
            .eq("clinica_id", clinicaAtual.clinica_id)
            .gte("data", from)
            .lte("data", to)
            .order("data"),
        );
      } else {
        data = await fetchAll(() =>
          supabase
            .from("fin_notas_pacientes")
            .select("data_emissao, numero, serie, valor, status")
            .eq("clinica_id", clinicaAtual.clinica_id)
            .gte("data_emissao", from)
            .lte("data_emissao", to)
            .order("data_emissao"),
        );
      }
    } catch (e: any) {
      setLoading(false);
      mostrarErro(e);
      return null;
    }
    setLoading(false);
    setResultado({
      tipo,
      chave: chaveAtual,
      from,
      to,
      linhas: data,
      rateio: cruas,
      rateioComp: cruasComp,
    });
    setPagina(1);
    return { linhas: data, cruas: cruas ?? [], cruasComp: cruasComp ?? [] };
  };

  const buscar = async () => {
    const res = await carregar();
    if (!res) return;
    const data = res.linhas;
    if (data.length === 0) toast.info("Nenhum dado no período");
    else if (tipo === "rateio")
      toast.success(`${data.length.toLocaleString("pt-BR")} linha(s) no rateio`);
    else toast.success(`${data.length.toLocaleString("pt-BR")} registro(s) encontrados`);
  };

  /** Cabeçalho de contexto que vai no topo da planilha e da folha impressa. */
  const contextoDoRelatorio = () => {
    const linhasCtx = [
      `${TITULOS[tipo]} — ${clinicaAtual?.clinica.nome ?? "Clínica"}`,
      `Período: ${fmtDate(from)} a ${fmtDate(to)}`,
    ];
    if (tipo === "rateio") {
      linhasCtx.push(descricaoFiltrosRateio());
      if (comparar) linhasCtx.push(textoPeriodoComparado);
    }
    return linhasCtx.filter(Boolean);
  };

  const baixarExcel = async () => {
    const res = await carregar();
    if (!res) return;
    const data = res.linhas;
    if (data.length === 0) {
      toast.info("Nenhum dado no período");
      return;
    }
    const t = totaisRateio(res.cruas);
    const tComp = totaisRateio(res.cruasComp);
    try {
      await exportarRelatorioXlsx({
        arquivo: `${tipo === "rateio" ? "rateio_receita" : `relatorio_${tipo}`}_${from}_${to}`,
        aba: TITULOS[tipo],
        cabecalho: contextoDoRelatorio(),
        colunas: colunas.map((c) => ({ rotulo: c.rotulo, tipo: tipoXlsx(c) })),
        linhas: data.map((linha) => colunas.map((c) => valorXlsx(c, linha[c.chave]))),
        totais:
          tipo === "rateio"
            ? totaisXlsxRateio(colunas, t, tComp)
            : colunas.map((c, i) =>
                c.somar
                  ? tipo === "lancamentos" && c.chave === "valor"
                    ? totais.saldo
                    : totais.somas[c.chave]
                  : i === 0
                    ? `${data.length.toLocaleString("pt-BR")} registro(s)`
                    : "",
              ),
        // O mesmo bloco que a tela mostra no card, abaixo da tabela: quem abre
        // a planilha enxerga a quebra por forma de pagamento sem precisar
        // montar tabela dinâmica. Os valores vão como número, para somarem.
        resumo:
          tipo === "rateio"
            ? {
                titulo: TITULO_COMPOSICAO,
                itens: receitaPorForma(res.cruas).map((f) => ({
                  rotulo: f.rotulo,
                  valor: f.valor,
                  tipo: "moeda" as const,
                })),
              }
            : undefined,
      });
      toast.success(`Planilha gerada (${data.length} linhas)`);
    } catch (e) {
      mostrarErro(e);
    }
  };

  const baixarCsv = async () => {
    const res = await carregar();
    if (!res) return;
    const data = res.linhas;
    if (data.length === 0) {
      toast.info("Nenhum dado no período");
      return;
    }
    if (tipo === "rateio") {
      // No rateio o CSV sai com os mesmos rótulos da tela — quem abre no Excel
      // não tem como saber o que significa "liquido" ou "margem".
      const linhasCsv = data.map((linha) => {
        const obj: Record<string, unknown> = {};
        for (const c of colunas) obj[c.rotulo] = valorXlsx(c, linha[c.chave]);
        return obj;
      });
      download(`rateio_receita_${from}_${to}.csv`, toCsv(linhasCsv));
      toast.success(`Relatório gerado (${data.length} linhas)`);
      return;
    }
    download(`relatorio_${tipo}_${from}_${to}.csv`, toCsv(data));
    toast.success(`Relatório gerado (${data.length} linhas)`);
  };

  const imprimir = async () => {
    const res = await carregar();
    if (!res) return;
    const data = res.linhas;
    if (data.length === 0) {
      toast.info("Nenhum dado no período");
      return;
    }
    const periodo = `${fmtDate(from)} a ${fmtDate(to)}`;
    if (tipo === "rateio") {
      // Totais recalculados aqui a partir das linhas cruas: imprimir pode ser
      // o primeiro clique, e aí o `useMemo` dos totais ainda não rodou.
      const t = totaisRateio(res.cruas);
      const tComp = totaisRateio(res.cruasComp);
      const resumo = resumoDoRateio(t);
      if (comparar) {
        const v = variacao(t.receita, tComp.receita);
        resumo.push({
          rotulo: "Receita do período comparado",
          valor: `${brl(tComp.receita)} (${v.percentual === null ? "sem base" : comSinal(v.percentual, pct(v.percentual))})`,
        });
      }
      imprimirRelatorio({
        clinicaNome: clinicaAtual?.clinica.nome ?? "Clínica",
        titulo: TITULOS.rateio,
        periodo: [periodo, descricaoFiltrosRateio(), comparar ? textoPeriodoComparado : ""]
          .filter(Boolean)
          .join(" · "),
        colunas: colunas.map((c) => ({ rotulo: c.rotulo, numerica: alinhaDireita(c) })),
        linhas: data.map((linha) => colunas.map((c) => celula(c, linha[c.chave]))),
        totais: rodapeRateio(colunas, t, tComp),
        resumo,
        composicao: {
          titulo: TITULO_COMPOSICAO,
          itens: receitaPorForma(res.cruas).map((f) => ({
            rotulo: f.rotulo,
            valor: brl(f.valor),
          })),
        },
      });
      return;
    }
    // Os totais vêm do `useMemo`, que só recalcula no próximo render; quando a
    // impressão é o PRIMEIRO clique (sem "Buscar" antes) esse render ainda não
    // aconteceu, então a folha é montada com os totais recalculados aqui.
    const somas: Record<string, number> = {};
    for (const c of colunas) if (c.somar) somas[c.chave] = 0;
    let receitas = 0;
    let despesas = 0;
    for (const linha of data) {
      for (const c of colunas) if (c.somar) somas[c.chave] += num(linha[c.chave]);
      const v = num(linha.valor);
      if (String(linha.tipo) === "despesa") despesas += v;
      else receitas += v;
    }
    const saldo = receitas - despesas;
    const totaisImpressos = colunas.map((c, i) => {
      if (c.somar) {
        return brl(tipo === "lancamentos" && c.chave === "valor" ? saldo : somas[c.chave]);
      }
      return i === 0 ? `${data.length.toLocaleString("pt-BR")} registro(s)` : "";
    });

    imprimirRelatorio({
      clinicaNome: clinicaAtual?.clinica.nome ?? "Clínica",
      titulo: TITULOS[tipo],
      periodo,
      colunas: colunas.map((c) => ({ rotulo: c.rotulo, numerica: alinhaDireita(c) })),
      linhas: data.map((linha) => colunas.map((c) => celula(c, linha[c.chave]))),
      totais: totaisImpressos,
      resumo:
        tipo === "lancamentos"
          ? [
              { rotulo: "Receitas", valor: brl(receitas) },
              { rotulo: "Despesas", valor: brl(despesas) },
              { rotulo: "Saldo do período", valor: brl(saldo) },
            ]
          : undefined,
    });
  };

  /** Serviços do combobox: seguem o grupo escolhido e a busca digitada. */
  const servicosFiltrados = useMemo(() => {
    if (!ctxRateio) return [];
    const alvo = normRepasse(buscaServico);
    const out: string[] = [];
    for (const s of ctxRateio.servicos) {
      if (rGrupo !== "todos" && s.grupo !== rGrupo) continue;
      if (alvo && !normRepasse(s.nome).includes(alvo)) continue;
      out.push(s.nome);
      if (out.length >= SERVICOS_VISIVEIS) break;
    }
    return out;
  }, [ctxRateio, rGrupo, buscaServico]);

  const deltaDe = (atual: number, anterior: number) =>
    comparacaoVisivel ? variacao(atual, anterior).percentual : undefined;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <FileBarChart className="h-6 w-6 text-primary" />
          Relatórios
        </h1>
        <p className="text-sm text-muted-foreground">
          Consulte na tela, imprima em A4 ou exporte em Excel/CSV para análise externa
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Gerar relatório</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Bloco 1 — o que buscar e em que período. O seletor de período é o
              mesmo componente do Dashboard/Estatísticas (Dia, Semana, Quinzena,
              Mês, Período): as abas aplicam o intervalo sozinhas e os campos de
              data só aparecem em "Período". */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-1.5 lg:w-72">
              <Label className={ROTULO}>Tipo de relatório</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as Tipo)}>
                <SelectTrigger className={CAMPO}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lancamentos">Lançamentos</SelectItem>
                  <SelectItem value="atendimentos">Atendimentos</SelectItem>
                  <SelectItem value="notas">Notas</SelectItem>
                  <SelectItem value="rateio">Rateio da Receita</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className={ROTULO}>Período</Label>
              <DateRangeFilter
                value={{ from, to }}
                preset={preset}
                onChange={(range, p) => {
                  setFrom(range.from);
                  setTo(range.to);
                  setPreset(p);
                }}
              />
            </div>
          </div>

          {tipo === "rateio" && (
            <>
              {/* Bloco 2 — recorte da base: quem atendeu e o que foi feito. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                <div className="space-y-1.5">
                  <Label className={ROTULO}>Profissional</Label>
                  <Select value={rMedico} onValueChange={setRMedico} disabled={!ctxRateio}>
                    <SelectTrigger className={CAMPO}>
                      <SelectValue placeholder={ctxCarregando ? "Carregando..." : "TODOS"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">TODOS</SelectItem>
                      {(ctxRateio?.medicos ?? []).map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className={ROTULO}>Especialidade</Label>
                  <Select
                    value={rEspecialidade}
                    onValueChange={setREspecialidade}
                    disabled={!ctxRateio}
                  >
                    <SelectTrigger className={CAMPO}>
                      <SelectValue placeholder={ctxCarregando ? "Carregando..." : "TODAS"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todas">TODAS</SelectItem>
                      {(ctxRateio?.especialidades ?? []).map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className={ROTULO}>Grupo de serviço</Label>
                  <Select
                    value={rGrupo}
                    onValueChange={(v) => {
                      setRGrupo(v);
                      // O serviço escolhido pode não pertencer ao novo grupo.
                      setRServico("todos");
                    }}
                    disabled={!ctxRateio}
                  >
                    <SelectTrigger className={CAMPO}>
                      <SelectValue placeholder={ctxCarregando ? "Carregando..." : "TODOS"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">TODOS</SelectItem>
                      {(ctxRateio?.grupos ?? []).map((g) => (
                        <SelectItem key={g.chave} value={g.chave}>
                          {g.rotulo}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className={ROTULO}>Serviço</Label>
                  <Popover open={servicoAberto} onOpenChange={setServicoAberto}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        className={cn("w-full justify-between font-normal", CAMPO)}
                        disabled={!ctxRateio}
                      >
                        <span className="truncate">
                          {rServico === "todos" ? "TODOS OS SERVIÇOS" : rServico}
                        </span>
                        <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="p-0 w-[min(var(--radix-popover-trigger-width),28rem)] max-w-[92vw]"
                      align="start"
                    >
                      {/* Filtro manual: o cadastro tem milhares de serviços e o
                          filtro embutido do Command percorreria todos a cada tecla. */}
                      <Command shouldFilter={false}>
                        <CommandInput
                          placeholder="Buscar serviço..."
                          value={buscaServico}
                          onValueChange={setBuscaServico}
                        />
                        <CommandList>
                          <CommandEmpty>Nenhum serviço encontrado.</CommandEmpty>
                          <CommandGroup>
                            <CommandItem
                              value="todos"
                              onSelect={() => {
                                setRServico("todos");
                                setServicoAberto(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  rServico === "todos" ? "opacity-100" : "opacity-0",
                                )}
                              />
                              TODOS OS SERVIÇOS
                            </CommandItem>
                            {servicosFiltrados.map((nome) => (
                              <CommandItem
                                key={nome}
                                value={nome}
                                onSelect={() => {
                                  setRServico(nome);
                                  setServicoAberto(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    rServico === nome ? "opacity-100" : "opacity-0",
                                  )}
                                />
                                <span className="truncate">{nome}</span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              {/* Bloco 3 — como o resultado é montado: o formato à esquerda, a
                  comparação à direita, separados por uma régua nas telas
                  largas. */}
              <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:gap-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:w-100 lg:shrink-0">
                    <div className="space-y-1.5">
                      <Label className={ROTULO}>Tipo</Label>
                      <Select value={rTipo} onValueChange={(v) => setRTipo(v as RateioTipo)}>
                        <SelectTrigger className={cn(CAMPO, "bg-white")}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="sintetico">SINTÉTICO</SelectItem>
                          <SelectItem value="analitico">ANALÍTICO</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className={ROTULO}>Agrupar por</Label>
                      <Select
                        value={rAgrupar}
                        onValueChange={(v) => setRAgrupar(v as RateioAgruparPor)}
                      >
                        <SelectTrigger className={cn(CAMPO, "bg-white")}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="data">DATA</SelectItem>
                          <SelectItem value="profissional">PROFISSIONAL</SelectItem>
                          <SelectItem value="especialidade">ESPECIALIDADE</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-1.5 lg:flex-1 lg:border-l lg:border-slate-200 lg:pl-4">
                    <Label className={ROTULO}>Comparação</Label>
                    <div className="flex flex-wrap items-center gap-2">
                      <Label
                        htmlFor="rateio-comparar"
                        className="flex h-10 cursor-pointer items-center gap-2 rounded-md border border-slate-200 bg-white px-3"
                      >
                        <Switch
                          id="rateio-comparar"
                          checked={comparar}
                          onCheckedChange={setComparar}
                        />
                        <span className="text-sm font-medium">Comparar com</span>
                      </Label>
                      <Select
                        value={modoComparacao}
                        onValueChange={(v) => setModoComparacao(v as ModoComparacao)}
                        disabled={!comparar}
                      >
                        <SelectTrigger className={cn(CAMPO, "w-full bg-white sm:w-72")}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="anterior">{ROTULO_COMPARACAO.anterior}</SelectItem>
                          <SelectItem value="ano-anterior">
                            {ROTULO_COMPARACAO["ano-anterior"]}
                          </SelectItem>
                          <SelectItem value="personalizado">
                            {ROTULO_COMPARACAO.personalizado}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      {comparar && modoComparacao === "personalizado" && (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm text-muted-foreground">De</span>
                          <DateInputBR
                            className={cn(CAMPO, "w-40 bg-white")}
                            value={compDe || from}
                            onChange={(e) => setCompDe(e.target.value)}
                          />
                          <span className="text-sm text-muted-foreground">até</span>
                          <DateInputBR
                            className={cn(CAMPO, "w-40 bg-white")}
                            value={compAte || to}
                            onChange={(e) => setCompAte(e.target.value)}
                          />
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {comparar
                        ? `${textoPeriodoComparado}. A comparação aparece nas colunas do relatório sintético e nos cards de fechamento.`
                        : "Ligue para ver quanto a receita subiu ou caiu contra outro período."}
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Bloco 4 — ação principal à esquerda, saídas do relatório à direita. */}
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
            <Button
              onClick={buscar}
              disabled={loading || !clinicaAtual}
              className="bg-primary font-medium text-primary-foreground shadow-sm hover:opacity-90"
            >
              <Search className="h-4 w-4 mr-2" />
              {loading ? "Buscando..." : "Buscar"}
            </Button>
            <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
              <span aria-hidden className="hidden h-6 w-px bg-slate-200 sm:block" />
              <Button
                variant="outline"
                className="border-slate-200"
                onClick={baixarExcel}
                disabled={loading || !clinicaAtual}
              >
                <FileSpreadsheet className="h-4 w-4 mr-2 text-emerald-600" />
                Baixar Excel
              </Button>
              <Button
                variant="outline"
                className="border-slate-200"
                onClick={imprimir}
                disabled={loading || !clinicaAtual}
              >
                <Printer className="h-4 w-4 mr-2 text-slate-500" />
                Imprimir
              </Button>
              <Button
                variant="ghost"
                className="text-slate-600 hover:text-slate-900"
                onClick={baixarCsv}
                disabled={loading || !clinicaAtual}
              >
                <Download className="h-4 w-4 mr-2" />
                Baixar CSV
              </Button>
            </div>
          </div>
          {tipo === "rateio" && (
            <p className="text-xs text-muted-foreground">
              Considera os atendimentos do período (mesma base da aba Atendimentos). Mensalidades de
              cartão, adesões e recebimentos avulsos não entram, porque não têm prestador a
              repassar.
            </p>
          )}
        </CardContent>
      </Card>

      {tipo === "rateio" && atualizado && linhas.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <CardResumo
            titulo="Atendimentos"
            valor={totaisR.qtd.toLocaleString("pt-BR")}
            detalhe={
              comparacaoVisivel ? `${totaisComp.qtd.toLocaleString("pt-BR")} antes` : undefined
            }
            delta={deltaDe(totaisR.qtd, totaisComp.qtd)}
          />
          <CardResumo
            titulo="Receita bruta"
            valor={brl(totaisR.receita)}
            detalhe={comparacaoVisivel ? `${brl(totaisComp.receita)} antes` : undefined}
            delta={deltaDe(totaisR.receita, totaisComp.receita)}
            composicao={fatiasReceita}
          />
          <CardResumo
            titulo="Repasse ao prestador"
            valor={brl(totaisR.repasse)}
            detalhe={comparacaoVisivel ? `${brl(totaisComp.repasse)} antes` : undefined}
            delta={deltaDe(totaisR.repasse, totaisComp.repasse)}
            invertido
          />
          <CardResumo
            titulo="Líquido da clínica"
            valor={brl(totaisR.liquido)}
            detalhe={`Margem de ${pct(totaisR.margem)}`}
            delta={deltaDe(totaisR.liquido, totaisComp.liquido)}
          />
        </div>
      )}

      {atualizado && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
            <div className="space-y-1">
              <CardTitle>
                {TITULOS[tipo]} — {fmtDate(from)} a {fmtDate(to)}
              </CardTitle>
              {comparacaoVisivel && (
                <p className="text-xs text-muted-foreground">{textoPeriodoComparado}</p>
              )}
            </div>
            <span className="text-sm text-muted-foreground">
              {linhas.length.toLocaleString("pt-BR")} registro(s)
            </span>
          </CardHeader>
          <CardContent className="space-y-3">
            {linhas.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Nenhum registro no período selecionado.
              </p>
            ) : (
              <>
                {/* A tabela do rateio comparado passa de dez colunas: em tela
                    estreita ela rola dentro do card, sem espremer os valores. */}
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {colunas.map((c) => (
                          <TableHead
                            key={c.chave}
                            className={alinhaDireita(c) ? "text-right" : undefined}
                          >
                            {c.rotulo}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {linhasDaPagina.map((linha, i) => (
                        <TableRow key={inicio + i}>
                          {colunas.map((c) => (
                            <TableCell
                              key={c.chave}
                              className={cn(
                                alinhaDireita(c) && "text-right whitespace-nowrap tabular-nums",
                                ehVariacao(c) && `font-medium ${corDaVariacao(linha[c.chave])}`,
                                // Linha que só existe no período comparado: o
                                // agrupador some do período atual, e o cinza
                                // evita ler zero como se fosse produção real.
                                linha.somenteAnterior === true && "text-muted-foreground",
                              )}
                            >
                              {celula(c, linha[c.chave])}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        {colunas.map((c, i) => (
                          <TableCell
                            key={c.chave}
                            className={
                              alinhaDireita(c)
                                ? "text-right whitespace-nowrap tabular-nums font-bold"
                                : "font-bold"
                            }
                          >
                            {rodape[i]}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>

                {tipo === "lancamentos" && (
                  <div className="ml-auto w-full sm:w-72 text-sm space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Receitas</span>
                      <span className="font-medium tabular-nums">{brl(totais.receitas)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Despesas</span>
                      <span className="font-medium tabular-nums">{brl(totais.despesas)}</span>
                    </div>
                    <div className="flex justify-between border-t pt-1">
                      <span className="font-semibold">Saldo do período</span>
                      <span className="font-bold tabular-nums">{brl(totais.saldo)}</span>
                    </div>
                  </div>
                )}

                {totalPaginas > 1 && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-muted-foreground">
                      Mostrando {(inicio + 1).toLocaleString("pt-BR")}–
                      {Math.min(inicio + POR_PAGINA, linhas.length).toLocaleString("pt-BR")} de{" "}
                      {linhas.length.toLocaleString("pt-BR")}
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPagina((p) => Math.max(1, p - 1))}
                        disabled={paginaAtual <= 1}
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Anterior
                      </Button>
                      <span className="text-sm tabular-nums">
                        {paginaAtual} / {totalPaginas}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                        disabled={paginaAtual >= totalPaginas}
                      >
                        Próxima
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
