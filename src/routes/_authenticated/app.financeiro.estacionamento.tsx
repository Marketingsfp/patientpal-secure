import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import {
  Car,
  Plus,
  Printer,
  Download,
  Trash2,
  ArrowUpCircle,
  ArrowDownCircle,
  AlertTriangle,
  CalendarCheck,
  CalendarClock,
  CalendarPlus,
} from "lucide-react";
import { toast } from "sonner";
import { useClinica } from "@/hooks/use-clinica";
import { useAuth } from "@/hooks/use-auth";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { hojeBR } from "@/lib/date-utils";
import { exportToExcel } from "@/lib/export-csv";
import { classificarForma, LABEL_FORMA } from "@/lib/financeiro/formas-pagamento";
import {
  barraDeFormas,
  totaisPorForma,
  resumoSintetico,
  baldeCasaComColuna,
  type ColunaDaBarra,
} from "@/lib/financeiro/composicao-receita";
import {
  listarMovimentos,
  criarMovimento,
  excluirMovimento,
  ehTabelaAusente,
  LABEL_TIPO,
  quemEhNoMovimento,
  type MovimentoEstacionamento,
  type TipoMovimento,
  type Sentido,
} from "@/lib/estacionamento/api";
import {
  situacaoMensalista,
  totaisPorSituacao,
  LABEL_SITUACAO,
  LEGENDA_SITUACAO,
  mesBR,
  type SituacaoMensalista,
} from "@/lib/estacionamento/mensalistas";
import { Pilulas } from "@/components/financeiro/pilulas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DateInputBR } from "@/components/ui/date-input-br";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/app/financeiro/estacionamento")({
  component: Page,
  head: () => ({ meta: [{ title: "Estacionamento — Financeiro" }] }),
});

const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Cores dos três cards de mensalista, na mesma convenção do Movimento de
 *  Caixa: verde é o que está em dia, âmbar é atraso, azul é adiantamento. A
 *  cor nunca é a única informação — o rótulo e a legenda dizem o mesmo. */
const TOM_SITUACAO: Record<
  SituacaoMensalista,
  { classe: string; valor: string; Icone: typeof CalendarCheck }
> = {
  periodo: {
    classe: "border-emerald-300 bg-emerald-50/60",
    valor: "text-emerald-700",
    Icone: CalendarCheck,
  },
  atrasado: {
    classe: "border-amber-300 bg-amber-50/60",
    valor: "text-amber-700",
    Icone: CalendarClock,
  },
  antecipado: {
    classe: "border-sky-300 bg-sky-50/60",
    valor: "text-sky-700",
    Icone: CalendarPlus,
  },
};

const SITUACOES: SituacaoMensalista[] = ["periodo", "atrasado", "antecipado"];

/** Formulário zerado. Função, e não constante de módulo, para a data não
 *  congelar no dia em que a aba foi aberta — mesma razão do Movimento. */
const formVazio = () => ({
  tipo: "rotativo" as TipoMovimento,
  sentido: "entrada" as Sentido,
  placa: "",
  nome: "",
  valor: "",
  forma_pagamento: "dinheiro",
  data: hojeBR(),
  competencia: hojeBR().slice(0, 7),
  observacoes: "",
});

/** Um card de total da barra do topo. */
function CardTotal({
  titulo,
  valor,
  legenda,
  tom = "neutro",
  onClick,
  ativo = false,
}: {
  titulo: string;
  valor: number;
  legenda?: string;
  tom?: "neutro" | "saida";
  onClick?: () => void;
  ativo?: boolean;
}) {
  const base = tom === "saida" ? "border-rose-200 bg-rose-50/60" : "border-border bg-muted/30";
  const conteudo = (
    <>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground truncate">{titulo}</p>
      <p className={`text-lg font-semibold tabular-nums ${tom === "saida" ? "text-rose-700" : ""}`}>
        {fmt(valor)}
      </p>
      {legenda ? <p className="text-[10px] text-muted-foreground">{legenda}</p> : null}
    </>
  );
  if (!onClick) {
    return <div className={`rounded-md border px-3 py-2 ${base}`}>{conteudo}</div>;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={`text-left rounded-md border px-3 py-2 transition hover:brightness-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        ativo ? "border-primary bg-primary/5 ring-1 ring-primary" : base
      }`}
    >
      {conteudo}
    </button>
  );
}

