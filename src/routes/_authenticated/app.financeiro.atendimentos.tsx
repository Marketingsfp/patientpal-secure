import { createFileRoute } from "@tanstack/react-router";
import { confirmDialog } from "@/lib/confirm";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  carregarMapaConvenioPacientes,
  resolverModalidade,
  type MapaConvenioPaciente,
} from "@/lib/convenio/modalidade";
import {
  Plus,
  Pencil,
  Trash2,
  Stethoscope,
  Download,
  Filter,
  Wallet,
  CheckCircle2,
  Clock,
  Check,
  ChevronsUpDown,
  Send,
  Loader2,
  Banknote,
  CreditCard,
  QrCode,
  HelpCircle,
  Printer,
  MoreHorizontal,
  Undo2,
  RotateCcw,
  CalendarIcon,
} from "lucide-react";
import { History } from "lucide-react";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { montarDiscriminacaoNfse } from "@/lib/nfse-descricao";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { useMedicoContext } from "@/hooks/use-medico-context";
import { useServerFn } from "@tanstack/react-start";
import { emitirNfse, consultarNfse } from "@/lib/nfse.functions";
import { avisarCepDoTomadorInvalido } from "@/lib/nfse-aviso-cep";
import { usePickTomador, aplicarValorParcial } from "@/components/nfse/use-pick-tomador";
import { usePromptDescricaoNfse } from "@/components/nfse/use-prompt-descricao";
import { exportToExcel } from "@/lib/export-csv";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, parse } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { DateInputBR } from "@/components/ui/date-input-br";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ComprovantesTab } from "@/components/financeiro/comprovantes-tab";
import { HistoricoAtendimentoDialog } from "@/components/financeiro/historico-atendimento-dialog";
import { resolverRepasse, formaDoAtendimento, type RepasseTerceiro } from "@/lib/repasse-calc";

export const Route = createFileRoute("/_authenticated/app/financeiro/atendimentos")({
  component: AtendimentosPage,
  head: () => ({ meta: [{ title: "Atendimentos — Financeiro" }] }),
});

interface Atend {
  id: string;
  data: string;
  procedimento: string | null;
  valor_total: number;
  valor_medico: number;
  valor_clinica: number;
  status: string;
  forma_pagamento: string | null;
  medico_id: string | null;
  paciente_id: string | null;
  origem?: "manual" | "agenda";
  agendamento_id?: string | null;
  repasse_pago?: boolean;
  repasse_pago_em?: string | null;
  repasse_pago_at?: string | null;
  repasse_forma_pagamento?: string | null;
  repasse_conta_id?: string | null;
  paciente_nome_extra?: string | null;
  agendamento_inicio?: string | null;
  agendamento_status?: string | null;
  requer_laudo?: boolean;
  laudo_status?: string | null;
  medico_laudador_id?: string | null;
  valor_laudo?: number;
  /** REPASSE TRIPLO — dono do equipamento que também recebe por este atendimento */
  terceiro_medico_id?: string | null;
  terceiro_percentual?: number | null;
  terceiro_valor?: number;
  /** Repasse do terceiro já foi pago (existe linha em fin_repasse_terceiro) */
  terceiro_pago?: boolean;
  /**
   * Dados do pagamento do terceiro, copiados de `fin_repasse_terceiro`. O
   * terceiro é pago no MESMO commit do executante, mas em lançamento próprio —
   * a 2ª via do recibo dele precisa da data/forma/conta gravadas na linha
   * dele, não das do executante.
   */
  terceiro_pago_em?: string | null;
  terceiro_pago_at?: string | null;
  terceiro_forma_pagamento?: string | null;
  terceiro_conta_id?: string | null;
}
interface Medico {
  id: string;
  nome: string;
  tipo_repasse: string;
  percentual_repasse_padrao: number;
  valor_repasse_padrao: number | null;
  aceita_cartao_beneficios?: boolean;
  cb_tipo_repasse?: string | null;
  cb_valor_repasse?: number | null;
  cb_percentual_repasse?: number | null;
}
interface Pac {
  id: string;
  nome: string;
}
interface Convenio {
  medico_id: string;
  nome: string;
  tipo_repasse: string;
  percentual: number | null;
  valor: number | null;
  convenio_tipo_repasse?: string | null;
  convenio_percentual?: number | null;
  convenio_valor?: number | null;
  cartao_consulta_valor?: number | null;
  cartao_desconto_valor?: number | null;
  terceiro_id?: string | null;
  percentual_terceiro?: number | null;
  tipo_repasse_terceiro?: string | null;
  valor_terceiro?: number | null;
}
interface Conta {
  id: string;
  nome: string;
}
interface Emitente {
  id: string;
  nome: string;
  codigo_municipio: string | null;
}
interface PacFull {
  id: string;
  nome: string;
  cpf: string | null;
  email: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
}

const EMPTY = {
  data: new Date().toISOString().slice(0, 10),
  medico_id: "",
  paciente_id: "",
  procedimento: "",
  valor_total: "",
  forma_pagamento: "",
  status: "realizado",
};
const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Deriva HH:mm de um timestamp de pagamento somente quando ele tem hora
 * explícita (>00:00 UTC). Registros antigos foram backfillados de `date` para
 * timestamptz em 00:00 UTC — comparar em UTC evita falso-positivo quando o
 * fuso local gera hh != 0 (ex.: 21:00 em BRT para 00:00 UTC).
 */
const derivarHoraPagamento = (iso: string | null | undefined): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const isBackfill = d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0;
  if (isBackfill) return null;
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

// Ícone da forma de pagamento
function FormaPagamentoIcon({ forma }: { forma: string | null | undefined }) {
  const f = (forma ?? "").toLowerCase();
  if (!f) return <span className="text-muted-foreground text-xs">—</span>;
  if (f.includes("pix")) return <QrCode className="h-4 w-4 text-emerald-600" aria-label="PIX" />;
  if (f.includes("dinhe") || f.includes("especie") || f.includes("espécie"))
    return <Banknote className="h-4 w-4 text-green-700" aria-label="Dinheiro" />;
  if (f.includes("cart") || f.includes("credi") || f.includes("debi") || f.includes("débi"))
    return <CreditCard className="h-4 w-4 text-blue-600" aria-label="Cartão" />;
  return <HelpCircle className="h-4 w-4 text-muted-foreground" aria-label={forma ?? ""} />;
}

