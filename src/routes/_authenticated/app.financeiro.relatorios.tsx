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
 * próprios (profissional, especialidade, grupo/tipo/serviço), comparação com outro
 * período e cards de fechamento. A conta em si vive em
 * `@/lib/financeiro/rateio-receita`; os períodos, em
 * `@/lib/financeiro/periodos`.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Download,
  FileBarChart,
  FileSpreadsheet,
  Minus,
  PhoneCall,
  Printer,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { brl, fmtDate } from "@/lib/financeiro/format";
import { imprimirRelatorio } from "@/lib/print-relatorio-financeiro";
import type { AssinaturaRelatorio } from "@/lib/print-relatorio-base";
import { exportarPastaXlsx, exportarRelatorioXlsx, type ColunaXlsx } from "@/lib/exportar-xlsx";
// Relatório de Movimentação Financeira: a regra das duas visões vive no módulo
// puro `extrato-caixa`; o acesso ao banco, em `extrato-carregar`.
import {
  categoriaDaLinha,
  categoriasPresentes,
  CATEGORIA_TRANSFERENCIA,
  colunasExtrato,
  fatiasDeEntrada,
  linhasExtrato,
  resumoPorForma,
  totaisExtrato,
  type MovimentacaoExtrato,
  type TotaisExtrato,
} from "@/lib/financeiro/extrato-caixa";
import { carregarMovimentacao } from "@/lib/financeiro/extrato-carregar";
// Seletor de Categoria: o recorte que o financeiro usa para auditar uma conta
// de cada vez. A regra é a mesma nos dois relatórios que o oferecem, e por isso
// mora num módulo puro só dela.
import {
  chaveCategoria,
  descricaoSelecao,
  filtrarPorCategoria,
  opcoesDeCategoria,
  rotuloSelecao,
  SEM_CATEGORIA,
} from "@/lib/financeiro/filtro-categoria";
import { carregarCategorias, type CategoriaFinanceira } from "@/lib/financeiro/categorias-carregar";
// Sessões e Manutenções: a folha junta o pacote fechado da fisioterapia com o
// ciclo mensal da ortodontia. A regra que separa os dois (e que impede a
// manutenção de virar dívida acumulada) vive no módulo puro `relatorio-sessoes`;
// o acesso ao banco, em `carregar-sessoes`.
import {
  colunasSessoes,
  modoDoFiltro,
  linhasSessoes,
  resumoSessoes,
  ROTULO_FILTRO,
  filtrarSessoes,
  totaisSessoes,
  type FiltroSessoes,
  type LinhaSessao,
  type TotaisSessoes,
} from "@/lib/sessoes/relatorio-sessoes";
import { carregarSessoes } from "@/lib/sessoes/carregar-sessoes";
// Busca ativa: o relatório diz QUEM sumiu; estes três recursos são o que a
// recepção faz com a lista sem sair da tela — ver o contato, marcar a próxima
// e anotar o que já foi tentado.
import {
  COR_RESULTADO,
  referenciaDaPosicao,
  ROTULO_RESULTADO_CURTO,
  ultimoContatoPorPaciente,
  type ContatoBuscaAtiva,
} from "@/lib/sessoes/busca-ativa-contatos";
import { carregarContatos } from "@/lib/sessoes/carregar-contatos";
import {
  ContatoPacienteDrawer,
  type PacienteDaLista,
} from "@/components/sessoes/contato-paciente-drawer";
import {
  RegistrarContatoDialog,
  type AlvoDoContato,
} from "@/components/sessoes/registrar-contato-dialog";
import { useAcessoModulo } from "@/hooks/use-permissoes";
import {
  agruparRateio,
  carregarContextoRateio,
  carregarRateio,
  categoriasDoRateio,
  compararRateio,
  rotuloTipo,
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

type Tipo = "lancamentos" | "atendimentos" | "notas" | "rateio" | "movimentacao" | "sessoes";

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
const COLUNAS: Record<Exclude<Tipo, "rateio" | "movimentacao" | "sessoes">, Coluna[]> = {
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
    // Substituiu "Série": na `nfse` a série vem sempre vazia, então a coluna
    // saía com um traço em todas as linhas. O tomador é quem está impresso na
    // nota e é por ele que o financeiro procura quando confere.
    { chave: "tomador_nome", rotulo: "Tomador", formato: "texto" },
    { chave: "valor_servicos", rotulo: "Valor", formato: "moeda", somar: true },
    { chave: "status", rotulo: "Status", formato: "texto" },
  ],
};

const TITULOS: Record<Tipo, string> = {
  lancamentos: "Lançamentos",
  atendimentos: "Atendimentos",
  notas: "Notas de pacientes",
  rateio: "Rateio da Receita",
  movimentacao: "Movimentação Financeira",
  sessoes: "Sessões e Manutenções",
};

/**
 * Quem assina a folha impressa.
 *
 * Todo relatório sai com espaço para a firma de quem conferiu, porque o papel
 * é arquivado como comprovante da conferência. O rateio leva uma segunda
 * linha: ele também é entregue ao profissional, que confere a própria
 * produção antes de receber, e a assinatura do financeiro sozinha não prova
 * que ele viu o cálculo.
 */
const ASSINATURAS_PADRAO: AssinaturaRelatorio[] = [{ cargo: "Responsável Financeiro" }];
const ASSINATURAS_RATEIO: AssinaturaRelatorio[] = [
  { cargo: "Médico / Profissional" },
  { cargo: "Responsável Financeiro" },
];

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
        : agruparPor === "servico"
          ? l.servico_nome
          : agruparPor === "tipo"
            ? l.tipo_servico
            : agruparPor === "condicao"
              ? l.condicao
              : l.data;
  return [...linhas].sort(
    (a, b) => chave(a).localeCompare(chave(b), "pt-BR") || a.data.localeCompare(b.data),
  );
}

