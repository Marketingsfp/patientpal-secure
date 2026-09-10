/**
 * Peças compartilhadas pelos cards do Financeiro → Dashboard e do Movimento de
 * Caixa: o card clicável (`KpiCard`) e o detalhamento em tela cheia
 * (`DetalhamentoDialog`).
 *
 * As duas telas usam a MESMA peça de propósito. A diretoria pediu que o
 * detalhamento se comporte igual nas duas — agrupado e linha a linha, com
 * Imprimir e Baixar Excel —, e duas cópias acabariam divergindo na primeira
 * correção feita só numa delas.
 *
 * O detalhamento recebe uma tabela já montada (`Detalhe`) e a desenha na tela,
 * imprime em A4 e exporta para Excel. É o que garante que o papel e a planilha
 * mostram exatamente o que a tela mostrou.
 */
import { useMemo, useState } from "react";
import { FileSpreadsheet, Printer } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { brl, fmtDate } from "@/lib/financeiro/format";
import { mostrarErro } from "@/lib/traduzir-erro";
import { cn } from "@/lib/utils";
import { imprimirRelatorio } from "@/lib/print-relatorio-financeiro";
import { exportarRelatorioXlsx } from "@/lib/exportar-xlsx";

export type Visao = "sintetico" | "analitico";
export type TipoCol = "texto" | "moeda" | "numero" | "data";
export type Celula = string | number | null;

/** Uma tabela de detalhamento, pronta para tela, papel e planilha. */
export interface Detalhe {
  titulo: string;
  explicacao: string;
  colunas: Array<{ rotulo: string; tipo: TipoCol }>;
  linhas: Celula[][];
  totais?: Celula[];
  /** Quadro de fechamento, acima da tabela e no papel. */
  resumo?: Array<{ rotulo: string; valor: number }>;
  /** Quebra por forma de pagamento (só na receita). */
  composicao?: Array<{ rotulo: string; valor: number }>;
  /** Existe visão sintética (agrupada) além da lista. */
  temSintetico: boolean;
}

export const pct = (v: number) => `${v.toFixed(1).replace(".", ",")}%`;
export const int = (n: number) => n.toLocaleString("pt-BR");

export function textoCelula(tipo: TipoCol, c: Celula): string {
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

export function DetalhamentoDialog({
  montar,
  rotuloSintetico,
  arquivo,
  de,
  ate,
  clinicaNome,
  onClose,
}: {
  /** Monta a tabela da visão pedida. */
  montar: (visao: Visao) => Detalhe;
  /** Nome do botão da visão agrupada ("Por categoria", "Por profissional"…). */
  rotuloSintetico: string;
  /** Prefixo do nome do arquivo do Excel. */
  arquivo: string;
  de: string;
  ate: string;
  clinicaNome: string;
  onClose: () => void;
}) {
  // Abre agrupado: é a leitura que a diretoria faz primeiro (quem recebeu
  // quanto, qual conta pesou). A lista linha a linha fica a um clique.
  const [visao, setVisao] = useState<Visao>("sintetico");
  const det = useMemo(() => montar(visao), [montar, visao]);
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
        arquivo: `${arquivo}_${visao}_${de}_${ate}`,
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
                  {vv === "sintetico" ? rotuloSintetico : "Linha a linha"}
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

export function KpiCard({
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
