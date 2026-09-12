/**
 * Peças compartilhadas pelos cards do Financeiro → Dashboard e do Movimento de
 * Caixa: o card clicável (`KpiCard`) e o detalhamento (`DetalhamentoCorpo`).
 *
 * As duas telas usam a MESMA peça de propósito. A diretoria pediu que o
 * detalhamento se comporte igual nas duas — agrupado e linha a linha, com
 * Imprimir e Baixar Excel —, e duas cópias acabariam divergindo na primeira
 * correção feita só numa delas.
 *
 * No Financeiro → Dashboard o detalhamento abre em TELA CHEIA por cima da
 * própria tela (`DetalhamentoDialog`): em 11/09/2026 o dono pediu que o card
 * não abrisse mais outra guia do navegador. O Movimento de Caixa continua
 * abrindo em NOVA ABA (`PaginaDetalhe` + `detalhe-aba`), com o mesmo diálogo
 * como plano B para quando o navegador bloqueia a aba nova.
 *
 * O corpo recebe uma tabela já montada (`Detalhe`) e a desenha na tela,
 * imprime em A4 e exporta para Excel. É o que garante que o papel e a planilha
 * mostram exatamente o que a tela mostrou.
 */
import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileSpreadsheet,
  Maximize2,
  Printer,
} from "lucide-react";
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
import type { Celula, Detalhe, TipoCol, Visao } from "@/lib/financeiro/detalhe-tabela";

export type { Celula, Detalhe, TipoCol, Visao } from "@/lib/financeiro/detalhe-tabela";

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

export const periodoLegivel = (de: string, ate: string) =>
  de === ate ? fmtDate(de) : `${fmtDate(de)} a ${fmtDate(ate)}`;

/** O que o detalhamento precisa para se desenhar, imprimir e exportar. */
export interface PropsDetalhamento {
  /** Monta a tabela da visão pedida. */
  montar: (visao: Visao) => Detalhe;
  /** Nome do botão da visão agrupada ("Por categoria", "Por profissional"…). */
  rotuloSintetico: string;
  /** Prefixo do nome do arquivo do Excel. */
  arquivo: string;
  de: string;
  ate: string;
  clinicaNome: string;
  /**
   * Abre o detalhe de UMA linha da tabela (quem foi atendido naquela linha).
   * Devolver `null` deixa a linha sem clique. Quando não é informado, a tabela
   * continua só de leitura — é o que o Movimento de Caixa usa hoje.
   */
  detalharLinha?: (args: { visao: Visao; indice: number; linha: Celula[] }) => Detalhe | null;
}

/**
 * Miolo do detalhamento: cabeçalho, troca de visão, Imprimir, Baixar Excel,
 * quadro de resumo, tabela e composição por forma.
 *
 * `cabecalho` desenha o título do jeito de cada lugar (título de janela no
 * diálogo, título de página na aba nova). `alturaTabela` decide quem rola: no
 * diálogo a tabela ocupa o que sobra da janela; na página ela tem altura
 * máxima, para o cabeçalho das colunas ficar fixo enquanto a lista rola.
 */
export function DetalhamentoCorpo({
  montar,
  rotuloSintetico,
  arquivo,
  de,
  ate,
  clinicaNome,
  cabecalho,
  alturaTabela,
}: PropsDetalhamento & {
  cabecalho: (det: Detalhe, periodo: string) => ReactNode;
  alturaTabela: string;
}) {
  // Abre agrupado: é a leitura que a diretoria faz primeiro (quem recebeu
  // quanto, qual conta pesou). A lista linha a linha fica a um clique.
  const [visao, setVisao] = useState<Visao>("sintetico");
  const det = useMemo(() => montar(visao), [montar, visao]);
  const periodo = periodoLegivel(de, ate);
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
    <>
      {cabecalho(det, periodo)}

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

      <div className={cn("overflow-auto rounded-md border", alturaTabela)}>
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
    </>
  );
}

/**
 * Detalhamento em tela cheia, por cima da própria tela. É o caminho normal do
 * Financeiro → Dashboard e o plano B do Movimento de Caixa (quando o navegador
 * bloqueia a aba nova ou recusa guardar a lista para ela).
 */
export function DetalhamentoDialog({
  onClose,
  ...props
}: PropsDetalhamento & { onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="left-0 top-0 flex h-dvh max-h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-3 overflow-hidden rounded-none border-0 sm:rounded-none">
        <DetalhamentoCorpo
          {...props}
          alturaTabela="min-h-0 flex-1"
          cabecalho={(det, periodo) => (
            <DialogHeader className="space-y-1 pr-8">
              <DialogTitle>
                {det.titulo} — {periodo}
              </DialogTitle>
              <DialogDescription className="text-xs">{det.explicacao}</DialogDescription>
            </DialogHeader>
          )}
        />
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
  novaAba = false,
  className,
  children,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  accent: "primary" | "success" | "destructive" | "warning";
  /** Linha curta abaixo do valor, dizendo o que o número inclui. */
  detalhe?: string;
  /** Abre o detalhamento do card. */
  onClick?: () => void;
  /** O clique abre outra aba (Movimento de Caixa) em vez da tela cheia. */
  novaAba?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  const IconeAbrir = novaAba ? ExternalLink : Maximize2;
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
      title={
        onClick
          ? novaAba
            ? "Abrir o detalhamento em nova aba"
            : "Abrir o detalhamento em tela cheia"
          : undefined
      }
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
      className={cn(
        onClick &&
          "group cursor-pointer hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        className,
      )}
    >
      <CardContent className="pt-6 flex items-start gap-3">
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg ${colorMap[accent]}`}
        >
          <Icon className="h-6 w-6" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="flex items-start justify-between gap-2 text-[12px] uppercase tracking-wide text-muted-foreground leading-tight">
            <span className="line-clamp-2">{label}</span>
            {/* Avisa o que o clique abre: outra aba ou a tela cheia. */}
            {onClick && (
              <IconeAbrir
                aria-hidden
                className="h-3.5 w-3.5 shrink-0 opacity-50 group-hover:opacity-100"
              />
            )}
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
