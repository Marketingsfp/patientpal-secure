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
 */
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, FileBarChart, Printer, Search } from "lucide-react";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { brl, fmtDate } from "@/lib/financeiro/format";
import { imprimirRelatorio } from "@/lib/print-relatorio-financeiro";
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

import { DateInputBR } from "@/components/ui/date-input-br";
export const Route = createFileRoute("/_authenticated/app/financeiro/relatorios")({
  component: Page,
  head: () => ({ meta: [{ title: "Relatórios — Financeiro" }] }),
});

type Tipo = "lancamentos" | "atendimentos" | "notas";
type Linha = Record<string, unknown>;

/** Quantas linhas cabem por página sem transformar a conferência em rolagem. */
const POR_PAGINA = 50;

type Coluna = {
  chave: string;
  rotulo: string;
  formato: "texto" | "data" | "moeda";
  /** Colunas de dinheiro somadas no rodapé da tabela e do papel. */
  somar?: boolean;
};

/**
 * Colunas de cada relatório. A ordem vale para a tela e para o papel — a lista
 * abaixo é a única fonte da verdade dos dois.
 */
const COLUNAS: Record<Tipo, Coluna[]> = {
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
};

const num = (v: unknown) => Number(v ?? 0) || 0;

/** Formata uma célula para a tela e para o papel (o CSV leva o valor cru). */
function celula(coluna: Coluna, valor: unknown): string {
  if (coluna.formato === "moeda") return brl(num(valor));
  if (coluna.formato === "data") return valor ? fmtDate(String(valor).slice(0, 10)) : "—";
  const texto = String(valor ?? "").trim();
  return texto === "" ? "—" : texto;
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

function Page() {
  const { clinicaAtual } = useClinica();
  const [tipo, setTipo] = useState<Tipo>("lancamentos");
  const [from, setFrom] = useState(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [pagina, setPagina] = useState(1);

  /**
   * Resultado carregado junto com o filtro que o gerou. Guardar o filtro é o
   * que impede a tela de mostrar (ou imprimir) o período antigo depois que
   * alguém mexeu nas datas e ainda não clicou em "Buscar".
   */
  const [resultado, setResultado] = useState<{
    tipo: Tipo;
    from: string;
    to: string;
    linhas: Linha[];
  } | null>(null);

  const chaveAtual = `${tipo}|${from}|${to}`;
  const atualizado =
    resultado !== null && `${resultado.tipo}|${resultado.from}|${resultado.to}` === chaveAtual;
  const linhas = useMemo(
    () => (atualizado && resultado ? resultado.linhas : []),
    [atualizado, resultado],
  );
  const colunas = COLUNAS[tipo];

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

  /** Rodapé da tabela: contagem na 1ª coluna e a soma em cada coluna de dinheiro. */
  const rodape = colunas.map((c, i) => {
    if (c.somar) {
      // Em Lançamentos, somar receita com despesa não daria dinheiro nenhum:
      // o consolidado da coluna é o saldo do período.
      const valor =
        tipo === "lancamentos" && c.chave === "valor" ? totais.saldo : totais.somas[c.chave];
      return brl(valor);
    }
    return i === 0 ? `${linhas.length.toLocaleString("pt-BR")} registro(s)` : "";
  });

  const resumoImpresso =
    tipo === "lancamentos"
      ? [
          { rotulo: "Receitas", valor: brl(totais.receitas) },
          { rotulo: "Despesas", valor: brl(totais.despesas) },
          { rotulo: "Saldo do período", valor: brl(totais.saldo) },
        ]
      : undefined;

  const carregar = async (): Promise<Linha[] | null> => {
    if (!clinicaAtual) return null;
    if (atualizado && resultado) return resultado.linhas;
    setLoading(true);
    let data: Linha[] = [];
    try {
      if (tipo === "lancamentos") {
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
    setResultado({ tipo, from, to, linhas: data });
    setPagina(1);
    return data;
  };

  const buscar = async () => {
    const data = await carregar();
    if (!data) return;
    if (data.length === 0) toast.info("Nenhum dado no período");
    else toast.success(`${data.length.toLocaleString("pt-BR")} registro(s) encontrados`);
  };

  const baixarCsv = async () => {
    const data = await carregar();
    if (!data) return;
    if (data.length === 0) {
      toast.info("Nenhum dado no período");
      return;
    }
    download(`relatorio_${tipo}_${from}_${to}.csv`, toCsv(data));
    toast.success(`Relatório gerado (${data.length} linhas)`);
  };

  const imprimir = async () => {
    const data = await carregar();
    if (!data) return;
    if (data.length === 0) {
      toast.info("Nenhum dado no período");
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
      periodo: `${fmtDate(from)} a ${fmtDate(to)}`,
      colunas: colunas.map((c) => ({ rotulo: c.rotulo, numerica: c.formato === "moeda" })),
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
                          className={c.formato === "moeda" ? "text-right" : undefined}
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
                              c.formato === "moeda"
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
                            c.formato === "moeda"
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