function Page() {
  const { clinicaAtual } = useClinica();
  const { user } = useAuth();
  const podeEscrever = usePodeEscrever("financeiro");

  const [movimentos, setMovimentos] = useState<MovimentoEstacionamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [faltaTabela, setFaltaTabela] = useState(false);
  const [fromDate, setFromDate] = useState(hojeBR);
  const [toDate, setToDate] = useState(hojeBR);
  const [modoLista, setModoLista] = useState<"analitico" | "sintetico">("analitico");
  const [filtroSentido, setFiltroSentido] = useState<"todos" | "entrada" | "saida">("todos");
  /** Card clicado na barra do topo; null = mostrando tudo. */
  const [filtroTipo, setFiltroTipo] = useState<TipoMovimento | null>(null);
  const [filtroSituacao, setFiltroSituacao] = useState<SituacaoMensalista | null>(null);
  /** Coluna da barra de formas clicada; null = todas. */
  const [filtroForma, setFiltroForma] = useState<ColunaDaBarra["chave"] | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(formVazio);
  const [confirmDel, setConfirmDel] = useState<MovimentoEstacionamento | null>(null);

  const carregar = async () => {
    if (!clinicaAtual) {
      setMovimentos([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { movimentos: lista, erro } = await listarMovimentos(
      clinicaAtual.clinica_id,
      fromDate,
      toDate,
    );
    if (erro) {
      // Tabela ainda não criada é o caso esperado antes de aplicar o SQL: a
      // tela explica o que falta em vez de despejar um erro do banco.
      if (ehTabelaAusente(erro)) setFaltaTabela(true);
      else toast.error(erro.message ?? "Não foi possível carregar o estacionamento.");
      setMovimentos([]);
      setLoading(false);
      return;
    }
    setFaltaTabela(false);
    setMovimentos(lista);
    setLoading(false);
  };

  useEffect(() => {
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicaAtual?.clinica_id, fromDate, toDate]);

  const periodo = { de: fromDate, ate: toDate };
  const balde = (m: MovimentoEstacionamento) => classificarForma(m.forma_pagamento);

  const entradas = movimentos.filter((m) => m.sentido === "entrada");
  const saidas = movimentos.filter((m) => m.sentido === "saida");

  // Barra do topo: as três colunas fixas, calculadas com a mesma regra do
  // Movimento de Caixa, para os dois módulos nunca classificarem uma forma de
  // um jeito em cada tela.
  const formasRecebidas = totaisPorForma(
    entradas.map((m) => ({ balde: balde(m), valor: m.valor })),
  );
  const colunas = barraDeFormas(formasRecebidas.formas);

  const pagoEmDinheiro = saidas
    .filter((m) => balde(m) === "dinheiro")
    .reduce((s, m) => s + m.valor, 0);
  const pagoPeloBanco = saidas
    .filter((m) =>
      ["pix", "debito", "credito", "legado_cartao", "transferencia"].includes(balde(m)),
    )
    .reduce((s, m) => s + m.valor, 0);
  const totalPago = saidas.reduce((s, m) => s + m.valor, 0);

  const recebidoRotativo = entradas
    .filter((m) => m.tipo === "rotativo")
    .reduce((s, m) => s + m.valor, 0);
  const recebidoMensalista = entradas
    .filter((m) => m.tipo === "mensalista")
    .reduce((s, m) => s + m.valor, 0);

  const mensal = totaisPorSituacao(
    entradas.map((m) => ({ tipo: m.tipo, valor: m.valor, competencia: m.competencia })),
    periodo,
  );

  // Lista exibida: os filtros do topo e os cards clicados se somam.
  const visiveis = movimentos.filter((m) => {
    if (filtroSentido !== "todos" && m.sentido !== filtroSentido) return false;
    if (filtroTipo && m.tipo !== filtroTipo) return false;
    if (filtroForma && !baldeCasaComColuna(balde(m), filtroForma)) return false;
    if (filtroSituacao) {
      if (m.tipo !== "mensalista") return false;
      if (situacaoMensalista(m.competencia, periodo) !== filtroSituacao) return false;
    }
    return true;
  });
  const temFiltroDeCard = filtroTipo !== null || filtroSituacao !== null || filtroForma !== null;

  const limparFiltros = () => {
    setFiltroTipo(null);
    setFiltroSituacao(null);
    setFiltroForma(null);
  };

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    if (!clinicaAtual) return;
    const valorNum = Number(form.valor || 0);
    if (valorNum <= 0) {
      toast.error("Informe o valor.");
      return;
    }
    if (form.tipo === "mensalista" && !form.competencia) {
      toast.error(`${LABEL_TIPO.mensalista} precisa do mês de competência.`);
      return;
    }
    setSaving(true);
    const { erro } = await criarMovimento({
      clinica_id: clinicaAtual.clinica_id,
      tipo: form.tipo,
      sentido: form.sentido,
      placa: form.placa.trim() || null,
      nome: form.nome.trim() || null,
      valor: valorNum,
      forma_pagamento: form.forma_pagamento || null,
      data: form.data,
      // A competência é gravada como o dia 1 do mês escolhido; o banco também
      // normaliza, então os dois lados concordam.
      competencia: form.tipo === "mensalista" ? `${form.competencia}-01` : null,
      observacoes: form.observacoes.trim() || null,
      criado_por: user?.id ?? null,
    });
    setSaving(false);
    if (erro) {
      toast.error(erro.message ?? "Não foi possível gravar.");
      return;
    }
    toast.success("Lançamento registrado.");
    setOpen(false);
    setForm(formVazio());
    void carregar();
  };

  const excluir = async (m: MovimentoEstacionamento) => {
    const { erro } = await excluirMovimento(m.id);
    if (erro) {
      toast.error(erro.message ?? "Não foi possível excluir.");
      return;
    }
    toast.success("Lançamento excluído.");
    setConfirmDel(null);
    void carregar();
  };

  const tituloDaLinha = (m: MovimentoEstacionamento) =>
    `${LABEL_TIPO[m.tipo]} · ${quemEhNoMovimento(m)}`;

  const exportar = () => {
    if (!visiveis.length) {
      toast.info("Sem dados para exportar.");
      return;
    }
    exportToExcel(
      visiveis.map((m) => ({
        data: m.data ? `${m.data.slice(8, 10)}/${m.data.slice(5, 7)}/${m.data.slice(0, 4)}` : "",
        tipo: LABEL_TIPO[m.tipo],
        sentido: m.sentido === "entrada" ? "Entrada" : "Saída",
        placa: m.placa ?? "",
        nome: m.nome ?? "",
        competencia: mesBR(m.competencia),
        forma: LABEL_FORMA[balde(m)],
        valor: m.valor.toFixed(2),
        observacoes: m.observacoes ?? "",
      })),
      `estacionamento-${fromDate}_a_${toDate}`,
      [
        { key: "data", label: "Data" },
        { key: "tipo", label: "Tipo" },
        { key: "sentido", label: "Sentido" },
        { key: "placa", label: "Placa" },
        { key: "nome", label: "Nome" },
        { key: "competencia", label: "Competência" },
        { key: "forma", label: "Forma de pagamento" },
        { key: "valor", label: "Valor (R$)" },
        { key: "observacoes", label: "Observações" },
      ],
    );
  };

  const imprimir = () => {
    if (!visiveis.length) {
      toast.info("Sem dados para o relatório.");
      return;
    }
    const esc = (v: unknown) =>
      String(v ?? "").replace(
        /[&<>"']/g,
        (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
      );
    const p = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
    const linhas = visiveis
      .map(
        (m) =>
          `<tr><td>${esc(p(m.data))}</td><td>${esc(tituloDaLinha(m))}</td><td>${esc(
            mesBR(m.competencia),
          )}</td><td>${esc(LABEL_FORMA[balde(m)])}</td><td style="text-align:right;">${esc(
            (m.sentido === "saida" ? "-" : "+") + " " + fmt(m.valor),
          )}</td></tr>`,
      )
      .join("");
    const html =
      `<!doctype html><html><head><meta charset="utf-8"/><title>Estacionamento</title><style>` +
      `body{font-family:Arial,sans-serif;padding:24px;color:#0f172a;}h1{font-size:16px;margin:0 0 6px;text-align:center;letter-spacing:.5px;}` +
      `.meta{font-size:11px;color:#475569;margin-bottom:10px;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;}` +
      `table{width:100%;border-collapse:collapse;font-size:12px;}th,td{padding:5px 6px;border-bottom:1px solid #cbd5e1;}` +
      `thead th{border-bottom:2px solid #0f172a;text-align:left;}tfoot td{border-top:2px solid #0f172a;font-weight:700;}` +
      `</style></head><body><h1>ESTACIONAMENTO</h1>` +
      `<div class="meta"><span>Período: ${esc(p(fromDate))} — ${esc(p(toDate))}</span>` +
      `<span>Emitido: ${esc(new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }))}</span></div>` +
      `<table><thead><tr><th>Data</th><th>Descrição</th><th>Competência</th><th>Forma</th><th style="text-align:right;">Valor</th></tr></thead>` +
      `<tbody>${linhas}</tbody>` +
      `<tfoot><tr><td colspan="4">TOTAL RECEBIDO</td><td style="text-align:right;">${esc(
        fmt(formasRecebidas.total),
      )}</td></tr>` +
      `<tr><td colspan="4">TOTAL PAGO</td><td style="text-align:right;">${esc(fmt(totalPago))}</td></tr></tfoot>` +
      `</table><script>window.onload=function(){window.print();}</script></body></html>`;
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) {
      toast.error("Bloqueador de pop-up impediu a impressão");
      return;
    }
    w.document.write(html);
    w.document.close();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Car className="h-6 w-6" />
            Estacionamento
          </h1>
          <p className="text-sm text-muted-foreground">
            Particular e mensalidades — entradas e saídas do período.
          </p>
        </div>
        {podeEscrever && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button disabled={!clinicaAtual || faltaTabela}>
                <Plus className="h-4 w-4 mr-2" />
                Novo lançamento
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Novo lançamento do estacionamento</DialogTitle>
              </DialogHeader>
              <form onSubmit={salvar} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Tipo</Label>
                    <Select
                      value={form.tipo}
                      onValueChange={(v) => setForm((f) => ({ ...f, tipo: v as TipoMovimento }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="rotativo">{LABEL_TIPO.rotativo}</SelectItem>
                        <SelectItem value="mensalista">{LABEL_TIPO.mensalista}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Sentido</Label>
                    <Select
                      value={form.sentido}
                      onValueChange={(v) => setForm((f) => ({ ...f, sentido: v as Sentido }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="entrada">Entrada (recebimento)</SelectItem>
                        <SelectItem value="saida">Saída (despesa)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Placa</Label>
                    <Input
                      value={form.placa}
                      onChange={(e) => setForm((f) => ({ ...f, placa: e.target.value }))}
                      placeholder="ABC1D23"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">
                      Nome {form.tipo === "rotativo" ? "(opcional)" : ""}
                    </Label>
                    <Input
                      value={form.nome}
                      onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                      placeholder="Nome do cliente"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Valor</Label>
                    <CurrencyInput
                      value={form.valor}
                      onChange={(v) => setForm((f) => ({ ...f, valor: v }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Forma de pagamento</Label>
                    <Select
                      value={form.forma_pagamento}
                      onValueChange={(v) => setForm((f) => ({ ...f, forma_pagamento: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="dinheiro">Dinheiro</SelectItem>
                        <SelectItem value="pix">PIX</SelectItem>
                        <SelectItem value="cartao_debito">Cartão de débito</SelectItem>
                        <SelectItem value="cartao_credito">Cartão de crédito</SelectItem>
                        <SelectItem value="transferencia">Transferência</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Data do pagamento</Label>
                    <DateInputBR
                      value={form.data}
                      onChange={(e) => setForm((f) => ({ ...f, data: e.target.value }))}
                    />
                  </div>
                  {form.tipo === "mensalista" && (
                    <div className="space-y-1">
                      <Label className="text-xs">Mês de competência</Label>
                      <Input
                        type="month"
                        value={form.competencia}
                        onChange={(e) => setForm((f) => ({ ...f, competencia: e.target.value }))}
                      />
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Observações</Label>
                  <Textarea
                    rows={2}
                    value={form.observacoes}
                    onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))}
                  />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={saving}>
                    {saving ? "Salvando..." : "Salvar"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* A tabela do estacionamento é nova. Enquanto o SQL não for aplicado a
          tela existe, mas não tem onde buscar dado — e dizer isso é melhor do
          que mostrar um módulo vazio sem explicação. */}
      {faltaTabela && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-900">
            <p className="font-medium">Falta aplicar o SQL do estacionamento.</p>
            <p className="text-xs mt-1">
              A tela está pronta, mas a tabela ainda não existe no banco. Rode o arquivo{" "}
              <span className="font-mono">APLICAR-ESTACIONAMENTO.sql</span> no SQL editor do Lovable
              Cloud e recarregue esta página.
            </p>
          </div>
        </div>
      )}

      {/* Barra de totais do topo. */}
      <Card>
        <CardContent className="pt-5">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)_minmax(0,2fr)]">
            <div className="space-y-2">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Total recebido por forma de pagamento
              </p>
              <div className="grid grid-cols-3 gap-2">
                {colunas.map((c) => (
                  <CardTotal
                    key={c.chave}
                    titulo={c.label}
                    valor={c.total}
                    legenda={`${c.qtd} ${c.qtd === 1 ? "transação" : "transações"}`}
                    ativo={filtroForma === c.chave}
                    onClick={() => setFiltroForma(filtroForma === c.chave ? null : c.chave)}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Total pago (saídas) — {fmt(totalPago)}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <CardTotal titulo="Pago em dinheiro" valor={pagoEmDinheiro} tom="saida" />
                <CardTotal
                  titulo="Pago pelo banco (PIX/cartão)"
                  valor={pagoPeloBanco}
                  tom="saida"
                />
              </div>
            </div>

            <div className="space-y-2">
              {/* No sistema de referência estes dois valores aparecem sob o
                  rótulo de saídas, mas eles somam exatamente o total RECEBIDO:
                  são a quebra do que entrou, por tipo. O rótulo aqui diz o que
                  o número é. */}
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Recebido por tipo
              </p>
              <div className="grid grid-cols-2 gap-2">
                <CardTotal
                  titulo={LABEL_TIPO.rotativo}
                  valor={recebidoRotativo}
                  onClick={() => setFiltroTipo(filtroTipo === "rotativo" ? null : "rotativo")}
                  ativo={filtroTipo === "rotativo"}
                />
                <CardTotal
                  titulo={LABEL_TIPO.mensalista}
                  valor={recebidoMensalista}
                  onClick={() => setFiltroTipo(filtroTipo === "mensalista" ? null : "mensalista")}
                  ativo={filtroTipo === "mensalista"}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detalhamento de mensalistas. */}
      <Card>
        <CardContent className="pt-5 space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-start gap-2">
              <Car className="h-4 w-4 mt-0.5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Detalhamento de mensalidades no período</p>
                <p className="text-xs text-muted-foreground">
                  Quanto entrou no caixa × a qual mês cada pagamento se refere
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Total recebido
              </p>
              <p className="text-lg font-semibold tabular-nums">{fmt(mensal.total.total)}</p>
              <p className="text-[10px] text-muted-foreground">
                {mensal.total.qtd} {mensal.total.qtd === 1 ? "pagamento" : "pagamentos"}
              </p>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {SITUACOES.map((s) => {
              const t = TOM_SITUACAO[s];
              const dados = mensal.porSituacao[s];
              const ativo = filtroSituacao === s;
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={ativo}
                  onClick={() => setFiltroSituacao(ativo ? null : s)}
                  className={`text-left rounded-md border px-3 py-2 transition hover:brightness-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    ativo ? "ring-2 ring-offset-1 ring-primary " + t.classe : t.classe
                  }`}
                >
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                    <t.Icone className="h-3.5 w-3.5" />
                    {LABEL_SITUACAO[s]}
                  </p>
                  <p className={`text-lg font-semibold tabular-nums ${t.valor}`}>
                    {fmt(dados.total)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {dados.qtd} {dados.qtd === 1 ? "pagamento" : "pagamentos"} ·{" "}
                    {LEGENDA_SITUACAO[s]}
                  </p>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Barra de filtros e controles. */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">De</Label>
              <DateInputBR
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Até</Label>
              <DateInputBR
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Visão</Label>
              <div>
                <Pilulas
                  ariaLabel="Visão da listagem"
                  valor={modoLista}
                  onChange={setModoLista}
                  opcoes={[
                    { valor: "analitico", label: "Analítico" },
                    { valor: "sintetico", label: "Sintético" },
                  ]}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tipo</Label>
              <div>
                <Pilulas
                  ariaLabel="Entradas ou saídas"
                  valor={filtroSentido}
                  onChange={setFiltroSentido}
                  opcoes={[
                    { valor: "todos", label: "Todos" },
                    { valor: "entrada", label: "Entradas" },
                    { valor: "saida", label: "Saídas" },
                  ]}
                />
              </div>
            </div>
            <div className="ml-auto flex items-center gap-2 pb-0.5">
              <Button variant="outline" size="sm" onClick={imprimir} disabled={!visiveis.length}>
                <Printer className="h-4 w-4 mr-2" />
                Imprimir
              </Button>
              <Button variant="outline" size="sm" onClick={exportar} disabled={!visiveis.length}>
                <Download className="h-4 w-4 mr-2" />
                Excel
              </Button>
            </div>
          </div>
          {temFiltroDeCard && (
            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <span>
                Filtrado por{" "}
                <strong>
                  {[
                    filtroForma ? colunas.find((c) => c.chave === filtroForma)?.label : null,
                    filtroTipo ? LABEL_TIPO[filtroTipo] : null,
                    filtroSituacao ? LABEL_SITUACAO[filtroSituacao] : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </strong>
              </span>
              <Button variant="outline" size="sm" onClick={limparFiltros}>
                Limpar filtro
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Listagem. */}
      {loading ? (
        <div className="py-12 text-center text-muted-foreground">Carregando...</div>
      ) : visiveis.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          {faltaTabela
            ? "O módulo ainda não foi ativado no banco."
            : "Nenhum lançamento no período."}
        </div>
      ) : modoLista === "sintetico" ? (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            {(() => {
              const r = resumoSintetico(
                visiveis.map((m) => ({
                  categoria: LABEL_TIPO[m.tipo],
                  // `resumoSintetico` fala a língua do financeiro: aqui a
                  // entrada do estacionamento é uma receita e a saída, uma
                  // despesa. A conta é a mesma.
                  tipo: m.sentido === "entrada" ? "receita" : "despesa",
                  valor: m.valor,
                })),
              );
              return (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-right">Lançamentos</TableHead>
                      <TableHead className="text-right">Entradas</TableHead>
                      <TableHead className="text-right">Saídas</TableHead>
                      <TableHead className="text-right">Saldo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {r.linhas.map((l) => (
                      <TableRow key={l.label}>
                        <TableCell className="font-medium">{l.label}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {l.qtd}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-green-600">
                          {l.entradas ? fmt(l.entradas) : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-red-600">
                          {l.saidas ? fmt(l.saidas) : "—"}
                        </TableCell>
                        <TableCell
                          className={`text-right tabular-nums font-medium ${
                            l.saldo >= 0 ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          {fmt(l.saldo)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/40 font-semibold">
                      <TableCell>TOTAL</TableCell>
                      <TableCell className="text-right tabular-nums">{r.total.qtd}</TableCell>
                      <TableCell className="text-right tabular-nums text-green-600">
                        {fmt(r.total.entradas)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-red-600">
                        {fmt(r.total.saidas)}
                      </TableCell>
                      <TableCell
                        className={`text-right tabular-nums ${
                          r.total.saldo >= 0 ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {fmt(r.total.saldo)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              );
            })()}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {visiveis.map((m) => {
            const hora = new Date(m.created_at).toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
            });
            const dataBR = `${m.data.slice(8, 10)}/${m.data.slice(5, 7)}/${m.data.slice(0, 4)}`;
            return (
              <Card key={m.id}>
                <CardContent className="p-3 flex items-start gap-3">
                  <div className="pt-0.5 shrink-0">
                    {m.sentido === "entrada" ? (
                      <ArrowUpCircle className="h-5 w-5 text-green-600" />
                    ) : (
                      <ArrowDownCircle className="h-5 w-5 text-red-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium truncate">
                        <Car className="h-4 w-4 inline-block mr-1 align-text-bottom" />
                        {tituloDaLinha(m)}
                      </p>
                      <Badge variant="secondary" className="text-[11px] px-1.5 py-0">
                        {LABEL_TIPO[m.tipo]}
                      </Badge>
                      <Badge variant="outline" className="text-[11px] px-1.5 py-0">
                        estacionamento
                      </Badge>
                      {m.competencia && (
                        <Badge
                          variant="outline"
                          className="text-[11px] px-1.5 py-0 border-sky-300 bg-sky-50 text-sky-800"
                        >
                          competência {mesBR(m.competencia)}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {dataBR}, {hora} · {LABEL_FORMA[balde(m)]}
                      {m.observacoes ? ` · ${m.observacoes}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`text-sm font-semibold tabular-nums whitespace-nowrap ${
                        m.sentido === "entrada" ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {m.sentido === "entrada" ? "+" : "-"}&nbsp;{fmt(m.valor)}
                    </span>
                    {podeEscrever && (
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Excluir lançamento"
                        onClick={() => setConfirmDel(m)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog open={confirmDel !== null} onOpenChange={(v) => !v && setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir este lançamento?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDel
                ? `${tituloDaLinha(confirmDel)} — ${fmt(confirmDel.valor)}. Esta ação não pode ser desfeita.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmDel && void excluir(confirmDel)}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