/** Formata uma célula para a tela e para o papel (o Excel leva o valor cru). */
function celula(coluna: Coluna, valor: unknown): string {
  if (coluna.formato === "moeda") return brl(num(valor));
  // `moeda-opcional`: vazio é vazio, não R$ 0,00. Ver o comentário do formato
  // em `rateio-colunas.ts` — é o que mantém legível o extrato onde cada linha
  // preenche Valor Pago OU Valor Recebido.
  if (coluna.formato === "moeda-opcional") {
    return valor === null || valor === undefined || valor === "" ? "" : brl(num(valor));
  }
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
  if (c.formato === "moeda" || c.formato === "variacao-moeda" || c.formato === "moeda-opcional") {
    return "moeda";
  }
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

/**
 * Seletor de Categoria da barra de filtros.
 *
 * É multi-escolha porque a conferência raramente é de uma conta só — "quero
 * PARTICULAR e EXAME CARTAO CONSULTA juntos" é o pedido comum. Por isso clicar
 * numa opção MARCA e DESMARCA sem fechar a lista; só "TODAS AS CATEGORIAS",
 * que limpa a seleção, fecha, porque ali a escolha terminou.
 *
 * A seleção vazia é "todas" (ver `filtro-categoria`), então a tela nasce
 * mostrando o relatório completo e ninguém precisa marcar nada para usá-la
 * como sempre usou.
 */
function SeletorCategorias({
  opcoes,
  valor,
  onChange,
  desabilitado,
  placeholder,
}: {
  /** Nomes já normalizados em caixa alta, na ordem em que devem aparecer. */
  opcoes: string[];
  valor: string[];
  onChange: (valor: string[]) => void;
  desabilitado?: boolean;
  placeholder?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const alternar = (nome: string) => {
    const chave = chaveCategoria(nome);
    onChange(valor.includes(chave) ? valor.filter((c) => c !== chave) : [...valor, chave]);
  };
  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className={cn("w-full justify-between font-normal", CAMPO)}
          disabled={desabilitado}
        >
          <span className="truncate">
            {desabilitado ? (placeholder ?? "Carregando...") : rotuloSelecao(valor)}
          </span>
          <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 w-[min(var(--radix-popover-trigger-width),24rem)] max-w-[92vw]"
        align="start"
      >
        <Command>
          <CommandInput placeholder="Buscar categoria..." />
          <CommandList>
            <CommandEmpty>Nenhuma categoria encontrada.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="TODAS AS CATEGORIAS"
                onSelect={() => {
                  onChange([]);
                  setAberto(false);
                }}
              >
                <Check
                  className={cn("mr-2 h-4 w-4", valor.length === 0 ? "opacity-100" : "opacity-0")}
                />
                TODAS AS CATEGORIAS
              </CommandItem>
              {opcoes.map((nome) => (
                <CommandItem key={nome} value={nome} onSelect={() => alternar(nome)}>
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      valor.includes(nome) ? "opacity-100" : "opacity-0",
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
  // Tipo de serviço (CONSULTA / EXAME / PROCEDIMENTO). É o filtro que separa a
  // consulta do exame de um mesmo profissional — o Grupo de serviço não faz
  // isso: em oftalmologia, consulta e exames estão todos no grupo
  // "OFTALMOLOGIA". Não confundir com `rTipo`, que é sintético/analítico.
  const [rTipoServico, setRTipoServico] = useState("todos");
  const [rServico, setRServico] = useState("todos");
  const [rTipo, setRTipo] = useState<RateioTipo>("sintetico");
  const [rAgrupar, setRAgrupar] = useState<RateioAgruparPor>("data");
  const [servicoAberto, setServicoAberto] = useState(false);
  const [buscaServico, setBuscaServico] = useState("");
  // --- Filtro de Categoria (Rateio e Movimentação Financeira) --------------
  // Recorte da MESMA lista carregada, como o sintético/analítico: marcar ou
  // desmarcar uma categoria refaz a tabela, os totais e os cards na hora, sem
  // ir ao banco de novo. Lista vazia = todas as categorias.
  const [categorias, setCategorias] = useState<string[]>([]);
  /** Cadastro de Financeiro → Categorias, para o seletor da Movimentação. */
  const [cadastroCategorias, setCadastroCategorias] = useState<CategoriaFinanceira[]>([]);
  const [catCarregando, setCatCarregando] = useState(false);
  const cadastroPedido = useRef(false);
  // --- Filtro exclusivo de Sessões e Manutenções ---------------------------
  // Recorte da MESMA lista carregada, como o sintético/analítico do extrato:
  // trocar de "Tudo" para "Busca ativa" não vai ao banco de novo.
  const [sFiltro, setSFiltro] = useState<FiltroSessoes>("todos");

  // --- Busca ativa: contato, agendamento e histórico -----------------------
  // Registrar contato é ato de recepção, mas a tela mora no Financeiro. Vale a
  // escrita em qualquer um dos três módulos que já abrem o relatório, que é
  // exatamente a régua da policy da tabela `busca_ativa_contatos`.
  const acessoRecepcao = useAcessoModulo("recepcao");
  const acessoFinanceiro = useAcessoModulo("financeiro");
  const acessoRelatorios = useAcessoModulo("relatorios");
  const podeRegistrarContato =
    acessoRecepcao === "write" || acessoFinanceiro === "write" || acessoRelatorios === "write";
  /** Paciente cujo painel de contato está aberto (clique no nome). */
  const [pacienteAberto, setPacienteAberto] = useState<PacienteDaLista | null>(null);
  /** Paciente do modal "Registrar contato". */
  const [alvoContato, setAlvoContato] = useState<AlvoDoContato | null>(null);
  const [contatos, setContatos] = useState<ContatoBuscaAtiva[]>([]);
  /** Sobe a cada gravação para o efeito reler o histórico. */
  const [contatosVersao, setContatosVersao] = useState(0);

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
    /** Movimentações cruas do extrato, pelo mesmo motivo: trocar entre
     *  sintético e analítico é um recorte da mesma lista, não outra consulta. */
    movimentacao?: MovimentacaoExtrato[];
    /** Linhas cruas de sessões/manutenções: o filtro é recorte em memória. */
    sessoes?: LinhaSessao[];
  } | null>(null);

  // "Agrupar por", "Sintético/Analítico" e "Categoria" são recortes do MESMO
  // resultado, então ficam fora da chave: trocar qualquer um deles reorganiza a
  // tabela na hora, sem ir ao banco de novo. O período de comparação, não: ele
  // é outra consulta.
  // "Movimento do período" é a única opção do seletor de Sessões que muda a
  // CONSULTA, e não o recorte: ela responde outra pergunta, com outra janela de
  // datas. Por isso entra na chave — sem isso, alternar entre posição e
  // movimento reaproveitaria o resultado já carregado, que é do outro modo.
  /**
   * Data de referência da visão de posição.
   *
   * A tela abre no mês corrente, cujo fim é uma data FUTURA — no dia 05 o
   * período vai até o dia 30. Mandando o dia 30 ao banco, a coluna "Dias
   * parado" contava 25 dias que ainda não passaram (um paciente visto em 09/07
   * aparecia com 83 dias de atraso quando o real era 58) e quem já tinha
   * remarcado para o dia 20 continuava listado como "sem agendamento", porque o
   * banco só reconhece como próxima data o que cai DEPOIS da referência.
   *
   * No modo movimento a data continua sendo a digitada: lá ela é janela fechada
   * de produção, e encolhê-la esconderia atendimento já realizado.
   */
  const hojeISO = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`;
  })();
  const ateSessoes = modoDoFiltro(sFiltro) === "posicao" ? referenciaDaPosicao(to, hojeISO) : to;

  const chaveAtual =
    tipo === "sessoes"
      ? `sessoes|${from}|${ateSessoes}|${modoDoFiltro(sFiltro)}`
      : tipo === "rateio"
        ? [
            "rateio",
            from,
            to,
            rMedico,
            rEspecialidade,
            rGrupo,
            rTipoServico,
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

  /**
   * Cadastro de categorias para o seletor da Movimentação Financeira. O Rateio
   * não passa por aqui: as categorias dele já vêm dentro do contexto acima,
   * carregado junto com médicos, especialidades e serviços.
   *
   * Mesmo `ref` de guarda do contexto do rateio, pelo mesmo motivo: sem ele
   * uma falha de rede deixaria o efeito num ciclo de tentativas.
   */
  useEffect(() => {
    if (tipo !== "movimentacao" || !clinicaAtual) {
      cadastroPedido.current = false;
      return;
    }
    if (cadastroCategorias.length > 0 || cadastroPedido.current) return;
    cadastroPedido.current = true;
    let cancelado = false;
    setCatCarregando(true);
    carregarCategorias(clinicaAtual.clinica_id)
      .then((lista) => {
        if (!cancelado) setCadastroCategorias(lista);
      })
      .catch((e) => {
        if (!cancelado) mostrarErro(e);
      })
      .finally(() => {
        if (!cancelado) setCatCarregando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [tipo, clinicaAtual, cadastroCategorias]);

  /**
   * Trocar de relatório zera a seleção de categorias.
   *
   * As listas não são as mesmas: o Rateio só vê categorias de receita, a
   * Movimentação vê também as de despesa e a transferência entre caixas. Sem
   * zerar, quem tivesse marcado REPASSE MEDICO na Movimentação passaria para o
   * Rateio e veria uma tela vazia sem entender por quê.
   */
  useEffect(() => {
    setCategorias([]);
  }, [tipo]);

  /** Linhas cruas do rateio, já recortadas pelas categorias escolhidas. */
  const linhasRateio = useMemo(
    () =>
      filtrarPorCategoria(
        atualizado && resultado?.rateio ? resultado.rateio : [],
        categorias,
        (l) => l.categoria_nome,
      ),
    [atualizado, resultado, categorias],
  );
  /** Movimentações cruas do extrato; base dos totais e das duas visões. */
  const movsExtrato = useMemo(
    () =>
      filtrarPorCategoria(
        atualizado && resultado?.movimentacao ? resultado.movimentacao : [],
        categorias,
        categoriaDaLinha,
      ),
    [atualizado, resultado, categorias],
  );
  const totaisM = useMemo(() => totaisExtrato(movsExtrato), [movsExtrato]);
  /** Linhas cruas de sessões; base dos totais e do filtro em memória. */
  const sessoesCruas = useMemo(
    () => (atualizado && resultado?.sessoes ? resultado.sessoes : []),
    [atualizado, resultado],
  );
  /**
   * Os totais do quadro saem do que está FILTRADO na tela. Diferente do
   * extrato, aqui o filtro não é uma outra visão do mesmo conjunto: escolher
   * "Busca ativa" é escolher outro conjunto de pacientes, e um rodapé com o
   * total geral em cima de 12 linhas visíveis confundiria quem confere.
   */
  const totaisS = useMemo(
    () => totaisSessoes(filtrarSessoes(sessoesCruas, sFiltro)),
    [sessoesCruas, sFiltro],
  );
  /**
   * As mesmas linhas da tabela, mas CRUAS.
   *
   * A tabela é genérica e trabalha com registros já formatados, que não
   * carregam `paciente_id` — e não podem carregar: o CSV é montado a partir das
   * chaves do primeiro registro, então qualquer campo extra vira uma coluna de
   * ids na planilha do financeiro. Como `linhasSessoes` aplica exatamente este
   * mesmo filtro e nesta mesma ordem, a linha `i` da tabela é a linha `i` daqui,
   * e é assim que o clique no nome sabe de qual paciente se trata.
   */
  const sessoesFiltradas = useMemo(
    () => filtrarSessoes(sessoesCruas, sFiltro),
    [sessoesCruas, sFiltro],
  );

  /**
   * Histórico de contato dos pacientes que estão na lista.
   *
   * Carregado à parte do relatório porque muda por outro motivo: o relatório só
   * recarrega ao clicar em "Buscar", enquanto o contato acabou de ser
   * registrado na linha ao lado e tem que aparecer na hora.
   */
  useEffect(() => {
    if (tipo !== "sessoes" || !clinicaAtual || sessoesFiltradas.length === 0) {
      setContatos([]);
      return;
    }
    let cancelado = false;
    void (async () => {
      try {
        const lista = await carregarContatos(
          clinicaAtual.clinica_id,
          sessoesFiltradas.map((l) => l.paciente_id),
        );
        if (!cancelado) setContatos(lista);
      } catch {
        // Silencioso de propósito: o relatório em si continua válido sem a
        // coluna de contatos, e um toast de erro a cada busca atrapalharia a
        // conferência do financeiro, que não usa essa coluna.
        if (!cancelado) setContatos([]);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [tipo, clinicaAtual?.clinica_id, sessoesFiltradas, contatosVersao]);

  const contatoPorPaciente = useMemo(() => ultimoContatoPorPaciente(contatos), [contatos]);

  /** A tabela ganha as colunas de ação só na visão de posição, que é a da recepção. */
  const mostrarAcoes = tipo === "sessoes" && modoDoFiltro(sFiltro) === "posicao";

  /** Uma linha do relatório traduzida para o que os painéis de contato pedem. */
  const pacienteDaLinha = (i: number): PacienteDaLista | null => {
    const l = sessoesFiltradas[i];
    if (!l) return null;
    return {
      pacienteId: l.paciente_id,
      pacienteNome: l.paciente_nome,
      origem: l.origem,
      procedimento: l.procedimento,
      profissional: l.profissional,
      ultimaData: l.ultima_data,
      diasParado: l.dias_parado,
    };
  };

  /**
   * "Agendar próxima" leva para a Agenda com o paciente, o serviço e o dia já
   * escolhidos. Marcar dentro do relatório exigiria repetir aqui a grade do
   * médico, os encaixes e as travas de horário — e uma segunda implementação
   * dessas regras é como nasce agendamento em horário que não existe.
   *
   * O dia sugerido é hoje: a manutenção já está atrasada, então o que a recepção
   * negocia ao telefone é a primeira data possível, não uma data do ciclo.
   */
  const irParaAgenda = (p: PacienteDaLista) => {
    const hoje = new Date();
    const dia = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(
      hoje.getDate(),
    ).padStart(2, "0")}`;
    const q = new URLSearchParams({
      novo: "1",
      novoPacId: p.pacienteId,
      novoPacNome: p.pacienteNome,
      novoData: dia,
      novoProc: p.procedimento,
    });
    // Navegação de página inteira, e não do roteador: a Agenda lê estes
    // parâmetros uma única vez, num efeito protegido por `useRef`, que só volta
    // a valer quando a tela monta do zero. Entrar por aqui garante isso.
    window.location.assign(`/app/agenda?${q.toString()}`);
  };
  /**
   * Quebra das entradas por forma, no card "Recebido". Sai das movimentações
   * cruas, e não das linhas da tabela: trocar de sintético para analítico muda
   * a apresentação, nunca quanto entrou em cada forma.
   */
  const fatiasDoExtrato = useMemo(() => fatiasDeEntrada(movsExtrato), [movsExtrato]);
  /** Sangrias + suprimentos do período: o que só trocou de custódia. */
  const custodiaDoExtrato = totaisM.transferSaida + totaisM.transferEntrada;
  const linhasRateioComp = useMemo(
    () =>
      filtrarPorCategoria(
        atualizado && resultado?.rateioComp ? resultado.rateioComp : [],
        categorias,
        (l) => l.categoria_nome,
      ),
    [atualizado, resultado, categorias],
  );
  /** Só estes dois relatórios têm categoria em cada linha. */
  const usaCategoria = tipo === "rateio" || tipo === "movimentacao";

  /**
   * Opções do seletor: o cadastro de Financeiro → Categorias somado ao que
   * apareceu no período JÁ CARREGADO (sempre a lista crua, nunca a filtrada —
   * senão marcar uma categoria apagaria as outras do próprio seletor).
   *
   * Os rótulos deduzidos entram fixos porque não existem no cadastro: a
   * transferência entre caixas (sangria e suprimento) e o `(SEM CATEGORIA)`,
   * que é onde caem os lançamentos sem `categoria_id` e os atendimentos
   * digitados à mão.
   */
  const opcoesCategoria = useMemo(() => {
    if (tipo === "rateio") {
      return opcoesDeCategoria(
        (ctxRateio?.categorias ?? []).map((c) => c.nome),
        [SEM_CATEGORIA, ...categoriasDoRateio(resultado?.rateio ?? [])],
      );
    }
    if (tipo === "movimentacao") {
      return opcoesDeCategoria(
        cadastroCategorias.map((c) => c.nome),
        [
          CATEGORIA_TRANSFERENCIA,
          SEM_CATEGORIA,
          ...categoriasPresentes(resultado?.movimentacao ?? []),
        ],
      );
    }
    return [];
  }, [tipo, ctxRateio, cadastroCategorias, resultado]);

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
    // As duas visões do extrato saem da mesma lista carregada: trocar de
    // sintético para analítico reorganiza a tabela na hora, sem ir ao banco.
    if (resultado.tipo === "movimentacao") return linhasExtrato(movsExtrato, rTipo);
    // Mesmo princípio: o filtro de sessões recorta a lista já carregada.
    if (resultado.tipo === "sessoes") return linhasSessoes(sessoesCruas, sFiltro);
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
    movsExtrato,
    sessoesCruas,
    sFiltro,
    rTipo,
    rAgrupar,
    comparacaoVisivel,
    periodoComp.de,
  ]);

  const colunas = useMemo(
    () =>
      tipo === "rateio"
        ? colunasRateio(rTipo, rAgrupar, comparacaoVisivel)
        : tipo === "movimentacao"
          ? colunasExtrato(rTipo)
          : tipo === "sessoes"
            ? colunasSessoes(modoDoFiltro(sFiltro))
            : COLUNAS[tipo],
    [tipo, rTipo, rAgrupar, comparacaoVisivel, sFiltro],
  );

  // A troca de agrupamento (ou de categoria) pode encurtar a lista; voltar para
  // a primeira página evita a tela em branco de uma página que não existe mais.
  useEffect(() => {
    setPagina(1);
  }, [rTipo, rAgrupar, sFiltro, categorias]);

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

  /**
   * Rodapé do extrato.
   *
   * Vem dos totais do período INTEIRO (`totaisExtrato`), e não da soma das
   * linhas exibidas: é isso que faz o sintético e o analítico mostrarem
   * exatamente o mesmo rodapé. Quem confere usa essa igualdade para saber que
   * nenhuma linha ficou de fora ao trocar de visão.
   */
  const rodapeExtrato = (cols: Coluna[], t: TotaisExtrato) =>
    cols.map((c, i) => {
      if (c.chave === "qtd") return t.qtd.toLocaleString("pt-BR");
      if (c.chave === "pago") return brl(t.pago);
      if (c.chave === "recebido") return brl(t.recebido);
      if (c.chave === "saldo") return brl(t.saldo);
      if (i === 0) return "TOTAL GERAL";
      // No analítico a contagem não tem coluna própria; fica ao lado do rótulo.
      return i === 1 && rTipo === "analitico"
        ? `${t.qtd.toLocaleString("pt-BR")} movimentação(ões)`
        : "";
    });

  /**
   * Rodapé de Sessões e Manutenções.
   *
   * "Contratado" e "A fazer" somam SÓ os pacotes: a manutenção ortodôntica não
   * tem valor contratado nem sessão a fazer, e deixá-la entrar na conta
   * inventaria um compromisso que a clínica não assumiu.
   */
  const rodapeSessoes = (cols: Coluna[], t: TotaisSessoes) =>
    cols.map((c, i) => {
      // `faltasColuna` e não `faltasPacote`: o rodapé tem que fechar com a
      // soma do que está impresso na coluna, que traz as duas naturezas.
      if (c.chave === "faltas") return t.faltasColuna.toLocaleString("pt-BR");
      if (c.chave === "restantes") return t.sessoesRestantes.toLocaleString("pt-BR");
      if (c.chave === "valor_contratado") return brl(t.contratado);
      if (c.chave === "valor_pago") return brl(t.recebido);
      if (i === 0) return `${t.linhas.toLocaleString("pt-BR")} registro(s)`;
      return i === 1 ? `${t.buscaAtiva.toLocaleString("pt-BR")} sem agendamento` : "";
    });

  /** Mesmo rodapé com números crus, para o Excel conseguir somar a coluna. */
  const rodapeSessoesXlsx = (cols: Coluna[], t: TotaisSessoes) =>
    cols.map((c, i) => {
      if (c.chave === "faltas") return t.faltasColuna;
      if (c.chave === "restantes") return t.sessoesRestantes;
      if (c.chave === "valor_contratado") return t.contratado;
      if (c.chave === "valor_pago") return t.recebido;
      return i === 0 ? `${t.linhas.toLocaleString("pt-BR")} registro(s)` : "";
    });

  /**
   * Quadro de fechamento do extrato, igual na tela, no papel e na planilha.
   *
   * Entradas, saídas e saldo são os do RESULTADO — só o dinheiro que de fato
   * entrou ou saiu da clínica. Sangria e suprimento ganham linha própria,
   * porque são o mesmo dinheiro trocando de custódia: contá-los como despesa
   * fazia o saldo do dia despencar sem ninguém ter gasto nada.
   *
   * As linhas de custódia só aparecem quando houve alguma, e são elas que
   * fecham a conta entre este quadro e o TOTAL GERAL do rodapé da tabela, que
   * soma a coluna inteira (saídas reais MAIS sangrias).
   */
  const resumoDoExtrato = (t: TotaisExtrato) => {
    const itens = [
      { rotulo: "Movimentações", valor: t.qtd.toLocaleString("pt-BR") },
      { rotulo: "Total recebido (entradas)", valor: brl(t.receitas) },
      { rotulo: "Total pago (saídas reais)", valor: brl(t.despesas) },
      { rotulo: "Saldo do período", valor: brl(t.resultado) },
    ];
    if (t.transferSaida) {
      itens.push({ rotulo: "Sangrias (troca de custódia)", valor: brl(t.transferSaida) });
    }
    if (t.transferEntrada) {
      itens.push({ rotulo: "Suprimentos (troca de custódia)", valor: brl(t.transferEntrada) });
    }
    return itens;
  };

  /** Rodapé da tabela: contagem na 1ª coluna e a soma em cada coluna de dinheiro. */
  const rodape =
    tipo === "rateio"
      ? rodapeRateio(colunas, totaisR, totaisComp)
      : tipo === "movimentacao"
        ? rodapeExtrato(colunas, totaisM)
        : tipo === "sessoes"
          ? rodapeSessoes(colunas, totaisS)
          : colunas.map((c, i) => {
              if (c.somar) {
                // Em Lançamentos, somar receita com despesa não daria dinheiro nenhum:
                // o consolidado da coluna é o saldo do período.
                const valor =
                  tipo === "lancamentos" && c.chave === "valor"
                    ? totais.saldo
                    : totais.somas[c.chave];
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

  /**
   * Mesma linha de totais do extrato, com números crus: na planilha o total
   * tem que continuar sendo número, senão o Excel não soma a coluna.
   */
  const rodapeExtratoXlsx = (cols: Coluna[], t: TotaisExtrato) => {
    const porChave: Record<string, number> = {
      qtd: t.qtd,
      pago: t.pago,
      recebido: t.recebido,
      saldo: t.saldo,
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
    if (rTipoServico !== "todos") partes.push(`Tipo de serviço: ${rTipoServico}`);
    if (rServico !== "todos") partes.push(`Serviço: ${rServico}`);
    // Sem esta linha, uma folha com o total menor circula sem dizer por que o
    // total é menor — que é exatamente a dúvida de quem confere.
    if (categorias.length > 0) partes.push(descricaoSelecao(categorias));
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
    movs: MovimentacaoExtrato[];
    sessoes: LinhaSessao[];
  } | null> => {
    if (!clinicaAtual) return null;
    if (atualizado && resultado) {
      return {
        linhas,
        cruas: linhasRateio,
        cruasComp: linhasRateioComp,
        movs: movsExtrato,
        sessoes: sessoesCruas,
      };
    }
    if (tipo === "rateio" && !ctxRateio) {
      toast.info("Carregando o cadastro de médicos e serviços — tente de novo em instantes");
      return null;
    }
    setLoading(true);
    let data: Linha[] = [];
    // `cruas*` e `movs` são o que a tela, o papel e a planilha usam: já
    // recortados pelas categorias escolhidas. `brutas*` é o que fica guardado
    // no resultado — sem recorte —, para que marcar e desmarcar categoria
    // continue sendo um recorte em memória e não uma ida ao banco.
    let brutasRateio: RateioLinha[] | undefined;
    let brutasComp: RateioLinha[] | undefined;
    let brutasMovs: MovimentacaoExtrato[] | undefined;
    let cruas: RateioLinha[] | undefined;
    let cruasComp: RateioLinha[] | undefined;
    let movs: MovimentacaoExtrato[] | undefined;
    let sessoes: LinhaSessao[] | undefined;
    try {
      if (tipo === "rateio" && ctxRateio) {
        const filtrosComuns = {
          clinicaId: clinicaAtual.clinica_id,
          medicoId: rMedico === "todos" ? null : rMedico,
          especialidadeId: rEspecialidade === "todas" ? null : rEspecialidade,
          grupo: rGrupo === "todos" ? null : rGrupo,
          tipo: rTipoServico === "todos" ? null : rTipoServico,
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
        brutasRateio = atual;
        brutasComp = anterior;
        cruas = filtrarPorCategoria(atual, categorias, (l) => l.categoria_nome);
        cruasComp = filtrarPorCategoria(anterior, categorias, (l) => l.categoria_nome);
        if (rTipo === "analitico") {
          data = ordenarAnalitico(cruas, rAgrupar) as unknown as Linha[];
        } else {
          const grupos = agruparRateio(cruas, rAgrupar);
          data = (comparar
            ? compararRateio(
                grupos,
                agruparRateio(cruasComp, rAgrupar),
                rAgrupar,
                diffDias(periodoComp.de, from),
              )
            : grupos) as unknown as Linha[];
        }
      } else if (tipo === "movimentacao") {
        brutasMovs = await carregarMovimentacao({
          clinicaId: clinicaAtual.clinica_id,
          de: from,
          ate: to,
        });
        movs = filtrarPorCategoria(brutasMovs, categorias, categoriaDaLinha);
        data = linhasExtrato(movs, rTipo);
      } else if (tipo === "sessoes") {
        sessoes = await carregarSessoes({
          clinicaId: clinicaAtual.clinica_id,
          de: from,
          // Na posição, o fim do período não vai além de hoje — ver o comentário
          // de `ateSessoes`. No movimento é a data digitada.
          ate: ateSessoes,
          modo: modoDoFiltro(sFiltro),
        });
        data = linhasSessoes(sessoes, sFiltro);
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
        // As notas vêm de `nfse`, onde o sistema grava a NFS-e de verdade.
        // Antes vinham de `fin_notas_pacientes`, um cadastro manual que nunca
        // foi usado (zero registros em produção): o relatório saía sempre em
        // branco. Só as emitidas entram, porque a coluna Valor é somada no
        // rodapé — cancelada não faturou e nota com erro nem chegou a existir
        // na prefeitura, e as duas inflariam o total do mês.
        data = await fetchAll(() =>
          supabase
            .from("nfse")
            .select("data_emissao, numero, tomador_nome, valor_servicos, status")
            .eq("clinica_id", clinicaAtual.clinica_id)
            .eq("status", "emitida")
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
      rateio: brutasRateio,
      rateioComp: brutasComp,
      movimentacao: brutasMovs,
      sessoes,
    });
    setPagina(1);
    return {
      linhas: data,
      cruas: cruas ?? [],
      cruasComp: cruasComp ?? [],
      movs: movs ?? [],
      sessoes: sessoes ?? [],
    };
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
    if (tipo === "movimentacao") {
      linhasCtx.push(
        `${rTipo === "sintetico" ? "Sintético" : "Analítico"} · entradas e saídas do caixa geral`,
      );
      linhasCtx.push(descricaoSelecao(categorias));
    }
    if (tipo === "sessoes") {
      // A primeira linha do cabeçalho já saiu como "Período: X a Y", que aqui
      // seria enganoso — a folha traz tratamento em andamento de qualquer data.
      // Estas duas linhas corrigem a leitura antes de o papel sair.
      if (modoDoFiltro(sFiltro) === "movimento") {
        linhasCtx.push(`${ROTULO_FILTRO[sFiltro]} · ${fmtDate(from)} a ${fmtDate(to)}`);
        linhasCtx.push(
          "Só o que foi realizado dentro do período. Esta visão fecha com o caixa da janela.",
        );
      } else {
        linhasCtx.push(`${ROTULO_FILTRO[sFiltro]} · posição em ${fmtDate(ateSessoes)}`);
        linhasCtx.push(
          "Tratamento em andamento aparece mesmo tendo começado antes do período; o período só limita os pacotes já encerrados.",
        );
      }
      // Sem esta linha, quem recebe a folha lê a coluna "Recebido" de uma
      // manutenção como se houvesse saldo a cobrar do resto.
      linhasCtx.push(
        "Manutenção de aparelho é cobrada por comparecimento: falta não gera cobrança retroativa.",
      );
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
    // O extrato sai com as DUAS abas no mesmo arquivo, e não só a visão que
    // está na tela: o financeiro concilia a analítica e a sintética lado a
    // lado, e dois arquivos soltos separam justamente o que precisa ser
    // conferido junto. O seletor SINTÉTICO/ANALÍTICO continua valendo para a
    // tela e para o papel.
    if (tipo === "movimentacao") {
      const tm = totaisExtrato(res.movs);
      const aba = (visao: "analitico" | "sintetico") => {
        const cols = colunasExtrato(visao);
        return {
          arquivo: "",
          aba: visao === "analitico" ? "Analítica" : "Sintética",
          cabecalho: [
            `${TITULOS.movimentacao} — ${clinicaAtual?.clinica.nome ?? "Clínica"}`,
            `Período: ${fmtDate(from)} a ${fmtDate(to)}`,
            `${visao === "analitico" ? "Analítico" : "Sintético"} · entradas e saídas do caixa geral`,
            // As duas abas saem com o MESMO recorte de categoria da tela: elas
            // são conciliadas lado a lado, e uma filtrada contra outra inteira
            // não fecharia.
            descricaoSelecao(categorias),
          ].filter(Boolean),
          colunas: cols.map((c) => ({ rotulo: c.rotulo, tipo: tipoXlsx(c) })),
          linhas: linhasExtrato(res.movs, visao).map((linha) =>
            cols.map((c) => valorXlsx(c, linha[c.chave])),
          ),
          totais: rodapeExtratoXlsx(cols, tm),
          resumo: {
            titulo: "Por forma de pagamento",
            itens: resumoPorForma(res.movs).map((i) => ({
              rotulo: i.rotulo,
              valor: i.valor,
              tipo: "moeda" as const,
            })),
          },
        };
      };
      try {
        await exportarPastaXlsx(`movimentacao_financeira_${from}_${to}`, [
          aba("analitico"),
          aba("sintetico"),
        ]);
        toast.success(`Planilha gerada com as duas abas (${res.movs.length} movimentações)`);
      } catch (e) {
        mostrarErro(e);
      }
      return;
    }
    const ts = totaisSessoes(filtrarSessoes(res.sessoes, sFiltro));
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
            : tipo === "sessoes"
              ? rodapeSessoesXlsx(colunas, ts)
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
            : tipo === "sessoes"
              ? {
                  titulo: "Resumo do acompanhamento",
                  // Vai como texto: o quadro mistura contagem ("18 pacotes")
                  // com dinheiro, e forçar tudo a número faria o Excel exibir
                  // "R$ 18,00" onde são dezoito pacotes.
                  itens: resumoSessoes(ts, modoDoFiltro(sFiltro)).map((i) => ({
                    rotulo: i.rotulo,
                    valor: i.valor,
                    tipo: "texto" as const,
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
    // No rateio, no extrato e nas sessões o CSV sai com os mesmos rótulos da
    // tela — quem abre no Excel não tem como saber o que significa "liquido",
    // "margem", "banco_conta" ou "dias_parado".
    if (tipo === "rateio" || tipo === "movimentacao" || tipo === "sessoes") {
      const linhasCsv = data.map((linha) => {
        const obj: Record<string, unknown> = {};
        for (const c of colunas) obj[c.rotulo] = valorXlsx(c, linha[c.chave]);
        return obj;
      });
      const nome =
        tipo === "rateio"
          ? "rateio_receita"
          : tipo === "sessoes"
            ? `sessoes_manutencoes_${sFiltro}`
            : `movimentacao_financeira_${rTipo}`;
      download(`${nome}_${from}_${to}.csv`, toCsv(linhasCsv));
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
        assinaturas: ASSINATURAS_RATEIO,
      });
      return;
    }
    if (tipo === "movimentacao") {
      // Mesmo cuidado do rateio: imprimir pode ser o primeiro clique, então os
      // totais são recalculados aqui a partir das movimentações cruas, e não
      // lidos do `useMemo`, que só roda no render seguinte.
      const tm = totaisExtrato(res.movs);
      imprimirRelatorio({
        clinicaNome: clinicaAtual?.clinica.nome ?? "Clínica",
        titulo: TITULOS.movimentacao,
        periodo: [
          periodo,
          rTipo === "sintetico" ? "Sintético" : "Analítico",
          descricaoSelecao(categorias),
        ]
          .filter(Boolean)
          .join(" · "),
        colunas: colunas.map((c) => ({ rotulo: c.rotulo, numerica: alinhaDireita(c) })),
        linhas: data.map((linha) => colunas.map((c) => celula(c, linha[c.chave]))),
        totais: rodapeExtrato(colunas, tm),
        resumo: resumoDoExtrato(tm),
        composicao: {
          titulo: "Por forma de pagamento",
          itens: resumoPorForma(res.movs).map((i) => ({ rotulo: i.rotulo, valor: brl(i.valor) })),
        },
        assinaturas: ASSINATURAS_PADRAO,
      });
      return;
    }
    if (tipo === "sessoes") {
      // Mesmo cuidado do rateio e do extrato: imprimir pode ser o primeiro
      // clique, então os totais são recalculados aqui a partir das linhas
      // cruas, e não lidos do `useMemo`, que só roda no render seguinte.
      const ts = totaisSessoes(filtrarSessoes(res.sessoes, sFiltro));
      imprimirRelatorio({
        clinicaNome: clinicaAtual?.clinica.nome ?? "Clínica",
        titulo: TITULOS.sessoes,
        periodo:
          modoDoFiltro(sFiltro) === "movimento"
            ? `${periodo} · ${ROTULO_FILTRO[sFiltro]} · só o que foi realizado dentro do período`
            : `Posição em ${fmtDate(ateSessoes)} · ${ROTULO_FILTRO[sFiltro]} · tratamento em andamento entra de qualquer data; o período (${periodo}) só limita os pacotes encerrados`,
        colunas: colunas.map((c) => ({ rotulo: c.rotulo, numerica: alinhaDireita(c) })),
        linhas: data.map((linha) => colunas.map((c) => celula(c, linha[c.chave]))),
        totais: rodapeSessoes(colunas, ts),
        resumo: resumoSessoes(ts, modoDoFiltro(sFiltro)),
        assinaturas: ASSINATURAS_PADRAO,
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
      assinaturas: ASSINATURAS_PADRAO,
    });
  };

  /**
   * Serviços do combobox: seguem o grupo, o tipo escolhido e a busca digitada.
   *
   * Sem seguir o tipo, escolher EXAME e depois abrir a lista de serviços
   * mostraria também as consultas — e escolher uma delas devolveria relatório
   * vazio, sem dizer por quê.
   */
  const servicosFiltrados = useMemo(() => {
    if (!ctxRateio) return [];
    const alvo = normRepasse(buscaServico);
    const out: string[] = [];
    for (const s of ctxRateio.servicos) {
      if (rGrupo !== "todos" && s.grupo !== rGrupo) continue;
      if (
        rTipoServico !== "todos" &&
        rotuloTipo(ctxRateio.procTipos.get(normRepasse(s.nome))) !== rTipoServico
      ) {
        continue;
      }
      if (alvo && !normRepasse(s.nome).includes(alvo)) continue;
      out.push(s.nome);
      if (out.length >= SERVICOS_VISIVEIS) break;
    }
    return out;
  }, [ctxRateio, rGrupo, rTipoServico, buscaServico]);

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
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="space-y-1.5 sm:w-72">
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
                    <SelectItem value="movimentacao">Movimentação Financeira</SelectItem>
                    <SelectItem value="sessoes">Sessões e Manutenções</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {/* Categoria fica ao lado do tipo de relatório, e não dentro do
                  bloco de opções de cada um, porque ela é a pergunta que o
                  financeiro faz PRIMEIRO ("quero auditar o repasse médico") —
                  antes mesmo de escolher sintético ou analítico. */}
              {usaCategoria && (
                <div className="space-y-1.5 sm:w-64">
                  <Label className={ROTULO}>Categoria</Label>
                  {/* Enquanto o cadastro não chega o botão fica travado: uma
                      lista com só os rótulos deduzidos (transferência e sem
                      categoria) pareceria o cadastro inteiro da clínica. */}
                  <SeletorCategorias
                    opcoes={opcoesCategoria}
                    valor={categorias}
                    onChange={setCategorias}
                    desabilitado={tipo === "rateio" ? !ctxRateio : catCarregando}
                    placeholder="Carregando..."
                  />
                </div>
              )}
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
          {usaCategoria && categorias.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Mostrando só <strong>{categorias.join(", ")}</strong>. Os totais do rodapé, os cards e
              o resumo já vêm recalculados com essa seleção, e o mesmo recorte vai para a impressão,
              o Excel e o CSV.
            </p>
          )}

          {tipo === "rateio" && (
            <>
              {/* Bloco 2 — recorte da base: quem atendeu e o que foi feito. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
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
                  <Label className={ROTULO}>Tipo de serviço</Label>
                  <Select
                    value={rTipoServico}
                    onValueChange={(v) => {
                      setRTipoServico(v);
                      // O serviço escolhido pode não ser do novo tipo.
                      setRServico("todos");
                    }}
                    disabled={!ctxRateio}
                  >
                    <SelectTrigger className={CAMPO}>
                      <SelectValue placeholder={ctxCarregando ? "Carregando..." : "TODOS"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">TODOS</SelectItem>
                      {(ctxRateio?.tipos ?? []).map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
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
                          <SelectItem value="servico">SERVIÇO</SelectItem>
                          <SelectItem value="tipo">TIPO DE SERVIÇO (CONSULTA/EXAME)</SelectItem>
                          <SelectItem value="condicao">CONDIÇÃO (PARTICULAR/CARTÃO)</SelectItem>
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

          {/* Movimentação Financeira: o mesmo seletor SINTÉTICO/ANALÍTICO do
              Rateio, sem "Agrupar por" (o agrupamento dela é sempre por
              categoria) e sem comparação de períodos — conciliação bancária
              confere UM período contra o extrato do banco, não dois entre si. */}
          {tipo === "movimentacao" && (
            <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="space-y-1.5 sm:w-48">
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
                <p className="text-xs text-muted-foreground sm:flex-1 sm:pb-2.5">
                  {rTipo === "sintetico"
                    ? "SINTÉTICO: uma linha por categoria, com o total de entradas e saídas de cada uma."
                    : "ANALÍTICO: uma linha por movimentação, com Valor Pago e Valor Recebido em colunas separadas."}{" "}
                  O <strong>Excel sai sempre com as duas abas</strong> (Analítica e Sintética) no
                  mesmo arquivo; a tela e a impressão seguem a visão escolhida aqui.
                </p>
              </div>
            </div>
          )}

          {/* Sessões e Manutenções: o filtro é recorte da mesma lista, então
              troca na hora, sem novo "Buscar". "Busca ativa" é o motivo de o
              relatório existir — quem tem tratamento em andamento e nenhuma
              data marcada na agenda. */}
          {tipo === "sessoes" && (
            <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="space-y-1.5 sm:w-72">
                  <Label className={ROTULO}>Mostrar</Label>
                  <Select value={sFiltro} onValueChange={(v) => setSFiltro(v as FiltroSessoes)}>
                    <SelectTrigger className={cn(CAMPO, "bg-white")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(ROTULO_FILTRO) as FiltroSessoes[]).map((f) => (
                        <SelectItem key={f} value={f}>
                          {ROTULO_FILTRO[f]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {/* As duas primeiras opções respondem "onde cada paciente
                    está"; a última responde "o que foi feito no período". Como
                    são perguntas diferentes, a explicação também muda — e é ela
                    que evita alguém conferir produção na folha errada. */}
                {modoDoFiltro(sFiltro) === "movimento" ? (
                  <p className="text-xs text-muted-foreground sm:flex-1 sm:pb-2.5">
                    <strong>Produção do período</strong>: só sessões e manutenções realizadas entre{" "}
                    {fmtDate(from)} e {fmtDate(to)}, para conferir contra o caixa e bater metas.
                    Aqui a data é janela de verdade — quem não foi atendido no período não aparece.
                    As colunas de pacote (contratado, a fazer, saldo) somem, porque descrevem o
                    tratamento inteiro e não o mês.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground sm:flex-1 sm:pb-2.5">
                    Pacotes de fisioterapia entram com{" "}
                    <strong>sessões contratadas x realizadas</strong> e situação de pagamento.
                    Manutenção de aparelho é cobrada <strong>por comparecimento</strong>: falta não
                    vira dívida, entra como paciente a buscar. A coluna <em>Dias parado</em> conta a
                    partir de {fmtDate(ateSessoes)} — o atraso nunca é medido por uma data que ainda
                    não chegou, mesmo quando o período escolhido termina no futuro.
                  </p>
                )}
              </div>
              {/* A recepção trabalha esta lista sem trocar de tela. Escrito aqui
                  porque o nome do paciente virar botão não é óbvio: sem a dica,
                  a coluna continua sendo lida como texto. */}
              {modoDoFiltro(sFiltro) === "posicao" && (
                <p className="mt-3 border-t border-slate-200 pt-2.5 text-xs text-muted-foreground">
                  <strong>Para a recepção:</strong> clique no <strong>nome do paciente</strong> para
                  ver telefone, WhatsApp e CPF. Use <strong>Agendar</strong> para abrir a Agenda já
                  com o paciente e o serviço preenchidos, e <strong>Contato</strong> para anotar o
                  que aconteceu na ligação — a anotação fica no histórico do paciente e aparece na
                  coluna <em>Último contato</em>.
                </p>
              )}
            </div>
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
          {tipo === "movimentacao" && (
            <p className="text-xs text-muted-foreground">
              Tudo que entrou e saiu do caixa geral no período: recebimentos de pacientes,
              mensalidades e adesões do cartão, despesas, repasse médico, boletos e as sangrias e
              suprimentos entre caixas. Lançamento cancelado fica de fora. Ajustes com data
              retroativa entram e vêm marcados na coluna Situação — eles não estavam no cupom
              impresso daquele dia.
            </p>
          )}
          {tipo === "sessoes" && (
            <p className="text-xs text-muted-foreground">
              Pacote em andamento aparece sempre, mesmo que tenha começado antes do período — é para
              ele que a busca ativa existe. Pacote já concluído entra só se começou dentro do
              período. A manutenção de aparelho <strong>não acumula cobrança</strong>: quem faltou
              não deve o mês, apenas ficou parado.
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

      {/* Cards de fechamento do extrato. Saem dos totais do período inteiro,
          então não mudam ao trocar de sintético para analítico — é a mesma
          conferência vista de dois jeitos. */}
      {tipo === "movimentacao" && atualizado && linhas.length > 0 && (
        <div
          className={cn(
            "grid grid-cols-1 sm:grid-cols-2 gap-3",
            custodiaDoExtrato > 0 ? "xl:grid-cols-5" : "xl:grid-cols-4",
          )}
        >
          <CardResumo titulo="Movimentações" valor={totaisM.qtd.toLocaleString("pt-BR")} />
          <CardResumo
            titulo="Recebido (entradas)"
            valor={brl(totaisM.receitas)}
            composicao={fatiasDoExtrato}
          />
          <CardResumo
            titulo="Pago (saídas)"
            valor={brl(totaisM.despesas)}
            detalhe="Repasse, prestação de serviço e contas a pagar"
            invertido
          />
          <CardResumo
            titulo="Saldo do período"
            valor={brl(totaisM.resultado)}
            detalhe={totaisM.resultado < 0 ? "Saiu mais do que entrou" : undefined}
          />
          {/* Tesouraria em card próprio: sangria e suprimento passam pelo caixa
              mas não são gasto nem receita — é o mesmo dinheiro mudando de mão
              dentro da clínica. Só aparece quando houve movimento. */}
          {custodiaDoExtrato > 0 && (
            <CardResumo
              titulo="Movimentações internas"
              valor={brl(custodiaDoExtrato)}
              detalhe={`Sangrias ${brl(totaisM.transferSaida)} · Suprimentos ${brl(
                totaisM.transferEntrada,
              )} — troca de custódia, fora do saldo`}
            />
          )}
        </div>
      )}

      {/* Cards de Sessões. O primeiro é o que a recepção usa todo dia: quantos
          pacientes estão em tratamento e não têm data marcada. */}
      {/* Modo movimento: a pergunta é produção do período, então "sem
          agendamento" e "saldo a receber" saem do quadro — o primeiro não se
          aplica a uma janela fechada, e o segundo é do pacote inteiro, não do
          mês. Ficam as quatro contagens que o financeiro concilia contra o
          caixa. */}
      {tipo === "sessoes" && modoDoFiltro(sFiltro) === "movimento" && atualizado && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <CardResumo
            titulo="Sessões de pacote"
            valor={totaisS.sessoesRealizadas.toLocaleString("pt-BR")}
            detalhe="realizadas no período"
          />
          <CardResumo
            titulo="Visitas de manutenção"
            valor={totaisS.visitasManutencao.toLocaleString("pt-BR")}
            detalhe="comparecimentos no período"
          />
          <CardResumo
            titulo="Faltas"
            valor={totaisS.faltasColuna.toLocaleString("pt-BR")}
            detalhe="pacote e manutenção somados"
            invertido
          />
          <CardResumo
            titulo="Recebido no período"
            valor={brl(totaisS.recebido)}
            detalhe="confere com o caixa da janela"
          />
        </div>
      )}

      {tipo === "sessoes" &&
        modoDoFiltro(sFiltro) === "posicao" &&
        atualizado &&
        linhas.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            <CardResumo
              titulo="Sem agendamento"
              valor={totaisS.buscaAtiva.toLocaleString("pt-BR")}
              detalhe="pacientes para busca ativa"
              invertido
            />
            {/* Duas contagens separadas de propósito. Sessão de pacote tem total
              contratado; visita de manutenção não tem — somar as duas gerava
              "30 realizadas de 10 contratadas". */}
            <CardResumo
              titulo="Sessões de pacote"
              valor={`${totaisS.sessoesRealizadas.toLocaleString("pt-BR")} de ${totaisS.sessoesContratadas.toLocaleString("pt-BR")}`}
              detalhe={`realizadas · ${totaisS.sessoesRestantes.toLocaleString("pt-BR")} a fazer · ${totaisS.faltasPacote.toLocaleString("pt-BR")} falta(s)`}
            />
            <CardResumo
              titulo="Visitas de manutenção"
              valor={totaisS.visitasManutencao.toLocaleString("pt-BR")}
              detalhe={`${totaisS.ciclos.toLocaleString("pt-BR")} paciente(s) em ciclo · sem total contratado`}
            />
            {/* Os dois números de dinheiro no mesmo cartão para o quadro caber em
              quatro colunas. O saldo é sempre "só pacotes": manutenção não
              acumula, então nunca entra aqui. */}
            <CardResumo
              titulo="Recebido"
              valor={brl(totaisS.recebido)}
              detalhe={`Saldo a receber ${brl(totaisS.emAberto)} — só pacotes`}
            />
          </div>
        )}

      {atualizado && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
            <div className="space-y-1">
              <CardTitle>
                {TITULOS[tipo]} —{" "}
                {/* Em Sessões a data NÃO é uma janela: um tratamento em
                    andamento aparece mesmo tendo começado meses antes, senão a
                    busca ativa nunca acharia quem sumiu. Escrever "03/09 a
                    03/09" numa folha cheia de visitas de julho faz a folha
                    mentir sobre o que está mostrando. */}
                {tipo === "sessoes"
                  ? modoDoFiltro(sFiltro) === "movimento"
                    ? `${fmtDate(from)} a ${fmtDate(to)}`
                    : `posição em ${fmtDate(ateSessoes)}`
                  : `${fmtDate(from)} a ${fmtDate(to)}`}
              </CardTitle>
              {tipo === "sessoes" && modoDoFiltro(sFiltro) === "posicao" && (
                <p className="text-xs text-muted-foreground">
                  Tratamento em andamento aparece sempre, mesmo tendo começado antes desta data — é
                  por isso que existem visitas antigas na lista. O período escolhido só limita os
                  pacotes já <strong>encerrados</strong>: {fmtDate(from)} a {fmtDate(ateSessoes)}.
                </p>
              )}
              {tipo === "sessoes" && modoDoFiltro(sFiltro) === "movimento" && (
                <p className="text-xs text-muted-foreground">
                  Só o que foi <strong>realizado dentro do período</strong>. Aqui a data é janela de
                  verdade — é esta visão que fecha com o caixa e serve para conferir produção.
                </p>
              )}
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
                        {/* Duas colunas que existem só na tela da recepção. Não
                            entram em `colunas` de propósito: aquela lista é a
                            fonte do CSV, do Excel e do papel, e botão não se
                            imprime. */}
                        {mostrarAcoes && <TableHead>Último contato</TableHead>}
                        {mostrarAcoes && <TableHead className="text-right">Ação</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {linhasDaPagina.map((linha, i) => {
                        const pac = mostrarAcoes ? pacienteDaLinha(inicio + i) : null;
                        const ultimo = pac ? contatoPorPaciente.get(pac.pacienteId) : undefined;
                        return (
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
                                {/* O nome do paciente abre o painel de contato.
                                    É o clique mais natural da tela: quem lê a
                                    lista está procurando com quem falar. */}
                                {pac && c.chave === "paciente" ? (
                                  <button
                                    type="button"
                                    className="text-left font-medium text-primary underline-offset-2 hover:underline"
                                    onClick={() => setPacienteAberto(pac)}
                                  >
                                    {celula(c, linha[c.chave])}
                                  </button>
                                ) : (
                                  celula(c, linha[c.chave])
                                )}
                              </TableCell>
                            ))}
                            {mostrarAcoes && (
                              <TableCell className="whitespace-nowrap">
                                {ultimo ? (
                                  <Badge
                                    variant="outline"
                                    className={cn("font-medium", COR_RESULTADO[ultimo.resultado])}
                                    title={ultimo.observacao || undefined}
                                  >
                                    {ROTULO_RESULTADO_CURTO[ultimo.resultado]} ·{" "}
                                    {fmtDate(ultimo.criado_em.slice(0, 10))}
                                  </Badge>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </TableCell>
                            )}
                            {mostrarAcoes && (
                              <TableCell className="whitespace-nowrap text-right">
                                <div className={cn("flex justify-end gap-1", !pac && "hidden")}>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 px-2 text-slate-600 hover:text-primary"
                                    title="Agendar próxima"
                                    onClick={() => pac && irParaAgenda(pac)}
                                  >
                                    <CalendarPlus className="h-4 w-4" />
                                    <span className="sr-only sm:not-sr-only sm:ml-1.5">
                                      Agendar
                                    </span>
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 px-2 text-slate-600 hover:text-primary"
                                    title={
                                      podeRegistrarContato
                                        ? "Registrar contato"
                                        : "Seu perfil não tem permissão para registrar contato."
                                    }
                                    disabled={!podeRegistrarContato}
                                    onClick={() =>
                                      pac &&
                                      setAlvoContato({
                                        pacienteId: pac.pacienteId,
                                        pacienteNome: pac.pacienteNome,
                                        origem: pac.origem,
                                        procedimento: pac.procedimento,
                                      })
                                    }
                                  >
                                    <PhoneCall className="h-4 w-4" />
                                    <span className="sr-only sm:not-sr-only sm:ml-1.5">
                                      Contato
                                    </span>
                                  </Button>
                                </div>
                              </TableCell>
                            )}
                          </TableRow>
                        );
                      })}
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
                        {/* Duas células vazias fechando as colunas de tela. Sem
                            elas o rodapé fica com menos colunas que o cabeçalho
                            e o TOTAL GERAL desalinha da coluna que soma. */}
                        {mostrarAcoes && <TableCell />}
                        {mostrarAcoes && <TableCell />}
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

      {/* Painéis da busca ativa. Ficam fora do card da tabela porque o painel de
          contato continua aberto enquanto a recepção troca de página da lista. */}
      <ContatoPacienteDrawer
        alvo={pacienteAberto}
        clinicaId={clinicaAtual?.clinica_id ?? ""}
        clinicaNome={clinicaAtual?.clinica.nome ?? "clínica"}
        contatos={contatos}
        podeRegistrar={podeRegistrarContato}
        onFechar={() => setPacienteAberto(null)}
        onAgendar={irParaAgenda}
        onRegistrarContato={(p) =>
          setAlvoContato({
            pacienteId: p.pacienteId,
            pacienteNome: p.pacienteNome,
            origem: p.origem,
            procedimento: p.procedimento,
          })
        }
      />
      <RegistrarContatoDialog
        alvo={alvoContato}
        clinicaId={clinicaAtual?.clinica_id ?? ""}
        onFechar={() => setAlvoContato(null)}
        onRegistrado={() => setContatosVersao((v) => v + 1)}
      />
    </div>
  );
}
