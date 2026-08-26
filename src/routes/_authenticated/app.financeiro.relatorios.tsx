/**
 * Financeiro > Relatórios.
 *
 * A tela nasceu só como exportador de CSV: escolhia-se o tipo e o período e o
 * arquivo era baixado às cegas, sem que ninguém visse os dados antes. A equipe
 * pediu para conferir na própria tela, então hoje o fluxo é: "Buscar" carrega o
 * período e mostra a tabela paginada com os totais no rodapé; a partir daí o
 * mesmo resultado pode ser baixado em CSV ou impresso em A4.
 *
 * Os totais do rodapé são sempre do período INTEIRO, não da página exibida —
 * quem confere caixa precisa do consolidado, não da soma de 50 linhas.
 *
 * O tipo "Rateio da Receita" reproduz o relatório de mesmo nome do sistema
 * anterior (Clínica Total): quanto cada dia/profissional/especialidade rendeu,
 * quanto saiu de repasse e quanto sobrou para a clínica. Ele tem filtros
 * próprios (profissional, especialidade, grupo/serviço) e a conta em si vive
 * em `@/lib/financeiro/rateio-receita`.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Download,
  FileBarChart,
  Printer,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { brl, fmtDate } from "@/lib/financeiro/format";
import { imprimirRelatorio } from "@/lib/print-relatorio-financeiro";
import {
  agruparRateio,
  carregarContextoRateio,
  carregarRateio,
  totaisRateio,
  type RateioAgruparPor,
  type RateioContexto,
  type RateioLinha,
  type RateioTipo,
  type RateioTotais,
} from "@/lib/financeiro/rateio-receita";
// Mesma normalização de nome usada no cálculo de repasse ("ultrassom" acha
// "ULTRASSONOGRAFIA"), para a busca do combobox casar com o cadastro.
import { normRepasse } from "@/lib/repasse-calc";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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

type Coluna = {
  chave: string;
  rotulo: string;
  formato: "texto" | "data" | "moeda" | "numero" | "percentual";
  /** Colunas de dinheiro somadas no rodapé da tabela e do papel. */
  somar?: boolean;
};

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

const ROTULO_AGRUPADOR: Record<RateioAgruparPor, string> = {
  data: "Data",
  profissional: "Profissional",
  especialidade: "Especialidade",
};

/** Colunas do Rateio: no sintético uma linha por agrupador, no analítico uma por atendimento. */
function colunasRateio(tipoRateio: RateioTipo, agruparPor: RateioAgruparPor): Coluna[] {
  const dinheiro: Coluna[] = [
    { chave: "receita", rotulo: "Receita bruta", formato: "moeda", somar: true },
    { chave: "repasse", rotulo: "Repasse prestador", formato: "moeda", somar: true },
    { chave: "liquido", rotulo: "Líquido clínica", formato: "moeda", somar: true },
    { chave: "margem", rotulo: "% clínica", formato: "percentual" },
  ];
  if (tipoRateio === "sintetico") {
    return [
      {
        chave: "agrupador",
        rotulo: ROTULO_AGRUPADOR[agruparPor],
        formato: agruparPor === "data" ? "data" : "texto",
      },
      { chave: "qtd", rotulo: "Qtd. atend.", formato: "numero" },
      ...dinheiro,
    ];
  }
  return [
    { chave: "data", rotulo: "Data", formato: "data" },
    { chave: "medico_nome", rotulo: "Profissional", formato: "texto" },
    { chave: "especialidade_nome", rotulo: "Especialidade", formato: "texto" },
    { chave: "procedimento", rotulo: "Serviço", formato: "texto" },
    ...dinheiro,
  ];
}

const num = (v: unknown) => Number(v ?? 0) || 0;

const pct = (v: number) => `${v.toFixed(1).replace(".", ",")}%`;

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

/** Formata uma célula para a tela e para o papel (o CSV leva o valor cru). */
function celula(coluna: Coluna, valor: unknown): string {
  if (coluna.formato === "moeda") return brl(num(valor));
  if (coluna.formato === "numero") return num(valor).toLocaleString("pt-BR");
  if (coluna.formato === "percentual") return pct(num(valor));
  if (coluna.formato === "data") return valor ? fmtDate(String(valor).slice(0, 10)) : "—";
  const texto = String(valor ?? "").trim();
  return texto === "" ? "—" : texto;
}

const alinhaDireita = (c: Coluna) =>
  c.formato === "moeda" || c.formato === "numero" || c.formato === "percentual";

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