function AtendimentosPage() {
  const { clinicaAtual } = useClinica();
  const { medicoId: medicoLogadoId, isMedicoOnly } = useMedicoContext();
  const podeEscrever = usePodeEscrever("financeiro");
  // Estorno segue a matriz de Perfis de Acesso normalmente (módulo "financeiro"),
  // não mais uma lista fixa de papéis — qualquer perfil com "Financeiro: edição"
  // pode estornar.
  const podeEstornar = podeEscrever;
  // Estornar um repasse JÁ PAGO é mais sério do que desfazer a baixa: desfaz o
  // pagamento do médico e mexe na despesa/comprovante. Fica restrito a
  // Financeiro e Administração. A mesma regra é reforçada no banco pela função
  // `estornar_repasse_atendimento` — aqui é só para não exibir um botão que
  // certamente falharia.
  const podeEstornarRepasse =
    podeEscrever && ["admin", "gestor", "financeiro"].includes(clinicaAtual?.role ?? "");
  const [items, setItems] = useState<Atend[]>([]);
  const [medicos, setMedicos] = useState<Medico[]>([]);
  const [pacientes, setPacientes] = useState<Pac[]>([]);
  const [convenios, setConvenios] = useState<Convenio[]>([]);
  const [procValores, setProcValores] = useState<Map<string, number>>(new Map());
  const [procTipos, setProcTipos] = useState<Map<string, string>>(new Map());
  const [procLaudo, setProcLaudo] = useState<Map<string, boolean>>(new Map());
  // Vínculo de convênio por paciente (contrato ativo) — decide Cartão
  // Consulta/Desconto pelo cadastro, não pelo texto do lançamento.
  const [mapaConvenio, setMapaConvenio] = useState<MapaConvenioPaciente>(new Map());
  const [loading, setLoading] = useState(true);
  const [historicoAtend, setHistoricoAtend] = useState<Atend | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Atend | null>(null);
  const [form, setForm] = useState(EMPTY);
  // Filtros do relatório
  const hoje = new Date().toISOString().slice(0, 10);
  const [fMedico, setFMedico] = useState<string>("todos");
  const [fIni, setFIni] = useState<string>(hoje);
  const [fFim, setFFim] = useState<string>(hoje);
  const [fStatus, setFStatus] = useState<"todos" | "aberto" | "pago">("aberto");
  const [fPaciente, setFPaciente] = useState<string>("");
  const [fOrdem, setFOrdem] = useState<
    "data_desc" | "data_asc" | "gr" | "paciente_az" | "paciente_za"
  >("gr");
  const [fTipo, setFTipo] = useState<"todos" | "medico" | "clinica">("todos");
  const [fLaudo, setFLaudo] = useState<"todos" | "baixado" | "nao_baixado">("todos");
  const [contas, setContas] = useState<Conta[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [optsReady, setOptsReady] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [payForm, setPayForm] = useState({
    data: hoje,
    conta_id: "",
    forma_pagamento: "",
    valor_manual: "",
  });
  // Edição pontual do repasse médico de um atendimento (linha da tabela)
  const [editRepasse, setEditRepasse] = useState<{
    open: boolean;
    atend: Atend | null;
    valor: string;
  }>({
    open: false,
    atend: null,
    valor: "",
  });
  const [savingRepasse, setSavingRepasse] = useState(false);
  const abrirEditRepasse = (a: Atend) => {
    setEditRepasse({ open: true, atend: a, valor: (Number(a.valor_medico) || 0).toFixed(2) });
  };
  const salvarEditRepasse = async () => {
    const a = editRepasse.atend;
    if (!a) return;
    const valorNum = Number(editRepasse.valor);
    if (!Number.isFinite(valorNum) || valorNum < 0) {
      toast.error("Valor inválido");
      return;
    }
    setSavingRepasse(true);
    try {
      const oldValor = Number(a.valor_medico) || 0;
      const delta = +(valorNum - oldValor).toFixed(2);
      // 1) Grava o valor no local certo conforme a origem do atendimento.
      if (a.origem === "agenda") {
        // Agenda: fin_lancamentos não tem valor_medico; usamos o override.
        const { error } = await supabase
          .from("fin_lancamentos")
          .update({ valor_medico_override: valorNum })
          .eq("id", a.id);
        if (error) {
          mostrarErro(error);
          return;
        }
      } else {
        const { error } = await supabase
          .from("fin_atendimentos")
          .update({ valor_medico: valorNum })
          .eq("id", a.id);
        if (error) {
          mostrarErro(error);
          return;
        }
      }
      // 2) Se o repasse já foi pago, ajusta a despesa vinculada pelo delta
      //    para o total do lançamento continuar batendo com o pago.
      let msgExtra = "";
      if (a.repasse_pago && Math.abs(delta) >= 0.005) {
        const srcTable = a.origem === "agenda" ? "fin_lancamentos" : "fin_atendimentos";
        const { data: src } = await supabase
          .from(srcTable)
          .select("repasse_lancamento_id")
          .eq("id", a.id)
          .maybeSingle();
        const lancId =
          (src as { repasse_lancamento_id?: string | null } | null)?.repasse_lancamento_id ?? null;
        if (lancId) {
          const { data: desp } = await supabase
            .from("fin_lancamentos")
            .select("valor")
            .eq("id", lancId)
            .maybeSingle();
          const valorAtual =
            Number((desp as { valor?: number | string | null } | null)?.valor) || 0;
          const novoValor = +(valorAtual + delta).toFixed(2);
          if (novoValor < 0) {
            toast.error(
              `Ajuste inválido: a despesa vinculada ficaria negativa (R$ ${novoValor.toFixed(2)}). Estorne o pagamento antes.`,
            );
            return;
          }
          const { error: eUp } = await supabase
            .from("fin_lancamentos")
            .update({ valor: novoValor })
            .eq("id", lancId);
          if (eUp) {
            mostrarErro(eUp);
            return;
          }
          msgExtra = ` Despesa vinculada ajustada em ${delta >= 0 ? "+" : ""}${delta.toFixed(2)}.`;
        } else {
          msgExtra = " (Sem despesa vinculada — nada a ajustar no caixa.)";
        }
      }
      toast.success("Repasse atualizado." + msgExtra);
      setEditRepasse({ open: false, atend: null, valor: "" });
      await load();
    } finally {
      setSavingRepasse(false);
    }
  };
  // Comprovante de pagamento de repasse (para impressão)
  type CompItem = {
    data: string;
    medico: string;
    paciente: string;
    servico: string;
    valorMedico: number;
    pagoEm: string | null;
    pagoHora: string | null;
    /** REPASSE TRIPLO — % do valor do atendimento pago ao terceiro nesta linha */
    percentual?: number | null;
  };
  type Comprovante = {
    clinicaNome: string;
    medicoNome: string;
    dataPagamento: string;
    horaPagamento: string | null;
    formaPagamento: string;
    contaNome: string;
    itens: CompItem[];
    total: number;
    qtd: number;
    emitidoEm: string;
    reimpressao: boolean;
    multiplasDatas?: number;
    /**
     * REPASSE TRIPLO — de quem é este recibo. O terceiro (dono do equipamento)
     * recebe num lançamento de despesa PRÓPRIO, então precisa de um recibo
     * próprio para assinar; o recibo do executante não comprova o que foi pago
     * a ele.
     */
    papel: "executante" | "terceiro";
    /** Só nos blocos de terceiro: quem executou os atendimentos. */
    executanteNome?: string | null;
    /**
     * Só no bloco do executante: a fatia de cada terceiro no mesmo lote, para
     * a divisão ficar visível também no papel do médico principal.
     */
    terceiros?: { nome: string; total: number; qtd: number; percentuais: number[] }[];
  } | null;
  const [comprovante, setComprovante] = useState<Comprovante>(null);
  const [comprovantes, setComprovantes] = useState<NonNullable<Comprovante>[]>([]);
  const [comprovanteOpen, setComprovanteOpen] = useState(false);
  const printAreaRef = useRef<HTMLDivElement | null>(null);
  const imprimirComprovante = (somenteResumo = false) => {
    const source = printAreaRef.current;
    if (!source) {
      toast.error("Comprovante não encontrado para impressão.");
      return;
    }

    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    Object.assign(iframe.style, {
      position: "fixed",
      left: "-10000px",
      top: "0",
      width: "210mm",
      height: "297mm",
      border: "0",
      opacity: "0",
      pointerEvents: "none",
    });

    document.body.appendChild(iframe);
    const printWindow = iframe.contentWindow;
    const printDocument = printWindow?.document;
    if (!printWindow || !printDocument) {
      iframe.remove();
      toast.error("Não foi possível preparar a impressão.");
      return;
    }

    const cleanup = () => {
      setTimeout(() => iframe.remove(), 500);
      printWindow.removeEventListener("afterprint", cleanup);
    };

    printDocument.open();
    printDocument.write(`<!doctype html>
      <html lang="pt-BR">
        <head>
          <meta charset="utf-8" />
          <title>Comprovante de repasse médico</title>
          <style>
            @page { size: A4 portrait; margin: 9mm; }
            html, body { margin: 0; padding: 0; background: #fff; color: #111; }
            body { font-family: Arial, Helvetica, sans-serif; font-size: 9.5pt; line-height: 1.28; }
            * { box-sizing: border-box; }
            .print-shell { width: 100%; max-width: 192mm; margin: 0 auto; }
            .print-area { width: 100%; max-width: 100%; overflow: visible; background: #fff; color: #111; }
            .comprovante-bloco { width: 100%; break-after: page; page-break-after: always; }
            .comprovante-bloco:last-child { break-after: auto; page-break-after: auto; }
            .flex { display: flex; }
            .grid { display: grid; }
            .grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
            .items-start { align-items: flex-start; }
            .justify-between { justify-content: space-between; }
            .gap-8 { gap: 12mm; }
            .text-right { text-align: right; }
            .text-center { text-align: center; }
            .uppercase { text-transform: uppercase; }
            .font-semibold { font-weight: 600; }
            .font-extrabold { font-weight: 800; }
            .text-xs { font-size: 8pt; }
            .text-sm { font-size: 9.5pt; }
            .text-base { font-size: 10pt; }
            .text-lg { font-size: 12pt; }
            .text-xl { font-size: 13pt; }
            .tracking-wide { letter-spacing: 0; }
            .opacity-80 { opacity: .8; }
            .border, .border-b, .border-t, .border-2, .border-t-4 { border-color: #d4d4d4; }
            .border { border: 1px solid #d4d4d4; }
            .border-b { border-bottom: 1px solid #d4d4d4; }
            .border-t { border-top: 1px solid #d4d4d4; }
            .border-2 { border: 2px solid #be123c; }
            .border-t-4 { border-top: 2px dashed #94a3b8; }
            .rounded-md { border-radius: 4px; }
            .p-2 { padding: 1.6mm; }
            .p-3 { padding: 2.4mm; }
            .pt-1 { padding-top: 1mm; }
            .pt-4 { padding-top: 3mm; }
            .pt-8 { padding-top: 4mm; }
            .pb-3 { padding-bottom: 2.4mm; }
            .mb-3 { margin-bottom: 2.4mm; }
            .mt-0\\.5 { margin-top: .5mm; }
            .mt-1 { margin-top: 1mm; }
            .mt-8 { margin-top: 4mm; }
            .mt-10 { margin-top: 10mm; }
            .ml-1 { margin-left: 1mm; }
            .bg-rose-100 { background: #ffe4e6; }
            .text-rose-900 { color: #881337; }
            .text-muted-foreground { color: #555; }
            .text-primary { color: #111; }
            .comprovante-resumo {
              display: grid;
              grid-template-columns: repeat(2, minmax(0, 1fr));
              column-gap: 8mm;
              row-gap: 1.4mm;
              border: 1px solid #d4d4d4;
              border-radius: 4px;
              padding: 2.4mm;
              margin-bottom: 2.5mm;
            }
            /* Linha da divisão do repasse (terceiro) ocupa as duas colunas. */
            .comprovante-resumo .col-span-2 { grid-column: 1 / -1; }
            table { width: 100%; max-width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 8pt; }
            thead { display: table-header-group; }
            tfoot { display: table-footer-group; }
            tr { break-inside: avoid; page-break-inside: avoid; }
            th, td { padding: 1.4mm 1mm; border-bottom: 1px solid #d7d7d7; vertical-align: top; overflow-wrap: break-word; word-break: normal; }
            th { text-align: left; font-weight: 700; background: #f4f4f5; }
            th:nth-child(1), td:nth-child(1) { width: 9%; white-space: nowrap; }
            th:nth-child(2), td:nth-child(2) { width: 15%; }
            th:nth-child(3), td:nth-child(3) { width: 18%; }
            th:nth-child(4), td:nth-child(4) { width: 20%; }
            th:nth-child(5), td:nth-child(5) { width: 26%; }
            th:nth-child(6), td:nth-child(6) { width: 12%; text-align: right; white-space: nowrap; }
            body.print-resumo-only .print-area .comprovante-bloco > *:not(.comprovante-resumo) { display: none !important; }
            body.print-resumo-only .print-area .comprovante-resumo { margin-top: 0 !important; }
          </style>
        </head>
        <body class="${somenteResumo ? "print-resumo-only" : ""}">
          <main class="print-shell">
            <div class="print-area">${source.innerHTML}</div>
          </main>
        </body>
      </html>`);
    printDocument.close();

    printWindow.addEventListener("afterprint", cleanup);
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
      setTimeout(cleanup, 60000);
    }, 100);
  };
  // Nome do paciente com o MESMO fallback usado na lista da tela: o combobox só
  // carrega os 500 primeiros pacientes, então `pacMap` erra na maioria das
  // linhas. O nome real vem embutido na própria linha (`paciente_nome_extra`,
  // de `agendamentos.paciente_nome` ou da FK `paciente:pacientes(nome)`).
  // Sem esse fallback o comprovante impresso saía com "—" em toda a coluna.
  const nomePaciente = (a: Atend): string =>
    ((a.paciente_id ? pacMap.get(a.paciente_id) : null) ?? a.paciente_nome_extra ?? "").trim();
  const buildComprovante = (
    itens: Atend[],
    meta: {
      data: string;
      forma_pagamento: string;
      conta_id: string;
      pago_at?: string | null;
      reimpressao?: boolean;
    },
  ): Comprovante => {
    if (!itens.length) return null;
    const medicoIds = new Set(itens.map((i) => i.medico_id ?? ""));
    const medicoNome =
      medicoIds.size === 1 ? (medMap.get([...medicoIds][0]) ?? "—") : `${medicoIds.size} médicos`;
    const contaNome = contas.find((c) => c.id === meta.conta_id)?.nome ?? "—";
    const derivarHora = derivarHoraPagamento;
    // Data/hora do pagamento do lote. Precisa ser calculada ANTES das linhas
    // porque serve de fallback para a coluna "Pago em" de cada linha.
    const horaPagamento = derivarHora(meta.pago_at ?? null);
    const rows: CompItem[] = itens.map((a) => {
      const pagoEmLinha =
        a.repasse_pago_em ?? (a.repasse_pago_at ? a.repasse_pago_at.slice(0, 10) : null);
      return {
        data: a.data,
        medico: a.medico_id ? (medMap.get(a.medico_id) ?? "—") : "—",
        paciente: nomePaciente(a) || "—",
        servico: a.procedimento ?? "—",
        valorMedico: Number(a.valor_medico) || 0,
        // No comprovante emitido no ato do pagamento a linha em memória ainda
        // está com `repasse_pago_em` nulo (a lista só recarrega depois), e a
        // coluna saía "—". Nesse caso vale a data/hora do próprio lote.
        pagoEm: pagoEmLinha ?? (meta.data || null),
        pagoHora: pagoEmLinha ? derivarHora(a.repasse_pago_at ?? null) : horaPagamento,
      };
    });
    const total = rows.reduce((s, r) => s + r.valorMedico, 0);
    // REPASSE TRIPLO — resumo da fatia de cada terceiro do mesmo lote, para o
    // recibo do executante mostrar a divisão inteira (o valor dele NÃO inclui
    // a parte do terceiro: são dois pagamentos separados).
    const terceiros = agruparTerceiros(itens, !!meta.reimpressao).map((t) => ({
      nome: t.nome,
      total: t.total,
      qtd: t.itens.length,
      percentuais: t.percentuais,
    }));
    return {
      clinicaNome: clinicaAtual?.clinica?.nome ?? "—",
      medicoNome,
      dataPagamento: meta.data,
      horaPagamento,
      formaPagamento: meta.forma_pagamento || "—",
      contaNome,
      itens: rows,
      total,
      qtd: rows.length,
      emitidoEm: new Date().toLocaleString("pt-BR"),
      reimpressao: !!meta.reimpressao,
      papel: "executante",
      terceiros,
    };
  };
  /**
   * REPASSE TRIPLO — agrupa os atendimentos por terceiro (dono do equipamento).
   * Na 2ª via (`apenasPagos`) entra só quem já tem o repasse gravado em
   * `fin_repasse_terceiro`; no ato do pagamento entra o inverso — os que ainda
   * não estavam pagos, exatamente os que a RPC acabou de pagar.
   */
  const agruparTerceiros = (itens: Atend[], apenasPagos: boolean) => {
    const m = new Map<
      string,
      { terceiroId: string; nome: string; total: number; percentuais: number[]; itens: Atend[] }
    >();
    for (const a of itens) {
      if (!a.terceiro_medico_id) continue;
      const valor = Number(a.terceiro_valor) || 0;
      if (valor <= 0) continue;
      if (apenasPagos ? !a.terceiro_pago : !!a.terceiro_pago) continue;
      const k = a.terceiro_medico_id;
      let g = m.get(k);
      if (!g) {
        g = {
          terceiroId: k,
          nome: medMap.get(k) ?? "Terceiro",
          total: 0,
          percentuais: [],
          itens: [],
        };
        m.set(k, g);
      }
      g.total = +(g.total + valor).toFixed(2);
      g.itens.push(a);
      const pct = a.terceiro_percentual == null ? null : Number(a.terceiro_percentual);
      if (pct != null && !g.percentuais.includes(pct)) g.percentuais.push(pct);
    }
    for (const g of m.values()) g.percentuais.sort((x, y) => x - y);
    return [...m.values()];
  };
  /**
   * REPASSE TRIPLO — um comprovante PRÓPRIO para cada terceiro. O financeiro
   * precisa de um papel assinável por profissional: o terceiro recebe num
   * lançamento de despesa separado do executante e não aparecia em recibo
   * nenhum.
   */
  const buildComprovantesTerceiro = (
    itens: Atend[],
    meta: { data: string; forma_pagamento: string; conta_id: string; reimpressao?: boolean },
  ): NonNullable<Comprovante>[] => {
    const blocos: NonNullable<Comprovante>[] = [];
    for (const g of agruparTerceiros(itens, !!meta.reimpressao)) {
      const primeiro = g.itens[0];
      // Na 2ª via valem a data/forma/conta gravadas no pagamento do terceiro;
      // no ato do pagamento ainda não existe linha no banco, então valem os
      // dados do lote que está sendo pago (é o mesmo COMMIT).
      const dataPag =
        (meta.reimpressao ? primeiro.terceiro_pago_em : null) || meta.data || primeiro.data;
      const pagoAt = meta.reimpressao ? (primeiro.terceiro_pago_at ?? null) : null;
      const formas = new Set(g.itens.map((x) => x.terceiro_forma_pagamento ?? "").filter(Boolean));
      const contasSet = new Set(g.itens.map((x) => x.terceiro_conta_id ?? "").filter(Boolean));
      const formaPag = meta.reimpressao
        ? formas.size === 1
          ? [...formas][0]
          : formas.size > 1
            ? "Vários"
            : meta.forma_pagamento
        : meta.forma_pagamento;
      const contaId = meta.reimpressao
        ? contasSet.size === 1
          ? [...contasSet][0]
          : meta.conta_id
        : meta.conta_id;
      const horaPagamento = derivarHoraPagamento(pagoAt);
      const executantes = new Set(g.itens.map((x) => x.medico_id ?? "").filter(Boolean));
      const executanteNome =
        executantes.size === 1
          ? (medMap.get([...executantes][0]) ?? "—")
          : executantes.size > 1
            ? `${executantes.size} médicos`
            : "—";
      const rows: CompItem[] = g.itens.map((a) => ({
        data: a.data,
        medico: a.medico_id ? (medMap.get(a.medico_id) ?? "—") : "—",
        paciente: nomePaciente(a) || "—",
        servico: a.procedimento ?? "—",
        valorMedico: Number(a.terceiro_valor) || 0,
        pagoEm: (meta.reimpressao ? a.terceiro_pago_em : null) || dataPag || null,
        pagoHora: meta.reimpressao ? derivarHoraPagamento(a.terceiro_pago_at ?? null) : null,
        percentual: a.terceiro_percentual ?? null,
      }));
      const datas = new Set(rows.map((r) => r.pagoEm ?? "").filter(Boolean));
      blocos.push({
        clinicaNome: clinicaAtual?.clinica?.nome ?? "—",
        medicoNome: g.nome,
        dataPagamento: dataPag,
        horaPagamento,
        formaPagamento: formaPag || "—",
        contaNome: contas.find((c) => c.id === contaId)?.nome ?? "—",
        itens: rows,
        total: g.total,
        qtd: rows.length,
        emitidoEm: new Date().toLocaleString("pt-BR"),
        reimpressao: !!meta.reimpressao,
        multiplasDatas: datas.size > 1 ? datas.size : 0,
        papel: "terceiro",
        executanteNome,
      });
    }
    return blocos;
  };
  const abrirComprovanteDoItem = (a: Atend) => {
    const dataPag =
      a.repasse_pago_em ?? (a.repasse_pago_at ? a.repasse_pago_at.slice(0, 10) : a.data);
    const meta = {
      data: dataPag,
      forma_pagamento: a.repasse_forma_pagamento || a.forma_pagamento || "",
      conta_id: a.repasse_conta_id ?? "",
      reimpressao: true,
    };
    const c = buildComprovante([a], { ...meta, pago_at: a.repasse_pago_at ?? null });
    // REPASSE TRIPLO — o terceiro recebeu num lançamento próprio, então ganha
    // um recibo próprio logo depois do recibo do executante.
    const blocos = [...(c ? [c] : []), ...buildComprovantesTerceiro([a], meta)];
    setComprovante(blocos[0] ?? null);
    setComprovantes(blocos);
    setComprovanteOpen(true);
  };
  // Constrói um comprovante em 2ª via para cada médico presente em `itens`.
  const abrirSegundaViaLote = (itens: Atend[]) => {
    if (!itens.length) return;
    const byMed = new Map<string, Atend[]>();
    for (const a of itens) {
      const k = a.medico_id ?? "sem";
      if (!byMed.has(k)) byMed.set(k, []);
      byMed.get(k)!.push(a);
    }
    const blocos: NonNullable<Comprovante>[] = [];
    for (const [, list] of byMed) {
      // Metadados agregados
      const datas = new Set(list.map((x) => x.repasse_pago_em ?? "").filter(Boolean));
      const formas = new Set(
        list.map((x) => x.repasse_forma_pagamento || x.forma_pagamento || "").filter(Boolean),
      );
      const contasSet = new Set(list.map((x) => x.repasse_conta_id ?? "").filter(Boolean));
      const primeiro = list[0];
      const dataPag =
        primeiro.repasse_pago_em ??
        (primeiro.repasse_pago_at ? primeiro.repasse_pago_at.slice(0, 10) : primeiro.data);
      const c = buildComprovante(list, {
        data: dataPag,
        forma_pagamento: formas.size === 1 ? [...formas][0] : formas.size > 1 ? "Vários" : "",
        conta_id: contasSet.size === 1 ? [...contasSet][0] : "",
        pago_at: primeiro.repasse_pago_at ?? null,
        reimpressao: true,
      });
      if (c) {
        c.multiplasDatas = datas.size > 1 ? datas.size : 0;
        blocos.push(c);
      }
    }
    // REPASSE TRIPLO — um bloco a mais por dono de equipamento que já recebeu
    // pelos atendimentos reimpressos. Fica depois dos blocos dos executantes,
    // cada um em sua própria página.
    blocos.push(
      ...buildComprovantesTerceiro(itens, {
        data: "",
        forma_pagamento: "",
        conta_id: "",
        reimpressao: true,
      }),
    );
    if (blocos.length) {
      setComprovante(blocos[0]);
      setComprovantes(blocos);
      setComprovanteOpen(true);
    }
  };
  const [payingNow, setPayingNow] = useState(false);

  // Diálogo de laudo
  const [laudoOpen, setLaudoOpen] = useState(false);
  const [laudoTarget, setLaudoTarget] = useState<Atend | null>(null);
  const [laudoForm, setLaudoForm] = useState({ medico_laudador_id: "", valor_laudo: "" });
  const [laudoSaving, setLaudoSaving] = useState(false);
  // Regras de repasse cadastradas para a agenda do atendimento em edição.
  // Alimenta o dropdown (só laudadores cadastrados) e o auto-preenchimento
  // do "Valor do laudo" ao trocar o médico.
  type LaudoRegra = {
    laudador_medico_id: string;
    laudador_nome: string;
    tipo_repasse: "valor" | "percentual";
    percentual: number | null;
    valor: number | null;
  };
  const [laudoRegras, setLaudoRegras] = useState<LaudoRegra[]>([]);
  const [laudoSemRegra, setLaudoSemRegra] = useState(false);

  // Diálogo de vínculo de laudo em lote
  const [laudoLoteOpen, setLaudoLoteOpen] = useState(false);
  const [laudoLoteLaudadorId, setLaudoLoteLaudadorId] = useState("");
  const [laudoLoteSaving, setLaudoLoteSaving] = useState(false);

  // NFS-e
  const [emitentes, setEmitentes] = useState<Emitente[]>([]);
  const [emitenteId, setEmitenteId] = useState("");
  const [nfseDialog, setNfseDialog] = useState<{ open: boolean; atend: Atend | null }>({
    open: false,
    atend: null,
  });
  const [nfseDesc, setNfseDesc] = useState("");
  const [nfseEmitting, setNfseEmitting] = useState(false);
  const emitirNfseFn = useServerFn(emitirNfse);
  const consultarNfseFn = useServerFn(consultarNfse);
  const { pick: pickTomadorNfse, dialog: tomadorNfseDialog } = usePickTomador();
  const { prompt: pedirDescricaoNfse, dialog: descricaoNfseDialog } = usePromptDescricaoNfse();

  useEffect(() => {
    if (!clinicaAtual) {
      setEmitentes([]);
      return;
    }
    void supabase
      .from("nfse_emitentes_publico")
      .select("id, nome, codigo_municipio")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .eq("ativo", true)
      .order("nome")
      .then(({ data }) => {
        const list = (data ?? []) as Emitente[];
        setEmitentes(list);
        if (list.length) setEmitenteId((prev) => prev || list[0].id);
      });
  }, [clinicaAtual?.clinica_id]);

  const openEmitNfse = (a: Atend) => {
    if (!emitentes.length) {
      toast.error("Cadastre um emitente em Configurações › NFS-e");
      return;
    }
    if (!a.paciente_id) {
      toast.error("Atendimento sem paciente vinculado");
      return;
    }
    const pacNome = pacMap.get(a.paciente_id) ?? a.paciente_nome_extra ?? "";
    setNfseDesc(
      `${a.procedimento ?? "Serviços médicos prestados"}${pacNome ? ` — ${pacNome}` : ""}`.trim(),
    );
    setNfseDialog({ open: true, atend: a });
  };

  const doEmitNfse = async () => {
    if (!podeEscrever) {
      toast.error("Você não tem permissão de edição neste módulo.");
      return;
    }
    const a = nfseDialog.atend;
    if (!a || !emitenteId || !a.paciente_id) return;
    setNfseEmitting(true);
    try {
      const { data: pac, error: pacErr } = await supabase
        .from("pacientes")
        .select("id, nome, cpf, email, cep, logradouro, numero, bairro, cidade, estado")
        .eq("id", a.paciente_id)
        .maybeSingle();
      if (pacErr || !pac) throw new Error("Paciente não encontrado");
      const p = pac as PacFull;
      const valor = Number(a.valor_total) || 0;
      if (valor <= 0) throw new Error("Valor do atendimento é zero");
      const tomador = await pickTomadorNfse({
        paciente: {
          nome: p.nome,
          cpfCnpj: p.cpf ?? undefined,
          email: p.email ?? undefined,
          cep: p.cep ?? undefined,
          logradouro: p.logradouro ?? undefined,
          numero: p.numero ?? undefined,
          bairro: p.bairro ?? undefined,
          municipio: p.cidade ?? undefined,
          uf: p.estado ?? undefined,
        },
        valorBase: valor,
      });
      if (!tomador) {
        setNfseEmitting(false);
        toast.error("Emissão cancelada.");
        return;
      }
      const parcial = aplicarValorParcial(valor, tomador);
      // Sempre compõe a discriminação com procedimento + paciente + data de
      // referência, mesmo se o usuário deixou o campo do diálogo em branco.
      const dataRef = a.agendamento_inicio ?? a.data;
      const descBase =
        nfseDesc && nfseDesc.trim()
          ? nfseDesc.trim()
          : montarDiscriminacaoNfse({
              procedimento: a.procedimento,
              pacienteNome: p.nome,
              dataReferencia: dataRef,
            });
      const descComDep = tomador.dependenteAtendido
        ? `${descBase} — Dependente do pagador: ${tomador.dependenteAtendido}`
        : descBase;
      const descSugerida = `${descComDep}${parcial.descricaoSufixo}`;
      const descFinal = await pedirDescricaoNfse(descSugerida);
      if (!descFinal) {
        setNfseEmitting(false);
        toast.error("Emissão cancelada.");
        return;
      }
      const res = await emitirNfseFn({
        data: {
          emitenteId,
          pacienteId: p.id,
          agendamentoId: a.agendamento_id ?? undefined,
          pagamentoId: a.id ?? undefined,
          valorServicos: parcial.valor,
          descricaoServicos: descFinal,
          tomador,
        },
      });
      const nfseId = (res as { id?: string })?.id;
      toast.success("NFS-e enviada. Consultando status...");
      avisarCepDoTomadorInvalido(res);
      if (nfseId) {
        await new Promise((r) => setTimeout(r, 4000));
        await consultarNfseFn({ data: { id: nfseId } });
      }
      setNfseDialog({ open: false, atend: null });
    } catch (e) {
      mostrarErro(e);
    } finally {
      setNfseEmitting(false);
    }
  };

  const calcularSugestao = (r: LaudoRegra, valorTotal: number): number => {
    if (r.tipo_repasse === "percentual") {
      return Number((valorTotal * ((r.percentual ?? 0) / 100)).toFixed(2));
    }
    return Number(r.valor ?? 0);
  };

  const openLaudo = async (a: Atend) => {
    setLaudoTarget(a);
    setLaudoForm({
      medico_laudador_id: a.medico_laudador_id ?? "",
      valor_laudo: a.valor_laudo ? String(a.valor_laudo) : "",
    });
    setLaudoSemRegra(false);
    setLaudoRegras([]);
    setLaudoOpen(true);
    if (!clinicaAtual || !a.medico_id) return;
    const { data } = await supabase
      .from("medico_repasse_laudo")
      .select(
        "laudador_medico_id, tipo_repasse, percentual, valor, laudador:medicos!medico_repasse_laudo_laudador_medico_id_fkey(nome)",
      )
      .eq("clinica_id", clinicaAtual.clinica_id)
      .eq("agenda_medico_id", a.medico_id)
      .eq("ativo", true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const regras: LaudoRegra[] = ((data as any[]) ?? []).map((r) => ({
      laudador_medico_id: r.laudador_medico_id,
      laudador_nome: r.laudador?.nome ?? "?",
      tipo_repasse: r.tipo_repasse,
      percentual: r.percentual != null ? Number(r.percentual) : null,
      valor: r.valor != null ? Number(r.valor) : null,
    }));
    regras.sort((x, y) => x.laudador_nome.localeCompare(y.laudador_nome));
    setLaudoRegras(regras);
    // Auto-sugerir se já vier laudador escolhido e sem valor.
    if (a.medico_laudador_id && !a.valor_laudo) {
      const regra = regras.find((r) => r.laudador_medico_id === a.medico_laudador_id);
      if (regra) {
        const sug = calcularSugestao(regra, Number(a.valor_total ?? 0));
        setLaudoForm((f) => ({ ...f, valor_laudo: sug > 0 ? String(sug) : "" }));
      }
    }
  };

  const onChangeLaudador = (id: string) => {
    setLaudoForm((f) => ({ ...f, medico_laudador_id: id }));
    const regra = laudoRegras.find((r) => r.laudador_medico_id === id);
    if (!regra) {
      setLaudoSemRegra(true);
      setLaudoForm((f) => ({ ...f, medico_laudador_id: id, valor_laudo: "" }));
      return;
    }
    setLaudoSemRegra(false);
    const sug = calcularSugestao(regra, Number(laudoTarget?.valor_total ?? 0));
    setLaudoForm((f) => ({
      ...f,
      medico_laudador_id: id,
      valor_laudo: sug > 0 ? String(sug) : "",
    }));
  };

  const emitirLaudo = async () => {
    if (!podeEscrever) {
      toast.error("Você não tem permissão de edição neste módulo.");
      return;
    }
    if (!laudoTarget) return;
    if (!laudoForm.medico_laudador_id) {
      toast.error("Selecione o médico laudador");
      return;
    }
    const valor = Number(laudoForm.valor_laudo);
    if (!valor || valor <= 0) {
      toast.error("Informe o valor do laudo");
      return;
    }
    setLaudoSaving(true);
    const tabela = laudoTarget.origem === "agenda" ? "fin_lancamentos" : "fin_atendimentos";
    const { error } = await supabase
      .from(tabela)
      .update({
        medico_laudador_id: laudoForm.medico_laudador_id,
        valor_laudo: valor,
        laudo_status: "emitido",
        laudo_emitido_em: new Date().toISOString(),
      })
      .eq("id", laudoTarget.id);
    setLaudoSaving(false);
    if (error) {
      mostrarErro(error);
      return;
    }
    toast.success("Laudo emitido — repasse do laudador gerado");
    // Gera comprovante de pagamento do laudo (mesmo modelo do repasse)
    const hojeIso = new Date().toISOString();
    const hoje = hojeIso.slice(0, 10);
    const itemComprovante: Atend = {
      ...laudoTarget,
      medico_id: laudoForm.medico_laudador_id,
      valor_medico: valor,
      repasse_pago_em: hoje,
      repasse_pago_at: hojeIso,
      repasse_forma_pagamento: laudoTarget.forma_pagamento ?? null,
      repasse_conta_id: laudoTarget.repasse_conta_id ?? null,
      // Este recibo é do laudo, não do repasse do atendimento: o eventual
      // terceiro (dono do equipamento) não recebe nada aqui e não pode
      // aparecer na divisão impressa.
      terceiro_medico_id: null,
      terceiro_valor: 0,
    };
    const c = buildComprovante([itemComprovante], {
      data: hoje,
      forma_pagamento: laudoTarget.forma_pagamento || "—",
      conta_id: laudoTarget.repasse_conta_id ?? "",
      pago_at: hojeIso,
      reimpressao: false,
    });
    if (c) {
      setComprovante(c);
      setComprovantes([c]);
      setComprovanteOpen(true);
    }
    setLaudoOpen(false);
    setLaudoTarget(null);
    await load();
  };

  const desvincularLaudo = async (a: Atend) => {
    if (!podeEscrever) {
      toast.error("Você não tem permissão de edição neste módulo.");
      return;
    }
    if (
      !(await confirmDialog(
        "Desvincular o médico laudador deste atendimento?\n\n" +
          "• O laudo voltará ao status 'Pendente'.\n" +
          "• O repasse do laudador deixará de ser devido por este atendimento.\n" +
          "• Você poderá vincular outro médico depois clicando em 'Vincular'.",
      ))
    )
      return;
    const tabela = a.origem === "agenda" ? "fin_lancamentos" : "fin_atendimentos";
    const { error } = await supabase
      .from(tabela)
      .update({
        medico_laudador_id: null,
        valor_laudo: 0,
        laudo_status: null,
        laudo_emitido_em: null,
      } as never)
      .eq("id", a.id);
    if (error) {
      mostrarErro(error);
      return;
    }
    toast.success("Laudador desvinculado");
    await load();
  };

  const abrirLaudoLote = () => {
    if (selectedLaudoElegiveis.length === 0) {
      toast.info("Selecione atendimentos que exijam laudo e ainda não vinculados.");
      return;
    }
    setLaudoLoteLaudadorId("");
    setLaudoLoteOpen(true);
  };

  const vincularLaudoLote = async () => {
    if (!clinicaAtual) return;
    if (!podeEscrever) {
      toast.error("Você não tem permissão de edição neste módulo.");
      return;
    }
    if (!laudoLoteLaudadorId) {
      toast.error("Selecione o médico laudador");
      return;
    }
    const alvos = selectedLaudoElegiveis;
    if (alvos.length === 0) {
      toast.info("Nenhum atendimento elegível.");
      return;
    }
    setLaudoLoteSaving(true);
    // Busca todas as regras para o laudador escolhido nesta clínica,
    // indexadas por agenda_medico_id → (tipo, percentual, valor).
    const { data: regrasData } = await supabase
      .from("medico_repasse_laudo")
      .select("agenda_medico_id, tipo_repasse, percentual, valor")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .eq("laudador_medico_id", laudoLoteLaudadorId)
      .eq("ativo", true);
    const regraPorAgenda = new Map<string, LaudoRegra>();
    for (const r of (regrasData as unknown as {
      agenda_medico_id: string;
      tipo_repasse: "valor" | "percentual";
      percentual: number | null;
      valor: number | null;
    }[]) ?? []) {
      regraPorAgenda.set(r.agenda_medico_id, {
        laudador_medico_id: laudoLoteLaudadorId,
        laudador_nome: "",
        tipo_repasse: r.tipo_repasse,
        percentual: r.percentual != null ? Number(r.percentual) : null,
        valor: r.valor != null ? Number(r.valor) : null,
      });
    }
    let ok = 0;
    const semRegra: string[] = [];
    const erros: string[] = [];
    const nowIso = new Date().toISOString();
    await Promise.all(
      alvos.map(async (a) => {
        if (!a.medico_id) {
          semRegra.push(a.paciente_nome_extra ?? a.procedimento ?? a.id);
          return;
        }
        const regra = regraPorAgenda.get(a.medico_id);
        if (!regra) {
          semRegra.push(a.paciente_nome_extra ?? a.procedimento ?? a.id);
          return;
        }
        const valor = calcularSugestao(regra, Number(a.valor_total ?? 0));
        if (!valor || valor <= 0) {
          semRegra.push(a.paciente_nome_extra ?? a.procedimento ?? a.id);
          return;
        }
        const tabela = a.origem === "agenda" ? "fin_lancamentos" : "fin_atendimentos";
        const { error } = await supabase
          .from(tabela)
          .update({
            medico_laudador_id: laudoLoteLaudadorId,
            valor_laudo: valor,
            laudo_status: "emitido",
            laudo_emitido_em: nowIso,
          })
          .eq("id", a.id);
        if (error) erros.push(error.message);
        else ok += 1;
      }),
    );
    setLaudoLoteSaving(false);
    setLaudoLoteOpen(false);
    if (ok > 0) {
      const partes = [`${ok} laudo(s) vinculado(s)`];
      if (semRegra.length) partes.push(`${semRegra.length} sem regra de repasse`);
      if (erros.length) partes.push(`${erros.length} com erro`);
      toast.success(partes.join(" • "));
    } else if (semRegra.length) {
      toast.error(
        `Nenhum vinculado — ${semRegra.length} sem regra de repasse cadastrada para este laudador.`,
      );
    } else if (erros.length) {
      toast.error(`Falha ao vincular: ${erros[0]}`);
    }
    await load();
  };

  // Perfil médico: trava o filtro no próprio profissional
  useEffect(() => {
    if (isMedicoOnly && medicoLogadoId) setFMedico(medicoLogadoId);
  }, [isMedicoOnly, medicoLogadoId]);

  // Carrega o vínculo de convênio (contrato ativo) de todos os pacientes.
  useEffect(() => {
    let cancel = false;
    (async () => {
      const cid = clinicaAtual?.clinica_id;
      if (!cid) return;
      const m = await carregarMapaConvenioPacientes(cid);
      if (!cancel) setMapaConvenio(m);
    })();
    return () => {
      cancel = true;
    };
  }, [clinicaAtual?.clinica_id]);

  const norm = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();

  // Gera variantes para casar o nome do procedimento com o cadastro de convênio.
  // O procedimento na agenda costuma vir com sufixo de especialidade entre
  // parênteses (ex.: "ECOCARDIOGRAMA (ADULTO) (CARDIOLOGIA)"), enquanto no
  // cadastro de convênio o nome é só "ECOCARDIOGRAMA (ADULTO)".
  const procVariants = (nome: string): string[] => {
    const base = norm(nome);
    const out = new Set<string>([base]);
    // remove um sufixo " (xxx)" de cada vez
    let cur = base;
    for (let i = 0; i < 3; i++) {
      const m = cur.match(/^(.*)\s*\([^()]*\)\s*$/);
      if (!m) break;
      cur = m[1].trim();
      if (cur) out.add(cur);
    }
    // também remove todos os parênteses (último recurso)
    const semParens = base
      .replace(/\s*\([^()]*\)\s*/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (semParens) out.add(semParens);
    return Array.from(out).filter(Boolean);
  };

  // Índices O(1) para o cálculo de repasse, que roda uma vez por linha em
  // `load()`. Antes disso eram `medicos.find`/`convenios.find` (O(n) cada),
  // repetidos por linha × variante de nome — em clínicas com milhares de
  // atendimentos e convênios isso somava milhões de comparações (incluindo
  // `norm()`, que já é caro por si só) e travava a main thread após o fetch.
  const medicosById = useMemo(() => new Map(medicos.map((m) => [m.id, m])), [medicos]);
  const convenioIdx = useMemo(() => {
    // chave normalizada "medicoId|norm(nome)" — casa com `procVariants`, que
    // já devolve variantes normalizadas.
    const porNomeNorm = new Map<string, Convenio>();
    // chave crua "medicoId|nome" — para o sentinel de categoria (__CAT__:x),
    // que NÃO é normalizado na comparação original.
    const porNomeCru = new Map<string, Convenio>();
    for (const cv of convenios) {
      const kNorm = `${cv.medico_id}|${norm(cv.nome)}`;
      if (!porNomeNorm.has(kNorm)) porNomeNorm.set(kNorm, cv);
      const kCru = `${cv.medico_id}|${cv.nome}`;
      if (!porNomeCru.has(kCru)) porNomeCru.set(kCru, cv);
    }
    return { porNomeNorm, porNomeCru };
  }, [convenios]);

  // Calcula repasse e também o "total" efetivo (valor do convênio quando o paciente
  // não paga em dinheiro, ex.: ANGIOLOGIA por convênio). Retorna { total, repasse }.
  const calcRepasseFull = (
    medicoId: string | null,
    totalPago: number,
    procNome: string | null,
    descricao?: string | null,
    /** Modalidade vinda do cadastro (contrato ativo) — prevalece sobre o texto. */
    modalidade?: "cartao_consulta" | "cartao_desconto" | null,
  ): { total: number; repasse: number; terceiro: RepasseTerceiro | null } => {
    if (!medicoId) return { total: totalPago, repasse: 0, terceiro: null };
    const med = medicosById.get(medicoId) ?? null;
    // Linha cadastrada para o servico (ou para a categoria dele). Os indices
    // O(1) existem porque isto roda uma vez por atendimento carregado.
    let linha: Convenio | undefined;
    if (procNome) {
      const variants = procVariants(procNome);
      for (const alvo of variants) {
        linha = convenioIdx.porNomeNorm.get(`${medicoId}|${alvo}`);
        if (linha) break;
      }
      // Fallback: repasse por categoria (__CAT__:<TIPO>) usando o tipo do procedimento
      if (!linha) {
        let tipo: string | undefined;
        for (const alvo of variants) {
          tipo = procTipos.get(alvo);
          if (tipo) break;
        }
        if (tipo) {
          const sentinel = `__CAT__:${String(tipo).toUpperCase()}`;
          linha = convenioIdx.porNomeCru.get(`${medicoId}|${sentinel}`);
        }
      }
    }
    // A escada de heranca (coluna da forma de pagamento -> Convenio -> cartao
    // beneficio do medico -> Repasse Padrao) vive em @/lib/repasse-calc, para
    // esta tela e a 2a via dos comprovantes decidirem igual.
    return resolverRepasse({
      linha,
      med,
      base: totalPago,
      forma: formaDoAtendimento(descricao, modalidade),
    });
  };
  const calcRepasse = (medicoId: string | null, total: number, procNome: string | null): number =>
    calcRepasseFull(medicoId, total, procNome).repasse;

  const load = async () => {
    if (!clinicaAtual) {
      setItems([]);
      setLoading(false);
      return;
    }
    if (!fIni || !fFim) {
      setLoading(false);
      return;
    }
    // Aguarda médicos/convênios/procedimentos carregarem para não calcular o
    // repasse com base vazia (cairia no padrão do médico em vez do convênio
    // cadastrado por procedimento — ex.: PREVENTIVO R$ 10,40).
    if (!optsReady) {
      setLoading(true);
      return;
    }
    setLoading(true);
    // Une atendimentos manuais (fin_atendimentos) com pagamentos da agenda (fin_lancamentos receita).
    // Regra de repasse da agenda: a competência é a data marcada no agendamento,
    // não a data em que o paciente pagou no caixa. Assim pagamento antecipado não
    // libera repasse antes do dia do atendimento/reagendamento.
    const agendaFimDia = `${fFim}T23:59:59.999`;
    // PostgREST corta em 1.000 linhas por padrão. Em clínicas movimentadas
    // (ex.: Menino Jesus com ~3.000 lançamentos no mês), registros ficam de
    // fora silenciosamente. Paginamos em blocos de 1.000 até esgotar.
    const PAGE_SIZE = 1000;
    // `paciente:pacientes(nome)` vem embutido via FK para resolver o nome mesmo
    // quando o paciente está fora dos 500 primeiros do combobox (`loadOpts`) —
    // evita a query extra de "nomes faltantes" que rodava depois do fetch.
    const buildManual = () => {
      let q = supabase
        .from("fin_atendimentos")
        .select(
          "id, data, procedimento, valor_total, valor_medico, valor_clinica, status, forma_pagamento, medico_id, paciente_id, repasse_pago, repasse_pago_em, repasse_pago_at, repasse_forma_pagamento, repasse_conta_id, laudo_status, medico_laudador_id, valor_laudo, lancamento_id, paciente:pacientes(nome)",
        )
        .eq("clinica_id", clinicaAtual.clinica_id)
        .gte("data", fIni)
        .lte("data", fFim);
      if (fMedico !== "todos") q = q.eq("medico_id", fMedico);
      return q;
    };
    const buildAgenda = () =>
      supabase
        .from("fin_lancamentos")
        .select(
          "id, data, descricao, valor, valor_medico_override, forma_pagamento, medico_id, paciente_id, agendamento_id, repasse_pago, repasse_pago_em, repasse_pago_at, repasse_forma_pagamento, repasse_conta_id, repasse_lancamento_id, laudo_status, medico_laudador_id, valor_laudo, paciente:pacientes(nome), agendamento:agendamentos!inner(procedimento, paciente_nome, paciente_id, medico_id, inicio, status)",
        )
        .eq("clinica_id", clinicaAtual.clinica_id)
        .eq("tipo", "receita")
        .eq("status", "confirmado")
        .not("agendamento_id", "is", null)
        .gte("agendamento.inicio", `${fIni}T00:00:00`)
        .lte("agendamento.inicio", agendaFimDia);
    const buildSemAgenda = () =>
      supabase
        .from("fin_lancamentos")
        .select(
          "id, data, descricao, valor, valor_medico_override, forma_pagamento, medico_id, paciente_id, agendamento_id, repasse_pago, repasse_pago_em, repasse_pago_at, repasse_forma_pagamento, repasse_conta_id, repasse_lancamento_id, laudo_status, medico_laudador_id, valor_laudo, paciente:pacientes(nome), agendamento:agendamentos(procedimento, paciente_nome, paciente_id, medico_id, inicio, status)",
        )
        .eq("clinica_id", clinicaAtual.clinica_id)
        .eq("tipo", "receita")
        .eq("status", "confirmado")
        .is("agendamento_id", null)
        .gte("data", fIni)
        .lte("data", fFim);
    const fetchAllPaged = async <T,>(
      builder: () => {
        order: (
          col: string,
          opts: { ascending: boolean },
        ) => { range: (from: number, to: number) => Promise<{ data: T[] | null; error: unknown }> };
      },
    ): Promise<{ data: T[]; error: unknown }> => {
      const acc: T[] = [];
      for (let offset = 0; ; offset += PAGE_SIZE) {
        const res = await builder()
          .order("data", { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1);
        if (res.error) return { data: acc, error: res.error };
        const rows = res.data ?? [];
        acc.push(...rows);
        if (rows.length < PAGE_SIZE) break;
        if (offset > 100_000) break; // guard-rail
      }
      return { data: acc, error: null };
    };
    const [mr, ar, sr] = await Promise.all([
      fetchAllPaged<any>(buildManual as any),
      fetchAllPaged<any>(buildAgenda as any),
      fetchAllPaged<any>(buildSemAgenda as any),
    ]);
    if (mr.error) {
      mostrarErro(mr.error);
      setLoading(false);
      return;
    }
    if (ar.error) {
      mostrarErro(ar.error);
      setLoading(false);
      return;
    }
    if (sr.error) {
      mostrarErro(sr.error);
      setLoading(false);
      return;
    }
    const agendaRows = [...(ar.data ?? []), ...(sr.data ?? [])];
    const manualLancamentoIds = (mr.data ?? [])
      .map((r: { lancamento_id?: string | null }) => r.lancamento_id ?? null)
      .filter((x): x is string => !!x);
    const lancamentosEspelhoAgenda = new Set<string>();
    if (manualLancamentoIds.length) {
      const { data: espelhos, error: espelhoErr } = await supabase
        .from("fin_lancamentos")
        .select("id, agendamento_id")
        .in("id", manualLancamentoIds)
        .not("agendamento_id", "is", null);
      if (espelhoErr) {
        mostrarErro(espelhoErr);
        setLoading(false);
        return;
      }
      for (const e of espelhos ?? []) lancamentosEspelhoAgenda.add(e.id);
    }
    // IDs de fin_lancamentos já carregados — usado para descartar linhas de
    // fin_atendimentos que espelham o mesmo pagamento (duplicidade legada
    // criada pelo fluxo de atendimento IA antes da correção).
    const lancIds = new Set(agendaRows.map((r: { id: string }) => r.id));
    // Também colecionamos o agendamento_id dos lançamentos para descartar
    // manuais que espelhem o mesmo agendamento (caso o lancamento_id não
    // tenha sido preenchido no fin_atendimentos, por qualquer motivo).
    const lancAgendIds = new Set(
      agendaRows
        .map((r: { agendamento_id?: string | null }) => r.agendamento_id ?? null)
        .filter((x): x is string => !!x),
    );
    const manuaisRaw = (mr.data ?? []).filter((r: { lancamento_id?: string | null }) => {
      if (r.lancamento_id && lancIds.has(r.lancamento_id)) return false;
      if (r.lancamento_id && lancamentosEspelhoAgenda.has(r.lancamento_id)) return false;
      // Sem lancamento_id: descarta se algum lançamento carregado apontar
      // para um agendamento que também aparece no lote manual (mesma data,
      // procedimento e paciente). O DB já tem trigger que impede este caso
      // em novos inserts; aqui blindamos registros históricos.
      if (r.lancamento_id && lancAgendIds.size > 0) {
        const lanc = agendaRows.find((l: { id: string }) => l.id === r.lancamento_id) as
          | { agendamento_id?: string | null }
          | undefined;
        if (lanc?.agendamento_id && lancAgendIds.has(lanc.agendamento_id)) return false;
      }
      return true;
    });
    // REPASSE TRIPLO — quais repasses de terceiro já foram pagos no período.
    // A tabela só ganha linha quando o terceiro é efetivamente pago, então a
    // ausência de linha significa "ainda a receber".
    const terceirosPagos = new Map<
      string,
      {
        pago_em: string | null;
        pago_at: string | null;
        forma_pagamento: string | null;
        conta_id: string | null;
      }
    >();
    {
      const { data: pagos, error: ePagos } = await supabase
        .from("fin_repasse_terceiro")
        .select(
          "origem, lancamento_id, atendimento_id, terceiro_medico_id, repasse_pago_em, repasse_pago_at, repasse_forma_pagamento, repasse_conta_id",
        )
        .eq("clinica_id", clinicaAtual.clinica_id)
        .gte("data", fIni)
        .lte("data", fFim);
      if (ePagos) {
        mostrarErro(ePagos);
        setLoading(false);
        return;
      }
      for (const p of pagos ?? []) {
        const ref = p.origem === "agenda" ? p.lancamento_id : p.atendimento_id;
        if (ref)
          terceirosPagos.set(`${p.origem}:${ref}:${p.terceiro_medico_id}`, {
            pago_em: p.repasse_pago_em ?? null,
            pago_at: p.repasse_pago_at ?? null,
            forma_pagamento: p.repasse_forma_pagamento ?? null,
            conta_id: p.repasse_conta_id ?? null,
          });
      }
    }
    const marcaTerceiro = (
      origem: "agenda" | "manual",
      id: string,
      terceiro: RepasseTerceiro | null,
    ) =>
      terceiro
        ? (() => {
            const pago = terceirosPagos.get(`${origem}:${id}:${terceiro.medico_id}`);
            return {
              terceiro_medico_id: terceiro.medico_id,
              terceiro_percentual: terceiro.percentual,
              terceiro_valor: terceiro.valor,
              terceiro_pago: !!pago,
              terceiro_pago_em: pago?.pago_em ?? null,
              terceiro_pago_at: pago?.pago_at ?? null,
              terceiro_forma_pagamento: pago?.forma_pagamento ?? null,
              terceiro_conta_id: pago?.conta_id ?? null,
            };
          })()
        : {};

    const manuais: Atend[] = manuaisRaw.map((r) => {
      const pago = Number(r.valor_total);
      // Recalcula repasse usando convênio cadastrado por procedimento
      // (ex.: PREVENTIVO R$ 10,40). Mantém o valor armazenado apenas como
      // fallback caso o cálculo retorne 0 e o banco já tenha um valor manual.
      const { total, repasse, terceiro } = calcRepasseFull(
        r.medico_id,
        pago,
        r.procedimento,
        null,
        resolverModalidade({ pacienteId: r.paciente_id, mapa: mapaConvenio }),
      );
      const valorMedico = repasse > 0 ? repasse : Number(r.valor_medico);
      const valorTotal = total > 0 ? total : pago;
      return {
        id: r.id,
        data: r.data,
        procedimento: r.procedimento,
        valor_total: valorTotal,
        valor_medico: valorMedico,
        // O que sobra para a clínica já desconta a parte do terceiro.
        valor_clinica: +(valorTotal - valorMedico - (terceiro?.valor ?? 0)).toFixed(2),
        ...marcaTerceiro("manual", r.id, terceiro),
        status: r.status,
        forma_pagamento: r.forma_pagamento,
        medico_id: r.medico_id,
        paciente_id: r.paciente_id,
        // Fallback do nome via FK embutida na query (`paciente:pacientes(nome)`)
        // — cobre pacientes fora dos 500 do combobox sem query extra depois.
        paciente_nome_extra: (r as any).paciente?.nome ?? null,
        origem: "manual",
        repasse_pago: !!r.repasse_pago,
        repasse_pago_em: r.repasse_pago_em,
        repasse_pago_at: (r as any).repasse_pago_at ?? null,
        repasse_forma_pagamento: r.repasse_forma_pagamento,
        repasse_conta_id: (r as any).repasse_conta_id ?? null,
        laudo_status: (r as any).laudo_status ?? null,
        medico_laudador_id: (r as any).medico_laudador_id ?? null,
        valor_laudo: Number((r as any).valor_laudo ?? 0),
      };
    });
    const agend: Atend[] = agendaRows.map((r): Atend => {
      const ag = (r as any).agendamento as {
        procedimento: string | null;
        paciente_nome: string | null;
        paciente_id: string | null;
        medico_id: string | null;
        inicio: string | null;
        status: string | null;
      } | null;
      // Procedimento: só usamos o do agendamento. Quando não há agendamento
      // vinculado, a "cauda" da descrição costuma ser tipo de contrato/forma
      // (CONTRATO, RECEBIMENTOS DIVERSOS, AJUSTE…), não o serviço realizado.
      const proc = ag?.procedimento ?? null;
      // Prioridade: nome digitado no agendamento > nome cadastral (via FK
      // embutida, cobre paciente fora dos 500 do combobox) > cauda da descrição.
      const pacNomeExtra =
        ag?.paciente_nome ??
        (r as any).paciente?.nome ??
        ((r.descricao ?? "").split("—")[0]?.trim() || null);
      const pacIdEff = r.paciente_id ?? ag?.paciente_id ?? null;
      const medIdEff = r.medico_id ?? ag?.medico_id ?? null;
      const dataRepasse = ag?.inicio ? ag.inicio.slice(0, 10) : r.data;
      const pago = Number(r.valor);
      const { total, repasse, terceiro } = calcRepasseFull(
        medIdEff,
        pago,
        proc,
        r.descricao ?? null,
        resolverModalidade({
          modalidadeLancamento:
            (r as { convenio_modalidade?: string | null }).convenio_modalidade ?? null,
          pacienteId: pacIdEff,
          mapa: mapaConvenio,
        }),
      );
      // Override manual do repasse (editado na tela). Quando presente,
      // sobrescreve o cálculo por regra.
      const overrideRaw = (r as { valor_medico_override?: number | string | null })
        .valor_medico_override;
      const override =
        overrideRaw !== null && overrideRaw !== undefined && overrideRaw !== ""
          ? Number(overrideRaw)
          : null;
      const valorMedicoFinal = override !== null && Number.isFinite(override) ? override : repasse;
      // O que sobra para a clínica já desconta a parte do terceiro.
      const valorClinicaFinal = +(total - valorMedicoFinal - (terceiro?.valor ?? 0)).toFixed(2);
      return {
        id: r.id,
        data: dataRepasse,
        procedimento: proc,
        agendamento_id: r.agendamento_id ?? null,
        valor_total: total,
        valor_medico: valorMedicoFinal,
        valor_clinica: valorClinicaFinal,
        status: "realizado",
        forma_pagamento: r.forma_pagamento,
        medico_id: medIdEff,
        paciente_id: pacIdEff,
        paciente_nome_extra: pacNomeExtra,
        origem: "agenda",
        repasse_pago: !!r.repasse_pago,
        repasse_pago_em: r.repasse_pago_em,
        repasse_pago_at: (r as any).repasse_pago_at ?? null,
        repasse_forma_pagamento: r.repasse_forma_pagamento,
        repasse_conta_id: (r as any).repasse_conta_id ?? null,
        agendamento_inicio: ag?.inicio ?? null,
        agendamento_status: ag?.status ?? null,
        ...marcaTerceiro("agenda", r.id, terceiro),
        laudo_status: (r as any).laudo_status ?? null,
        medico_laudador_id: (r as any).medico_laudador_id ?? null,
        valor_laudo: Number((r as any).valor_laudo ?? 0),
      };
    });
    // Filtro client-side por médico para os registros da agenda (cobre os
    // lançamentos cujo medico_id está nulo e vem do agendamento).
    const agendFiltered =
      fMedico === "todos" ? agend : agend.filter((x) => x.medico_id === fMedico);
    let unif = [...manuais, ...agendFiltered].sort((a, b) => (a.data < b.data ? 1 : -1));
    if (fStatus === "aberto") unif = unif.filter((x) => !x.repasse_pago);
    else if (fStatus === "pago") unif = unif.filter((x) => x.repasse_pago);
    setItems(unif);
    setSel(new Set());
    setLoading(false);
  };
  const loadOpts = async () => {
    if (!clinicaAtual) return;
    const clinicaId = clinicaAtual.clinica_id;
    // As 4 fases (médicos, pacientes/contas, regras de repasse, procedimentos)
    // rodavam em série — cada `await` esperava a anterior terminar antes de
    // sequer abrir a próxima conexão. Nenhuma delas depende das outras, então
    // todas disparam juntas agora. `medicosReq` é convertido para uma Promise
    // nativa (via `Promise.resolve`) porque também alimenta `conveniosReq` —
    // reutilizar o builder do Supabase diretamente faria a query de médicos
    // rodar duas vezes (o builder é "thenable" e reexecuta a cada `.then`).
    const medicosReq = Promise.resolve(
      supabase
        .from("medicos")
        .select(
          "id, nome, aceita_cartao_beneficios, cb_tipo_repasse, cb_valor_repasse, cb_percentual_repasse",
        )
        .eq("clinica_id", clinicaId)
        .eq("ativo", true)
        .order("nome"),
    );
    const pacientesReq = supabase
      .from("pacientes")
      .select("id, nome")
      .eq("clinica_id", clinicaId)
      .eq("ativo", true)
      .order("nome")
      .limit(500);
    const contasReq = supabase
      .from("fin_contas")
      .select("id, nome")
      .eq("clinica_id", clinicaId)
      .eq("ativo", true)
      .order("nome");
    const repReq = supabase.rpc("medicos_repasse_lista", { _clinica_id: clinicaId });
    // Valor de tabela dos procedimentos, para usar como "total cheio". Paginado
    // — mesma razão do medico_convenios (teto de 1000 do PostgREST) — mas a
    // paginação em si não depende de nenhuma das outras requisições.
    const procsReq = (async () => {
      const procs: Array<{
        nome: string | null;
        valor_padrao?: number | string | null;
        valor_dinheiro?: number | string | null;
        tipo?: string | null;
        requer_laudo?: boolean | null;
      }> = [];
      const CHUNK = 1000;
      const MAX = 50000;
      let offset = 0;
      for (;;) {
        const { data, error } = await supabase
          .from("procedimentos")
          .select("nome, valor_padrao, valor_dinheiro, tipo, requer_laudo")
          .eq("clinica_id", clinicaId)
          .eq("ativo", true)
          .range(offset, offset + CHUNK - 1);
        if (error) break;
        const rows = (data ?? []) as typeof procs;
        procs.push(...rows);
        if (rows.length < CHUNK) break;
        offset += CHUNK;
        if (offset >= MAX) break;
      }
      return procs;
    })();
    // Convênios por médico só podem começar depois que os IDs dos médicos
    // chegarem — mas não esperam pacientes/contas/regras/procedimentos, que
    // seguem em paralelo.
    const conveniosReq = medicosReq.then(async ({ data: mData }) => {
      const ids = ((mData ?? []) as Medico[]).map((x) => x.id);
      if (!ids.length) return [] as Convenio[];
      // Paginado: o PostgREST retorna no máximo 1000 linhas por chamada.
      // Clínicas com muitos convênios cadastrados por médico ultrapassam
      // esse teto e faziam alguns convênios sumirem do cálculo de repasse
      // (caía no repasse padrão do médico). Buscamos em chunks até o fim.
      const CHUNK = 1000;
      const MAX = 50000; // salvaguarda
      const acc: Convenio[] = [];
      let offset = 0;
      for (;;) {
        const { data: cv, error: cvErr } = await supabase
          .from("medico_convenios")
          .select(
            "medico_id, nome, tipo_repasse, percentual, valor, ativo, convenio_tipo_repasse, convenio_percentual, convenio_valor, cartao_consulta_valor, cartao_desconto_valor, terceiro_id, percentual_terceiro, tipo_repasse_terceiro, valor_terceiro",
          )
          .in("medico_id", ids)
          .eq("ativo", true)
          .range(offset, offset + CHUNK - 1);
        if (cvErr) break;
        const rows = (cv ?? []) as Convenio[];
        acc.push(...rows);
        if (rows.length < CHUNK) break;
        offset += CHUNK;
        if (offset >= MAX) break;
      }
      return acc;
    });

    const [m, p, c, { data: rep }, procs, convenios] = await Promise.all([
      medicosReq,
      pacientesReq,
      contasReq,
      repReq,
      procsReq,
      conveniosReq,
    ]);

    const repMap = new Map<
      string,
      {
        tipo_repasse: string;
        percentual_repasse_padrao: number | null;
        valor_repasse_padrao: number | null;
      }
    >();
    for (const r of (rep as any[] | null) ?? []) repMap.set(r.id, r);
    const merged: Medico[] = ((m.data ?? []) as any[]).map((x) => {
      const r = repMap.get(x.id);
      return {
        id: x.id,
        nome: x.nome,
        tipo_repasse: r?.tipo_repasse ?? "percentual",
        percentual_repasse_padrao: Number(r?.percentual_repasse_padrao ?? 0),
        valor_repasse_padrao: r?.valor_repasse_padrao ?? null,
        aceita_cartao_beneficios: !!x.aceita_cartao_beneficios,
        cb_tipo_repasse: x.cb_tipo_repasse ?? null,
        cb_valor_repasse: x.cb_valor_repasse ?? null,
        cb_percentual_repasse: x.cb_percentual_repasse ?? null,
      };
    });
    setMedicos(merged);
    setPacientes((p.data ?? []) as Pac[]);
    setContas((c.data ?? []) as Conta[]);
    const pmap = new Map<string, number>();
    const tmap = new Map<string, string>();
    const lmap = new Map<string, boolean>();
    for (const pr of procs) {
      const v = Number(pr.valor_padrao ?? pr.valor_dinheiro ?? 0);
      if (!pr?.nome) continue;
      const key = norm(String(pr.nome));
      // mantém o maior valor caso haja duplicidade entre unidades
      if (v > (pmap.get(key) ?? 0)) pmap.set(key, v);
      if (pr.tipo && !tmap.has(key)) tmap.set(key, String(pr.tipo));
      if (pr.requer_laudo) lmap.set(key, true);
    }
    setProcValores(pmap);
    setProcTipos(tmap);
    setProcLaudo(lmap);
    setConvenios(convenios);
    setOptsReady(true);
  };
  useEffect(() => {
    setOptsReady(false);
    void loadOpts();
  }, [clinicaAtual?.clinica_id]);
  useEffect(
    () => {
      void load(); /* refaz ao mudar filtros ou opções de repasse */
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      clinicaAtual?.clinica_id,
      fMedico,
      fIni,
      fFim,
      fStatus,
      optsReady,
      medicos.length,
      convenios.length,
      procValores.size,
      mapaConvenio,
    ],
  );

  const calc = useMemo(() => {
    const total = Number(form.valor_total || 0);
    const med = medicos.find((m) => m.id === form.medico_id);
    if (!med || !total) return { medico: 0, clinica: total };
    if (med.tipo_repasse === "valor" && med.valor_repasse_padrao != null) {
      const v = Number(med.valor_repasse_padrao);
      return { medico: v, clinica: Math.max(0, total - v) };
    }
    const pct = Number(med.percentual_repasse_padrao || 0);
    const medico = +((total * pct) / 100).toFixed(2);
    return { medico, clinica: +(total - medico).toFixed(2) };
  }, [form.valor_total, form.medico_id, medicos]);

  const openNew = () => {
    setEditing(null);
    setForm(EMPTY);
    setOpen(true);
  };
  const openEdit = (a: Atend) => {
    setEditing(a);
    setForm({
      data: a.data,
      medico_id: a.medico_id ?? "",
      paciente_id: a.paciente_id ?? "",
      procedimento: a.procedimento ?? "",
      valor_total: String(a.valor_total),
      forma_pagamento: a.forma_pagamento ?? "",
      status: a.status,
    });
    setOpen(true);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!clinicaAtual) return;
    if (!podeEscrever) {
      toast.error("Você não tem permissão de edição neste módulo.");
      return;
    }
    setSaving(true);
    const payload = {
      clinica_id: clinicaAtual.clinica_id,
      data: form.data,
      medico_id: form.medico_id || null,
      paciente_id: form.paciente_id || null,
      procedimento: form.procedimento || null,
      valor_total: Number(form.valor_total),
      valor_medico: calc.medico,
      valor_clinica: calc.clinica,
      forma_pagamento: form.forma_pagamento || null,
      status: form.status,
    };
    const { error } = editing
      ? await supabase.from("fin_atendimentos").update(payload).eq("id", editing.id)
      : await supabase.from("fin_atendimentos").insert(payload);
    setSaving(false);
    if (error) {
      mostrarErro(error);
      return;
    }
    toast.success("Salvo");
    setOpen(false);
    await load();
  };

  const remove = async (a: Atend) => {
    if (!podeEscrever) {
      toast.error("Você não tem permissão de edição neste módulo.");
      return;
    }
    if (!(await confirmDialog("Excluir atendimento?"))) return;

    try {
      let error;

      if (a.origem === "agenda") {
        // Para atendimentos da agenda, exclui da tabela fin_lancamentos
        const { error: e } = await supabase.from("fin_lancamentos").delete().eq("id", a.id);
        error = e;
      } else {
        // Para atendimentos manuais, exclui da tabela fin_atendimentos
        const { error: e } = await supabase.from("fin_atendimentos").delete().eq("id", a.id);
        error = e;
      }

      if (error) {
        mostrarErro(error);
        return;
      }

      toast.success("Atendimento removido com sucesso");
      await load();
    } catch (err) {
      mostrarErro(err);
    }
  };

  const darBaixa = async (a: Atend) => {
    if (!podeEscrever) {
      toast.error("Você não tem permissão de edição neste módulo.");
      return;
    }
    if (
      !(await confirmDialog(
        "Confirmar baixa do atendimento?\n\nO médico será marcado como tendo atendido este paciente e o repasse ficará liberado para pagamento.",
      ))
    )
      return;
    try {
      if (a.origem === "agenda") {
        if (!a.agendamento_id) {
          toast.error("Atendimento sem agendamento vinculado.");
          return;
        }
        const { error } = await supabase
          .from("agendamentos")
          .update({ status: "realizado" })
          .eq("id", a.agendamento_id);
        if (error) {
          mostrarErro(error);
          return;
        }
      } else {
        const { error } = await supabase
          .from("fin_atendimentos")
          .update({ status: "realizado" })
          .eq("id", a.id);
        if (error) {
          mostrarErro(error);
          return;
        }
      }
      toast.success("Baixa realizada. Repasse liberado.");
      await load();
    } catch (err) {
      mostrarErro(err);
    }
  };

  /**
   * Desfaz a baixa de UM atendimento no banco.
   *
   * Vai por RPC (`desfazer_baixa_atendimento`, SECURITY DEFINER) e não mais por
   * UPDATE direto nas tabelas. Motivo: a política de segurança `agend_update`
   * libera o UPDATE em `agendamentos` para admin, gestor, supervisor, recepção,
   * caixa, médico e enfermeiro — o perfil `financeiro` ficou de fora. Um UPDATE
   * barrado por RLS não devolve erro nenhum: ele simplesmente não altera linha
   * alguma. O resultado era a tela avisar "Baixa desfeita." sem nada mudar, que
   * é o "o botão não responde" relatado pelo financeiro. O mesmo valia para o
   * DELETE do lançamento-sombra de R$ 0,00 (`fin_lanc_delete` só aceita
   * admin/gestor).
   *
   * A RPC também grava a auditoria (quem, quando, motivo) e a nota no histórico
   * do agendamento.
   */
  const desfazerBaixaNoBanco = async (
    a: Atend,
    motivo?: string | null,
  ): Promise<{ ok: boolean; jaDesfeito: boolean; erro?: string }> => {
    if (!clinicaAtual) return { ok: false, jaDesfeito: false, erro: "Clínica não identificada." };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)("desfazer_baixa_atendimento", {
      _clinica_id: clinicaAtual.clinica_id,
      _origem: a.origem === "agenda" ? "agenda" : "manual",
      _id: a.id,
      _motivo: motivo ?? null,
    });
    if (error) {
      return {
        ok: false,
        jaDesfeito: false,
        erro: (error as { message?: string }).message ?? "erro desconhecido",
      };
    }
    const r = (data ?? {}) as { ja_desfeito?: boolean };
    return { ok: true, jaDesfeito: !!r.ja_desfeito };
  };

  const desfazerBaixa = async (a: Atend) => {
    if (!podeEstornar) {
      toast.error("Sem permissão para desfazer a baixa.");
      return;
    }
    if (!podeEscrever) {
      toast.error("Você não tem permissão de edição neste módulo.");
      return;
    }
    if (a.repasse_pago) {
      toast.error(
        "Repasse já foi pago — estorne o pagamento do repasse antes de desfazer a baixa.",
      );
      return;
    }
    if (
      !(await confirmDialog(
        "Desfazer a baixa deste atendimento?\n\nO atendimento volta para 'Confirmado'. O pagamento do paciente (se houver) permanece intacto no caixa — só o lançamento-sombra de R$ 0,00 é removido.",
      ))
    )
      return;
    try {
      const r = await desfazerBaixaNoBanco(a);
      if (!r.ok) {
        mostrarErro({ message: r.erro });
        return;
      }
      toast.success(r.jaDesfeito ? "Este atendimento já não estava baixado." : "Baixa desfeita.");
      await load();
    } catch (err) {
      mostrarErro(err);
    }
  };

  const darBaixaLote = async () => {
    if (!podeEscrever) {
      toast.error("Você não tem permissão de edição neste módulo.");
      return;
    }
    const alvos = selectedItems.filter((a) => !a.repasse_pago && !isAtendido(a));
    if (alvos.length === 0) return;
    if (
      !(await confirmDialog(
        `Confirmar baixa de ${alvos.length} atendimento(s)?\n\nOs médicos serão marcados como tendo atendido esses pacientes e os repasses ficarão liberados para pagamento.`,
      ))
    )
      return;
    try {
      const agIds = alvos
        .filter((a) => a.origem === "agenda" && !!a.agendamento_id)
        .map((a) => a.agendamento_id as string);
      const manualIds = alvos.filter((a) => a.origem === "manual").map((a) => a.id);
      if (agIds.length) {
        const { error } = await supabase
          .from("agendamentos")
          .update({ status: "realizado" })
          .in("id", agIds);
        if (error) {
          mostrarErro(error);
          return;
        }
      }
      if (manualIds.length) {
        const { error } = await supabase
          .from("fin_atendimentos")
          .update({ status: "realizado" })
          .in("id", manualIds);
        if (error) {
          mostrarErro(error);
          return;
        }
      }
      toast.success(`Baixa realizada em ${alvos.length} atendimento(s). Repasses liberados.`);
      await load();
    } catch (err) {
      mostrarErro(err);
    }
  };

  const desfazerBaixaLote = async () => {
    if (!podeEstornar) {
      toast.error("Sem permissão para desfazer a baixa.");
      return;
    }
    if (!podeEscrever) {
      toast.error("Você não tem permissão de edição neste módulo.");
      return;
    }
    const alvos = selectedItems.filter((a) => !a.repasse_pago && isAtendido(a));
    if (alvos.length === 0) return;
    if (
      !(await confirmDialog(
        `Desfazer a baixa de ${alvos.length} atendimento(s)?\n\nOs atendimentos voltam para 'Confirmado'. Os pagamentos dos pacientes permanecem intactos no caixa — apenas lançamentos-sombra de R$ 0,00 são removidos.`,
      ))
    )
      return;
    try {
      // Um a um, pela mesma RPC do botão da linha. Sequencial de propósito: os
      // atendimentos do lote podem dividir o mesmo agendamento/lançamento, e em
      // paralelo eles disputariam a trava da linha no banco.
      let ok = 0;
      let jaDesfeitos = 0;
      const erros: string[] = [];
      for (const a of alvos) {
        const r = await desfazerBaixaNoBanco(a);
        if (!r.ok) erros.push(r.erro ?? "erro desconhecido");
        else {
          ok += 1;
          if (r.jaDesfeito) jaDesfeitos += 1;
        }
      }
      if (ok > 0) {
        toast.success(
          `Baixa desfeita em ${ok} atendimento(s).` +
            (jaDesfeitos > 0 ? ` ${jaDesfeitos} já não estava(m) baixado(s).` : ""),
        );
      }
      if (erros.length > 0) {
        toast.error(`${erros.length} atendimento(s) não puderam ser desfeitos: ${erros[0]}`);
      }
      await load();
    } catch (err) {
      mostrarErro(err);
    }
  };

  // ------------------------------------------------------------------------
  // ESTORNO DO REPASSE — volta um atendimento de "Pago" para "A receber".
  //
  // É a ação que faltava: até aqui, um repasse pago por engano não tinha volta
  // pela tela. Roda pela RPC `estornar_repasse_atendimento`, que num único
  // COMMIT desvincula o comprovante (a despesa de repasse), abate o valor dela
  // (ou apaga a despesa, se aquele era o último atendimento dela), desfaz o
  // repasse do terceiro dono do equipamento, limpa as marcas de pago e grava a
  // auditoria com usuário, data/hora e motivo.
  //
  // O pagamento do PACIENTE e a gaveta do caixa não são tocados — a despesa de
  // repasse nunca entra em caixa_movimentos.
  // ------------------------------------------------------------------------
  const [estornoRepasse, setEstornoRepasse] = useState<{
    open: boolean;
    alvos: Atend[];
    motivo: string;
    saving: boolean;
  }>({ open: false, alvos: [], motivo: "", saving: false });

  const abrirEstornoRepasse = (candidatos: Atend[]) => {
    if (!podeEstornarRepasse) {
      toast.error("Somente os perfis Financeiro e Administrador podem estornar um repasse pago.");
      return;
    }
    const pagos = candidatos.filter((a) => a.repasse_pago);
    if (pagos.length === 0) {
      toast.info("Selecione atendimentos que estejam com o repasse Pago.");
      return;
    }
    setEstornoRepasse({ open: true, alvos: pagos, motivo: "", saving: false });
  };

  const confirmarEstornoRepasse = async () => {
    if (!clinicaAtual) return;
    const motivo = estornoRepasse.motivo.trim();
    if (motivo.length < 3) {
      toast.error("Escreva o motivo do estorno (no mínimo 3 letras).");
      return;
    }
    setEstornoRepasse((s) => ({ ...s, saving: true }));
    let ok = 0;
    let jaEstornados = 0;
    const erros: string[] = [];
    try {
      for (const a of estornoRepasse.alvos) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase.rpc as any)("estornar_repasse_atendimento", {
          _clinica_id: clinicaAtual.clinica_id,
          _origem: a.origem === "agenda" ? "agenda" : "manual",
          _id: a.id,
          _valor_medico: Number(a.valor_medico) || 0,
          _motivo: motivo,
        });
        if (error) {
          erros.push((error as { message?: string }).message ?? "erro desconhecido");
        } else {
          ok += 1;
          if (((data ?? {}) as { ja_estornado?: boolean }).ja_estornado) jaEstornados += 1;
        }
      }
    } catch (err) {
      mostrarErro(err);
    }
    setEstornoRepasse({ open: false, alvos: [], motivo: "", saving: false });
    if (ok > 0) {
      toast.success(
        `Repasse estornado em ${ok} atendimento(s) — voltaram para "A receber".` +
          (jaEstornados > 0 ? ` ${jaEstornados} já não estava(m) pago(s).` : ""),
      );
    }
    if (erros.length > 0) {
      toast.error(`${erros.length} atendimento(s) não puderam ser estornados: ${erros[0]}`);
    }
    setSel(new Set());
    await load();
  };

  const medMap = useMemo(() => new Map(medicos.map((m) => [m.id, m.nome])), [medicos]);
  // Nome do paciente: o combobox só traz os 500 primeiros (`pacientes`), por
  // isso o fallback usa `a.paciente_nome_extra` (vem embutido na query em
  // `load`, via FK `paciente:pacientes(nome)`) — ver uso em `filteredItems`.
  const pacMap = useMemo(() => new Map(pacientes.map((p) => [p.id, p.nome])), [pacientes]);
  const filteredItems = useMemo(() => {
    const q = norm(fPaciente.trim());
    const base = !q
      ? items
      : items.filter((a) => {
          const nome =
            (a.paciente_id ? pacMap.get(a.paciente_id) : null) ?? a.paciente_nome_extra ?? "";
          return norm(nome).includes(q);
        });
    const baseTipo =
      fTipo === "todos"
        ? base
        : fTipo === "medico"
          ? base.filter((a) => (Number(a.valor_medico) || 0) > 0)
          : base.filter((a) => (Number(a.valor_medico) || 0) === 0);
    const baseLaudo =
      fLaudo === "todos"
        ? baseTipo
        : fLaudo === "baixado"
          ? baseTipo.filter((a) => a.laudo_status === "emitido")
          : baseTipo.filter((a) => a.laudo_status !== "emitido");
    const nomeDe = (a: Atend) =>
      norm(
        ((a.paciente_id ? pacMap.get(a.paciente_id) : null) ?? a.paciente_nome_extra ?? "").trim(),
      );
    const grDe = (a: Atend) => a.agendamento_inicio ?? a.data ?? "";
    const arr = [...baseLaudo];
    switch (fOrdem) {
      case "data_asc":
        arr.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
        break;
      case "gr":
        // GR = ordem da agenda (data/hora do agendamento). Manuais vão para o fim.
        arr.sort((a, b) => {
          const ai = grDe(a);
          const bi = grDe(b);
          if (a.origem === "agenda" && b.origem !== "agenda") return -1;
          if (b.origem === "agenda" && a.origem !== "agenda") return 1;
          return ai < bi ? -1 : ai > bi ? 1 : 0;
        });
        break;
      case "paciente_az":
        arr.sort((a, b) => nomeDe(a).localeCompare(nomeDe(b)));
        break;
      case "paciente_za":
        arr.sort((a, b) => nomeDe(b).localeCompare(nomeDe(a)));
        break;
      case "data_desc":
      default:
        arr.sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0));
    }
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, fPaciente, pacientes.length, fOrdem, fTipo, fLaudo]);
  const totais = useMemo(
    () =>
      filteredItems.reduce(
        (acc, a) => {
          acc.total += Number(a.valor_total) || 0;
          acc.medico += Number(a.valor_medico) || 0;
          acc.clinica += Number(a.valor_clinica) || 0;
          if (a.repasse_pago) acc.pago += Number(a.valor_medico) || 0;
          else acc.aReceber += Number(a.valor_medico) || 0;
          // REPASSE TRIPLO — a parte do dono do equipamento é somada à parte,
          // porque ela sai num lançamento separado do repasse do executante.
          const vt = a.terceiro_medico_id ? Number(a.terceiro_valor) || 0 : 0;
          if (vt > 0) {
            if (a.terceiro_pago) acc.terceiroPago += vt;
            else acc.terceiroAPagar += vt;
          }
          return acc;
        },
        {
          total: 0,
          medico: 0,
          clinica: 0,
          pago: 0,
          aReceber: 0,
          terceiroPago: 0,
          terceiroAPagar: 0,
        },
      ),
    [filteredItems],
  );

  const isAtendido = (a: Atend) =>
    a.origem === "manual" ? a.status === "realizado" : a.agendamento_status === "realizado";
  // Itens selecionáveis: qualquer atendimento com repasse > 0.
  // As ações do topo validam individualmente o que cada uma aceita
  // (baixa em lote, pagar repasse, 2ª via).
  // Memoizado: sem isso eram 9 varreduras completas de `filteredItems`/
  // `selectedItems` — nenhuma memoizada — refeitas a cada render (inclusive
  // ao digitar em qualquer campo da tela), o que travava o clique de
  // seleção com milhares de linhas na tabela.
  const {
    selectables,
    allSelected,
    selectedItems,
    selectedTotal,
    selectedPagos,
    selectedNaoPagos,
    selectedNaoBaixados,
    selectedBaixados,
    selectedLaudoElegiveis,
  } = useMemo(() => {
    const selectables = filteredItems.filter((a) => (a.valor_medico ?? 0) > 0);
    const allSelected =
      selectables.length > 0 && selectables.every((a) => sel.has(`${a.origem}:${a.id}`));
    const selectedItems = filteredItems.filter((a) => sel.has(`${a.origem}:${a.id}`));
    const selectedTotal = selectedItems.reduce((s, a) => s + (Number(a.valor_medico) || 0), 0);
    const selectedPagos = selectedItems.filter((a) => a.repasse_pago);
    const selectedNaoPagos = selectedItems.filter((a) => !a.repasse_pago);
    const selectedNaoBaixados = selectedItems.filter((a) => !a.repasse_pago && !isAtendido(a));
    const selectedBaixados = selectedItems.filter((a) => !a.repasse_pago && isAtendido(a));
    const selectedLaudoElegiveis = selectedItems.filter((a) => {
      const procKey = a.procedimento ? norm(a.procedimento) : "";
      const exige = procKey && procLaudo.get(procKey);
      return exige && a.laudo_status !== "emitido";
    });
    return {
      selectables,
      allSelected,
      selectedItems,
      selectedTotal,
      selectedPagos,
      selectedNaoPagos,
      selectedNaoBaixados,
      selectedBaixados,
      selectedLaudoElegiveis,
    };
  }, [filteredItems, sel, procLaudo]);
  const toggleAll = () => {
    if (allSelected) setSel(new Set());
    else setSel(new Set(selectables.map((a) => `${a.origem}:${a.id}`)));
  };
  const toggleOne = (a: Atend) => {
    const k = `${a.origem}:${a.id}`;
    const next = new Set(sel);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    setSel(next);
  };
  // REPASSE TRIPLO — prévia de quanto cada dono de equipamento vai receber
  // pelos atendimentos selecionados. Mostrada na janela de pagamento para o
  // operador conferir a divisão antes de confirmar.
  const terceirosSelecionados = useMemo(() => {
    const m = new Map<string, { nome: string; total: number; qtd: number }>();
    for (const a of selectedItems) {
      if (!a.terceiro_medico_id || a.terceiro_pago) continue;
      const valor = Number(a.terceiro_valor) || 0;
      if (valor <= 0) continue;
      const cur = m.get(a.terceiro_medico_id) ?? {
        nome: medMap.get(a.terceiro_medico_id) ?? "Terceiro",
        total: 0,
        qtd: 0,
      };
      cur.total = +(cur.total + valor).toFixed(2);
      cur.qtd += 1;
      m.set(a.terceiro_medico_id, cur);
    }
    return Array.from(m.values());
  }, [selectedItems, medMap]);
  const podePagar = selectedItems.length > 0 && selectedNaoPagos.length === selectedItems.length;
  // 2ª via: basta haver ao menos um selecionado já pago. Reimprimir não grava
  // nada, então seleção misturada não precisa bloquear — o comprovante sai
  // apenas com os itens efetivamente pagos.
  const podeReimprimir = selectedPagos.length > 0;
  const misturado =
    selectedItems.length > 0 && selectedPagos.length > 0 && selectedNaoPagos.length > 0;
  const reimprimirSelecionados = () => {
    if (!podeReimprimir) {
      toast.info("Selecione atendimentos com repasse já pago para emitir a 2ª via.");
      return;
    }
    abrirSegundaViaLote(selectedPagos);
  };

  const openPay = () => {
    if (!selectedItems.length) {
      toast.info("Selecione ao menos um atendimento.");
      return;
    }
    setPayForm({
      data: hoje,
      conta_id: contas[0]?.id ?? "",
      forma_pagamento: "",
      valor_manual: "",
    });
    setPayOpen(true);
  };

  const confirmarPagamento = async () => {
    if (!clinicaAtual || !selectedItems.length) return;
    if (!podeEscrever) {
      toast.error("Você não tem permissão de edição neste módulo.");
      return;
    }
    setPayingNow(true);
    try {
      // Pré-validação no cliente: só pode pagar repasse de atendimentos efetivamente
      // realizados e cuja data marcada na agenda já chegou. A mesma regra também
      // é reforçada no banco pela RPC pagar_repasse_medico.
      const agendaIdsCheck = selectedItems.filter((x) => x.origem === "agenda").map((x) => x.id);
      if (agendaIdsCheck.length) {
        const { data: lancs, error: eChk } = await supabase
          .from("fin_lancamentos")
          .select("id, status, agendamento_id, agendamento:agendamentos(status, inicio)")
          .in("id", agendaIdsCheck);
        if (eChk) throw eChk;
        const hojeIso = new Date().toISOString().slice(0, 10);
        const bloq: string[] = [];
        for (const l of (lancs ?? []) as Array<{
          id: string;
          status: string | null;
          agendamento_id: string | null;
          agendamento: { status: string | null; inicio: string | null } | null;
        }>) {
          const lancOk = l.status === "confirmado";
          const agStatus = l.agendamento?.status ?? null;
          const dataAgenda = l.agendamento?.inicio?.slice(0, 10) ?? null;
          const agOk = agStatus === "realizado";
          const dataOk = !!dataAgenda && dataAgenda <= hojeIso && dataAgenda <= payForm.data;
          if (!lancOk || !agOk || !dataOk) bloq.push(l.id);
        }
        if (bloq.length) {
          toast.error(
            `Não é possível pagar o repasse: ${bloq.length} atendimento(s) ainda não estão liberados. O repasse só pode ser pago no dia marcado do atendimento ou depois, com o atendimento realizado.`,
          );
          setPayingNow(false);
          return;
        }
      }
      // Mesma validação para atendimentos manuais (fin_atendimentos)
      const manualBloq = selectedItems.filter(
        (x) => x.origem === "manual" && x.status !== "realizado",
      );
      if (manualBloq.length) {
        toast.error(
          `Não é possível pagar o repasse: ${manualBloq.length} atendimento(s) manual(is) não estão com status 'realizado'.`,
        );
        setPayingNow(false);
        return;
      }
      // Agrupa por médico para gerar um lançamento de despesa por médico
      const byMed = new Map<string, Atend[]>();
      for (const a of selectedItems) {
        const k = a.medico_id ?? "sem";
        if (!byMed.has(k)) byMed.set(k, []);
        byMed.get(k)!.push(a);
      }
      // Valor manual (override). Só aplicável quando o pagamento é para
      // um único médico — se houver mais de um, mostramos aviso e
      // ignoramos o override para não desbalancear repasses de outros.
      const valorManualNum = Number((payForm.valor_manual ?? "").toString().replace(",", "."));
      const usarValorManual = valorManualNum > 0 && byMed.size === 1;
      if (valorManualNum > 0 && byMed.size > 1) {
        toast.warning(
          "Valor manual ignorado: selecione atendimentos de apenas um médico para editar o valor do repasse.",
        );
      }
      // Quantos lançamentos separados de terceiro (dono de equipamento) foram
      // gerados — só para avisar o operador no fim.
      let terceirosGerados = 0;
      // Itens cujo pagamento realmente entrou no banco. É desta lista que sai o
      // recibo do terceiro: se a RPC de algum médico falhar, o dono do
      // equipamento daqueles atendimentos também não recebeu, e não pode sair
      // recibo dele.
      const itensPagosOk: Atend[] = [];
      for (const [medId, list] of byMed) {
        const totalCalc = list.reduce((s, x) => s + (Number(x.valor_medico) || 0), 0);
        const total = usarValorManual ? valorManualNum : totalCalc;
        if (total <= 0) {
          // Repasse do executante zerado: nada a pagar. Se houvesse terceiro
          // pendente nesses atendimentos ele ficaria de fora sem ninguém
          // perceber — por isso o aviso explícito.
          const terceiroPendente = list.some(
            (x) => x.terceiro_medico_id && !x.terceiro_pago && (Number(x.terceiro_valor) || 0) > 0,
          );
          if (terceiroPendente) {
            toast.warning(
              "Há repasse de terceiro pendente em atendimentos cujo repasse do médico executante é zero. Esses terceiros não foram pagos — lance a despesa manualmente em Financeiro → Movimento.",
            );
          }
          continue;
        }
        const medNome = medId !== "sem" ? (medMap.get(medId) ?? "") : "—";
        const { data: userData } = await supabase.auth.getUser();
        const currentUserId = userData?.user?.id ?? null;
        const manualIds = list.filter((x) => x.origem === "manual").map((x) => x.id);
        const agendaIds = list.filter((x) => x.origem === "agenda").map((x) => x.id);
        // REPASSE TRIPLO — a parte do dono do equipamento sai num lançamento
        // PRÓPRIO, por terceiro, dentro do mesmo COMMIT do repasse do
        // executante. O valor do terceiro não depende do valor manual do
        // executante: é sempre o percentual cadastrado sobre o valor do
        // atendimento.
        const terceirosMap = new Map<
          string,
          {
            terceiro_id: string;
            terceiro_nome: string;
            total: number;
            itens: Array<{
              origem: string;
              id: string;
              valor: number;
              percentual: number | null;
              data: string;
            }>;
          }
        >();
        for (const x of list) {
          if (!x.terceiro_medico_id || x.terceiro_pago) continue;
          const valorTerceiro = +(Number(x.terceiro_valor) || 0).toFixed(2);
          if (valorTerceiro <= 0) continue;
          const k = x.terceiro_medico_id;
          if (!terceirosMap.has(k)) {
            terceirosMap.set(k, {
              terceiro_id: k,
              terceiro_nome: medMap.get(k) ?? "Terceiro",
              total: 0,
              itens: [],
            });
          }
          const t = terceirosMap.get(k)!;
          t.total = +(t.total + valorTerceiro).toFixed(2);
          t.itens.push({
            origem: x.origem ?? "manual",
            id: x.id,
            valor: valorTerceiro,
            percentual: x.terceiro_percentual ?? null,
            data: x.data,
          });
        }
        const terceiros = Array.from(terceirosMap.values());
        // Cria a despesa e marca todos os atendimentos como pagos numa ÚNICA
        // transação no banco (RPC pagar_repasse_medico). Se qualquer passo
        // falhar — inclusive outra aba/retry já tendo pago algum desses
        // atendimentos nesse meio-tempo — o Postgres desfaz TUDO
        // automaticamente (transação real), sem depender de rollback manual
        // no cliente e sem janela onde a despesa exista sem todos os
        // atendimentos marcados como pagos (ou vice-versa).
        const argsRpc = {
          _clinica_id: clinicaAtual.clinica_id,
          _medico_id: medId !== "sem" ? medId : null,
          _manual_ids: manualIds,
          _agenda_ids: agendaIds,
          _total: total,
          _data: payForm.data,
          _forma_pagamento: payForm.forma_pagamento || null,
          _conta_id: payForm.conta_id || null,
          _criado_por: currentUserId,
          _medico_nome: medNome,
        };
        // Sem terceiro o fluxo continua exatamente como sempre foi. Com
        // terceiro, a RPC estendida faz os dois pagamentos numa transação só —
        // ou entram os dois créditos, ou não entra nenhum.
        const { error: eRpc } = terceiros.length
          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase.rpc as any)("pagar_repasse_medico_com_terceiros", {
              ...argsRpc,
              _terceiros: terceiros,
            })
          : await supabase.rpc("pagar_repasse_medico", argsRpc as never);
        if (eRpc) {
          toast.error(
            (eRpc as { code?: string }).code === "23505"
              ? `Alguns atendimentos de ${medNome} já haviam sido pagos. Nenhum novo pagamento foi gerado — recarregando.`
              : `Falha ao pagar repasse de ${medNome}: ${(eRpc as { message?: string }).message ?? "erro desconhecido"}`,
          );
          continue;
        }
        terceirosGerados += terceiros.length;
        itensPagosOk.push(...list);
        // Se usamos valor manual, ajusta o valor_medico de cada atendimento
        // MANUAL proporcionalmente para que o comprovante e o total pago
        // batam. Para atendimentos de agenda o valor_medico é derivado das
        // regras de repasse e não é persistido nessa tabela — o total
        // manual já foi gravado no lançamento de despesa acima.
        if (usarValorManual) {
          const centavosAlvo = Math.round(total * 100);
          const base = totalCalc > 0 ? totalCalc : list.length;
          let acumulado = 0;
          for (let i = 0; i < list.length; i++) {
            const item = list[i];
            let valorItem: number;
            if (i === list.length - 1) {
              valorItem = Math.max(0, (centavosAlvo - acumulado) / 100);
            } else {
              const peso = totalCalc > 0 ? (Number(item.valor_medico) || 0) / base : 1 / base;
              const cents = Math.round(centavosAlvo * peso);
              acumulado += cents;
              valorItem = cents / 100;
            }
            item.valor_medico = valorItem;
            if (item.origem === "manual") {
              await supabase
                .from("fin_atendimentos")
                .update({ valor_medico: valorItem })
                .eq("id", item.id);
            }
          }
        }
      }
      toast.success(
        terceirosGerados > 0
          ? `Repasses pagos com sucesso. Foram gerados ${terceirosGerados} lançamento(s) separado(s) de repasse de terceiro (dono do equipamento).`
          : "Repasses pagos com sucesso",
      );
      const c = buildComprovante(selectedItems, {
        ...payForm,
        pago_at: new Date().toISOString(),
        reimpressao: false,
      });
      // REPASSE TRIPLO — cada dono de equipamento pago neste lote sai com o
      // recibo dele, numa página própria, logo depois do recibo do executante.
      const blocos = [
        ...(c ? [c] : []),
        ...buildComprovantesTerceiro(itensPagosOk, {
          data: payForm.data,
          forma_pagamento: payForm.forma_pagamento,
          conta_id: payForm.conta_id,
          reimpressao: false,
        }),
      ];
      setPayOpen(false);
      if (blocos.length) {
        setComprovante(blocos[0]);
        setComprovantes(blocos);
        setComprovanteOpen(true);
      }
      await load();
    } catch (e) {
      const err = e as { message?: string };
      mostrarErro(err);
      // Sincroniza o estado local com o banco após falha para evitar que
      // o usuário tente pagar de novo achando que nada foi feito quando na
      // verdade um médico do lote já foi processado com sucesso.
      try {
        await load();
      } catch {
        /* noop */
      }
    } finally {
      setPayingNow(false);
    }
  };

  return (
    <div className="space-y-3">
      <Tabs defaultValue="atendimentos" className="space-y-3">
        <TabsList>
          <TabsTrigger value="atendimentos">Atendimentos</TabsTrigger>
          <TabsTrigger value="comprovantes">Comprovantes</TabsTrigger>
        </TabsList>
        <TabsContent value="atendimentos" className="space-y-3 mt-0">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold leading-tight">Atendimentos</h1>
              <p className="text-xs text-muted-foreground">
                {isMedicoOnly
                  ? "Seus atendimentos e o repasse devido por serviço"
                  : "Serviços realizados com repasse automático (inclui pagamentos da agenda)"}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  if (!filteredItems.length) {
                    toast.info("Sem dados para exportar.");
                    return;
                  }
                  exportToExcel(
                    filteredItems.map((a) => ({
                      data: new Date(a.data + "T00:00:00").toLocaleDateString("pt-BR"),
                      medico: a.medico_id ? (medMap.get(a.medico_id) ?? "") : "",
                      paciente: nomePaciente(a),
                      procedimento: a.procedimento ?? "",
                      valor_total: Number(a.valor_total).toFixed(2),
                      valor_medico: Number(a.valor_medico).toFixed(2),
                      valor_clinica: Number(a.valor_clinica).toFixed(2),
                      forma_pagamento: a.forma_pagamento ?? "",
                      status: a.status,
                    })),
                    `atendimentos-${new Date().toISOString().slice(0, 10)}`,
                    isMedicoOnly
                      ? [
                          { key: "data", label: "Data" },
                          { key: "paciente", label: "Paciente" },
                          { key: "procedimento", label: "Serviço" },
                          { key: "valor_medico", label: "Repasse (R$)" },
                          { key: "status", label: "Status" },
                        ]
                      : [
                          { key: "data", label: "Data" },
                          { key: "medico", label: "Médico" },
                          { key: "paciente", label: "Paciente" },
                          { key: "procedimento", label: "Serviço" },
                          { key: "valor_total", label: "Valor total (R$)" },
                          { key: "valor_medico", label: "Repasse médico (R$)" },
                          { key: "valor_clinica", label: "Clínica (R$)" },
                          { key: "forma_pagamento", label: "Forma pagamento" },
                          { key: "status", label: "Status" },
                        ],
                  );
                }}
              >
                <Download className="h-4 w-4 mr-2" />
                Exportar Excel
              </Button>
              {!isMedicoOnly && podeEscrever && (
                <Button
                  onClick={openPay}
                  disabled={!podePagar}
                  title={misturado ? "Selecione apenas atendimentos NÃO pagos" : undefined}
                >
                  <Wallet className="h-4 w-4 mr-2" />
                  Pagar repasse
                  {selectedNaoPagos.length
                    ? ` (${selectedNaoPagos.length} • ${fmt(selectedNaoPagos.reduce((s, x) => s + (Number(x.valor_medico) || 0), 0))})`
                    : ""}
                </Button>
              )}
              {/* 2ª via do comprovante: aparece assim que há repasse pago marcado.
                  Não exige permissão de escrita porque só reimprime. */}
              {!isMedicoOnly && podeReimprimir && (
                <Button
                  variant="outline"
                  onClick={reimprimirSelecionados}
                  title="Reimprimir o comprovante (2ª via) dos repasses já pagos que estão selecionados"
                >
                  <Printer className="h-4 w-4 mr-2" />
                  2ª via do comprovante
                  {` (${selectedPagos.length} • ${fmt(selectedPagos.reduce((s, x) => s + (Number(x.valor_medico) || 0), 0))})`}
                </Button>
              )}
              {!isMedicoOnly && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline">
                      <MoreHorizontal className="h-4 w-4 mr-2" />
                      Opções
                      {selectedItems.length ? ` (${selectedItems.length})` : ""}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                    <DropdownMenuLabel>
                      {selectedItems.length
                        ? `${selectedItems.length} atendimento(s) selecionado(s)`
                        : "Selecione atendimentos na lista"}
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      disabled={selectedNaoBaixados.length === 0 || !podeEscrever}
                      onSelect={(e) => {
                        e.preventDefault();
                        if (selectedNaoBaixados.length > 0) darBaixaLote();
                      }}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-2 text-emerald-600" />
                      Dar baixa
                      {selectedNaoBaixados.length ? ` (${selectedNaoBaixados.length})` : ""}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={selectedBaixados.length === 0 || !podeEstornar || !podeEscrever}
                      onSelect={(e) => {
                        e.preventDefault();
                        if (selectedBaixados.length > 0) desfazerBaixaLote();
                      }}
                    >
                      <Undo2 className="h-4 w-4 mr-2 text-amber-600" />
                      Desfazer baixa
                      {selectedBaixados.length ? ` (${selectedBaixados.length})` : ""}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={selectedPagos.length === 0 || !podeEstornarRepasse}
                      onSelect={(e) => {
                        e.preventDefault();
                        if (selectedPagos.length > 0) abrirEstornoRepasse(selectedPagos);
                      }}
                    >
                      <RotateCcw className="h-4 w-4 mr-2 text-rose-600" />
                      Estornar repasse (volta para A receber)
                      {selectedPagos.length ? ` (${selectedPagos.length})` : ""}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      disabled={selectedLaudoElegiveis.length === 0 || !podeEscrever}
                      onSelect={(e) => {
                        e.preventDefault();
                        if (selectedLaudoElegiveis.length > 0) abrirLaudoLote();
                      }}
                    >
                      <Stethoscope className="h-4 w-4 mr-2 text-sky-600" />
                      Vincular vários laudos
                      {selectedLaudoElegiveis.length ? ` (${selectedLaudoElegiveis.length})` : ""}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      disabled={!podeReimprimir}
                      onSelect={(e) => {
                        e.preventDefault();
                        reimprimirSelecionados();
                      }}
                    >
                      <Printer className="h-4 w-4 mr-2 text-primary" />
                      Reimprimir comprovante (2ª via)
                      {selectedPagos.length ? ` (${selectedPagos.length})` : ""}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <Dialog open={open} onOpenChange={setOpen}>
                {!isMedicoOnly && podeEscrever && (
                  <DialogTrigger asChild>
                    <Button onClick={openNew} disabled={!clinicaAtual}>
                      <Plus className="h-4 w-4 mr-2" />
                      Novo atendimento
                    </Button>
                  </DialogTrigger>
                )}
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>{editing ? "Editar" : "Novo"} atendimento</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={submit} className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>Data</Label>
                        <DateInputBR
                          required
                          value={form.data}
                          onChange={(e) => setForm({ ...form, data: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Status</Label>
                        <Select
                          value={form.status}
                          onValueChange={(v) => setForm({ ...form, status: v })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="realizado">Realizado</SelectItem>
                            <SelectItem value="agendado">Agendado</SelectItem>
                            <SelectItem value="cancelado">Cancelado</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Médico</Label>
                      <Select
                        value={form.medico_id || "none"}
                        onValueChange={(v) =>
                          setForm({ ...form, medico_id: v === "none" ? "" : v })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="—" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">—</SelectItem>
                          {medicos.map((m) => (
                            <SelectItem key={m.id} value={m.id} className="uppercase">
                              {m.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Paciente</Label>
                      <Select
                        value={form.paciente_id || "none"}
                        onValueChange={(v) =>
                          setForm({ ...form, paciente_id: v === "none" ? "" : v })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="—" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">—</SelectItem>
                          {pacientes.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Serviço</Label>
                      <Input
                        value={form.procedimento}
                        onChange={(e) => setForm({ ...form, procedimento: e.target.value })}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>Valor total *</Label>
                        <CurrencyInput
                          value={form.valor_total}
                          onChange={(v) => setForm({ ...form, valor_total: v })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Forma de pagamento</Label>
                        <Input
                          value={form.forma_pagamento}
                          onChange={(e) => setForm({ ...form, forma_pagamento: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="bg-muted rounded-md p-3 text-sm flex justify-between">
                      <span>
                        Repasse médico: <strong>{fmt(calc.medico)}</strong>
                      </span>
                      <span>
                        Clínica: <strong>{fmt(calc.clinica)}</strong>
                      </span>
                    </div>
                    <DialogFooter>
                      <Button type="submit" disabled={saving}>
                        {saving ? "Salvando..." : "Salvar"}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* Filtros */}
          <Card>
            <CardContent className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-8 gap-3 items-end">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium flex items-center gap-1">
                    <Filter className="h-3.5 w-3.5" />
                    Médico
                  </Label>
                  <MedicoCombobox
                    value={fMedico}
                    onChange={(v) => {
                      if (!isMedicoOnly) setFMedico(v);
                    }}
                    medicos={
                      isMedicoOnly ? medicos.filter((m) => m.id === medicoLogadoId) : medicos
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Paciente</Label>
                  <Input
                    className="h-9"
                    placeholder="Buscar por nome..."
                    value={fPaciente}
                    onChange={(e) => setFPaciente(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">De</Label>
                  <DateInputBR
                    className="h-9"
                    value={fIni}
                    onChange={(e) => setFIni(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Até</Label>
                  <DateInputBR
                    className="h-9"
                    value={fFim}
                    onChange={(e) => setFFim(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Status repasse</Label>
                  <Select
                    value={fStatus}
                    onValueChange={(v) => setFStatus(v as "todos" | "aberto" | "pago")}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="aberto">A receber</SelectItem>
                      <SelectItem value="pago">Pagos</SelectItem>
                      <SelectItem value="todos">Todos</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Tipo</Label>
                  <Select
                    value={fTipo}
                    onValueChange={(v) => setFTipo(v as "todos" | "medico" | "clinica")}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos</SelectItem>
                      <SelectItem value="medico">Apenas médico (com repasse)</SelectItem>
                      <SelectItem value="clinica">Apenas clínica (sem repasse)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">
                    Laudo
                    <span className="ml-1 font-normal text-muted-foreground">
                      ({filteredItems.filter((a) => a.laudo_status === "emitido").length} baixados ·{" "}
                      {filteredItems.filter((a) => a.laudo_status !== "emitido").length} pendentes)
                    </span>
                  </Label>
                  <Select
                    value={fLaudo}
                    onValueChange={(v) => setFLaudo(v as "todos" | "baixado" | "nao_baixado")}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos</SelectItem>
                      <SelectItem value="baixado">Baixados</SelectItem>
                      <SelectItem value="nao_baixado">Não baixados</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Ordenar por</Label>
                  <Select value={fOrdem} onValueChange={(v) => setFOrdem(v as typeof fOrdem)}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="data_desc">Data (mais recente)</SelectItem>
                      <SelectItem value="data_asc">Data (mais antiga)</SelectItem>
                      <SelectItem value="gr">Nº da GR (agenda)</SelectItem>
                      <SelectItem value="paciente_az">Paciente (A-Z)</SelectItem>
                      <SelectItem value="paciente_za">Paciente (Z-A)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Cards de valores - mais compactos e próximos */}
                {isMedicoOnly ? (
                  <div className="flex gap-1.5 min-w-[140px]">
                    <div className="flex-1 rounded-lg border-2 px-2 py-1 bg-primary/10 text-center h-9 flex items-center justify-center">
                      <div>
                        <div className="text-[9px] text-muted-foreground uppercase leading-tight">
                          A receber
                        </div>
                        <div className="text-xs font-bold text-primary leading-tight">
                          {fmt(totais.aReceber)}
                        </div>
                      </div>
                    </div>
                    <div className="flex-1 rounded-lg border-2 px-2 py-1 text-center h-9 flex items-center justify-center">
                      <div>
                        <div className="text-[9px] text-muted-foreground uppercase leading-tight">
                          Recebido
                        </div>
                        <div className="text-xs font-bold leading-tight">{fmt(totais.pago)}</div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-1.5 min-w-[140px]">
                    <div className="flex-1 rounded-lg border-2 px-2 py-1 bg-amber-500/10 text-center h-9 flex items-center justify-center">
                      <div>
                        <div className="text-[9px] text-muted-foreground uppercase leading-tight">
                          A pagar
                        </div>
                        <div className="text-xs font-bold text-amber-600 leading-tight">
                          {fmt(totais.aReceber)}
                        </div>
                      </div>
                    </div>
                    <div className="flex-1 rounded-lg border-2 px-2 py-1 bg-emerald-500/10 text-center h-9 flex items-center justify-center">
                      <div>
                        <div className="text-[9px] text-muted-foreground uppercase leading-tight">
                          Pago
                        </div>
                        <div className="text-xs font-bold text-emerald-600 leading-tight">
                          {fmt(totais.pago)}
                        </div>
                      </div>
                    </div>
                    {/* REPASSE TRIPLO — só aparece quando há dono de equipamento
                        a receber no período filtrado. */}
                    {totais.terceiroAPagar + totais.terceiroPago > 0 && (
                      <div
                        className="flex-1 rounded-lg border-2 px-2 py-1 bg-amber-500/10 text-center h-9 flex items-center justify-center"
                        title="Repasse de terceiro (dono do equipamento) — sai em lançamento separado do repasse do médico executante"
                      >
                        <div>
                          <div className="text-[9px] text-muted-foreground uppercase leading-tight">
                            Terceiros
                          </div>
                          <div className="text-xs font-bold text-amber-700 leading-tight">
                            {fmt(totais.terceiroAPagar)}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="rounded-xl bg-card">
            <div className="p-0">
              {loading ? (
                <ListSkeleton
                  rows={7}
                  fallback={
                    <div className="py-12 text-center text-muted-foreground">Carregando...</div>
                  }
                />
              ) : filteredItems.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <Stethoscope className="h-10 w-10 mx-auto mb-2 text-muted-foreground/50" />
                  Nenhum atendimento no período/filtro selecionado.
                </div>
              ) : (
                <Table
                  containerClassName="max-h-[70vh] scroll-slim rounded-xl border-0"
                  className="max-lg:table max-lg:overflow-visible border-separate border-spacing-0"
                >
                  <TableHeader className="sticky top-0 z-20">
                    <TableRow className="bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70 border-0 [&>th]:border-b [&>th]:border-border/60 [&>th]:h-9 [&>th]:text-muted-foreground [&>th]:uppercase [&>th]:tracking-wide hover:bg-background/90">
                      {!isMedicoOnly && (
                        <TableHead className="w-8 px-2">
                          <Checkbox
                            checked={allSelected}
                            onCheckedChange={toggleAll}
                            aria-label="Selecionar todos"
                          />
                        </TableHead>
                      )}
                      <TableHead className="text-[12px] font-medium px-2 whitespace-nowrap text-center w-10">
                        Ficha
                      </TableHead>
                      <TableHead className="text-[12px] font-medium px-2 whitespace-nowrap">
                        Data
                      </TableHead>
                      <TableHead className="text-[12px] font-medium px-2">Médico</TableHead>
                      <TableHead className="text-[12px] font-medium px-2">Paciente</TableHead>
                      <TableHead className="text-[12px] font-medium px-2">Serviço</TableHead>
                      {!isMedicoOnly && (
                        <TableHead className="text-right text-[12px] font-medium px-2">
                          Total
                        </TableHead>
                      )}
                      <TableHead className="text-right text-[12px] font-medium px-2">
                        {isMedicoOnly ? "Repasse" : "Médico"}
                      </TableHead>
                      {!isMedicoOnly && (
                        <TableHead className="text-right text-[12px] font-medium px-2">
                          Clínica
                        </TableHead>
                      )}
                      <TableHead className="text-center text-[12px] font-medium px-2">
                        Status
                      </TableHead>
                      <TableHead className="text-center text-[12px] font-medium px-2">
                        Pgto
                      </TableHead>
                      <TableHead className="text-center text-[12px] font-medium px-2">
                        Laudo
                      </TableHead>
                      {!isMedicoOnly && (
                        <TableHead className="text-center text-[12px] font-medium px-2">
                          Ações
                        </TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredItems.map((a, idx) => {
                      const medicoNome = a.medico_id ? (medMap.get(a.medico_id) ?? "—") : "—";
                      const pacienteNome =
                        (a.paciente_id ? pacMap.get(a.paciente_id) : null) ??
                        a.paciente_nome_extra ??
                        "—";
                      const procedimentoNome = a.procedimento ?? "—";

                      // Define as cores das linhas para o efeito zebrado acompanhar a coluna fixa
                      const isSelected = sel.has(`${a.origem}:${a.id}`);
                      const baixaPendente = !a.repasse_pago && !isAtendido(a);
                      // Atendimento externo (faturado em outra clínica) — destaque
                      // vermelho bem claro para diferenciar do fluxo normal.
                      const ehExterno =
                        (a.forma_pagamento ?? "").trim().toLowerCase() === "externo";
                      const rowBg =
                        isSelected && baixaPendente
                          ? "bg-amber-50 dark:bg-amber-950/30"
                          : ehExterno
                            ? "bg-rose-50 dark:bg-rose-950/30"
                            : idx % 2 === 0
                              ? "bg-background"
                              : "bg-slate-50 dark:bg-slate-900/40";

                      return (
                        <TableRow
                          key={`${a.origem}:${a.id}`}
                          className={cn(
                            "border-0 transition-colors duration-150 hover:bg-muted/40 [&>td]:border-b [&>td]:border-border/40 [&>td]:py-2.5",
                            rowBg,
                          )}
                        >
                          {!isMedicoOnly && (
                            <TableCell className="px-2">
                              {(a.valor_medico ?? 0) > 0 ? (
                                <Checkbox
                                  checked={sel.has(`${a.origem}:${a.id}`)}
                                  onCheckedChange={() => toggleOne(a)}
                                  aria-label={
                                    a.repasse_pago ? "Selecionar para 2ª via" : "Selecionar"
                                  }
                                  title={
                                    a.repasse_pago ? "Selecionar para reimprimir 2ª via" : undefined
                                  }
                                  className="h-4 w-4"
                                />
                              ) : (
                                <span
                                  title="Sem valor de repasse cadastrado para este médico/procedimento"
                                  className="text-[11px] text-muted-foreground whitespace-nowrap"
                                >
                                  Sem repasse
                                </span>
                              )}
                            </TableCell>
                          )}
                          <TableCell className="text-xs whitespace-nowrap px-2 text-center font-mono text-muted-foreground">
                            {String(idx + 1).padStart(3, "0")}
                          </TableCell>
                          <TableCell className="text-xs whitespace-nowrap px-2">
                            {new Date(a.data + "T00:00:00").toLocaleDateString("pt-BR", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "2-digit",
                            })}
                          </TableCell>

                          {/* Larguras baseadas em % e truncate para textos longos não quebrarem o layout */}
                          <TableCell
                            className="text-xs max-w-[90px] truncate px-2"
                            title={medicoNome}
                          >
                            {medicoNome}
                          </TableCell>
                          <TableCell
                            className="text-xs font-medium max-w-[190px] truncate px-2"
                            title={pacienteNome}
                          >
                            {pacienteNome}
                          </TableCell>
                          <TableCell
                            className="text-xs text-muted-foreground max-w-[160px] truncate px-2"
                            title={procedimentoNome}
                          >
                            {procedimentoNome}
                          </TableCell>

                          {!isMedicoOnly && (
                            <TableCell className="text-xs text-right font-medium whitespace-nowrap px-2">
                              {fmt(Number(a.valor_total))}
                            </TableCell>
                          )}
                          <TableCell className="text-xs text-right font-semibold text-primary whitespace-nowrap px-2">
                            {fmt(Number(a.valor_medico))}
                            {/* REPASSE TRIPLO — a parte do dono do equipamento
                                aparece logo abaixo do repasse do executante,
                                para o operador ver a divisão antes de pagar. */}
                            {a.terceiro_medico_id && (Number(a.terceiro_valor) || 0) > 0 && (
                              <div
                                className="mt-0.5 font-normal text-[11px] text-amber-700 dark:text-amber-500"
                                title={`Repasse de terceiro (dono do equipamento): ${
                                  medMap.get(a.terceiro_medico_id) ?? "—"
                                } — ${
                                  a.terceiro_percentual != null
                                    ? `${a.terceiro_percentual}% do valor do atendimento`
                                    : "valor fixo por atendimento"
                                }`}
                              >
                                + {fmt(Number(a.terceiro_valor))}{" "}
                                <span className="text-muted-foreground">
                                  {medMap.get(a.terceiro_medico_id) ?? "terceiro"}
                                  {a.terceiro_percentual != null
                                    ? ` (${a.terceiro_percentual}%)`
                                    : " (R$ fixo)"}
                                  {a.terceiro_pago ? " • pago" : ""}
                                </span>
                              </div>
                            )}
                          </TableCell>
                          {!isMedicoOnly && (
                            <TableCell className="text-xs text-right text-muted-foreground whitespace-nowrap px-2">
                              {fmt(Number(a.valor_clinica))}
                            </TableCell>
                          )}
                          <TableCell className="text-center px-2">
                            {a.repasse_pago ? (
                              <Badge
                                variant="outline"
                                className="text-[11px] bg-emerald-500/10 text-emerald-700 border-emerald-500/30 whitespace-nowrap px-1.5 py-0"
                              >
                                <CheckCircle2 className="h-3 w-3 mr-0.5 inline" />
                                Pago
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="text-[11px] bg-amber-500/10 text-amber-700 border-amber-500/30 whitespace-nowrap px-1.5 py-0"
                              >
                                <Clock className="h-3 w-3 mr-0.5 inline" />A receber
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-center px-2">
                            <div className="flex justify-center">
                              <FormaPagamentoIcon forma={a.forma_pagamento} />
                            </div>
                          </TableCell>
                          <TableCell className="text-center px-2">
                            {(() => {
                              const procKey = a.procedimento ? norm(a.procedimento) : "";
                              const exigeLaudo = procKey && procLaudo.get(procKey);
                              const laudadorNome = a.medico_laudador_id
                                ? (medMap.get(a.medico_laudador_id) ?? null)
                                : null;
                              if (a.laudo_status === "emitido")
                                return podeEscrever ? (
                                  <div className="flex flex-col items-center gap-0.5">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-6 text-[11px] px-2 bg-sky-500/10 text-sky-700 border-sky-500/30 hover:bg-sky-500/20"
                                      title={
                                        laudadorNome
                                          ? `Laudador: ${laudadorNome}. Clique para desvincular.`
                                          : "Laudo vinculado a um médico laudador. Clique para desvincular e reabrir para nova vinculação."
                                      }
                                      onClick={() => desvincularLaudo(a)}
                                    >
                                      <CheckCircle2 className="h-3 w-3 mr-0.5" />
                                      Vinculado
                                    </Button>
                                    {laudadorNome && (
                                      <span
                                        className="text-[10px] leading-tight text-muted-foreground max-w-[110px] truncate"
                                        title={laudadorNome}
                                      >
                                        {laudadorNome}
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <div className="flex flex-col items-center gap-0.5">
                                    <Badge
                                      variant="outline"
                                      className="text-[11px] bg-sky-500/10 text-sky-700 border-sky-500/30 whitespace-nowrap px-1.5 py-0"
                                    >
                                      <CheckCircle2 className="h-3 w-3 mr-0.5 inline" />
                                      Vinculado
                                    </Badge>
                                    {laudadorNome && (
                                      <span
                                        className="text-[10px] leading-tight text-muted-foreground max-w-[110px] truncate"
                                        title={laudadorNome}
                                      >
                                        {laudadorNome}
                                      </span>
                                    )}
                                  </div>
                                );
                              if (!exigeLaudo)
                                return <span className="text-muted-foreground text-[11px]">—</span>;
                              if (!podeEstornar || !podeEscrever)
                                return <span className="text-amber-600 text-[11px]">Pendente</span>;
                              return (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-6 text-[11px] px-2"
                                  onClick={() => openLaudo(a)}
                                >
                                  Vincular
                                </Button>
                              );
                            })()}
                          </TableCell>

                          {/* Célula de Ações Fixa na Direita com sombra lateral */}
                          {!isMedicoOnly && (
                            <TableCell
                              className={cn(
                                "text-right px-2 sticky right-0 z-10 border-l shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.05)]",
                                rowBg, // Usa a mesma cor zebrada da linha para o fundo do bloco fixo
                              )}
                            >
                              {a.origem === "agenda" ? (
                                <div className="flex items-center justify-end gap-0.5">
                                  <span className="text-[10px] text-muted-foreground uppercase mr-1">
                                    Agenda
                                  </span>
                                  {podeEscrever && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7"
                                      title="Emitir NFS-e"
                                      onClick={() => openEmitNfse(a)}
                                      disabled={!a.paciente_id}
                                    >
                                      <Send className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                  {a.repasse_pago && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7"
                                      title="Imprimir comprovante de repasse"
                                      onClick={() => abrirComprovanteDoItem(a)}
                                    >
                                      <Printer className="h-3.5 w-3.5 text-primary" />
                                    </Button>
                                  )}
                                  {a.repasse_pago && podeEstornarRepasse && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7"
                                      title="Estornar o repasse — o atendimento volta para 'A receber'"
                                      onClick={() => abrirEstornoRepasse([a])}
                                    >
                                      <Undo2 className="h-3.5 w-3.5 text-amber-600" />
                                    </Button>
                                  )}
                                  {a.repasse_pago || a.agendamento_status === "realizado" ? (
                                    <Button
                                      size="sm"
                                      disabled={!podeEstornar || !podeEscrever || a.repasse_pago}
                                      className="h-6 px-2 text-[11px] gap-1 bg-emerald-100 text-emerald-800 border border-emerald-300 hover:bg-emerald-100 disabled:opacity-100"
                                      title={
                                        a.repasse_pago
                                          ? podeEstornarRepasse
                                            ? "Repasse já pago — clique na seta ao lado para estornar o repasse (volta para 'A receber') e só então desfaça a baixa"
                                            : "Repasse já pago — só os perfis Financeiro e Administrador podem estornar o repasse"
                                          : podeEstornar
                                            ? "Clique para desfazer a baixa"
                                            : "Repasse já baixado"
                                      }
                                      onClick={() => desfazerBaixa(a)}
                                    >
                                      <CheckCircle2 className="h-3 w-3" /> Baixado
                                    </Button>
                                  ) : (
                                    podeEscrever && (
                                      <Button
                                        size="sm"
                                        className={cn(
                                          "h-6 px-2 text-[11px] gap-1 border",
                                          isSelected
                                            ? "bg-amber-500 text-white border-amber-600 ring-2 ring-amber-600 hover:bg-amber-500"
                                            : "bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200",
                                        )}
                                        title="Dá baixa (marcar como realizado e liberar repasse)"
                                        onClick={() => darBaixa(a)}
                                      >
                                        {isSelected ? (
                                          <CheckCircle2 className="h-3 w-3" />
                                        ) : (
                                          <Clock className="h-3 w-3" />
                                        )}
                                        Baixar
                                      </Button>
                                    )
                                  )}
                                  {/* Botão de excluir para agenda */}
                                  {podeEscrever && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className={cn(
                                        "h-7 w-7",
                                        a.repasse_pago && "text-amber-600 hover:text-amber-700",
                                      )}
                                      title={
                                        a.repasse_pago
                                          ? "Editar repasse (já pago — ajusta a despesa vinculada)"
                                          : "Editar repasse médico deste atendimento"
                                      }
                                      onClick={() => abrirEditRepasse(a)}
                                    >
                                      <Wallet className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                  {podeEscrever && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7"
                                      title="Excluir este atendimento do financeiro. Remove o lançamento e o repasse vinculado. Não apaga o agendamento na agenda — use apenas para lançamentos criados por engano."
                                      onClick={() => remove(a)}
                                    >
                                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                    </Button>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    title="Ver histórico"
                                    onClick={() => setHistoricoAtend(a)}
                                  >
                                    <History className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-end gap-0.5">
                                  {podeEscrever && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7"
                                      title="Emitir NFS-e"
                                      onClick={() => openEmitNfse(a)}
                                      disabled={!a.paciente_id}
                                    >
                                      <Send className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                  {podeEscrever && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7"
                                      onClick={() => openEdit(a)}
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                  {a.repasse_pago && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7"
                                      title="Imprimir comprovante de repasse"
                                      onClick={() => abrirComprovanteDoItem(a)}
                                    >
                                      <Printer className="h-3.5 w-3.5 text-primary" />
                                    </Button>
                                  )}
                                  {a.repasse_pago && podeEstornarRepasse && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7"
                                      title="Estornar o repasse — o atendimento volta para 'A receber'"
                                      onClick={() => abrirEstornoRepasse([a])}
                                    >
                                      <Undo2 className="h-3.5 w-3.5 text-amber-600" />
                                    </Button>
                                  )}
                                  {a.repasse_pago || a.status === "realizado" ? (
                                    <Button
                                      size="sm"
                                      disabled={!podeEstornar || !podeEscrever || a.repasse_pago}
                                      className="h-6 px-2 text-[11px] gap-1 bg-emerald-100 text-emerald-800 border border-emerald-300 hover:bg-emerald-100 disabled:opacity-100"
                                      title={
                                        a.repasse_pago
                                          ? podeEstornarRepasse
                                            ? "Repasse já pago — clique na seta ao lado para estornar o repasse (volta para 'A receber') e só então desfaça a baixa"
                                            : "Repasse já pago — só os perfis Financeiro e Administrador podem estornar o repasse"
                                          : podeEstornar
                                            ? "Clique para desfazer a baixa"
                                            : "Repasse já baixado"
                                      }
                                      onClick={() => desfazerBaixa(a)}
                                    >
                                      <CheckCircle2 className="h-3 w-3" /> Baixado
                                    </Button>
                                  ) : (
                                    podeEscrever && (
                                      <Button
                                        size="sm"
                                        className={cn(
                                          "h-6 px-2 text-[11px] gap-1 border",
                                          isSelected
                                            ? "bg-amber-500 text-white border-amber-600 ring-2 ring-amber-600 hover:bg-amber-500"
                                            : "bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200",
                                        )}
                                        title="Dá baixa (marcar como realizado e liberar repasse)"
                                        onClick={() => darBaixa(a)}
                                      >
                                        {isSelected ? (
                                          <CheckCircle2 className="h-3 w-3" />
                                        ) : (
                                          <Clock className="h-3 w-3" />
                                        )}
                                        Baixar
                                      </Button>
                                    )
                                  )}
                                  {podeEscrever && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className={cn(
                                        "h-7 w-7",
                                        a.repasse_pago && "text-amber-600 hover:text-amber-700",
                                      )}
                                      title={
                                        a.repasse_pago
                                          ? "Editar repasse (já pago — ajusta a despesa vinculada)"
                                          : "Editar repasse médico deste atendimento"
                                      }
                                      onClick={() => abrirEditRepasse(a)}
                                    >
                                      <Wallet className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                  {podeEscrever && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7"
                                      title="Excluir este atendimento manual do financeiro. Remove o lançamento e o repasse médico. Use apenas para lançamentos criados por engano."
                                      onClick={() => remove(a)}
                                    >
                                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                    </Button>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    title="Ver histórico"
                                    onClick={() => setHistoricoAtend(a)}
                                  >
                                    <History className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              )}
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>

          {/* Barra de ações do rodapé: repete botões quando houver seleção */}
          {!isMedicoOnly && selectedItems.length > 0 && (
            <div className="sticky bottom-2 z-10 flex flex-wrap items-center justify-between gap-3 rounded-md border bg-background/95 backdrop-blur px-3 py-2 shadow-md">
              <div className="text-sm">
                <b>{selectedItems.length}</b> selecionado(s)
                {selectedPagos.length > 0 && (
                  <span className="ml-2 text-emerald-700">• {selectedPagos.length} pago(s)</span>
                )}
                {selectedNaoPagos.length > 0 && (
                  <span className="ml-2 text-amber-700">• {selectedNaoPagos.length} a pagar</span>
                )}
                <span className="ml-2 text-muted-foreground">— total {fmt(selectedTotal)}</span>
                {misturado && (
                  <span className="ml-2 text-xs text-rose-700">
                    Para pagar repasse, selecione apenas os não pagos.
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                {podeEscrever && (
                  <Button
                    size="sm"
                    onClick={openPay}
                    disabled={!podePagar}
                    title={misturado ? "Selecione apenas atendimentos NÃO pagos" : undefined}
                  >
                    <Wallet className="h-4 w-4 mr-2" />
                    Pagar repasse{selectedNaoPagos.length ? ` (${selectedNaoPagos.length})` : ""}
                  </Button>
                )}
                {podeReimprimir && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={reimprimirSelecionados}
                    title="Reimprimir o comprovante (2ª via) dos repasses já pagos que estão selecionados"
                  >
                    <Printer className="h-4 w-4 mr-2" />
                    2ª via ({selectedPagos.length})
                  </Button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline">
                      <MoreHorizontal className="h-4 w-4 mr-2" />
                      Opções
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                    <DropdownMenuItem
                      disabled={selectedNaoBaixados.length === 0 || !podeEscrever}
                      onSelect={(e) => {
                        e.preventDefault();
                        if (selectedNaoBaixados.length > 0) darBaixaLote();
                      }}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-2 text-emerald-600" />
                      Dar baixa
                      {selectedNaoBaixados.length ? ` (${selectedNaoBaixados.length})` : ""}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={selectedBaixados.length === 0 || !podeEstornar || !podeEscrever}
                      onSelect={(e) => {
                        e.preventDefault();
                        if (selectedBaixados.length > 0) desfazerBaixaLote();
                      }}
                    >
                      <Undo2 className="h-4 w-4 mr-2 text-amber-600" />
                      Desfazer baixa
                      {selectedBaixados.length ? ` (${selectedBaixados.length})` : ""}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={selectedPagos.length === 0 || !podeEstornarRepasse}
                      onSelect={(e) => {
                        e.preventDefault();
                        if (selectedPagos.length > 0) abrirEstornoRepasse(selectedPagos);
                      }}
                    >
                      <RotateCcw className="h-4 w-4 mr-2 text-rose-600" />
                      Estornar repasse (volta para A receber)
                      {selectedPagos.length ? ` (${selectedPagos.length})` : ""}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={selectedLaudoElegiveis.length === 0 || !podeEscrever}
                      onSelect={(e) => {
                        e.preventDefault();
                        if (selectedLaudoElegiveis.length > 0) abrirLaudoLote();
                      }}
                    >
                      <Stethoscope className="h-4 w-4 mr-2 text-sky-600" />
                      Vincular vários laudos
                      {selectedLaudoElegiveis.length ? ` (${selectedLaudoElegiveis.length})` : ""}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button size="sm" variant="ghost" onClick={() => setSel(new Set())}>
                  Limpar
                </Button>
              </div>
            </div>
          )}

          {/* Diálogo pagar repasse */}
          <Dialog open={payOpen} onOpenChange={setPayOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Pagar repasse médico</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="rounded-md border bg-muted/40 p-3 text-sm flex justify-between">
                  <span>{selectedItems.length} atendimento(s)</span>
                  <span className="font-semibold text-primary">{fmt(selectedTotal)}</span>
                </div>
                {terceirosSelecionados.length > 0 && (
                  <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm space-y-1">
                    <p className="text-xs font-medium text-amber-800 dark:text-amber-400">
                      Repasse de terceiro (dono do equipamento) — sai em lançamento separado
                    </p>
                    {terceirosSelecionados.map((t) => (
                      <div key={t.nome} className="flex justify-between text-xs">
                        <span>
                          {t.nome} — {t.qtd} atend.
                        </span>
                        <span className="font-semibold">{fmt(t.total)}</span>
                      </div>
                    ))}
                    <p className="text-[12px] text-muted-foreground pt-1">
                      Cada médico executante recebe o lançamento dele e cada terceiro acima recebe
                      um lançamento próprio — {terceirosSelecionados.length} a mais. Tudo é gravado
                      de uma vez só: ou entram todos, ou não entra nenhum.
                    </p>
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Valor do repasse (opcional)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder={`Padrão: ${fmt(selectedTotal)}`}
                    value={payForm.valor_manual}
                    onChange={(e) => setPayForm({ ...payForm, valor_manual: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Deixe em branco para usar o valor calculado. Para alterar manualmente, selecione
                    atendimentos de apenas um médico.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Data do pagamento</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !payForm.data && "text-muted-foreground",
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {payForm.data
                          ? format(parse(payForm.data, "yyyy-MM-dd", new Date()), "dd/MM/yyyy", {
                              locale: ptBR,
                            })
                          : "Selecionar data"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        locale={ptBR}
                        selected={
                          payForm.data ? parse(payForm.data, "yyyy-MM-dd", new Date()) : undefined
                        }
                        onSelect={(d) =>
                          d && setPayForm({ ...payForm, data: format(d, "yyyy-MM-dd") })
                        }
                        initialFocus
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>
                  <p className="text-xs text-muted-foreground">
                    Use uma data anterior para lançar pagamentos retroativos.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Conta</Label>
                  <Select
                    value={payForm.conta_id || "none"}
                    onValueChange={(v) =>
                      setPayForm({ ...payForm, conta_id: v === "none" ? "" : v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      {contas.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Forma de pagamento</Label>
                  <Select
                    value={payForm.forma_pagamento || undefined}
                    onValueChange={(v) => setPayForm({ ...payForm, forma_pagamento: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Pix">Pix</SelectItem>
                      <SelectItem value="Dinheiro">Dinheiro</SelectItem>
                      <SelectItem value="Transferência">Transferência</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setPayOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={confirmarPagamento} disabled={payingNow}>
                  {payingNow ? "Registrando..." : "Confirmar pagamento"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Diálogo: comprovante de repasse (imprimível) */}
          <Dialog open={comprovanteOpen} onOpenChange={setComprovanteOpen}>
            <DialogContent className="max-w-3xl">
              <DialogHeader className="no-print">
                <DialogTitle>
                  Comprovante de pagamento de repasse
                  {comprovantes.length > 1
                    ? ` — ${comprovantes.length} comprovantes (1 por profissional)`
                    : ""}
                </DialogTitle>
              </DialogHeader>
              {comprovantes.length > 0 && (
                <div
                  ref={printAreaRef}
                  className="print-area bg-white text-black text-sm max-h-[70vh] overflow-y-auto print:max-h-none print:overflow-visible"
                >
                  {comprovantes.map((comprovante, blocoIdx) => (
                    <div
                      key={blocoIdx}
                      className={cn(
                        "comprovante-bloco",
                        blocoIdx > 0 && "mt-8 pt-8 border-t-4 border-dashed border-slate-400",
                      )}
                    >
                      {comprovante.reimpressao && (
                        <div className="mb-3 border-2 border-rose-600 bg-rose-100 text-rose-900 rounded-md p-3 text-center">
                          <div className="text-xl font-extrabold tracking-wide uppercase">
                            Segunda via — Reimpressão de comprovante
                          </div>
                          <div className="text-sm mt-1">
                            Pagamento realizado em{" "}
                            <b>
                              {new Date(comprovante.dataPagamento + "T00:00:00").toLocaleDateString(
                                "pt-BR",
                              )}
                              {comprovante.horaPagamento
                                ? ` às ${comprovante.horaPagamento}`
                                : " (horário não registrado)"}
                            </b>
                            {comprovante.multiplasDatas && comprovante.multiplasDatas > 1 ? (
                              <span className="ml-1">
                                (contém pagamentos de {comprovante.multiplasDatas} datas)
                              </span>
                            ) : null}
                          </div>
                          <div className="text-xs mt-0.5 opacity-80">
                            Reimpressão emitida em {comprovante.emitidoEm}
                          </div>
                        </div>
                      )}
                      <div className="flex items-start justify-between border-b pb-3 mb-3">
                        <div>
                          <div className="text-xs uppercase tracking-wide text-muted-foreground">
                            Clínica
                          </div>
                          <div className="text-lg font-semibold">{comprovante.clinicaNome}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-base font-semibold">
                            {comprovante.papel === "terceiro"
                              ? "Comprovante de repasse — terceiro (equipamento)"
                              : "Comprovante de repasse médico"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Emitido em {comprovante.emitidoEm}
                          </div>
                        </div>
                      </div>

                      <div className="comprovante-resumo grid grid-cols-2 gap-x-6 gap-y-1.5 border rounded-md p-3 mb-3">
                        <div>
                          <span className="text-xs text-muted-foreground">
                            {comprovante.papel === "terceiro"
                              ? "Terceiro (dono do equipamento): "
                              : "Médico: "}
                          </span>
                          <b>{comprovante.medicoNome}</b>
                        </div>
                        <div>
                          <span className="text-xs text-muted-foreground">
                            Data e hora do pagamento:{" "}
                          </span>
                          <b>
                            {new Date(comprovante.dataPagamento + "T00:00:00").toLocaleDateString(
                              "pt-BR",
                            )}
                            {comprovante.horaPagamento
                              ? ` às ${comprovante.horaPagamento}`
                              : " (horário não registrado)"}
                          </b>
                        </div>
                        <div>
                          <span className="text-xs text-muted-foreground">Forma: </span>
                          <b>{comprovante.formaPagamento}</b>
                        </div>
                        <div>
                          <span className="text-xs text-muted-foreground">Conta: </span>
                          <b>{comprovante.contaNome}</b>
                        </div>
                        <div>
                          <span className="text-xs text-muted-foreground">Atendimentos: </span>
                          <b>{comprovante.qtd}</b>
                        </div>
                        <div className="text-right">
                          <span className="text-xs text-muted-foreground">
                            {comprovante.papel === "terceiro"
                              ? "Total pago ao terceiro: "
                              : "Total pago ao médico: "}
                          </span>
                          <b className="text-base text-primary">{fmt(comprovante.total)}</b>
                        </div>
                        {comprovante.papel === "terceiro" && (
                          <div className="col-span-2">
                            <span className="text-xs text-muted-foreground">
                              Atendimentos executados por:{" "}
                            </span>
                            <b>{comprovante.executanteNome ?? "—"}</b>
                          </div>
                        )}
                        {/* REPASSE TRIPLO — a divisão aparece também no recibo do
                            médico principal, para o financeiro conferir num papel
                            só quem mais recebeu por estes atendimentos. */}
                        {comprovante.papel === "executante" && !!comprovante.terceiros?.length && (
                          <div className="col-span-2">
                            <span className="text-xs text-muted-foreground">
                              Repasse dividido — também recebeu por estes atendimentos:{" "}
                            </span>
                            <b>
                              {comprovante.terceiros
                                .map(
                                  (t) =>
                                    `${t.nome}${
                                      t.percentuais.length
                                        ? ` (${t.percentuais.join("% / ")}%)`
                                        : " (R$ fixo)"
                                    } — ${fmt(t.total)} em ${t.qtd} atend.`,
                                )
                                .join(" · ")}
                            </b>
                            <span className="text-xs text-muted-foreground">
                              {" "}
                              — pago em comprovante próprio, não incluído no total acima.
                            </span>
                          </div>
                        )}
                      </div>

                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="border-b bg-muted/40">
                            <th className="text-left p-2">Data</th>
                            <th className="text-left p-2">Pago em</th>
                            <th className="text-left p-2">
                              {comprovante.papel === "terceiro" ? "Executante" : "Médico"}
                            </th>
                            <th className="text-left p-2">Paciente</th>
                            <th className="text-left p-2">Serviço</th>
                            <th className="text-right p-2">Valor pago (R$)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {comprovante.itens.map((it, idx) => (
                            <tr key={idx} className="border-b">
                              <td className="p-2 whitespace-nowrap">
                                {new Date(it.data + "T00:00:00").toLocaleDateString("pt-BR")}
                              </td>
                              <td className="p-2 whitespace-nowrap">
                                {it.pagoEm
                                  ? `${new Date(it.pagoEm + "T00:00:00").toLocaleDateString("pt-BR")}${it.pagoHora ? ` às ${it.pagoHora}` : ""}`
                                  : "—"}
                              </td>
                              <td className="p-2">{it.medico}</td>
                              <td className="p-2">{it.paciente}</td>
                              <td className="p-2">{it.servico}</td>
                              <td className="p-2 text-right whitespace-nowrap">
                                {fmt(it.valorMedico)}
                                {it.percentual != null ? (
                                  <span className="text-muted-foreground"> ({it.percentual}%)</span>
                                ) : null}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="font-semibold">
                            <td className="p-2" colSpan={5}>
                              Total
                            </td>
                            <td className="p-2 text-right">{fmt(comprovante.total)}</td>
                          </tr>
                        </tfoot>
                      </table>

                      <div className="grid grid-cols-2 gap-8 mt-10 pt-4 text-xs">
                        <div className="text-center">
                          <div className="border-t pt-1">Assinatura da clínica</div>
                        </div>
                        <div className="text-center">
                          <div className="border-t pt-1">
                            {comprovante.papel === "terceiro"
                              ? `Assinatura de ${comprovante.medicoNome}`
                              : "Assinatura do médico"}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <DialogFooter className="no-print">
                <Button variant="outline" onClick={() => setComprovanteOpen(false)}>
                  Fechar
                </Button>
                <Button variant="secondary" onClick={() => imprimirComprovante(true)}>
                  <Printer className="h-4 w-4 mr-2" />
                  Imprimir resumo (médico)
                </Button>
                <Button onClick={() => imprimirComprovante()}>
                  <Printer className="h-4 w-4 mr-2" />
                  Imprimir
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Diálogo: marcar laudo emitido */}
          <Dialog open={laudoOpen} onOpenChange={setLaudoOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Vincular laudo</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                {laudoTarget && (
                  <div className="rounded-md border bg-muted/40 p-3 text-xs">
                    <div>
                      <span className="text-muted-foreground">Paciente:</span>{" "}
                      {nomePaciente(laudoTarget) || "—"}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Serviço:</span>{" "}
                      {laudoTarget.procedimento ?? "—"}
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Médico laudador</Label>
                  <Select
                    value={laudoForm.medico_laudador_id || undefined}
                    onValueChange={onChangeLaudador}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o médico..." />
                    </SelectTrigger>
                    <SelectContent>
                      {(laudoRegras.length > 0
                        ? laudoRegras.map((r) => ({
                            id: r.laudador_medico_id,
                            nome: r.laudador_nome,
                          }))
                        : medicos
                      ).map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {laudoRegras.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      Nenhum laudador cadastrado na aba Repasse desta agenda — informe o valor
                      manualmente.
                    </p>
                  )}
                </div>
                {laudoForm.medico_laudador_id && (
                  <div className="space-y-2">
                    <Label>Valor do laudo (R$)</Label>
                    <CurrencyInput
                      value={laudoForm.valor_laudo}
                      onChange={(v) => setLaudoForm({ ...laudoForm, valor_laudo: v })}
                    />
                    {laudoSemRegra && (
                      <p className="text-xs text-muted-foreground">
                        Sem regra cadastrada para este laudador — informe o valor manualmente.
                      </p>
                    )}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Ao confirmar, o sistema gera automaticamente um lançamento de repasse para o
                  laudador no valor informado.
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setLaudoOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={emitirLaudo} disabled={laudoSaving}>
                  {laudoSaving ? "Salvando..." : "Confirmar laudo emitido"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Diálogo: vincular laudos em lote */}
          <Dialog open={laudoLoteOpen} onOpenChange={setLaudoLoteOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Vincular laudos em lote</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="rounded-md border bg-muted/40 p-3 text-xs">
                  <b>{selectedLaudoElegiveis.length}</b> atendimento(s) elegível(is) para vínculo de
                  laudo.
                </div>
                <div className="space-y-2">
                  <Label>Médico laudador</Label>
                  <Select
                    value={laudoLoteLaudadorId || undefined}
                    onValueChange={setLaudoLoteLaudadorId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o médico..." />
                    </SelectTrigger>
                    <SelectContent>
                      {medicos.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    O valor de cada laudo será calculado automaticamente pela regra de repasse da
                    agenda de cada atendimento. Atendimentos sem regra para este laudador serão
                    ignorados.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setLaudoLoteOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  onClick={vincularLaudoLote}
                  disabled={laudoLoteSaving || !laudoLoteLaudadorId}
                >
                  {laudoLoteSaving
                    ? "Vinculando..."
                    : `Vincular (${selectedLaudoElegiveis.length})`}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Diálogo: emitir NFS-e */}
          <Dialog
            open={nfseDialog.open}
            onOpenChange={(o) =>
              setNfseDialog((prev) => ({ open: o, atend: o ? prev.atend : null }))
            }
          >
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Emitir NFS-e</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Emitente *</Label>
                  <Select value={emitenteId} onValueChange={setEmitenteId}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {emitentes.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {nfseDialog.atend && (
                  <div className="rounded-md border bg-muted/40 p-3 text-xs space-y-1">
                    <div>
                      <span className="text-muted-foreground">Paciente:</span>{" "}
                      <b>{nomePaciente(nfseDialog.atend) || "—"}</b>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Serviço:</span>{" "}
                      {nfseDialog.atend.procedimento ?? "—"}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Valor:</span>{" "}
                      <b>{fmt(Number(nfseDialog.atend.valor_total))}</b>
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Descrição dos serviços *</Label>
                  <Textarea
                    rows={3}
                    value={nfseDesc}
                    onChange={(e) => setNfseDesc(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setNfseDialog({ open: false, atend: null })}
                  disabled={nfseEmitting}
                >
                  Cancelar
                </Button>
                <Button onClick={doEmitNfse} disabled={nfseEmitting || !emitenteId}>
                  {nfseEmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Emitindo...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Emitir
                    </>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          {tomadorNfseDialog}
          {descricaoNfseDialog}

          {/* Edição pontual do repasse médico de um atendimento */}
          <Dialog
            open={editRepasse.open}
            onOpenChange={(o) => setEditRepasse((s) => ({ ...s, open: o }))}
          >
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Editar repasse médico</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="text-xs text-muted-foreground">
                  {editRepasse.atend?.procedimento || "Atendimento"} — Total{" "}
                  {fmt(Number(editRepasse.atend?.valor_total) || 0)}
                </div>
                {editRepasse.atend?.repasse_pago && (
                  <div className="rounded border border-amber-300 bg-amber-50 text-amber-900 text-[12px] p-2 leading-snug">
                    Este repasse já foi pago. Ao salvar, a despesa vinculada (fin_lancamentos) será
                    ajustada pela diferença para o caixa continuar batendo. Confirme com o médico
                    antes de gravar.
                  </div>
                )}
                <div className="space-y-1">
                  <Label>Valor do repasse (R$)</Label>
                  <CurrencyInput
                    value={editRepasse.valor}
                    onChange={(v) => setEditRepasse((s) => ({ ...s, valor: v }))}
                  />
                  <p className="text-[12px] text-muted-foreground">
                    Só ajusta este atendimento. Não altera a regra padrão do médico.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setEditRepasse({ open: false, atend: null, valor: "" })}
                  disabled={savingRepasse}
                >
                  Cancelar
                </Button>
                <Button onClick={() => void salvarEditRepasse()} disabled={savingRepasse}>
                  {savingRepasse ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    "Salvar"
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Estorno do repasse já pago — volta o atendimento para "A receber" */}
          <Dialog
            open={estornoRepasse.open}
            onOpenChange={(o) =>
              setEstornoRepasse((s) =>
                s.saving ? s : { ...s, open: o, motivo: o ? s.motivo : "" },
              )
            }
          >
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Estornar repasse pago</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="rounded border border-amber-300 bg-amber-50 text-amber-900 text-[12px] p-2 leading-snug space-y-1">
                  <p>
                    <strong>
                      {estornoRepasse.alvos.length === 1
                        ? "1 atendimento"
                        : `${estornoRepasse.alvos.length} atendimentos`}
                    </strong>{" "}
                    voltará(ão) de <strong>Pago</strong> para <strong>A receber</strong>, no total
                    de{" "}
                    <strong>
                      {fmt(
                        estornoRepasse.alvos.reduce((s, x) => s + (Number(x.valor_medico) || 0), 0),
                      )}
                    </strong>
                    .
                  </p>
                  <p>
                    O comprovante de repasse é desvinculado e a despesa do médico é abatida nesse
                    valor — se este era o último atendimento dela, a despesa é apagada.
                  </p>
                  <p>
                    O pagamento do paciente e o caixa <strong>não são alterados</strong>. A ação
                    fica registrada na auditoria com o seu nome, a data e a hora.
                  </p>
                </div>
                <div className="space-y-1">
                  <Label>Motivo do estorno</Label>
                  <Textarea
                    rows={3}
                    autoFocus
                    placeholder="Ex.: repasse pago em duplicidade; atendimento lançado no médico errado."
                    value={estornoRepasse.motivo}
                    onChange={(e) =>
                      setEstornoRepasse((s) => ({ ...s, motivo: e.target.value.slice(0, 500) }))
                    }
                  />
                  <p className="text-[12px] text-muted-foreground">
                    Obrigatório. Fica gravado na auditoria e no histórico do atendimento.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() =>
                    setEstornoRepasse({ open: false, alvos: [], motivo: "", saving: false })
                  }
                  disabled={estornoRepasse.saving}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={() => void confirmarEstornoRepasse()}
                  disabled={estornoRepasse.saving || estornoRepasse.motivo.trim().length < 3}
                >
                  {estornoRepasse.saving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Estornando...
                    </>
                  ) : (
                    "Confirmar estorno"
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>
        <TabsContent value="comprovantes" className="mt-0">
          <ComprovantesTab />
        </TabsContent>
      </Tabs>
      <HistoricoAtendimentoDialog
        open={!!historicoAtend}
        onClose={() => setHistoricoAtend(null)}
        lancamentoId={historicoAtend?.id ?? null}
        agendamentoId={historicoAtend?.agendamento_id ?? null}
        clinicaId={clinicaAtual?.clinica_id ?? null}
      />
    </div>
  );
}

function MedicoCombobox({
  value,
  onChange,
  medicos,
}: {
  value: string;
  onChange: (v: string) => void;
  medicos: Array<{ id: string; nome: string }>;
}) {
  const [open, setOpen] = useState(false);
  const selected = medicos.find((m) => m.id === value);
  const label = value === "todos" || !selected ? "Todos os médicos" : selected.nome;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm",
            "uppercase text-left",
          )}
        >
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
        <Command>
          <CommandInput placeholder="Buscar médico..." />
          <CommandList>
            <CommandEmpty>Nenhum médico encontrado.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="todos os médicos"
                onSelect={() => {
                  onChange("todos");
                  setOpen(false);
                }}
              >
                <Check
                  className={cn("mr-2 h-4 w-4", value === "todos" ? "opacity-100" : "opacity-0")}
                />
                Todos os médicos
              </CommandItem>
              {medicos.map((m) => (
                <CommandItem
                  key={m.id}
                  value={m.nome}
                  onSelect={() => {
                    onChange(m.id);
                    setOpen(false);
                  }}
                  className="uppercase"
                >
                  <Check
                    className={cn("mr-2 h-4 w-4", value === m.id ? "opacity-100" : "opacity-0")}
                  />
                  {m.nome}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
