import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
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
} from "lucide-react";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { useMedicoContext } from "@/hooks/use-medico-context";
import { useServerFn } from "@tanstack/react-start";
import { emitirNfse, consultarNfse } from "@/lib/nfse.functions";
import { usePickTomador } from "@/components/nfse/use-pick-tomador";
import { exportToExcel } from "@/lib/export-csv";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/_authenticated/app/financeiro/atendimentos")({
  component: Page,
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

function Page() {
  const { clinicaAtual } = useClinica();
  const { medicoId: medicoLogadoId, isMedicoOnly } = useMedicoContext();
  const podeEstornar = ["admin", "gestor", "financeiro"].includes(clinicaAtual?.role ?? "");
  const [items, setItems] = useState<Atend[]>([]);
  const [medicos, setMedicos] = useState<Medico[]>([]);
  const [pacientes, setPacientes] = useState<Pac[]>([]);
  const [pacNameExtra, setPacNameExtra] = useState<Record<string, string>>({});
  const [convenios, setConvenios] = useState<Convenio[]>([]);
  const [procValores, setProcValores] = useState<Map<string, number>>(new Map());
  const [procTipos, setProcTipos] = useState<Map<string, string>>(new Map());
  const [procLaudo, setProcLaudo] = useState<Map<string, boolean>>(new Map());
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Atend | null>(null);
  const [form, setForm] = useState(EMPTY);
  // Filtros do relatório
  const hoje = new Date().toISOString().slice(0, 10);
  const primeiroDia = new Date();
  primeiroDia.setDate(1);
  const [fMedico, setFMedico] = useState<string>("todos");
  const [fIni, setFIni] = useState<string>(primeiroDia.toISOString().slice(0, 10));
  const [fFim, setFFim] = useState<string>(hoje);
  const [fStatus, setFStatus] = useState<"todos" | "aberto" | "pago">("aberto");
  const [fPaciente, setFPaciente] = useState<string>("");
  const [fOrdem, setFOrdem] = useState<"data_desc" | "data_asc" | "gr" | "paciente_az" | "paciente_za">("gr");
  const [fTipo, setFTipo] = useState<"todos" | "medico" | "clinica">("todos");
  const [contas, setContas] = useState<Conta[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [optsReady, setOptsReady] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [payForm, setPayForm] = useState({ data: hoje, conta_id: "", forma_pagamento: "", valor_manual: "" });
  // Comprovante de pagamento de repasse (para impressão)
  type CompItem = { data: string; medico: string; paciente: string; servico: string; valorMedico: number; pagoEm: string | null; pagoHora: string | null };
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
  } | null;
  const [comprovante, setComprovante] = useState<Comprovante>(null);
  const [comprovantes, setComprovantes] = useState<NonNullable<Comprovante>[]>([]);
  const [comprovanteOpen, setComprovanteOpen] = useState(false);
  const buildComprovante = (
    itens: Atend[],
    meta: { data: string; forma_pagamento: string; conta_id: string; pago_at?: string | null; reimpressao?: boolean },
  ): Comprovante => {
    if (!itens.length) return null;
    const medicoIds = new Set(itens.map((i) => i.medico_id ?? ""));
    const medicoNome =
      medicoIds.size === 1
        ? (medMap.get([...medicoIds][0]) ?? "—")
        : `${medicoIds.size} médicos`;
    const contaNome = contas.find((c) => c.id === meta.conta_id)?.nome ?? "—";
    const derivarHora = (iso: string | null | undefined): string | null => {
      if (!iso) return null;
      const d = new Date(iso);
      if (isNaN(d.getTime())) return null;
      const isBackfill =
        d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0;
      if (isBackfill) return null;
      return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    };
    const rows: CompItem[] = itens.map((a) => ({
      data: a.data,
      medico: a.medico_id ? (medMap.get(a.medico_id) ?? "—") : "—",
      paciente: a.paciente_id ? (pacMap.get(a.paciente_id) ?? "—") : (a.paciente_nome_extra ?? "—"),
      servico: a.procedimento ?? "—",
      valorMedico: Number(a.valor_medico) || 0,
      pagoEm: a.repasse_pago_em ?? (a.repasse_pago_at ? a.repasse_pago_at.slice(0, 10) : null),
      pagoHora: derivarHora(a.repasse_pago_at ?? null),
    }));
    const total = rows.reduce((s, r) => s + r.valorMedico, 0);
    // Deriva HH:mm somente quando o timestamp tem hora explícita (>00:00 UTC).
    // Registros antigos foram backfillados de `date` para timestamptz em
    // 00:00 UTC — comparar em UTC evita falso-positivo quando o fuso local
    // gera hh != 0 (ex.: 21:00 em BRT para 00:00 UTC).
    let horaPagamento: string | null = null;
    if (meta.pago_at) {
      const d = new Date(meta.pago_at);
      if (!isNaN(d.getTime())) {
        const isBackfill =
          d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0;
        if (!isBackfill) {
          const hh = d.getHours();
          const mm = d.getMinutes();
          horaPagamento = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
        }
      }
    }
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
    };
  };
  const abrirComprovanteDoItem = (a: Atend) => {
    const dataPag = a.repasse_pago_em ?? (a.repasse_pago_at ? a.repasse_pago_at.slice(0, 10) : a.data);
    const c = buildComprovante([a], {
      data: dataPag,
      forma_pagamento: a.repasse_forma_pagamento || a.forma_pagamento || "",
      conta_id: a.repasse_conta_id ?? "",
      pago_at: a.repasse_pago_at ?? null,
      reimpressao: true,
    });
    setComprovante(c);
    setComprovantes(c ? [c] : []);
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

  // NFS-e
  const [emitentes, setEmitentes] = useState<Emitente[]>([]);
  const [emitenteId, setEmitenteId] = useState("");
  const [nfseDialog, setNfseDialog] = useState<{ open: boolean; atend: Atend | null }>({ open: false, atend: null });
  const [nfseDesc, setNfseDesc] = useState("");
  const [nfseEmitting, setNfseEmitting] = useState(false);
  const emitirNfseFn = useServerFn(emitirNfse);
  const consultarNfseFn = useServerFn(consultarNfse);
  const { pick: pickTomadorNfse, dialog: tomadorNfseDialog } = usePickTomador();

  useEffect(() => {
    if (!clinicaAtual) {
      setEmitentes([]);
      return;
    }
    void supabase
      .from("nfse_emitentes")
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
    setNfseDesc(`${a.procedimento ?? "Serviços médicos prestados"}${pacNome ? ` — ${pacNome}` : ""}`.trim());
    setNfseDialog({ open: true, atend: a });
  };

  const doEmitNfse = async () => {
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
      });
      if (!tomador) { setNfseEmitting(false); toast.error("Emissão cancelada."); return; }
      const descBase = nfseDesc || "Serviços prestados";
      const descFinal = tomador.dependenteAtendido
        ? `${descBase} — Atendido: ${tomador.dependenteAtendido}`
        : descBase;
      const res = await emitirNfseFn({
        data: {
          emitenteId,
          pacienteId: p.id,
          agendamentoId: a.agendamento_id ?? undefined,
          pagamentoId: a.id ?? undefined,
          valorServicos: valor,
          descricaoServicos: descFinal,
          tomador,
        },
      });
      const nfseId = (res as { id?: string })?.id;
      toast.success("NFS-e enviada. Consultando status...");
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

  // Perfil médico: trava o filtro no próprio profissional
  useEffect(() => {
    if (isMedicoOnly && medicoLogadoId) setFMedico(medicoLogadoId);
  }, [isMedicoOnly, medicoLogadoId]);

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

  // Detecta lançamentos de "Cartão Consulta" pela descrição.
  const isCartaoConsultaDesc = (desc: string | null | undefined): boolean => {
    if (!desc) return false;
    const d = desc.toUpperCase();
    if (d.includes("ADESAO") || d.includes("ADESÃO")) return false;
    return (
      d.includes("CARTAO CONSULTA") ||
      d.includes("CARTÃO CONSULTA") ||
      d.includes("CONSULTA CARTAO") ||
      d.includes("CONSULTA CARTÃO")
    );
  };

  // Calcula repasse e também o "total" efetivo (valor do convênio quando o paciente
  // não paga em dinheiro, ex.: ANGIOLOGIA por convênio). Retorna { total, repasse }.
  const calcRepasseFull = (
    medicoId: string | null,
    totalPago: number,
    procNome: string | null,
    descricao?: string | null,
  ): { total: number; repasse: number } => {
    if (!medicoId) return { total: totalPago, repasse: 0 };
    const med = medicos.find((m) => m.id === medicoId);
    // Cartão Consulta: o paciente paga um valor reduzido (ex.: R$ 9,99) e o
    // repasse ao médico é o cb_valor_repasse cadastrado (não o valor do
    // convênio particular). Detecta pela descrição do lançamento.
    if (isCartaoConsultaDesc(descricao) && med?.aceita_cartao_beneficios) {
      if (med.cb_tipo_repasse === "valor" && med.cb_valor_repasse != null) {
        return { total: totalPago, repasse: Number(med.cb_valor_repasse) };
      }
      if (med.cb_tipo_repasse === "percentual" && med.cb_percentual_repasse != null) {
        return {
          total: totalPago,
          repasse: +((totalPago * Number(med.cb_percentual_repasse)) / 100).toFixed(2),
        };
      }
    }
    // 1) Procura convênio cadastrado pelo nome do procedimento (independente de ter pagamento)
    if (procNome) {
      const variants = procVariants(procNome);
      let c: Convenio | undefined;
      for (const alvo of variants) {
        c = convenios.find((cv) => cv.medico_id === medicoId && norm(cv.nome) === alvo);
        if (c) break;
      }
      // Fallback: repasse por categoria (__CAT__:<TIPO>) usando o tipo do procedimento
      if (!c) {
        let tipo: string | undefined;
        for (const alvo of variants) {
          tipo = procTipos.get(alvo);
          if (tipo) break;
        }
        if (tipo) {
          const sentinel = `__CAT__:${String(tipo).toUpperCase()}`;
          c = convenios.find((cv) => cv.medico_id === medicoId && cv.nome === sentinel);
        }
      }
      if (c) {
        // Sem pagamento registrado, mantém total zerado (será preenchido quando o
        // financeiro for lançado). Com pagamento, usa o valor pago como base.
        const base = totalPago;
        if (c.tipo_repasse === "valor" && c.valor != null) {
          // Repasse fixo do convênio é pago integralmente, mesmo que o paciente
          // tenha pago R$ 0 no caixa (convênio cobre direto com a clínica).
          return { total: Math.max(base, Number(c.valor)), repasse: Number(c.valor) };
        }
        if (c.tipo_repasse === "percentual" && c.percentual != null) {
          return { total: base, repasse: +((base * Number(c.percentual)) / 100).toFixed(2) };
        }
        // convênio sem tipo definido → cai no padrão do médico abaixo, usando base
        if (med) {
          if (med.tipo_repasse === "valor" && med.valor_repasse_padrao != null) {
            return { total: base, repasse: Math.min(Number(med.valor_repasse_padrao), base) };
          }
          return { total: base, repasse: +((base * Number(med.percentual_repasse_padrao ?? 0)) / 100).toFixed(2) };
        }
        return { total: base, repasse: 0 };
      }
    }
    // 2) Sem convênio casado e sem pagamento → trata como Cartão Consulta
    if (!totalPago) {
      if (med?.cb_tipo_repasse === "valor" && med.cb_valor_repasse != null) {
        return { total: 0, repasse: Number(med.cb_valor_repasse) };
      }
      if (med?.tipo_repasse === "valor" && med.valor_repasse_padrao != null) {
        return { total: 0, repasse: Number(med.valor_repasse_padrao) };
      }
      return { total: 0, repasse: 0 };
    }
    // 3) Pagou em dinheiro/cartão sem convênio → repasse padrão do médico sobre o total pago
    if (med) {
      if (med.tipo_repasse === "valor" && med.valor_repasse_padrao != null) {
        return { total: totalPago, repasse: Math.min(Number(med.valor_repasse_padrao), totalPago) };
      }
      return {
        total: totalPago,
        repasse: +((totalPago * Number(med.percentual_repasse_padrao ?? 0)) / 100).toFixed(2),
      };
    }
    return { total: totalPago, repasse: 0 };
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
    let qManual = supabase
      .from("fin_atendimentos")
      .select(
        "id, data, procedimento, valor_total, valor_medico, valor_clinica, status, forma_pagamento, medico_id, paciente_id, repasse_pago, repasse_pago_em, repasse_pago_at, repasse_forma_pagamento, repasse_conta_id, laudo_status, medico_laudador_id, valor_laudo, lancamento_id",
      )
      .eq("clinica_id", clinicaAtual.clinica_id)
      .gte("data", fIni)
      .lte("data", fFim);
    let qAgenda = supabase
      .from("fin_lancamentos")
      .select(
        "id, data, descricao, valor, forma_pagamento, medico_id, paciente_id, agendamento_id, repasse_pago, repasse_pago_em, repasse_pago_at, repasse_forma_pagamento, repasse_conta_id, laudo_status, medico_laudador_id, valor_laudo, agendamento:agendamentos(procedimento, paciente_nome, paciente_id, medico_id, inicio, status)",
      )
      .eq("clinica_id", clinicaAtual.clinica_id)
      .eq("tipo", "receita")
      .eq("status", "confirmado")
      .gte("data", fIni)
      .lte("data", fFim);
    if (fMedico !== "todos") {
      qManual = qManual.eq("medico_id", fMedico);
      // Para agenda: não filtramos no servidor porque o lançamento pode estar
      // com medico_id nulo (médico vem do agendamento). Filtramos client-side
      // logo após o mapeamento abaixo.
    }
    const [mr, ar] = await Promise.all([
      qManual.order("data", { ascending: false }),
      qAgenda.order("data", { ascending: false }),
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
    // IDs de fin_lancamentos já carregados — usado para descartar linhas de
    // fin_atendimentos que espelham o mesmo pagamento (duplicidade legada
    // criada pelo fluxo de atendimento IA antes da correção).
    const lancIds = new Set((ar.data ?? []).map((r: { id: string }) => r.id));
    // Também colecionamos o agendamento_id dos lançamentos para descartar
    // manuais que espelhem o mesmo agendamento (caso o lancamento_id não
    // tenha sido preenchido no fin_atendimentos, por qualquer motivo).
    const lancAgendIds = new Set(
      (ar.data ?? [])
        .map((r: { agendamento_id?: string | null }) => r.agendamento_id ?? null)
        .filter((x): x is string => !!x),
    );
    const manuaisRaw = (mr.data ?? []).filter(
      (r: { lancamento_id?: string | null }) => {
        if (r.lancamento_id && lancIds.has(r.lancamento_id)) return false;
        // Sem lancamento_id: descarta se algum lançamento carregado apontar
        // para um agendamento que também aparece no lote manual (mesma data,
        // procedimento e paciente). O DB já tem trigger que impede este caso
        // em novos inserts; aqui blindamos registros históricos.
        if (r.lancamento_id && lancAgendIds.size > 0) {
          const lanc = (ar.data ?? []).find((l: { id: string }) => l.id === r.lancamento_id) as
            | { agendamento_id?: string | null }
            | undefined;
          if (lanc?.agendamento_id && lancAgendIds.has(lanc.agendamento_id)) return false;
        }
        return true;
      },
    );
    const manuais: Atend[] = manuaisRaw.map((r) => {
      const pago = Number(r.valor_total);
      // Recalcula repasse usando convênio cadastrado por procedimento
      // (ex.: PREVENTIVO R$ 10,40). Mantém o valor armazenado apenas como
      // fallback caso o cálculo retorne 0 e o banco já tenha um valor manual.
      const { total, repasse } = calcRepasseFull(r.medico_id, pago, r.procedimento, null);
      const valorMedico = repasse > 0 ? repasse : Number(r.valor_medico);
      const valorTotal = total > 0 ? total : pago;
      return {
        id: r.id,
        data: r.data,
        procedimento: r.procedimento,
        valor_total: valorTotal,
        valor_medico: valorMedico,
        valor_clinica: +(valorTotal - valorMedico).toFixed(2),
        status: r.status,
        forma_pagamento: r.forma_pagamento,
        medico_id: r.medico_id,
        paciente_id: r.paciente_id,
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
    const agend: Atend[] = (ar.data ?? []).map((r): Atend => {
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
      const pacNomeExtra = ag?.paciente_nome ?? ((r.descricao ?? "").split("—")[0]?.trim() || null);
      const pacIdEff = r.paciente_id ?? ag?.paciente_id ?? null;
      const medIdEff = r.medico_id ?? ag?.medico_id ?? null;
      const pago = Number(r.valor);
      const { total, repasse } = calcRepasseFull(medIdEff, pago, proc, r.descricao ?? null);
      return {
        id: r.id,
        data: r.data,
        procedimento: proc,
        agendamento_id: r.agendamento_id ?? null,
        valor_total: total,
        valor_medico: repasse,
        valor_clinica: +(total - repasse).toFixed(2),
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
        laudo_status: (r as any).laudo_status ?? null,
        medico_laudador_id: (r as any).medico_laudador_id ?? null,
        valor_laudo: Number((r as any).valor_laudo ?? 0),
      };
    });
    // Filtro client-side por médico para os registros da agenda (cobre os
    // lançamentos cujo medico_id está nulo e vem do agendamento).
    const agendFiltered = fMedico === "todos" ? agend : agend.filter((x) => x.medico_id === fMedico);
    let unif = [...manuais, ...agendFiltered].sort((a, b) => (a.data < b.data ? 1 : -1));
    if (fStatus === "aberto") unif = unif.filter((x) => !x.repasse_pago);
    else if (fStatus === "pago") unif = unif.filter((x) => x.repasse_pago);
    setItems(unif);
    setSel(new Set());
    // Resolve nomes de pacientes referenciados que estão fora do combobox
    // (o combobox só carrega 500 por ordem alfabética). Sem isso, atendimentos
    // com paciente cadastrado aparecem como "—".
    const knownIds = new Set(pacientes.map((p) => p.id));
    const missing = new Set<string>();
    for (const it of unif) {
      if (it.paciente_id && !knownIds.has(it.paciente_id) && !pacNameExtra[it.paciente_id]) {
        missing.add(it.paciente_id);
      }
    }
    if (missing.size) {
      const { data: extra } = await supabase
        .from("pacientes")
        .select("id, nome")
        .in("id", [...missing]);
      if (extra?.length) {
        setPacNameExtra((prev) => {
          const next = { ...prev };
          for (const p of extra) next[p.id] = p.nome;
          return next;
        });
      }
    }
    setLoading(false);
  };
  const loadOpts = async () => {
    if (!clinicaAtual) return;
    const [m, p, c] = await Promise.all([
      supabase
        .from("medicos")
        .select("id, nome, aceita_cartao_beneficios, cb_tipo_repasse, cb_valor_repasse, cb_percentual_repasse")
        .eq("clinica_id", clinicaAtual.clinica_id)
        .eq("ativo", true)
        .order("nome"),
      supabase
        .from("pacientes")
        .select("id, nome")
        .eq("clinica_id", clinicaAtual.clinica_id)
        .eq("ativo", true)
        .order("nome")
        .limit(500),
      supabase
        .from("fin_contas")
        .select("id, nome")
        .eq("clinica_id", clinicaAtual.clinica_id)
        .eq("ativo", true)
        .order("nome"),
    ]);
    const { data: rep } = await supabase.rpc("medicos_repasse_lista", { _clinica_id: clinicaAtual.clinica_id });
    const repMap = new Map<
      string,
      { tipo_repasse: string; percentual_repasse_padrao: number | null; valor_repasse_padrao: number | null }
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
    // Carrega valor de tabela dos procedimentos para usar como "total cheio".
    // Paginado — mesma razão do medico_convenios (teto de 1000 do PostgREST).
    const procs: Array<{ nome: string | null; valor_padrao?: number | string | null; valor_dinheiro?: number | string | null; tipo?: string | null; requer_laudo?: boolean | null }> = [];
    {
      const CHUNK = 1000;
      const MAX = 50000;
      let offset = 0;
      for (;;) {
        const { data, error } = await supabase
          .from("procedimentos")
          .select("nome, valor_padrao, valor_dinheiro, tipo, requer_laudo")
          .eq("clinica_id", clinicaAtual.clinica_id)
          .eq("ativo", true)
          .range(offset, offset + CHUNK - 1);
        if (error) break;
        const rows = (data ?? []) as typeof procs;
        procs.push(...rows);
        if (rows.length < CHUNK) break;
        offset += CHUNK;
        if (offset >= MAX) break;
      }
    }
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
    const ids = ((m.data ?? []) as Medico[]).map((x) => x.id);
    if (ids.length) {
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
          .select("medico_id, nome, tipo_repasse, percentual, valor, ativo")
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
      setConvenios(acc);
    } else {
      setConvenios([]);
    }
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
    if (!confirm("Excluir atendimento?")) return;

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
    if (
      !confirm(
        "Confirmar baixa do atendimento?\n\nO médico será marcado como tendo atendido este paciente e o repasse ficará liberado para pagamento.",
      )
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

  const desfazerBaixa = async (a: Atend) => {
    if (!podeEstornar) {
      toast.error("Sem permissão para desfazer a baixa.");
      return;
    }
    if (a.repasse_pago) {
      toast.error("Repasse já foi pago — estorne o pagamento do repasse antes de desfazer a baixa.");
      return;
    }
    if (
      !confirm(
        "Desfazer a baixa deste atendimento?\n\nO atendimento volta para 'Confirmado'. O pagamento do paciente (se houver) permanece intacto no caixa — só o lançamento-sombra de R$ 0,00 é removido.",
      )
    )
      return;
    try {
      // Verifica lançamento(s) em caixa vinculados. Só apagamos os R$ 0,00
      // (lançamento-sombra "SEM COBRANÇA"). Lançamentos pagos (valor > 0)
      // permanecem — o pagamento do paciente é trilha independente do
      // status médico do atendimento.
      let sombraIds: string[] = [];
      if (a.origem === "agenda" && a.agendamento_id) {
        const { data: lancs } = await supabase
          .from("fin_lancamentos")
          .select("id, valor")
          .eq("agendamento_id", a.agendamento_id);
        const rows = (lancs ?? []) as Array<{ id: string; valor: number | string | null }>;
        sombraIds = rows.filter((l) => Number(l.valor) === 0).map((l) => l.id);
      } else if (a.origem !== "agenda") {
        const { data: fa } = await supabase
          .from("fin_atendimentos")
          .select("lancamento_id")
          .eq("id", a.id)
          .maybeSingle();
        const lancId = (fa as { lancamento_id: string | null } | null)?.lancamento_id ?? null;
        if (lancId) {
          const { data: l } = await supabase
            .from("fin_lancamentos")
            .select("id, valor")
            .eq("id", lancId)
            .maybeSingle();
          const row = l as { id: string; valor: number | string | null } | null;
          if (row && Number(row.valor) === 0) sombraIds = [row.id];
        }
      }

      if (a.origem === "agenda") {
        if (!a.agendamento_id) {
          toast.error("Atendimento sem agendamento vinculado.");
          return;
        }
        const { error } = await supabase
          .from("agendamentos")
          .update({ status: "confirmado" })
          .eq("id", a.agendamento_id);
        if (error) {
          mostrarErro(error);
          return;
        }
      } else {
        const { error } = await supabase
          .from("fin_atendimentos")
          .update({ status: "confirmado" })
          .eq("id", a.id);
        if (error) {
          mostrarErro(error);
          return;
        }
      }
      if (sombraIds.length > 0) {
        const { error: delErr } = await supabase
          .from("fin_lancamentos")
          .delete()
          .in("id", sombraIds);
        if (delErr) {
          mostrarErro(delErr);
          return;
        }
      }
      toast.success("Baixa desfeita.");
      await load();
    } catch (err) {
      mostrarErro(err);
    }
  };

  const darBaixaLote = async () => {
    const alvos = selectedItems.filter((a) => !a.repasse_pago && !isAtendido(a));
    if (alvos.length === 0) return;
    if (
      !confirm(
        `Confirmar baixa de ${alvos.length} atendimento(s)?\n\nOs médicos serão marcados como tendo atendido esses pacientes e os repasses ficarão liberados para pagamento.`,
      )
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
    const alvos = selectedItems.filter((a) => !a.repasse_pago && isAtendido(a));
    if (alvos.length === 0) return;
    if (
      !confirm(
        `Desfazer a baixa de ${alvos.length} atendimento(s)?\n\nOs atendimentos voltam para 'Confirmado'. Os pagamentos dos pacientes permanecem intactos no caixa — apenas lançamentos-sombra de R$ 0,00 são removidos.`,
      )
    )
      return;
    try {
      const agIds = alvos
        .filter((a) => a.origem === "agenda" && !!a.agendamento_id)
        .map((a) => a.agendamento_id as string);
      const manualIds = alvos.filter((a) => a.origem === "manual").map((a) => a.id);

      // Coleta lançamentos-sombra (R$ 0,00) para apagar.
      let sombraIds: string[] = [];
      if (agIds.length) {
        const { data: lancs } = await supabase
          .from("fin_lancamentos")
          .select("id, valor, agendamento_id")
          .in("agendamento_id", agIds);
        const rows = (lancs ?? []) as Array<{ id: string; valor: number | string | null }>;
        sombraIds.push(...rows.filter((l) => Number(l.valor) === 0).map((l) => l.id));
      }
      if (manualIds.length) {
        const { data: fas } = await supabase
          .from("fin_atendimentos")
          .select("lancamento_id")
          .in("id", manualIds);
        const lancIds = ((fas ?? []) as Array<{ lancamento_id: string | null }>)
          .map((r) => r.lancamento_id)
          .filter((x): x is string => !!x);
        if (lancIds.length) {
          const { data: lancs } = await supabase
            .from("fin_lancamentos")
            .select("id, valor")
            .in("id", lancIds);
          const rows = (lancs ?? []) as Array<{ id: string; valor: number | string | null }>;
          sombraIds.push(...rows.filter((l) => Number(l.valor) === 0).map((l) => l.id));
        }
      }

      if (agIds.length) {
        const { error } = await supabase
          .from("agendamentos")
          .update({ status: "confirmado" })
          .in("id", agIds);
        if (error) {
          mostrarErro(error);
          return;
        }
      }
      if (manualIds.length) {
        const { error } = await supabase
          .from("fin_atendimentos")
          .update({ status: "confirmado" })
          .in("id", manualIds);
        if (error) {
          mostrarErro(error);
          return;
        }
      }
      if (sombraIds.length) {
        const { error: delErr } = await supabase
          .from("fin_lancamentos")
          .delete()
          .in("id", sombraIds);
        if (delErr) {
          mostrarErro(delErr);
          return;
        }
      }
      toast.success(`Baixa desfeita em ${alvos.length} atendimento(s).`);
      await load();
    } catch (err) {
      mostrarErro(err);
    }
  };

  const medMap = useMemo(() => new Map(medicos.map((m) => [m.id, m.nome])), [medicos]);
  const pacMap = useMemo(() => {
    const m = new Map<string, string>(pacientes.map((p) => [p.id, p.nome]));
    for (const [id, nome] of Object.entries(pacNameExtra)) if (!m.has(id)) m.set(id, nome);
    return m;
  }, [pacientes, pacNameExtra]);
  const filteredItems = useMemo(() => {
    const q = norm(fPaciente.trim());
    const base = !q
      ? items
      : items.filter((a) => {
          const nome = (a.paciente_id ? pacMap.get(a.paciente_id) : null) ?? a.paciente_nome_extra ?? "";
          return norm(nome).includes(q);
        });
    const baseTipo =
      fTipo === "todos"
        ? base
        : fTipo === "medico"
          ? base.filter((a) => (Number(a.valor_medico) || 0) > 0)
          : base.filter((a) => (Number(a.valor_medico) || 0) === 0);
    const nomeDe = (a: Atend) =>
      norm(((a.paciente_id ? pacMap.get(a.paciente_id) : null) ?? a.paciente_nome_extra ?? "").trim());
    const grDe = (a: Atend) => a.agendamento_inicio ?? a.data ?? "";
    const arr = [...baseTipo];
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
  }, [items, fPaciente, pacientes.length, fOrdem, fTipo]);
  const totais = useMemo(
    () =>
      filteredItems.reduce(
        (acc, a) => {
          acc.total += Number(a.valor_total) || 0;
          acc.medico += Number(a.valor_medico) || 0;
          acc.clinica += Number(a.valor_clinica) || 0;
          if (a.repasse_pago) acc.pago += Number(a.valor_medico) || 0;
          else acc.aReceber += Number(a.valor_medico) || 0;
          return acc;
        },
        { total: 0, medico: 0, clinica: 0, pago: 0, aReceber: 0 },
      ),
    [filteredItems],
  );

  const isAtendido = (a: Atend) =>
    a.origem === "manual" ? a.status === "realizado" : a.agendamento_status === "realizado";
  // Itens selecionáveis: qualquer atendimento com repasse > 0.
  // As ações do topo validam individualmente o que cada uma aceita
  // (baixa em lote, pagar repasse, 2ª via).
  const selectables = filteredItems.filter((a) => (a.valor_medico ?? 0) > 0);
  const allSelected = selectables.length > 0 && selectables.every((a) => sel.has(`${a.origem}:${a.id}`));
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
  const selectedItems = filteredItems.filter((a) => sel.has(`${a.origem}:${a.id}`));
  const selectedTotal = selectedItems.reduce((s, a) => s + (Number(a.valor_medico) || 0), 0);
  const selectedPagos = selectedItems.filter((a) => a.repasse_pago);
  const selectedNaoPagos = selectedItems.filter((a) => !a.repasse_pago);
  const selectedNaoBaixados = selectedItems.filter(
    (a) => !a.repasse_pago && !isAtendido(a),
  );
  const podePagar = selectedItems.length > 0 && selectedNaoPagos.length === selectedItems.length;
  const podeReimprimir = selectedItems.length > 0 && selectedPagos.length === selectedItems.length;
  const misturado = selectedItems.length > 0 && selectedPagos.length > 0 && selectedNaoPagos.length > 0;
  const reimprimirSelecionados = () => {
    if (!podeReimprimir) return;
    abrirSegundaViaLote(selectedPagos);
  };

  const openPay = () => {
    if (!selectedItems.length) {
      toast.info("Selecione ao menos um atendimento.");
      return;
    }
    setPayForm({ data: hoje, conta_id: contas[0]?.id ?? "", forma_pagamento: "", valor_manual: "" });
    setPayOpen(true);
  };

  const confirmarPagamento = async () => {
    if (!clinicaAtual || !selectedItems.length) return;
    setPayingNow(true);
    try {
      // Validação servidor-side: só pode pagar repasse de atendimentos efetivamente
      // realizados (lançamento confirmado + agendamento com status 'realizado').
      // Bloqueia o bug de repassar antes do paciente ter sido atendido.
      const agendaIdsCheck = selectedItems.filter((x) => x.origem === "agenda").map((x) => x.id);
      if (agendaIdsCheck.length) {
        const { data: lancs, error: eChk } = await supabase
          .from("fin_lancamentos")
          .select("id, status, agendamento_id, agendamento:agendamentos(status)")
          .in("id", agendaIdsCheck);
        if (eChk) throw eChk;
        const bloq: string[] = [];
        for (const l of (lancs ?? []) as Array<{
          id: string;
          status: string | null;
          agendamento_id: string | null;
          agendamento: { status: string | null } | null;
        }>) {
          const lancOk = l.status === "confirmado";
          const agStatus = l.agendamento?.status ?? null;
          const agOk = agStatus === "realizado";
          if (!lancOk || !agOk) bloq.push(l.id);
        }
        if (bloq.length) {
          toast.error(
            `Não é possível pagar o repasse: ${bloq.length} atendimento(s) ainda não foram baixados/realizados. Confirme o pagamento no Caixa e marque o atendimento como realizado antes de gerar o repasse.`,
          );
          setPayingNow(false);
          return;
        }
      }
      // Mesma validação para atendimentos manuais (fin_atendimentos)
      const manualBloq = selectedItems.filter((x) => x.origem === "manual" && x.status !== "realizado");
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
        toast.warning("Valor manual ignorado: selecione atendimentos de apenas um médico para editar o valor do repasse.");
      }
      for (const [medId, list] of byMed) {
        const totalCalc = list.reduce((s, x) => s + (Number(x.valor_medico) || 0), 0);
        const total = usarValorManual ? valorManualNum : totalCalc;
        if (total <= 0) continue;
        const nowIso = new Date().toISOString();
        const medNome = medId !== "sem" ? (medMap.get(medId) ?? "") : "—";
        const { data: userData } = await supabase.auth.getUser();
        const currentUserId = userData?.user?.id ?? null;
        const { data: lanc, error: eLanc } = await supabase
          .from("fin_lancamentos")
          .insert({
            clinica_id: clinicaAtual.clinica_id,
            tipo: "despesa",
            descricao: `Repasse médico — ${medNome} (${list.length} atend.)`,
            valor: total,
            data: payForm.data,
            data_vencimento: payForm.data,
            status: "confirmado",
            medico_id: medId !== "sem" ? medId : null,
            conta_id: payForm.conta_id || null,
            forma_pagamento: payForm.forma_pagamento || null,
            criado_por: currentUserId,
          })
          .select("id")
          .single();
        if (eLanc) throw eLanc;
        const lancId = lanc?.id ?? null;
        const upd = {
          repasse_pago: true,
          repasse_pago_em: payForm.data,
          repasse_pago_at: nowIso,
          repasse_forma_pagamento: payForm.forma_pagamento || null,
          repasse_conta_id: payForm.conta_id || null,
          repasse_lancamento_id: lancId,
        };
        const manualIds = list.filter((x) => x.origem === "manual").map((x) => x.id);
        const agendaIds = list.filter((x) => x.origem === "agenda").map((x) => x.id);
        if (manualIds.length) {
          const { error } = await supabase.from("fin_atendimentos").update(upd).in("id", manualIds);
          if (error) throw error;
        }
        if (agendaIds.length) {
          const { error } = await supabase.from("fin_lancamentos").update(upd).in("id", agendaIds);
          if (error) throw error;
        }
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
              await supabase.from("fin_atendimentos").update({ valor_medico: valorItem }).eq("id", item.id);
            }
          }
        }
      }
      toast.success("Repasses pagos com sucesso");
      const c = buildComprovante(selectedItems, {
        ...payForm,
        pago_at: new Date().toISOString(),
        reimpressao: false,
      });
      setPayOpen(false);
      if (c) {
        setComprovante(c);
        setComprovantes([c]);
        setComprovanteOpen(true);
      }
      await load();
    } catch (e) {
      const err = e as { message?: string };
      mostrarErro(err);
    } finally {
      setPayingNow(false);
    }
  };

  return (
    <div className="space-y-3">
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
                  paciente: a.paciente_id ? (pacMap.get(a.paciente_id) ?? "") : "",
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
          {!isMedicoOnly && (
            <Button
              onClick={openPay}
              disabled={!podePagar}
              title={misturado ? "Selecione apenas atendimentos NÃO pagos" : undefined}
            >
              <Wallet className="h-4 w-4 mr-2" />
              Pagar repasse{selectedNaoPagos.length ? ` (${selectedNaoPagos.length} • ${fmt(selectedNaoPagos.reduce((s, x) => s + (Number(x.valor_medico) || 0), 0))})` : ""}
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
                  disabled={selectedNaoBaixados.length === 0}
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
                  disabled={!podeReimprimir}
                  onSelect={(e) => {
                    e.preventDefault();
                    if (podeReimprimir) reimprimirSelecionados();
                  }}
                >
                  <Printer className="h-4 w-4 mr-2" />
                  Imprimir 2ª via
                  {selectedPagos.length ? ` (${selectedPagos.length})` : ""}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Dialog open={open} onOpenChange={setOpen}>
            {!isMedicoOnly && (
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
                    <Input
                      type="date"
                      required
                      value={form.data}
                      onChange={(e) => setForm({ ...form, data: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
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
                    onValueChange={(v) => setForm({ ...form, medico_id: v === "none" ? "" : v })}
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
                    onValueChange={(v) => setForm({ ...form, paciente_id: v === "none" ? "" : v })}
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
                    <CurrencyInput value={form.valor_total} onChange={(v) => setForm({ ...form, valor_total: v })} />
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
                medicos={isMedicoOnly ? medicos.filter((m) => m.id === medicoLogadoId) : medicos}
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
              <Input type="date" className="h-9" value={fIni} onChange={(e) => setFIni(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Até</Label>
              <Input type="date" className="h-9" value={fFim} onChange={(e) => setFFim(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Status repasse</Label>
              <Select value={fStatus} onValueChange={(v) => setFStatus(v as "todos" | "aberto" | "pago")}>
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
              <Select value={fTipo} onValueChange={(v) => setFTipo(v as "todos" | "medico" | "clinica")}>
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
                    <div className="text-[8px] text-muted-foreground uppercase leading-tight">A receber</div>
                    <div className="text-xs font-bold text-primary leading-tight">{fmt(totais.aReceber)}</div>
                  </div>
                </div>
                <div className="flex-1 rounded-lg border-2 px-2 py-1 text-center h-9 flex items-center justify-center">
                  <div>
                    <div className="text-[8px] text-muted-foreground uppercase leading-tight">Recebido</div>
                    <div className="text-xs font-bold leading-tight">{fmt(totais.pago)}</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex gap-1.5 min-w-[140px]">
                <div className="flex-1 rounded-lg border-2 px-2 py-1 bg-amber-500/10 text-center h-9 flex items-center justify-center">
                  <div>
                    <div className="text-[8px] text-muted-foreground uppercase leading-tight">A pagar</div>
                    <div className="text-xs font-bold text-amber-600 leading-tight">{fmt(totais.aReceber)}</div>
                  </div>
                </div>
                <div className="flex-1 rounded-lg border-2 px-2 py-1 bg-emerald-500/10 text-center h-9 flex items-center justify-center">
                  <div>
                    <div className="text-[8px] text-muted-foreground uppercase leading-tight">Pago</div>
                    <div className="text-xs font-bold text-emerald-600 leading-tight">{fmt(totais.pago)}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-12 text-center text-muted-foreground">Carregando...</div>
          ) : filteredItems.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Stethoscope className="h-10 w-10 mx-auto mb-2 text-muted-foreground/50" />
              Nenhum atendimento no período/filtro selecionado.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  {!isMedicoOnly && (
                    <TableHead className="w-8 px-2">
                      <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Selecionar todos" />
                    </TableHead>
                  )}
                  <TableHead className="text-[11px] font-medium px-2 whitespace-nowrap text-center w-10">Ficha</TableHead>
                  <TableHead className="text-[11px] font-medium px-2 whitespace-nowrap">Data</TableHead>
                  <TableHead className="text-[11px] font-medium px-2">Médico</TableHead>
                  <TableHead className="text-[11px] font-medium px-2">Paciente</TableHead>
                  <TableHead className="text-[11px] font-medium px-2">Serviço</TableHead>
                  {!isMedicoOnly && <TableHead className="text-right text-[11px] font-medium px-2">Total</TableHead>}
                  <TableHead className="text-right text-[11px] font-medium px-2">
                    {isMedicoOnly ? "Repasse" : "Médico"}
                  </TableHead>
                  {!isMedicoOnly && <TableHead className="text-right text-[11px] font-medium px-2">Clínica</TableHead>}
                  <TableHead className="text-center text-[11px] font-medium px-2">Status</TableHead>
                  <TableHead className="text-center text-[11px] font-medium px-2">Pgto</TableHead>
                  <TableHead className="text-center text-[11px] font-medium px-2">Laudo</TableHead>
                  {!isMedicoOnly && <TableHead className="text-center text-[11px] font-medium px-2">Ações</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.map((a, idx) => {
                  const medicoNome = a.medico_id ? (medMap.get(a.medico_id) ?? "—") : "—";
                  const pacienteNome =
                    (a.paciente_id ? pacMap.get(a.paciente_id) : null) ?? a.paciente_nome_extra ?? "—";
                  const procedimentoNome = a.procedimento ?? "—";

                  // Define as cores das linhas para o efeito zebrado acompanhar a coluna fixa
                  const isSelected = sel.has(`${a.origem}:${a.id}`);
                  const baixaPendente = !a.repasse_pago && !isAtendido(a);
                  const rowBg =
                    isSelected && baixaPendente
                      ? "bg-amber-50 dark:bg-amber-950/30"
                      : idx % 2 === 0
                        ? "bg-background"
                        : "bg-slate-50 dark:bg-slate-900/40";

                  return (
                    <TableRow key={`${a.origem}:${a.id}`} className={cn("hover:bg-muted/30 transition-colors", rowBg)}>
                      {!isMedicoOnly && (
                        <TableCell className="px-2">
                          {(a.valor_medico ?? 0) > 0 ? (
                            <Checkbox
                              checked={sel.has(`${a.origem}:${a.id}`)}
                              onCheckedChange={() => toggleOne(a)}
                              aria-label={a.repasse_pago ? "Selecionar para 2ª via" : "Selecionar"}
                              title={a.repasse_pago ? "Selecionar para reimprimir 2ª via" : undefined}
                              className="h-4 w-4"
                            />
                          ) : (
                            <span
                              title="Sem valor de repasse cadastrado para este médico/procedimento"
                              className="text-[10px] text-muted-foreground whitespace-nowrap"
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
                      <TableCell className="text-xs max-w-[90px] truncate px-2" title={medicoNome}>
                        {medicoNome}
                      </TableCell>
                      <TableCell className="text-xs font-medium max-w-[190px] truncate px-2" title={pacienteNome}>
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
                            className="text-[10px] bg-emerald-500/10 text-emerald-700 border-emerald-500/30 whitespace-nowrap px-1.5 py-0"
                          >
                            <CheckCircle2 className="h-3 w-3 mr-0.5 inline" />
                            Pago
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-[10px] bg-amber-500/10 text-amber-700 border-amber-500/30 whitespace-nowrap px-1.5 py-0"
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
                          if (a.laudo_status === "emitido")
                            return (
                              <Badge
                                variant="outline"
                                className="text-[10px] bg-sky-500/10 text-sky-700 border-sky-500/30 whitespace-nowrap px-1.5 py-0"
                              >
                                <CheckCircle2 className="h-3 w-3 mr-0.5 inline" />
                                Pago
                              </Badge>
                            );
                          if (!exigeLaudo) return <span className="text-muted-foreground text-[10px]">—</span>;
                          if (!podeEstornar) return <span className="text-amber-600 text-[10px]">Pendente</span>;
                          return (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 text-[10px] px-2"
                              onClick={() => openLaudo(a)}
                            >
                              Pagar
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
                              <span className="text-[9px] text-muted-foreground uppercase mr-1">Agenda</span>
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
                              {a.repasse_pago || a.agendamento_status === "realizado" ? (
                                <Button
                                  size="sm"
                                  disabled={!podeEstornar || a.repasse_pago}
                                  className="h-6 px-2 text-[10px] gap-1 bg-emerald-100 text-emerald-800 border border-emerald-300 hover:bg-emerald-100 disabled:opacity-100"
                                  title={
                                    a.repasse_pago
                                      ? "Repasse já pago — estorne o repasse antes de desfazer a baixa"
                                      : podeEstornar
                                        ? "Clique para desfazer a baixa"
                                        : "Repasse já baixado"
                                  }
                                  onClick={() => desfazerBaixa(a)}
                                >
                                  <CheckCircle2 className="h-3 w-3" /> Baixado
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  className={cn(
                                    "h-6 px-2 text-[10px] gap-1 border",
                                    isSelected
                                      ? "bg-amber-500 text-white border-amber-600 ring-2 ring-amber-600 hover:bg-amber-500"
                                      : "bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200",
                                  )}
                                  title="Dá baixa (marcar como realizado e liberar repasse)"
                                  onClick={() => darBaixa(a)}
                                >
                                  {isSelected ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                                  Baixar
                                </Button>
                              )}
                              {/* Botão de excluir para agenda */}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                title="Excluir"
                                onClick={() => remove(a)}
                              >
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-0.5">
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
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(a)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
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
                              {a.repasse_pago || a.status === "realizado" ? (
                                <Button
                                  size="sm"
                                  disabled={!podeEstornar || a.repasse_pago}
                                  className="h-6 px-2 text-[10px] gap-1 bg-emerald-100 text-emerald-800 border border-emerald-300 hover:bg-emerald-100 disabled:opacity-100"
                                  title={
                                    a.repasse_pago
                                      ? "Repasse já pago — estorne o repasse antes de desfazer a baixa"
                                      : podeEstornar
                                        ? "Clique para desfazer a baixa"
                                        : "Repasse já baixado"
                                  }
                                  onClick={() => desfazerBaixa(a)}
                                >
                                  <CheckCircle2 className="h-3 w-3" /> Baixado
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  className={cn(
                                    "h-6 px-2 text-[10px] gap-1 border",
                                    isSelected
                                      ? "bg-amber-500 text-white border-amber-600 ring-2 ring-amber-600 hover:bg-amber-500"
                                      : "bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200",
                                  )}
                                  title="Dá baixa (marcar como realizado e liberar repasse)"
                                  onClick={() => darBaixa(a)}
                                >
                                  {isSelected ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                                  Baixar
                                </Button>
                              )}
                              <Button variant="ghost" size="icon" className="h-7 w-7" title="Excluir" onClick={() => remove(a)}>
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
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
        </CardContent>
      </Card>

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
            <span className="ml-2 text-muted-foreground">
              — total {fmt(selectedTotal)}
            </span>
            {misturado && (
              <span className="ml-2 text-xs text-rose-700">
                Separe pagos e não pagos para agir.
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={openPay}
              disabled={!podePagar}
              title={misturado ? "Selecione apenas atendimentos NÃO pagos" : undefined}
            >
              <Wallet className="h-4 w-4 mr-2" />
              Pagar repasse{selectedNaoPagos.length ? ` (${selectedNaoPagos.length})` : ""}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline">
                  <MoreHorizontal className="h-4 w-4 mr-2" />
                  Opções
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuItem
                  disabled={selectedNaoBaixados.length === 0}
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
                  disabled={!podeReimprimir}
                  onSelect={(e) => {
                    e.preventDefault();
                    if (podeReimprimir) reimprimirSelecionados();
                  }}
                >
                  <Printer className="h-4 w-4 mr-2" />
                  Imprimir 2ª via
                  {selectedPagos.length ? ` (${selectedPagos.length})` : ""}
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
                Deixe em branco para usar o valor calculado. Para alterar manualmente, selecione atendimentos de apenas um médico.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Data do pagamento</Label>
              <Input
                type="date"
                value={payForm.data}
                onChange={(e) => setPayForm({ ...payForm, data: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Conta</Label>
              <Select
                value={payForm.conta_id || "none"}
                onValueChange={(v) => setPayForm({ ...payForm, conta_id: v === "none" ? "" : v })}
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
              {comprovantes.length > 1 ? ` — ${comprovantes.length} médicos` : ""}
            </DialogTitle>
          </DialogHeader>
          {comprovantes.length > 0 && (
            <div className="print-area bg-white text-black text-sm max-h-[70vh] overflow-y-auto print:max-h-none print:overflow-visible">
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
                      {new Date(comprovante.dataPagamento + "T00:00:00").toLocaleDateString("pt-BR")}
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
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Clínica</div>
                  <div className="text-lg font-semibold">{comprovante.clinicaNome}</div>
                </div>
                <div className="text-right">
                  <div className="text-base font-semibold">Comprovante de repasse médico</div>
                  <div className="text-xs text-muted-foreground">Emitido em {comprovante.emitidoEm}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 border rounded-md p-3 mb-3">
                <div>
                  <span className="text-xs text-muted-foreground">Médico: </span>
                  <b>{comprovante.medicoNome}</b>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Data e hora do pagamento: </span>
                  <b>
                    {new Date(comprovante.dataPagamento + "T00:00:00").toLocaleDateString("pt-BR")}
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
                  <span className="text-xs text-muted-foreground">Total pago ao médico: </span>
                  <b className="text-base text-primary">{fmt(comprovante.total)}</b>
                </div>
              </div>

              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left p-2">Data</th>
                    <th className="text-left p-2">Pago em</th>
                    <th className="text-left p-2">Médico</th>
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
                      <td className="p-2 text-right whitespace-nowrap">{fmt(it.valorMedico)}</td>
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
                  <div className="border-t pt-1">Assinatura do médico</div>
                </div>
                <div className="text-center">
                  <div className="border-t pt-1">Assinatura da clínica</div>
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
            <Button onClick={() => window.print()}>
              <Printer className="h-4 w-4 mr-2" />
              Imprimir
            </Button>
          </DialogFooter>
          <style>{`
            @media print {
              @page { size: A4 portrait; margin: 12mm; }
              body * { visibility: hidden !important; }
              .print-area, .print-area * { visibility: visible !important; }
              html, body { height: auto !important; overflow: visible !important; background: white !important; }
              .print-area { position: absolute; left: 0; top: 0; right: 0; margin: 0; padding: 0; width: 186mm; background: white !important; color: black !important; max-height: none !important; height: auto !important; overflow: visible !important; z-index: 9999; font-size: 11pt; }
              [role="dialog"], [role="dialog"] > * { position: static !important; transform: none !important; max-height: none !important; height: auto !important; overflow: visible !important; }
              .no-print { display: none !important; }
              [role="dialog"] { box-shadow: none !important; border: none !important; }
              .comprovante-bloco { break-after: page; page-break-after: always; }
              .comprovante-bloco:last-child { break-after: auto; page-break-after: auto; }
              .comprovante-bloco table, .comprovante-bloco thead, .comprovante-bloco tbody, .comprovante-bloco tr, .comprovante-bloco td, .comprovante-bloco th { page-break-inside: auto; break-inside: auto; }
              .comprovante-bloco tr { page-break-inside: avoid; break-inside: avoid; }
            }
          `}</style>
        </DialogContent>
      </Dialog>

      {/* Diálogo: marcar laudo emitido */}
      <Dialog open={laudoOpen} onOpenChange={setLaudoOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Marcar laudo emitido</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {laudoTarget && (
              <div className="rounded-md border bg-muted/40 p-3 text-xs">
                <div>
                  <span className="text-muted-foreground">Paciente:</span>{" "}
                  {laudoTarget.paciente_nome_extra ??
                    (laudoTarget.paciente_id ? pacMap.get(laudoTarget.paciente_id) : "—")}
                </div>
                <div>
                  <span className="text-muted-foreground">Serviço:</span> {laudoTarget.procedimento ?? "—"}
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
                    ? laudoRegras.map((r) => ({ id: r.laudador_medico_id, nome: r.laudador_nome }))
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
                  Nenhum laudador cadastrado na aba Repasse desta agenda — informe o valor manualmente.
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
              Ao confirmar, o sistema gera automaticamente um lançamento de repasse para o laudador no valor informado.
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

      {/* Diálogo: emitir NFS-e */}
      <Dialog
        open={nfseDialog.open}
        onOpenChange={(o) => setNfseDialog((prev) => ({ open: o, atend: o ? prev.atend : null }))}
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
                  <b>
                    {nfseDialog.atend.paciente_id
                      ? (pacMap.get(nfseDialog.atend.paciente_id) ?? "—")
                      : (nfseDialog.atend.paciente_nome_extra ?? "—")}
                  </b>
                </div>
                <div>
                  <span className="text-muted-foreground">Serviço:</span> {nfseDialog.atend.procedimento ?? "—"}
                </div>
                <div>
                  <span className="text-muted-foreground">Valor:</span>{" "}
                  <b>{fmt(Number(nfseDialog.atend.valor_total))}</b>
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label>Descrição dos serviços *</Label>
              <Textarea rows={3} value={nfseDesc} onChange={(e) => setNfseDesc(e.target.value)} />
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
                <Check className={cn("mr-2 h-4 w-4", value === "todos" ? "opacity-100" : "opacity-0")} />
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
                  <Check className={cn("mr-2 h-4 w-4", value === m.id ? "opacity-100" : "opacity-0")} />
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