function Page() {
  const { clinicaAtual } = useClinica();
  const [tipo, setTipo] = useState<Tipo>("lancamentos");
  const [from, setFrom] = useState(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
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
  /** Catálogos e grade de repasse; só carregam quando o Rateio é escolhido. */
  const [ctxRateio, setCtxRateio] = useState<RateioContexto | null>(null);
  const [ctxCarregando, setCtxCarregando] = useState(false);
  const ctxPedido = useRef(false);

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
  } | null>(null);

  // "Agrupar por" e "Sintético/Analítico" são recortes do MESMO resultado, então
  // ficam fora da chave: trocar qualquer um deles reorganiza a tabela na hora,
  // sem ir ao banco de novo.
  const chaveAtual =
    tipo === "rateio"
      ? ["rateio", from, to, rMedico, rEspecialidade, rGrupo, rServico].join("|")
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
  const totaisR = useMemo(() => totaisRateio(linhasRateio), [linhasRateio]);

  const linhas = useMemo<Linha[]>(() => {
    if (!atualizado || !resultado) return [];
    if (resultado.tipo !== "rateio") return resultado.linhas;
    // No analítico o "Agrupar por" não soma nada: ele manda na ORDEM em que os
    // atendimentos aparecem, para a folha sair na sequência que o usuário pediu.
    if (rTipo === "analitico") {
      return ordenarAnalitico(linhasRateio, rAgrupar) as unknown as Linha[];
    }
    return agruparRateio(linhasRateio, rAgrupar).map((g) => ({
      agrupador: g.rotulo,
      qtd: g.qtd,
      receita: g.receita,
      repasse: g.repasse,
      liquido: g.liquido,
      margem: g.margem,
    }));
  }, [atualizado, resultado, linhasRateio, rTipo, rAgrupar]);

  const colunas = useMemo(
    () => (tipo === "rateio" ? colunasRateio(rTipo, rAgrupar) : COLUNAS[tipo]),
    [tipo, rTipo, rAgrupar],
  );

  // A troca de agrupamento pode encurtar a lista; voltar para a primeira página
  // evita a tela em branco de uma página que não existe mais.
  useEffect(() => {
    setPagina(1);
  }, [rTipo, rAgrupar]);

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
   * do período inteiro, calculada sobre os totais.
   */
  const rodapeRateio = (cols: Coluna[], t: RateioTotais) =>
    cols.map((c, i) => {
      if (c.chave === "qtd") return t.qtd.toLocaleString("pt-BR");
      if (c.chave === "receita") return brl(t.receita);
      if (c.chave === "repasse") return brl(t.repasse);
      if (c.chave === "liquido") return brl(t.liquido);
      if (c.chave === "margem") return pct(t.margem);
      if (i === 0) return "TOTAL GERAL";
      // No analítico a contagem não tem coluna própria; fica ao lado do rótulo.
      return i === 1 && rTipo === "analitico"
        ? `${t.qtd.toLocaleString("pt-BR")} atendimento(s)`
        : "";
    });

  /** Rodapé da tabela: contagem na 1ª coluna e a soma em cada coluna de dinheiro. */
  const rodape =
    tipo === "rateio"
      ? rodapeRateio(colunas, totaisR)
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

  /** Quadro de fechamento do rateio, igual na tela e no papel. */
  const resumoDoRateio = (t: RateioTotais) => [
    { rotulo: "Atendimentos", valor: t.qtd.toLocaleString("pt-BR") },
    { rotulo: "Receita bruta", valor: brl(t.receita) },
    { rotulo: "Repasse ao prestador", valor: brl(t.repasse) },
    { rotulo: "Líquido da clínica", valor: `${brl(t.liquido)} (${pct(t.margem)})` },
  ];
  const resumoRateio = resumoDoRateio(totaisR);

  /** Nome do médico/especialidade/serviço escolhido, para o cabeçalho impresso. */
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

  /**
   * Devolve as linhas prontas para a tabela e, no rateio, também as linhas
   * cruas (uma por atendimento). O papel precisa das cruas porque os totais do
   * `useMemo` só existem no render seguinte — e imprimir pode ser o primeiro
   * clique, sem "Buscar" antes.
   */
  const carregar = async (): Promise<{ linhas: Linha[]; cruas: RateioLinha[] } | null> => {
    if (!clinicaAtual) return null;
    if (atualizado && resultado) return { linhas, cruas: linhasRateio };
    if (tipo === "rateio" && !ctxRateio) {
      toast.info("Carregando o cadastro de médicos e serviços — tente de novo em instantes");
      return null;
    }
    setLoading(true);
    let data: Linha[] = [];
    let cruas: RateioLinha[] | undefined;
    try {
      if (tipo === "rateio" && ctxRateio) {
        cruas = await carregarRateio(ctxRateio, {
          clinicaId: clinicaAtual.clinica_id,
          de: from,
          ate: to,
          medicoId: rMedico === "todos" ? null : rMedico,
          especialidadeId: rEspecialidade === "todas" ? null : rEspecialidade,
          grupo: rGrupo === "todos" ? null : rGrupo,
          servico: rServico === "todos" ? null : rServico,
        });
        data =
          rTipo === "analitico"
            ? (ordenarAnalitico(cruas, rAgrupar) as unknown as Linha[])
            : agruparRateio(cruas, rAgrupar).map((g) => ({
                agrupador: g.rotulo,
                qtd: g.qtd,
                receita: g.receita,
                repasse: g.repasse,
                liquido: g.liquido,
                margem: g.margem,
              }));
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
    setResultado({ tipo, chave: chaveAtual, from, to, linhas: data, rateio: cruas });
    setPagina(1);
    return { linhas: data, cruas: cruas ?? [] };
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
        for (const c of colunas) {
          obj[c.rotulo] =
            c.formato === "moeda" || c.formato === "numero" || c.formato === "percentual"
              ? num(linha[c.chave])
              : (linha[c.chave] ?? "");
        }
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
      imprimirRelatorio({
        clinicaNome: clinicaAtual?.clinica.nome ?? "Clínica",
        titulo: TITULOS.rateio,
        periodo: `${periodo} · ${descricaoFiltrosRateio()}`,
        colunas: colunas.map((c) => ({ rotulo: c.rotulo, numerica: alinhaDireita(c) })),
        linhas: data.map((linha) => colunas.map((c) => celula(c, linha[c.chave]))),
        totais: rodapeRateio(colunas, t),
        resumo: resumoDoRateio(t),
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <FileBarChart className="h-6 w-6 text-primary" />
          Relatórios
        </h1>
        <p className="text-sm text-muted-foreground">
          Consulte na tela, imprima em A4 ou exporte em CSV para análise externa
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Gerar relatório</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as Tipo)}>
                <SelectTrigger>
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
            <div className="space-y-2">
              <Label>De</Label>
              <DateInputBR value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Até</Label>
              <DateInputBR value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>

          {tipo === "rateio" && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Profissional</Label>
                <Select value={rMedico} onValueChange={setRMedico} disabled={!ctxRateio}>
                  <SelectTrigger>
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
              <div className="space-y-2">
                <Label>Especialidade</Label>
                <Select
                  value={rEspecialidade}
                  onValueChange={setREspecialidade}
                  disabled={!ctxRateio}
                >
                  <SelectTrigger>
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
              <div className="space-y-2">
                <Label>Grupo de serviço</Label>
                <Select
                  value={rGrupo}
                  onValueChange={(v) => {
                    setRGrupo(v);
                    // O serviço escolhido pode não pertencer ao novo grupo.
                    setRServico("todos");
                  }}
                  disabled={!ctxRateio}
                >
                  <SelectTrigger>
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
              <div className="space-y-2">
                <Label>Serviço</Label>
                <Popover open={servicoAberto} onOpenChange={setServicoAberto}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className="w-full justify-between font-normal"
                      disabled={!ctxRateio}
                    >
                      <span className="truncate">
                        {rServico === "todos" ? "TODOS OS SERVIÇOS" : rServico}
                      </span>
                      <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
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
              <div className="space-y-2">
                <Label>Tipo do relatório</Label>
                <Select value={rTipo} onValueChange={(v) => setRTipo(v as RateioTipo)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sintetico">SINTÉTICO</SelectItem>
                    <SelectItem value="analitico">ANALÍTICO</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Agrupar por</Label>
                <Select value={rAgrupar} onValueChange={(v) => setRAgrupar(v as RateioAgruparPor)}>
                  <SelectTrigger>
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
          )}

          <div className="flex flex-wrap gap-2">
            <Button onClick={buscar} disabled={loading || !clinicaAtual}>
              <Search className="h-4 w-4 mr-2" />
              {loading ? "Buscando..." : "Buscar"}
            </Button>
            <Button variant="outline" onClick={imprimir} disabled={loading || !clinicaAtual}>
              <Printer className="h-4 w-4 mr-2" />
              Imprimir
            </Button>
            <Button variant="outline" onClick={baixarCsv} disabled={loading || !clinicaAtual}>
              <Download className="h-4 w-4 mr-2" />
              Baixar CSV
            </Button>
          </div>
          {tipo === "rateio" && (
            <p className="text-xs text-muted-foreground">
              Considera os atendimentos do período (mesma base da aba Atendimentos). Mensalidades de
              cartão, adesões e recebimentos avulsos não entram, porque não têm prestador para
              repassar.
            </p>
          )}
        </CardContent>
      </Card>

      {atualizado && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
            <CardTitle>
              {TITULOS[tipo]} — {fmtDate(from)} a {fmtDate(to)}
            </CardTitle>
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
                            className={
                              alinhaDireita(c)
                                ? "text-right whitespace-nowrap tabular-nums"
                                : undefined
                            }
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

                {tipo === "rateio" && (
                  <div className="ml-auto w-full sm:w-80 text-sm space-y-1">
                    {resumoRateio.map((r, i) => (
                      <div
                        key={r.rotulo}
                        className={cn(
                          "flex justify-between",
                          i === resumoRateio.length - 1 && "border-t pt-1",
                        )}
                      >
                        <span
                          className={
                            i === resumoRateio.length - 1
                              ? "font-semibold"
                              : "text-muted-foreground"
                          }
                        >
                          {r.rotulo}
                        </span>
                        <span
                          className={cn(
                            "tabular-nums",
                            i === resumoRateio.length - 1 ? "font-bold" : "font-medium",
                          )}
                        >
                          {r.valor}
                        </span>
                      </div>
                    ))}
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
