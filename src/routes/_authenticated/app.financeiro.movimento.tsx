import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  ArrowUpCircle,
  ArrowDownCircle,
  ArrowLeftRight,
  Download,
  Undo2,
  Printer,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { useAuth } from "@/hooks/use-auth";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { useClinicFeatureFlag } from "@/hooks/use-clinic-feature-flag";
import { useIsMobile } from "@/hooks/use-mobile";
import { logAction } from "@/hooks/use-crud";
import { exportToExcel } from "@/lib/export-csv";
import { hojeBR } from "@/lib/date-utils";
import { printReciboLancamento } from "@/lib/print-recibo-lancamento";
import {
  classificarForma,
  filtroFormaPostgrest,
  formaCasaComFiltro,
  baldeCasaComFiltro,
  partesDoPagamentoMisto,
  FORMAS_SEMPRE_VISIVEIS,
  LABEL_FORMA,
  ORDEM_FORMAS,
  type FiltroForma,
  type FormaCanonica,
} from "@/lib/financeiro/formas-pagamento";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInputBR } from "@/components/ui/date-input-br";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { Switch } from "@/components/ui/switch";
import { SolicitarEstornoDialog } from "@/components/financeiro/SolicitarEstornoDialog";
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

export const Route = createFileRoute("/_authenticated/app/financeiro/movimento")({
  component: Page,
  head: () => ({ meta: [{ title: "Movimento — Financeiro" }] }),
});

interface Lanc {
  id: string;
  tipo: "receita" | "despesa" | "transferencia";
  descricao: string;
  valor: number;
  data: string;
  status: string;
  categoria_id: string | null;
  conta_id: string | null;
  forma_pagamento: string | null;
  criado_por: string | null;
  /** Observações do lançamento — retaguarda para decompor pagamentos "misto"
   *  em suas formas reais (DINHEIRO, PIX, CARTAO…) no relatório. */
  observacoes?: string | null;
  /** Composição estruturada do pagamento misto ({ partes: [{forma, valor}] }).
   *  É a fonte confiável da decomposição; as observações só valem para
   *  lançamentos gravados antes deste campo existir. */
  composicao_pagamento?: unknown;
  /** Balde canônico da forma de pagamento desta linha (Dinheiro, PIX, Cartão
   *  de Débito, Cartão de Crédito…), calculado por `classificarForma`. */
  formaCanonica?: FormaCanonica;
  /** true → linha veio de caixa_movimentos (sangria/suprimento); não editável aqui */
  origem?: "fin" | "caixa";
  /** direção da transferência: entrada (suprimento) ou saída (sangria) */
  transferSentido?: "entrada" | "saida";
  /** Tipo original do movimento de caixa (só quando origem === "caixa"). */
  caixaTipo?: "sangria" | "suprimento";
  /** HH:MM local — só preenchido para linhas vindas de caixa_movimentos */
  hora?: string | null;
  /** Nome do médico do lançamento (linhas de fin_lancamentos com medico_id). */
  medico_nome?: string | null;
  /** Nº da ficha do agendamento vinculado. */
  ficha_numero?: number | null;
  /** true → linha sintética criada pela decomposição de um pagamento "misto"
   *  (só para exibição; ações de editar/excluir/estornar ficam desabilitadas). */
  _mistoParte?: boolean;
  /** id do lançamento pai quando esta linha é uma parte de "misto". */
  _mistoPaiId?: string;
}
/** Rótulos amigáveis das formas de pagamento (usados no recibo impresso). */
const FORMA_LABEL: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix: "Pix",
  cartao_credito: "Cartão Crédito",
  cartao_debito: "Cartão Débito",
  boleto: "Boleto",
  convenio: "Convênio",
  transferencia: "Transferência",
};

interface Opt {
  id: string;
  nome: string;
  tipo?: string;
}

/** Formulário zerado. É uma função, e não uma constante de módulo, porque a
 *  data padrão precisa ser recalculada a cada abertura: como constante ela
 *  ficava congelada no dia em que a aba foi carregada, e uma recepção que
 *  deixa o sistema aberto de um dia para o outro lançava com a data de
 *  ontem. `hojeBR` também resolve o outro lado do problema — `toISOString`
 *  devolve a data em UTC, então depois das 21h de Brasília o lançamento
 *  saía com a data do dia seguinte. */
const emptyForm = () => ({
  tipo: "receita" as "receita" | "despesa",
  descricao: "",
  valor: "",
  data: hojeBR(),
  status: "confirmado",
  categoria_id: "",
  conta_id: "",
  forma_pagamento: "",
  observacoes: "",
  referente_a: "outros" as "medico" | "funcionario" | "outros",
});
const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Expande as linhas de "misto" em uma linha sintética por forma real.
 *  A soma das partes = valor original (validado; caso contrário mantém a linha
 *  original). Cada linha sintética já sai com o balde canônico definido, para
 *  que a parte em débito nunca seja confundida com a parte em crédito. */
function expandMistoItems(items: Lanc[]): Lanc[] {
  const out: Lanc[] = [];
  for (const l of items) {
    const partes = partesDoPagamentoMisto(l.forma_pagamento, l.observacoes, l.composicao_pagamento);
    if (partes.length === 0) {
      out.push(l);
      continue;
    }
    const soma = partes.reduce((s, p) => s + p.valor, 0);
    if (Math.abs(soma - Number(l.valor || 0)) > 0.05) {
      out.push(l);
      continue;
    }
    partes.forEach((p, i) => {
      const label = LABEL_FORMA[p.forma];
      out.push({
        ...l,
        id: `${l.id}#m${i}`,
        valor: p.valor,
        forma_pagamento: label,
        formaCanonica: p.forma,
        descricao: `${l.descricao} — ${label}`,
        _mistoParte: true,
        _mistoPaiId: l.id,
      });
    });
  }
  return out;
}

/** Balde canônico de uma linha: o já calculado (partes de misto) ou o texto
 *  gravado no banco, classificado na hora. */
const baldeDaLinha = (l: Lanc): FormaCanonica =>
  l.formaCanonica ?? classificarForma(l.forma_pagamento);

/**
 * Lista final de linhas: decompõe os pagamentos mistos (quando a opção está
 * ligada) e mantém só o que pertence à forma escolhida no filtro. Usada tanto
 * na tela quanto no cálculo dos cards de Receita/Despesa/Saldo, para que os
 * dois números venham sempre da mesma conta.
 */
function linhasVisiveis(items: Lanc[], filtro: FiltroForma, decompor: boolean): Lanc[] {
  const expandido = decompor ? expandMistoItems(items) : items;
  if (filtro === "todos") return expandido;
  return expandido.filter((l) => baldeCasaComFiltro(baldeDaLinha(l), filtro));
}

function Page() {
  const { clinicaAtual } = useClinica();
  const { user } = useAuth();
  const podeEscrever = usePodeEscrever("financeiro");
  // Estorno segue a matriz de Perfis de Acesso normalmente (módulo "financeiro"),
  // não mais uma lista fixa de papéis — qualquer perfil com "Financeiro: edição"
  // pode estornar.
  const podeEstornar = podeEscrever;
  // Visão em cartões no celular para a tabela de lançamentos (9 colunas) —
  // piloto São Francisco de Paula (flag ux_melhorias).
  const { enabled: uxMelhorias } = useClinicFeatureFlag("ux_melhorias");
  const isMobile = useIsMobile();
  const modoMobile = uxMelhorias && isMobile;
  const [estornando, setEstornando] = useState<string | null>(null);
  const [estornoSangria, setEstornoSangria] = useState<Lanc | null>(null);
  const [confirmDel, setConfirmDel] = useState<Lanc | null>(null);
  const [confirmEst, setConfirmEst] = useState<{ lanc: Lanc; aviso: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [items, setItems] = useState<Lanc[]>([]);
  const [cats, setCats] = useState<Opt[]>([]);
  const [contas, setContas] = useState<Opt[]>([]);
  const [usuarios, setUsuarios] = useState<Opt[]>([]);
  const [medicosOpts, setMedicosOpts] = useState<Opt[]>([]);
  const [funcionariosOpts, setFuncionariosOpts] = useState<Opt[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Lanc | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [filterTipo, setFilterTipo] = useState<"todos" | "receita" | "despesa" | "transferencia">(
    "todos",
  );
  // Fuso de Brasília, não UTC: com `toISOString` o filtro já abria em "amanhã"
  // depois das 21h e a tela aparecia vazia no fim do expediente.
  const [fromDate, setFromDate] = useState(hojeBR);
  const [toDate, setToDate] = useState(hojeBR);
  const [detalhe, setDetalhe] = useState<null | "receita" | "despesa" | "saldo">(null);
  const [resumo, setResumo] = useState<{ r: number; d: number; saldo: number; totalRows: number }>({
    r: 0,
    d: 0,
    saldo: 0,
    totalRows: 0,
  });
  const [filterStatus, setFilterStatus] = useState<"confirmado" | "todos" | "pendente">(
    "confirmado",
  );
  const [filterUsuario, setFilterUsuario] = useState<string>("todos");
  const [filterForma, setFilterForma] = useState<string>("todos");
  const [filterPaciente, setFilterPaciente] = useState<string>("");
  const [filterPacienteDebounced, setFilterPacienteDebounced] = useState<string>("");
  const [filterValor, setFilterValor] = useState<string>("");
  const [filterValorDebounced, setFilterValorDebounced] = useState<string>("");
  const [filterFicha, setFilterFicha] = useState<string>("");
  const [filterFichaDebounced, setFilterFichaDebounced] = useState<string>("");
  const PAGE_SIZE = 100;
  const [page, setPage] = useState(1);
  // Preferência do usuário: decompor pagamentos "misto" nas formas reais
  // (DINHEIRO, PIX, CARTÃO…) em TODAS as visões — tabela, drill-down,
  // export e relatório. Padrão: ligado. Persistido por navegador.
  const [decomporMisto, setDecomporMisto] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const v = window.localStorage.getItem("financeiro:decomporMisto");
    return v === null ? true : v === "1";
  });
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("financeiro:decomporMisto", decomporMisto ? "1" : "0");
    }
  }, [decomporMisto]);

  useEffect(() => {
    const t = setTimeout(() => setFilterPacienteDebounced(filterPaciente.trim()), 300);
    return () => clearTimeout(t);
  }, [filterPaciente]);
  useEffect(() => {
    const t = setTimeout(() => setFilterValorDebounced(filterValor.trim()), 300);
    return () => clearTimeout(t);
  }, [filterValor]);
  useEffect(() => {
    const t = setTimeout(() => setFilterFichaDebounced(filterFicha.trim()), 300);
    return () => clearTimeout(t);
  }, [filterFicha]);

  /**
   * Recorte do filtro de forma direto no banco. É de propósito mais largo que
   * a regra final (ver `@/lib/financeiro/formas-pagamento`): serve só para não
   * baixar o período inteiro. A separação exata entre Cartão de Débito e
   * Cartão de Crédito é aplicada depois, no cliente, por `classificarForma` —
   * assim as bandeiras antigas (MASTER, VISA, MAESTRO, ELO…) caem sempre no
   * cartão certo, o que o `ilike` sozinho não conseguia garantir.
   */
  const applyForma = <T extends { or: (s: string) => T }>(q: T): T => {
    const expr = filtroFormaPostgrest(filterForma as FiltroForma, decomporMisto);
    return expr ? q.or(expr) : q;
  };

  const load = async () => {
    if (!clinicaAtual) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    // 1) Lançamentos (receitas/despesas) — só quando o filtro pede
    const carregarFin =
      filterTipo === "todos" || filterTipo === "receita" || filterTipo === "despesa";
    let finList: Lanc[] = [];
    if (carregarFin) {
      const CHUNK = 1000;
      const MAX = 20000; // salvaguarda
      let offset = 0;
      for (;;) {
        let q = supabase
          .from("fin_lancamentos")
          .select(
            "id, tipo, descricao, valor, data, status, categoria_id, conta_id, forma_pagamento, composicao_pagamento, observacoes, criado_por, medico_id, agendamento_id, created_at",
          )
          .eq("clinica_id", clinicaAtual.clinica_id)
          .gte("data", fromDate)
          .lte("data", toDate)
          .order("data", { ascending: false })
          .range(offset, offset + CHUNK - 1);
        if (filterTipo === "receita" || filterTipo === "despesa") q = q.eq("tipo", filterTipo);
        if (filterUsuario !== "todos") {
          if (filterUsuario === "sem") q = q.is("criado_por", null);
          else q = q.eq("criado_por", filterUsuario);
        }
        q = applyForma(q);
        if (filterPacienteDebounced) q = q.ilike("descricao", `%${filterPacienteDebounced}%`);
        const { data, error } = await q;
        if (error) {
          mostrarErro(error);
          setLoading(false);
          return;
        }
        const rows = (data ?? []) as Array<
          Omit<Lanc, "origem" | "medico_nome" | "ficha_numero"> & {
            medico_id?: string | null;
            agendamento_id?: string | null;
            created_at?: string | null;
          }
        >;
        finList.push(
          ...rows.map((l) => ({
            ...l,
            origem: "fin" as const,
            hora: l.created_at
              ? (() => {
                  const d = new Date(l.created_at as string);
                  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
                })()
              : null,
          })),
        );
        if (rows.length < CHUNK) break;
        offset += CHUNK;
        if (offset >= MAX) break;
      }
      // Enriquecer com nome do médico e nº da ficha do agendamento vinculado.
      const medIds = Array.from(
        new Set(
          finList
            .map((l) => (l as unknown as { medico_id?: string | null }).medico_id)
            .filter((x): x is string => !!x),
        ),
      );
      const agIds = Array.from(
        new Set(
          finList
            .map((l) => (l as unknown as { agendamento_id?: string | null }).agendamento_id)
            .filter((x): x is string => !!x),
        ),
      );
      const medMap = new Map<string, string>();
      if (medIds.length) {
        const { data: meds } = await supabase.from("medicos").select("id, nome").in("id", medIds);
        for (const m of (meds ?? []) as Array<{ id: string; nome: string | null }>) {
          medMap.set(m.id, m.nome ?? "");
        }
      }
      const fichaMap = new Map<string, number | null>();
      if (agIds.length) {
        const { data: ags } = await supabase
          .from("agendamentos")
          .select("id, ficha_numero")
          .in("id", agIds);
        for (const a of (ags ?? []) as Array<{ id: string; ficha_numero: number | null }>) {
          fichaMap.set(a.id, a.ficha_numero);
        }
      }
      finList = finList.map((l) => {
        const raw = l as unknown as { medico_id?: string | null; agendamento_id?: string | null };
        return {
          ...l,
          medico_nome: raw.medico_id ? (medMap.get(raw.medico_id) ?? null) : null,
          ficha_numero: raw.agendamento_id ? (fichaMap.get(raw.agendamento_id) ?? null) : null,
        };
      });
    }
    // 2) Transferências entre caixas — sangria/suprimento em caixa_movimentos
    //    (só carrega se o filtro Forma não estiver restringindo a algo específico
    //    e se o filtro de tipo permitir transferências)
    const carregarCaixa =
      (filterTipo === "todos" || filterTipo === "transferencia") &&
      (filterForma === "todos" || filterForma === "dinheiro");
    let caixaList: Lanc[] = [];
    if (carregarCaixa) {
      const CHUNK = 1000;
      const MAX = 20000;
      let offset = 0;
      const raw: Array<{
        id: string;
        tipo: "sangria" | "suprimento";
        valor: number | string;
        descricao: string | null;
        forma_pagamento: string | null;
        user_id: string | null;
        created_at: string;
        destino_user_id: string | null;
        destino_nome: string | null;
      }> = [];
      for (;;) {
        let qc = supabase
          .from("caixa_movimentos")
          .select(
            "id, tipo, valor, descricao, forma_pagamento, user_id, created_at, destino_user_id, destino_nome",
          )
          .eq("clinica_id", clinicaAtual.clinica_id)
          .in("tipo", ["sangria", "suprimento"])
          .gte("created_at", `${fromDate}T00:00:00`)
          .lte("created_at", `${toDate}T23:59:59`)
          .order("created_at", { ascending: false })
          .range(offset, offset + CHUNK - 1);
        if (filterUsuario !== "todos") {
          if (filterUsuario === "sem") qc = qc.is("user_id", null);
          else qc = qc.eq("user_id", filterUsuario);
        }
        if (filterPacienteDebounced) qc = qc.ilike("descricao", `%${filterPacienteDebounced}%`);
        const { data: mv, error: errMv } = await qc;
        if (errMv) {
          mostrarErro(errMv);
          setLoading(false);
          return;
        }
        const rows = (mv ?? []) as typeof raw;
        raw.push(...rows);
        if (rows.length < CHUNK) break;
        offset += CHUNK;
        if (offset >= MAX) break;
      }
      caixaList = raw.map((m) => ({
        id: m.id,
        tipo: "transferencia" as const,
        descricao: (() => {
          const base = m.tipo === "sangria" ? "Sangria" : "Suprimento";
          const label = m.tipo === "sangria" ? "Entregue a" : "Recebido de";
          const partes: string[] = [base];
          if (m.descricao?.trim()) partes.push(m.descricao.trim());
          if (m.destino_nome?.trim()) partes.push(`${label}: ${m.destino_nome.trim()}`);
          return partes.join(" — ");
        })(),
        valor: Number(m.valor) || 0,
        // created_at é UTC; converter para data local (BRT) antes de fatiar,
        // senão sangrias após 21:00 locais aparecem no dia seguinte em UTC
        // e sangrias da manhã aparecem no dia anterior no fuso local.
        data: (() => {
          const d = new Date(m.created_at);
          const y = d.getFullYear();
          const mo = String(d.getMonth() + 1).padStart(2, "0");
          const da = String(d.getDate()).padStart(2, "0");
          return `${y}-${mo}-${da}`;
        })(),
        hora: (() => {
          const d = new Date(m.created_at);
          return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
        })(),
        status: "confirmado",
        categoria_id: null,
        conta_id: null,
        forma_pagamento: m.forma_pagamento,
        // Sangria e suprimento mexem no dinheiro físico da gaveta: quando vêm
        // sem forma preenchida, contam como Dinheiro (mesma regra do Caixa).
        formaCanonica: m.forma_pagamento
          ? classificarForma(m.forma_pagamento)
          : ("dinheiro" as const),
        criado_por: m.user_id,
        origem: "caixa" as const,
        transferSentido: m.tipo === "suprimento" ? "entrada" : "saida",
        caixaTipo: m.tipo,
      }));
    }
    // Merge ordenado por data + hora desc (mais recente primeiro)
    let merged = [...finList, ...caixaList].sort((a, b) => {
      if (a.data !== b.data) return a.data < b.data ? 1 : -1;
      const ha = a.hora ?? "";
      const hb = b.hora ?? "";
      if (ha !== hb) return ha < hb ? 1 : -1;
      return 0;
    });
    // Separação final por forma de pagamento. O `ilike` do banco é um recorte
    // grosseiro; quem decide é `classificarForma`, para que Cartão de Débito e
    // Cartão de Crédito fiquem 100% isolados um do outro. Um pagamento misto
    // só permanece se alguma de suas partes for da forma procurada.
    if (filterForma !== "todos") {
      const filtro = filterForma as FiltroForma;
      merged = merged.filter((l) => {
        if (formaCasaComFiltro(l.forma_pagamento, filtro)) return true;
        if (l.formaCanonica && baldeCasaComFiltro(l.formaCanonica, filtro)) return true;
        if (!decomporMisto) return false;
        return partesDoPagamentoMisto(
          l.forma_pagamento,
          l.observacoes,
          l.composicao_pagamento,
        ).some((p) => baldeCasaComFiltro(p.forma, filtro));
      });
    }
    // Filtros client-side: valor exato e nº da ficha (referência).
    const vNum = filterValorDebounced ? Number(filterValorDebounced.replace(",", ".")) : NaN;
    if (Number.isFinite(vNum)) {
      merged = merged.filter((l) => Math.abs(Number(l.valor) - vNum) < 0.005);
    }
    const fNum = filterFichaDebounced ? Number(filterFichaDebounced) : NaN;
    if (Number.isFinite(fNum)) {
      merged = merged.filter((l) => Number(l.ficha_numero) === fNum);
    }
    setItems(merged);
    // Se qualquer filtro client-side estiver ativo, recomputa o resumo a partir da lista filtrada.
    // O filtro de forma entra aqui porque a separação exata entre débito e
    // crédito (e a decomposição do misto) só existe no cliente.
    if (Number.isFinite(vNum) || Number.isFinite(fNum) || filterForma !== "todos") {
      let r = 0,
        d = 0;
      const base = linhasVisiveis(merged, filterForma as FiltroForma, decomporMisto);
      for (const l of base) {
        if (l.status === "cancelado") continue;
        if (filterStatus !== "todos" && l.status !== filterStatus) continue;
        const v = Number(l.valor) || 0;
        if (l.tipo === "receita") r += v;
        else if (l.tipo === "despesa") d += v;
      }
      setResumo({ r, d, saldo: r - d, totalRows: merged.length });
    }
    setLoading(false);
  };
  const loadResumo = async () => {
    if (!clinicaAtual) {
      setResumo({ r: 0, d: 0, saldo: 0, totalRows: 0 });
      return;
    }
    // Filtro "só transferências" não afeta os cards de Receita/Despesa/Saldo — zera-os.
    if (filterTipo === "transferencia") {
      setResumo({ r: 0, d: 0, saldo: 0, totalRows: items.length });
      return;
    }
    // Com filtro de forma, quem fecha a conta é `load()`: só lá existe a
    // classificação exata (débito ≠ crédito) e a decomposição do misto. Somar
    // aqui, direto do recorte do banco, contaria o misto inteiro na forma
    // errada.
    if (filterForma !== "todos") return;
    // Sem filtro por usuário/tipo/forma → usa RPC agregado (rápido).
    if (
      filterUsuario === "todos" &&
      filterTipo === "todos" &&
      filterForma === "todos" &&
      !filterPacienteDebounced
    ) {
      const { data, error } = await supabase.rpc("fin_resumo_periodo", {
        p_clinica: clinicaAtual.clinica_id,
        p_ini: fromDate,
        p_fim: toDate,
      });
      if (error) {
        mostrarErro(error);
        return;
      }
      let r = 0,
        d = 0,
        totalRows = 0;
      for (const row of (data ?? []) as Array<{
        tipo: string;
        status: string;
        qtd: number;
        total: number;
      }>) {
        totalRows += Number(row.qtd) || 0;
        if (row.status === "cancelado") continue;
        if (filterStatus !== "todos" && row.status !== filterStatus) continue;
        if (row.tipo === "receita") r += Number(row.total) || 0;
        else if (row.tipo === "despesa") d += Number(row.total) || 0;
      }
      setResumo({ r, d, saldo: r - d, totalRows });
      return;
    }
    // Com filtros → agrega no cliente sobre as linhas filtradas.
    let r = 0,
      d = 0,
      totalRows = 0;
    const CHUNK = 1000;
    let offset = 0;
    for (;;) {
      let q = supabase
        .from("fin_lancamentos")
        .select("tipo,status,valor")
        .eq("clinica_id", clinicaAtual.clinica_id)
        .gte("data", fromDate)
        .lte("data", toDate)
        .range(offset, offset + CHUNK - 1);
      if (filterTipo !== "todos") q = q.eq("tipo", filterTipo);
      if (filterUsuario !== "todos") {
        if (filterUsuario === "sem") q = q.is("criado_por", null);
        else q = q.eq("criado_por", filterUsuario);
      }
      q = applyForma(q);
      if (filterPacienteDebounced) q = q.ilike("descricao", `%${filterPacienteDebounced}%`);
      const { data, error } = await q;
      if (error) {
        mostrarErro(error);
        return;
      }
      const rows = (data ?? []) as Array<{
        tipo: string;
        status: string;
        valor: number | string | null;
      }>;
      for (const row of rows) {
        totalRows += 1;
        if (row.status === "cancelado") continue;
        if (filterStatus !== "todos" && row.status !== filterStatus) continue;
        const v = Number(row.valor) || 0;
        if (row.tipo === "receita") r += v;
        else if (row.tipo === "despesa") d += v;
      }
      if (rows.length < CHUNK) break;
      offset += CHUNK;
      if (offset > 20000) break; // salvaguarda
    }
    setResumo({ r, d, saldo: r - d, totalRows });
  };
  const loadOpts = async () => {
    if (!clinicaAtual) return;
    const [c, b, m, meds] = await Promise.all([
      supabase
        .from("fin_categorias")
        .select("id, nome, tipo")
        .eq("clinica_id", clinicaAtual.clinica_id)
        .eq("ativo", true)
        .order("nome"),
      supabase
        .from("fin_contas")
        .select("id, nome")
        .eq("clinica_id", clinicaAtual.clinica_id)
        .eq("ativo", true)
        .order("nome"),
      supabase
        .from("clinica_memberships")
        .select("user_id, role")
        .eq("clinica_id", clinicaAtual.clinica_id)
        .eq("ativo", true),
      supabase
        .from("medicos")
        .select("id, nome")
        .eq("clinica_id", clinicaAtual.clinica_id)
        .eq("ativo", true)
        .order("nome"),
    ]);
    setCats((c.data ?? []) as Opt[]);
    setContas((b.data ?? []) as Opt[]);
    setMedicosOpts(
      ((meds.data ?? []) as Array<{ id: string; nome: string | null }>).map((x) => ({
        id: x.id,
        nome: x.nome || "(sem nome)",
      })),
    );
    const mems = (m.data ?? []) as Array<{ user_id: string; role: string }>;
    const userIds = mems.map((r) => r.user_id);
    if (userIds.length) {
      const { data: profs } = await supabase.from("profiles").select("id, nome").in("id", userIds);
      const list = ((profs ?? []) as Array<{ id: string; nome: string | null }>)
        .map((p) => ({ id: p.id, nome: p.nome || "(sem nome)" }))
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
      setUsuarios(list);
      // Funcionários = memberships ativos que NÃO são paciente nem médico
      const funcIds = new Set(
        mems.filter((r) => r.role !== "paciente" && r.role !== "medico").map((r) => r.user_id),
      );
      const funcNames = list.filter((p) => funcIds.has(p.id));
      // Deduplicar por nome (case-insensitive)
      const seen = new Set<string>();
      const dedup: Opt[] = [];
      for (const f of funcNames) {
        const k = f.nome.trim().toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        dedup.push(f);
      }
      setFuncionariosOpts(dedup);
    } else {
      setUsuarios([]);
      setFuncionariosOpts([]);
    }
  };
  useEffect(() => {
    void load();
    void loadResumo();
  }, [
    clinicaAtual?.clinica_id,
    filterTipo,
    fromDate,
    toDate,
    filterStatus,
    filterUsuario,
    filterForma,
    // recarrega ao ligar/desligar a decomposição do misto: ela muda o recorte
    // enviado ao banco (os lançamentos "misto" entram ou não no filtro de forma)
    decomporMisto,
    filterPacienteDebounced,
    filterValorDebounced,
    filterFichaDebounced,
  ]);
  // Reseta a página sempre que qualquer filtro mudar
  useEffect(() => {
    setPage(1);
  }, [
    clinicaAtual?.clinica_id,
    filterTipo,
    fromDate,
    toDate,
    filterStatus,
    filterUsuario,
    filterForma,
    filterPacienteDebounced,
    filterValorDebounced,
    filterFichaDebounced,
  ]);
  useEffect(() => {
    void loadOpts();
  }, [clinicaAtual?.clinica_id]);
  const totais = resumo;

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm());
    setOpen(true);
  };
  const openEdit = (l: Lanc) => {
    if (l.origem === "caixa" || l.tipo === "transferencia") return; // transferências de caixa são somente-leitura aqui
    const desc = (l.descricao ?? "").trim().toLowerCase();
    const isMedico = medicosOpts.some((x) => x.nome.trim().toLowerCase() === desc);
    const isFunc = !isMedico && funcionariosOpts.some((x) => x.nome.trim().toLowerCase() === desc);
    setEditing(l);
    setForm({
      tipo: l.tipo as "receita" | "despesa",
      descricao: l.descricao,
      valor: String(l.valor),
      data: l.data,
      status: l.status,
      categoria_id: l.categoria_id ?? "",
      conta_id: l.conta_id ?? "",
      forma_pagamento: l.forma_pagamento ?? "",
      observacoes: "",
      referente_a: isMedico ? "medico" : isFunc ? "funcionario" : "outros",
    });
    setOpen(true);
  };

  const salvarLancamento = async (imprimir: boolean) => {
    if (!clinicaAtual) return;
    if (!form.descricao.trim()) {
      toast.error("Preencha a descrição.");
      return;
    }
    if (!form.data) {
      toast.error("Informe a data.");
      return;
    }
    if (!(Number(form.valor) > 0)) {
      toast.error("Informe o valor.");
      return;
    }
    // Forma de pagamento é obrigatória para receita já confirmada (pendente
    // pode legitimamente não ter forma ainda). Sem essa checagem, lançamentos
    // manuais ficavam com forma_pagamento NULL e a guia impressa (GR) caía
    // num fallback enganoso em vez de refletir o pagamento real.
    if (form.tipo === "receita" && form.status === "confirmado" && !form.forma_pagamento) {
      toast.error("Selecione a forma de pagamento.");
      return;
    }
    // Despesa sem categoria e sem conta cega a DRE e os relatórios: não dá
    // para responder "quanto gastei com o quê" nem "saiu de qual conta". Os
    // campos existiam mas eram opcionais e quase ninguém preenchia — em
    // agosto/2026, 76 das 90 despesas do mês (84%) entraram sem categoria e 33
    // sem conta. Mesma regra aplicada no diálogo de lançamento do financeiro.
    if (form.tipo === "despesa") {
      if (!form.categoria_id) {
        toast.error("Selecione a categoria da despesa.");
        return;
      }
      if (!form.conta_id) {
        toast.error("Selecione a conta de onde a despesa saiu.");
        return;
      }
    }
    setSaving(true);
    const payload = {
      clinica_id: clinicaAtual.clinica_id,
      tipo: form.tipo,
      descricao: form.descricao.trim(),
      valor: Number(form.valor),
      data: form.data,
      status: form.status as "cancelado" | "confirmado" | "pendente",
      categoria_id: form.categoria_id || null,
      conta_id: form.conta_id || null,
      forma_pagamento: form.forma_pagamento || null,
      observacoes: form.observacoes || null,
    };
    // `criado_por` só vai no INSERT: o banco não tem gatilho que preencha essa
    // coluna em fin_lancamentos (o gatilho de autoria existe só para
    // orçamentos), então sem esta linha o lançamento nascia sem dono e sumia
    // da própria listagem assim que alguém filtrava por usuário. No UPDATE ele
    // fica de fora de propósito, para que editar um lançamento não roube a
    // autoria de quem o criou.
    const { error } = editing
      ? await supabase.from("fin_lancamentos").update(payload).eq("id", editing.id)
      : await supabase.from("fin_lancamentos").insert({ ...payload, criado_por: user?.id ?? null });
    setSaving(false);
    if (error) {
      mostrarErro(error);
      return;
    }
    toast.success("Salvo");
    // Recibo do lançamento: mesma impressão usada pelo diálogo de Receita /
    // Despesa do financeiro, para o papel sair igual em todas as telas.
    if (imprimir) {
      try {
        printReciboLancamento({
          tipo: form.tipo,
          clinicaNome: clinicaAtual.clinica?.nome ?? "",
          operadorNome:
            (user?.user_metadata as { nome?: string } | null)?.nome ?? user?.email ?? null,
          descricao: form.descricao.trim(),
          valor: Number(form.valor),
          data: form.data,
          categoriaNome: cats.find((c) => c.id === form.categoria_id)?.nome ?? null,
          contaNome: contas.find((c) => c.id === form.conta_id)?.nome ?? null,
          formaPagamentoLabel: form.forma_pagamento
            ? (FORMA_LABEL[form.forma_pagamento] ?? form.forma_pagamento)
            : null,
          observacoes: form.observacoes || null,
        });
      } catch (err) {
        console.error("Falha ao imprimir recibo do lançamento:", err);
        toast.error("Lançamento salvo, mas não foi possível abrir a impressão do recibo.");
      }
    }
    setOpen(false);
    await load();
    await loadResumo();
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void salvarLancamento(false);
  };

  /** Segunda via do recibo de um lançamento já gravado. Só monta o papel de
   *  novo — não altera nada no banco, ao contrário de abrir em Editar e
   *  clicar em "Salvar e imprimir", que regravava o registro. */
  const reimprimirRecibo = (l: Lanc) => {
    if (l.tipo === "transferencia") return;
    try {
      printReciboLancamento({
        tipo: l.tipo,
        clinicaNome: clinicaAtual?.clinica?.nome ?? "",
        operadorNome: l.criado_por
          ? (usuarios.find((u) => u.id === l.criado_por)?.nome ?? null)
          : null,
        descricao: l.descricao,
        valor: Number(l.valor),
        data: l.data,
        categoriaNome: cats.find((c) => c.id === l.categoria_id)?.nome ?? null,
        contaNome: contas.find((c) => c.id === l.conta_id)?.nome ?? null,
        formaPagamentoLabel: l.forma_pagamento
          ? (FORMA_LABEL[l.forma_pagamento] ?? l.forma_pagamento)
          : null,
        observacoes: l.observacoes || null,
        segundaVia: true,
      });
    } catch (err) {
      console.error("Falha ao reimprimir recibo do lançamento:", err);
      toast.error("Não foi possível abrir a impressão do recibo.");
    }
  };

  const remove = (l: Lanc) => {
    setConfirmDel(l);
  };

  const confirmarExclusao = async () => {
    const l = confirmDel;
    if (!l) return;
    setDeleting(true);
    const { error } = await supabase.from("fin_lancamentos").delete().eq("id", l.id);
    setDeleting(false);
    setConfirmDel(null);
    if (error) mostrarErro(error);
    else {
      toast.success("Removido");
      await load();
      await loadResumo();
    }
  };

  const estornar = async (l: Lanc) => {
    if (!podeEstornar) {
      toast.error("Sem permissão");
      return;
    }
    if (l.origem === "caixa" || l.tipo === "transferencia") return;
    if (l.status === "cancelado") {
      toast.info("Lançamento já estornado.");
      return;
    }
    // Antes de confirmar, consulta o lançamento para verificar se pertence a um
    // pagamento agrupado (grupo_pagamento_id) ou é uma sombra legada (valor 0 +
    // observação "Pagamento agrupado com agendamento ..."). O usuário deve saber
    // que outros atendimentos do mesmo grupo permanecerão pagos.
    const { data: lancInfo } = await supabase
      .from("fin_lancamentos")
      .select("id, valor, observacoes, grupo_pagamento_id")
      .eq("id", l.id)
      .maybeSingle();
    const info = (lancInfo ?? {}) as {
      valor: number | string | null;
      observacoes: string | null;
      grupo_pagamento_id: string | null;
    };
    let qtdGrupo = 0;
    if (info.grupo_pagamento_id) {
      const { count } = await supabase
        .from("fin_lancamentos")
        .select("id", { count: "exact", head: true })
        .eq("grupo_pagamento_id", info.grupo_pagamento_id)
        .eq("status", "confirmado");
      qtdGrupo = count ?? 0;
    }
    const ehSombraLegado =
      Number(info.valor) === 0 &&
      typeof info.observacoes === "string" &&
      info.observacoes.startsWith("Pagamento agrupado com agendamento");
    const avisoGrupo =
      info.grupo_pagamento_id && qtdGrupo > 1
        ? `\n\nEste pagamento faz parte de um grupo de ${qtdGrupo} atendimentos. Apenas ESTE atendimento será estornado — os demais permanecem pagos.`
        : ehSombraLegado
          ? "\n\nEste atendimento foi pago em grupo (pagamento antigo). Ao estornar, o valor total do lançamento principal NÃO é ajustado automaticamente — se necessário, ajuste manualmente o lançamento principal do grupo."
          : "";
    setConfirmEst({ lanc: l, aviso: avisoGrupo.trim() });
  };

  const executarEstorno = async () => {
    const l = confirmEst?.lanc;
    if (!l) return;
    setConfirmEst(null);
    setEstornando(l.id);
    try {
      const { data: lanc, error: eLanc } = await supabase
        .from("fin_lancamentos")
        .select("id, agendamento_id, valor, descricao, repasse_pago")
        .eq("id", l.id)
        .maybeSingle();
      if (eLanc) {
        mostrarErro(eLanc);
        return;
      }
      const { data: atd } = await supabase
        .from("fin_atendimentos")
        .select("id, repasse_pago")
        .eq("lancamento_id", l.id)
        .maybeSingle();
      // Checa as DUAS tabelas: repasses de agenda são marcados em
      // fin_lancamentos.repasse_pago (não em fin_atendimentos).
      if (atd?.repasse_pago || (lanc as { repasse_pago?: boolean } | null)?.repasse_pago) {
        toast.error("Repasse já pago — estorne o pagamento do repasse primeiro.");
        return;
      }
      const { error: eUpdLanc } = await supabase
        .from("fin_lancamentos")
        .update({ status: "cancelado" })
        .eq("id", l.id);
      if (eUpdLanc) {
        mostrarErro(eUpdLanc, "falha ao estornar lançamento");
        return;
      }
      // Auditoria: registra o estorno do lançamento em si — antes vinha
      // só o log do agendamento, então lançamentos avulsos (sem agenda)
      // ficavam invisíveis na Auditoria.
      try {
        await logAction({
          table_name: "fin_lancamentos",
          record_id: l.id,
          action: "ESTORNO",
          clinica_id: clinicaAtual?.clinica_id,
          dados_antes: {
            id: l.id,
            status: l.status,
            tipo: l.tipo,
            valor: l.valor,
            descricao: l.descricao,
            forma_pagamento: l.forma_pagamento,
            data: l.data,
          },
          dados_depois: {
            id: l.id,
            status: "cancelado",
            valor_estornado: lanc?.valor ?? l.valor,
            agendamento_id: lanc?.agendamento_id ?? null,
          },
        });
      } catch {
        /* auditoria best-effort */
      }
      const agId = lanc?.agendamento_id ?? null;
      if (agId) {
        const { data: agAntes } = await supabase
          .from("agendamentos")
          .select("id, status, fluxo_etapa")
          .eq("id", agId)
          .maybeSingle();
        const { error: eUpd } = await supabase
          .from("agendamentos")
          .update({
            status: "agendado",
            fluxo_etapa: "aguardando_recepcao",
            fluxo_atualizado_em: new Date().toISOString(),
          })
          .eq("id", agId);
        if (eUpd) {
          mostrarErro(eUpd);
          return;
        }
        try {
          await logAction({
            table_name: "agendamentos",
            record_id: agId,
            action: "ESTORNO",
            clinica_id: clinicaAtual?.clinica_id,
            dados_antes: agAntes ?? { id: agId },
            dados_depois: {
              id: agId,
              status: "agendado",
              fin_lancamentos_id_removido: l.id,
              valor_estornado: lanc?.valor ?? null,
            },
          });
        } catch {
          /* auditoria best-effort */
        }
      }
      // Registra o estorno como solicitação PENDENTE na aba "Estorno".
      const ok = await registrarNaFilaEstorno(
        l,
        lanc?.agendamento_id ?? null,
        Number(lanc?.valor ?? l.valor),
      );
      toast.success(
        ok
          ? "Lançamento estornado — solicitação enviada para a aba Estorno (pendente)."
          : "Lançamento estornado",
      );
      await load();
      await loadResumo();
    } finally {
      setEstornando(null);
    }
  };

  /**
   * Garante que todo estorno feito direto no Mov. Caixa apareça na aba
   * "Estorno" com status PENDENTE, alimentando o contador "Pendentes".
   * Best-effort — se falhar, o estorno em si continua válido.
   */
  const registrarNaFilaEstorno = async (
    l: Lanc,
    agendamentoId: string | null,
    valor: number,
  ): Promise<boolean> => {
    if (!clinicaAtual) return false;
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return false;
      const agora = new Date().toISOString();
      const hoje = agora.slice(0, 10);

      // Reaproveita solicitação pendente já existente para este lançamento.
      const { data: existente } = await supabase
        .from("estorno_solicitacoes")
        .select("id")
        .eq("lancamento_id", l.id)
        .eq("status", "pendente")
        .maybeSingle();

      if (existente?.id) return true;

      const { data: nova, error: eIns } = await supabase
        .from("estorno_solicitacoes")
        .insert({
          clinica_id: clinicaAtual.clinica_id,
          lancamento_id: l.id,
          agendamento_id: agendamentoId,
          paciente_nome: l.descricao?.split("—")[0]?.trim() || null,
          descricao: l.descricao,
          valor,
          motivo: "Estorno realizado pelo Movimento de Caixa.",
          tipo: "erro_caixa",
          status: "pendente",
          solicitado_por: user.id,
          data_pagamento_original: l.data ?? null,
          data_estorno: hoje,
        })
        .select("id")
        .maybeSingle();
      if (eIns || !nova?.id) return false;
      return true;
    } catch {
      /* registro na fila é best-effort */
      return false;
    }
  };

  const catsFiltradas = cats.filter((c) => !c.tipo || c.tipo === form.tipo);

  // Lista efetivamente usada em TODAS as visões (tabela, drill-down, export,
  // relatório). Quando a opção está ligada, cada lançamento "misto" vira N
  // linhas sintéticas (uma por forma real). A soma dos valores é preservada.
  //
  // O filtro de Status entra AQUI, e não só nos cards de Receita/Despesa/Saldo.
  // Enquanto valia apenas para os cards, um atendimento estornado (status
  // `cancelado`) sumia do card mas continuava listado na tabela, no Excel e —
  // o que a recepção percebeu — somado no "Resumo por tipo de moeda" do
  // relatório impresso. Resultado: a mesma tela mostrava dois valores para a
  // mesma forma de pagamento e nenhum dos dois fechava com o comprovante do
  // sistema antigo. Em 18/08/2026 o Cartão de Débito saía R$ 5.118,98 no
  // relatório contra R$ 4.616,98 reais — os R$ 502,00 de dois atendimentos
  // estornados no mesmo dia.
  //
  // `cancelado` sai em qualquer opção: as três escolhas do filtro são
  // "confirmados", "pendentes" e "confirmados + pendentes". Estorno é assunto
  // da aba Estorno, não do movimento do caixa.
  const displayItems = linhasVisiveis(items, filterForma as FiltroForma, decomporMisto).filter(
    (l) => l.status !== "cancelado" && (filterStatus === "todos" || l.status === filterStatus),
  );

  const imprimirRelatorio = () => {
    const source = displayItems;
    if (!source.length) {
      toast.info("Sem dados para o relatório.");
      return;
    }
    const catMap = new Map(cats.map((c) => [c.id, c.nome]));
    const esc = (v: unknown) =>
      String(v ?? "").replace(
        /[&<>"']/g,
        (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
      );
    type Row = { label: string; pagamento: number; recebimento: number };
    const cats2 = new Map<string, Row>();
    /**
     * Uma linha por forma canônica. `origens` guarda os textos que o banco
     * tinha (cartao_credito, MASTER, VISA…) só para o relatório mostrar de
     * onde veio cada total — a soma em si é sempre por balde, então Cartão de
     * Débito e Cartão de Crédito nunca compartilham valor.
     */
    type LinhaForma = {
      pagamento: number;
      recebimento: number;
      origens: Map<string, number>;
    };
    const formas = new Map<FormaCanonica, LinhaForma>();
    const somarForma = (
      balde: FormaCanonica,
      origem: string,
      valor: number,
      isReceita: boolean,
      isDespesa: boolean,
    ) => {
      const linha = formas.get(balde) ?? {
        pagamento: 0,
        recebimento: 0,
        origens: new Map<string, number>(),
      };
      if (isReceita) linha.recebimento += valor;
      else if (isDespesa) linha.pagamento += valor;
      linha.origens.set(origem, (linha.origens.get(origem) ?? 0) + valor);
      formas.set(balde, linha);
    };
    let totPag = 0,
      totReceb = 0;
    for (const l of source) {
      const v = Number(l.valor || 0);
      const isReceita =
        l.tipo === "receita" || (l.tipo === "transferencia" && l.transferSentido === "entrada");
      const isDespesa =
        l.tipo === "despesa" || (l.tipo === "transferencia" && l.transferSentido === "saida");
      const catLabel =
        (l.categoria_id ? catMap.get(l.categoria_id) : null) ||
        (isReceita ? "RECEBIMENTOS DIVERSOS" : "DESPESAS DIVERSAS");
      const c = cats2.get(catLabel) ?? { label: catLabel, pagamento: 0, recebimento: 0 };
      if (isReceita) {
        c.recebimento += v;
        totReceb += v;
      } else if (isDespesa) {
        c.pagamento += v;
        totPag += v;
      }
      cats2.set(catLabel, c);
      // Decompõe pagamentos "misto" quando a opção estiver ligada; caso
      // contrário mantém a linha "Misto" no Resumo por tipo de moeda.
      const partes = decomporMisto
        ? partesDoPagamentoMisto(l.forma_pagamento, l.observacoes, l.composicao_pagamento)
        : [];
      if (partes.length) {
        for (const p of partes) {
          somarForma(p.forma, `Misto → ${LABEL_FORMA[p.forma]}`, p.valor, isReceita, isDespesa);
        }
      } else {
        somarForma(baldeDaLinha(l), l.forma_pagamento || "(sem forma)", v, isReceita, isDespesa);
      }
    }
    let acc = 0;
    const linhasCat = Array.from(cats2.values())
      .map((c) => {
        acc += c.recebimento - c.pagamento;
        return (
          "<tr><td>" +
          esc(c.label) +
          '</td><td style="text-align:right;">' +
          fmt(c.pagamento) +
          '</td><td style="text-align:right;">' +
          fmt(c.recebimento) +
          '</td><td style="text-align:right;">' +
          fmt(acc) +
          "</td></tr>"
        );
      })
      .join("");
    // Linhas por forma: ordem fixa, Dinheiro / PIX / Débito / Crédito sempre
    // presentes (mesmo zerados) para a conferência com a maquininha, e o saldo
    // é o da PRÓPRIA forma — não um acumulado corrido, que fazia o valor do
    // Cartão de Débito aparecer somado ao do Cartão de Crédito.
    const chavesForma = ORDEM_FORMAS.filter(
      (k) => formas.has(k) || (FORMAS_SEMPRE_VISIVEIS.includes(k) && filterForma === "todos"),
    );
    const linhasForma = chavesForma
      .map((k) => {
        const f = formas.get(k) ?? { pagamento: 0, recebimento: 0, origens: new Map() };
        const saldo = f.recebimento - f.pagamento;
        const origens = Array.from(f.origens.entries())
          .filter(([, valor]) => Math.abs(valor) > 0.004)
          .map(([nome]) => nome)
          .sort();
        // Mostra os textos de origem quando o balde reúne mais de um (o caso
        // dos cartões: cartao_credito + MASTER + VISA do sistema antigo), para
        // que dê para auditar de onde veio cada centavo.
        const detalhe =
          origens.length > 1
            ? '<div style="font-size:10px;color:#64748b;">registrado como: ' +
              esc(origens.join(" · ")) +
              "</div>"
            : "";
        return (
          "<tr><td>" +
          esc(LABEL_FORMA[k]) +
          detalhe +
          '</td><td style="text-align:right;">' +
          fmt(f.pagamento) +
          '</td><td style="text-align:right;">' +
          fmt(f.recebimento) +
          '</td><td style="text-align:right;">' +
          fmt(saldo) +
          "</td></tr>"
        );
      })
      .join("");
    const p = (s: string) => s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4);
    const periodo = p(fromDate) + " — " + p(toDate);
    const clinicaNome = "";
    const emissao = new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
    const style =
      "body{font-family:Arial,sans-serif;padding:24px;color:#0f172a;} h1{font-size:16px;margin:0 0 6px;text-align:center;letter-spacing:.5px;} .meta{font-size:11px;color:#475569;margin-bottom:10px;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;} table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:14px;} th,td{padding:5px 6px;border-bottom:1px solid #cbd5e1;} thead th{border-bottom:2px solid #0f172a;text-align:left;} thead th.n{text-align:right;} tfoot td{border-top:2px solid #0f172a;font-weight:700;} .right{text-align:right;}";
    const html =
      '<!doctype html><html><head><meta charset="utf-8"/><title>Relatório de movimento de caixa</title><style>' +
      style +
      "</style></head><body>" +
      '<div class="meta"><span>' +
      esc(clinicaNome) +
      "</span><span>Emitido: " +
      esc(emissao) +
      "</span></div>" +
      "<h1>RELATÓRIO DE MOVIMENTO DE CAIXA</h1>" +
      '<div class="meta"><span>Tipo: TODOS (SEM TRANSFERÊNCIA)</span><span>Período: ' +
      esc(periodo) +
      "</span><span>Agrupar: CATEGORIA</span></div>" +
      '<table><thead><tr><th>GERAL — Descrição</th><th class="n">Pagamento</th><th class="n">Recebimento</th><th class="n">Acumulado</th></tr></thead><tbody>' +
      linhasCat +
      "</tbody></table>" +
      '<table><thead><tr><th>Resumo por tipo de moeda</th><th class="n">Pagamento</th><th class="n">Recebimento</th><th class="n">Saldo da forma</th></tr></thead><tbody>' +
      linhasForma +
      "</tbody>" +
      '<tfoot><tr><td>TOTAL</td><td class="right">' +
      fmt(totPag) +
      '</td><td class="right">' +
      fmt(totReceb) +
      '</td><td class="right">' +
      fmt(totReceb - totPag) +
      "</td></tr></tfoot></table>" +
      '<div class="meta"><span>' +
      source.length +
      " registro" +
      (source.length === 1 ? "" : "s") +
      "</span></div>" +
      "<script>window.onload=function(){window.print();}</script></body></html>";
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
          <h1 className="text-2xl font-semibold">Movimento de Caixa</h1>
          <p className="text-sm text-muted-foreground">Receitas e despesas do período</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={imprimirRelatorio} disabled={!displayItems.length}>
            <Printer className="h-4 w-4 mr-2" />
            Relatório
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              if (!displayItems.length) {
                toast.info("Sem dados para exportar.");
                return;
              }
              const catMap = new Map(cats.map((c) => [c.id, c.nome]));
              const contaMap = new Map(contas.map((c) => [c.id, c.nome]));
              const userMap = new Map(usuarios.map((u) => [u.id, u.nome]));
              exportToExcel(
                displayItems.map((l) => ({
                  data: l.data
                    ? l.data.slice(8, 10) + "/" + l.data.slice(5, 7) + "/" + l.data.slice(0, 4)
                    : "",
                  hora: l.hora ?? "",
                  tipo: l.tipo,
                  descricao: l.descricao,
                  medico: l.medico_nome ?? "",
                  ficha:
                    typeof l.ficha_numero === "number"
                      ? String(l.ficha_numero).padStart(3, "0")
                      : "",
                  categoria: l.categoria_id ? (catMap.get(l.categoria_id) ?? "") : "",
                  conta: l.conta_id ? (contaMap.get(l.conta_id) ?? "") : "",
                  forma_pagamento: LABEL_FORMA[baldeDaLinha(l)],
                  forma_registrada: l.forma_pagamento ?? "",
                  status: l.status,
                  usuario: l.criado_por ? (userMap.get(l.criado_por) ?? "") : "",
                  valor: Number(l.valor).toFixed(2),
                })),
                `movimento-${fromDate}_a_${toDate}`,
                [
                  { key: "data", label: "Data" },
                  { key: "hora", label: "Hora" },
                  { key: "tipo", label: "Tipo" },
                  { key: "descricao", label: "Descrição" },
                  { key: "medico", label: "Médico" },
                  { key: "ficha", label: "Ficha" },
                  { key: "categoria", label: "Categoria" },
                  { key: "conta", label: "Conta" },
                  { key: "forma_pagamento", label: "Forma pagamento" },
                  { key: "forma_registrada", label: "Registrado como" },
                  { key: "status", label: "Status" },
                  { key: "usuario", label: "Usuário" },
                  { key: "valor", label: "Valor (R$)" },
                ],
              );
            }}
          >
            <Download className="h-4 w-4 mr-2" />
            Exportar Excel
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            {podeEscrever && (
              <DialogTrigger asChild>
                <Button onClick={openNew} disabled={!clinicaAtual}>
                  <Plus className="h-4 w-4 mr-2" />
                  Novo lançamento
                </Button>
              </DialogTrigger>
            )}
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{editing ? "Editar" : "Novo"} lançamento</DialogTitle>
              </DialogHeader>
              <form onSubmit={submit} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Tipo</Label>
                    <Select
                      value={form.tipo}
                      onValueChange={(v) =>
                        setForm({ ...form, tipo: v as "receita" | "despesa", categoria_id: "" })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="receita">Receita</SelectItem>
                        <SelectItem value="despesa">Despesa</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Data</Label>
                    <DateInputBR
                      required
                      value={form.data}
                      onChange={(e) => setForm({ ...form, data: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Referente a</Label>
                  <Select
                    value={form.referente_a}
                    onValueChange={(v) =>
                      setForm({
                        ...form,
                        referente_a: v as "medico" | "funcionario" | "outros",
                        descricao: "",
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="medico">Médico</SelectItem>
                      <SelectItem value="funcionario">Funcionário</SelectItem>
                      <SelectItem value="outros">Outros</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Descrição *</Label>
                  {form.referente_a === "medico" ? (
                    <Select
                      value={form.descricao || ""}
                      onValueChange={(v) => setForm({ ...form, descricao: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o médico" />
                      </SelectTrigger>
                      <SelectContent>
                        {medicosOpts.map((m) => (
                          <SelectItem key={m.id} value={m.nome}>
                            {m.nome}
                          </SelectItem>
                        ))}
                        {form.descricao && !medicosOpts.some((m) => m.nome === form.descricao) && (
                          <SelectItem value={form.descricao}>{form.descricao}</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  ) : form.referente_a === "funcionario" ? (
                    <Select
                      value={form.descricao || ""}
                      onValueChange={(v) => setForm({ ...form, descricao: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o funcionário" />
                      </SelectTrigger>
                      <SelectContent>
                        {funcionariosOpts.map((f) => (
                          <SelectItem key={f.id} value={f.nome}>
                            {f.nome}
                          </SelectItem>
                        ))}
                        {form.descricao &&
                          !funcionariosOpts.some((f) => f.nome === form.descricao) && (
                            <SelectItem value={form.descricao}>{form.descricao}</SelectItem>
                          )}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      required
                      value={form.descricao}
                      onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                    />
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Valor (R$) *</Label>
                    <CurrencyInput
                      value={form.valor}
                      onChange={(v) => setForm({ ...form, valor: v })}
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
                        <SelectItem value="confirmado">Confirmado</SelectItem>
                        <SelectItem value="pendente">Pendente</SelectItem>
                        <SelectItem value="cancelado">Cancelado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>
                      Categoria
                      {form.tipo === "despesa" && <span className="text-destructive"> *</span>}
                    </Label>
                    <Select
                      value={form.categoria_id || "none"}
                      onValueChange={(v) =>
                        setForm({ ...form, categoria_id: v === "none" ? "" : v })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        {catsFiltradas.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>
                      Conta
                      {form.tipo === "despesa" && <span className="text-destructive"> *</span>}
                    </Label>
                    <Select
                      value={form.conta_id || "none"}
                      onValueChange={(v) => setForm({ ...form, conta_id: v === "none" ? "" : v })}
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
                </div>
                <div className="space-y-2">
                  <Label>Forma de pagamento</Label>
                  <Select
                    value={form.forma_pagamento || "none"}
                    onValueChange={(v) =>
                      setForm({ ...form, forma_pagamento: v === "none" ? "" : v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      <SelectItem value="dinheiro">Dinheiro</SelectItem>
                      <SelectItem value="pix">Pix</SelectItem>
                      <SelectItem value="cartao_credito">Cartão Crédito</SelectItem>
                      <SelectItem value="cartao_debito">Cartão Débito</SelectItem>
                      <SelectItem value="boleto">Boleto</SelectItem>
                      <SelectItem value="convenio">Convênio</SelectItem>
                      <SelectItem value="transferencia">Transferência</SelectItem>
                      {form.forma_pagamento &&
                        ![
                          "dinheiro",
                          "pix",
                          "cartao_credito",
                          "cartao_debito",
                          "boleto",
                          "convenio",
                          "transferencia",
                        ].includes(form.forma_pagamento) && (
                          <SelectItem value={form.forma_pagamento}>
                            {form.forma_pagamento}
                          </SelectItem>
                        )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Observações</Label>
                  <Textarea
                    rows={2}
                    value={form.observacoes}
                    onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                  />
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={saving}
                    onClick={() => void salvarLancamento(true)}
                  >
                    <Printer className="h-4 w-4 mr-2" />
                    {saving ? "Salvando..." : "Salvar e imprimir"}
                  </Button>
                  <Button type="submit" disabled={saving}>
                    {saving ? "Salvando..." : "Salvar"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card
          className="cursor-pointer hover:bg-muted/40 transition"
          onClick={() => setDetalhe("receita")}
        >
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Receitas</p>
            <p className="text-2xl font-semibold text-green-600">{fmt(totais.r)}</p>
            <p className="text-[10px] text-muted-foreground mt-1">Clique para ver detalhes</p>
          </CardContent>
        </Card>
        <Card
          className="cursor-pointer hover:bg-muted/40 transition"
          onClick={() => setDetalhe("despesa")}
        >
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Despesas</p>
            <p className="text-2xl font-semibold text-red-600">{fmt(totais.d)}</p>
            <p className="text-[10px] text-muted-foreground mt-1">Clique para ver detalhes</p>
          </CardContent>
        </Card>
        <Card
          className="cursor-pointer hover:bg-muted/40 transition"
          onClick={() => setDetalhe("saldo")}
        >
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Saldo</p>
            <p
              className={`text-2xl font-semibold ${totais.saldo >= 0 ? "text-green-600" : "text-red-600"}`}
            >
              {fmt(totais.saldo)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">Clique para ver detalhes</p>
          </CardContent>
        </Card>
      </div>

      <Dialog open={detalhe !== null} onOpenChange={(v) => !v && setDetalhe(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {detalhe === "saldo"
                ? `Saldo do período — ${fmt(totais.saldo)}`
                : `${detalhe === "receita" ? "Receitas" : "Despesas"} do período — ${fmt(detalhe === "receita" ? totais.r : totais.d)}`}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-auto">
            {(() => {
              const list =
                detalhe === "saldo" ? displayItems : displayItems.filter((i) => i.tipo === detalhe);
              if (list.length === 0)
                return (
                  <p className="text-sm text-muted-foreground py-6 text-center">Sem lançamentos.</p>
                );
              const catMap = new Map(cats.map((c) => [c.id, c.nome]));
              return (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      {detalhe === "saldo" && <TableHead>Tipo</TableHead>}
                      <TableHead>Descrição</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {list.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="text-sm whitespace-nowrap">
                          {l.data
                            ? l.data.slice(8, 10) +
                              "/" +
                              l.data.slice(5, 7) +
                              "/" +
                              l.data.slice(0, 4) +
                              (l.hora ? " " + l.hora : "")
                            : ""}
                        </TableCell>
                        {detalhe === "saldo" && (
                          <TableCell className="capitalize">{l.tipo}</TableCell>
                        )}
                        <TableCell>{l.descricao}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {l.categoria_id ? (catMap.get(l.categoria_id) ?? "—") : "—"}
                        </TableCell>
                        <TableCell
                          className={`text-right font-medium ${l.tipo === "receita" ? "text-green-600" : "text-red-600"}`}
                        >
                          {fmt(Number(l.valor))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              );
            })()}
          </div>
        </DialogContent>
      </Dialog>

      <Card>
        <CardContent className="pt-6 flex flex-wrap items-end gap-3">
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
            <Label className="text-xs">Tipo</Label>
            <Select value={filterTipo} onValueChange={(v) => setFilterTipo(v as typeof filterTipo)}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="receita">Receitas</SelectItem>
                <SelectItem value="despesa">Despesas</SelectItem>
                <SelectItem value="transferencia">Transferências entre caixas</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Status</Label>
            <Select
              value={filterStatus}
              onValueChange={(v) => setFilterStatus(v as typeof filterStatus)}
            >
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="confirmado">Apenas confirmados</SelectItem>
                <SelectItem value="pendente">Apenas pendentes</SelectItem>
                <SelectItem value="todos">Confirmados + pendentes</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Usuário</Label>
            <Select value={filterUsuario} onValueChange={setFilterUsuario}>
              <SelectTrigger className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os usuários</SelectItem>
                <SelectItem value="sem">Sem usuário</SelectItem>
                {usuarios.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Forma de pagamento</Label>
            <Select value={filterForma} onValueChange={setFilterForma}>
              <SelectTrigger className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas as formas</SelectItem>
                <SelectItem value="dinheiro">Dinheiro</SelectItem>
                <SelectItem value="pix">Pix</SelectItem>
                <SelectItem value="debito">Cartão débito</SelectItem>
                <SelectItem value="credito">Cartão crédito</SelectItem>
                <SelectItem value="cartao">Cartão (qualquer)</SelectItem>
                <SelectItem value="legado">Parcelas do sistema antigo</SelectItem>
                <SelectItem value="boleto">Boleto / Transferência</SelectItem>
                <SelectItem value="sem">Sem informação</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 flex-1 min-w-[220px]">
            <Label className="text-xs">Paciente / descrição</Label>
            <Input
              type="search"
              value={filterPaciente}
              onChange={(e) => setFilterPaciente(e.target.value)}
              placeholder="Buscar por nome do paciente..."
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Valor (R$)</Label>
            <Input
              type="number"
              step="0.01"
              min={0}
              className="w-32"
              value={filterValor}
              onChange={(e) => setFilterValor(e.target.value)}
              placeholder="Ex.: 36,00"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Ficha (referência)</Label>
            <Input
              type="number"
              min={0}
              className="w-32"
              value={filterFicha}
              onChange={(e) => setFilterFicha(e.target.value)}
              placeholder="Nº da ficha"
            />
          </div>
          <div className="flex items-center gap-2 pb-1 ml-auto">
            <Switch
              id="decompor-misto"
              checked={decomporMisto}
              onCheckedChange={setDecomporMisto}
            />
            <Label
              htmlFor="decompor-misto"
              className="text-xs cursor-pointer"
              title="Quando ligado, cada pagamento 'misto' aparece como várias linhas (uma por forma real: dinheiro, cartão, pix…). A soma dos valores é preservada."
            >
              Decompor pagamentos mistos
            </Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-12 text-center text-muted-foreground">Carregando...</div>
          ) : displayItems.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              Nenhum lançamento no período.
            </div>
          ) : (
            <>
              {(() => {
                const totalPages = Math.max(1, Math.ceil(displayItems.length / PAGE_SIZE));
                const currentPage = Math.min(page, totalPages);
                return (
                  <div className="px-4 py-2 text-xs text-muted-foreground bg-muted/30 border-b">
                    Página {currentPage} de {totalPages} —{" "}
                    {displayItems.length.toLocaleString("pt-BR")} linha(s)
                    {decomporMisto ? " (mistos decompostos)" : ""} no período.
                  </div>
                );
              })()}
              {(() => {
                const totalPages2 = Math.max(1, Math.ceil(displayItems.length / PAGE_SIZE));
                const currentPage2 = Math.min(page, totalPages2);
                const paginaAtual = displayItems.slice(
                  (currentPage2 - 1) * PAGE_SIZE,
                  currentPage2 * PAGE_SIZE,
                );
                // Visão em cartões no celular (piloto SFP) — mesmos dados e ações
                // da tabela, só em layout vertical com alvos de toque maiores.
                if (modoMobile) {
                  const userMap = new Map(usuarios.map((u) => [u.id, u.nome]));
                  return (
                    <div>
                      {paginaAtual.map((l) => (
                        <div
                          key={`${l.origem ?? "fin"}:${l.id}`}
                          className="flex items-start gap-3 p-3 border-b last:border-b-0"
                        >
                          <div className="pt-0.5 shrink-0">
                            {l.tipo === "transferencia" ? (
                              <ArrowLeftRight
                                className={`h-4 w-4 ${l.transferSentido === "entrada" ? "text-blue-600" : "text-amber-600"}`}
                              />
                            ) : l.tipo === "receita" ? (
                              <ArrowUpCircle className="h-4 w-4 text-green-600" />
                            ) : (
                              <ArrowDownCircle className="h-4 w-4 text-red-600" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm font-medium truncate">{l.descricao}</p>
                              <span
                                className={`text-sm font-medium whitespace-nowrap shrink-0 ${
                                  l.tipo === "transferencia"
                                    ? l.transferSentido === "entrada"
                                      ? "text-blue-600"
                                      : "text-amber-600"
                                    : l.tipo === "receita"
                                      ? "text-green-600"
                                      : "text-red-600"
                                }`}
                              >
                                <span className="whitespace-nowrap inline-block">
                                  {`${l.tipo === "transferencia" ? (l.transferSentido === "entrada" ? "↑" : "↓") : l.tipo === "receita" ? "+" : "-"}\u00A0${fmt(Number(l.valor))}`}
                                </span>
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                              <span>
                                {l.data
                                  ? l.data.slice(8, 10) +
                                    "/" +
                                    l.data.slice(5, 7) +
                                    "/" +
                                    l.data.slice(0, 4) +
                                    (l.hora ? " " + l.hora : "")
                                  : ""}
                              </span>
                              {l.medico_nome && (
                                <span className="whitespace-nowrap">{l.medico_nome}</span>
                              )}
                              {typeof l.ficha_numero === "number" && (
                                <span>Ficha {String(l.ficha_numero).padStart(3, "0")}</span>
                              )}
                              <span className="whitespace-nowrap">
                                {LABEL_FORMA[baldeDaLinha(l)]}
                              </span>
                              {l.criado_por && (
                                <span className="whitespace-nowrap">
                                  {userMap.get(l.criado_por) ?? "—"}
                                </span>
                              )}
                              <Badge
                                variant={l.status === "confirmado" ? "default" : "secondary"}
                                className="text-[10px] px-1.5 py-0"
                              >
                                {l.status}
                              </Badge>
                            </div>
                            {l.origem !== "caixa" && !l._mistoParte && (
                              <div className="flex items-center gap-1 pt-1 -ml-2">
                                {l.tipo !== "transferencia" ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 px-2 text-xs"
                                    onClick={() => reimprimirRecibo(l)}
                                  >
                                    <Printer className="h-3.5 w-3.5 mr-1" /> Reimprimir
                                  </Button>
                                ) : null}
                                {podeEstornar &&
                                l.tipo !== "transferencia" &&
                                l.status !== "cancelado" ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 px-2 text-xs"
                                    disabled={estornando === l.id}
                                    onClick={() => estornar(l)}
                                  >
                                    <Undo2 className="h-3.5 w-3.5 text-amber-600 mr-1" /> Estornar
                                  </Button>
                                ) : null}
                                {podeEscrever ? (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 px-2 text-xs"
                                      onClick={() => openEdit(l)}
                                    >
                                      <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 px-2 text-xs"
                                      onClick={() => remove(l)}
                                    >
                                      <Trash2 className="h-3.5 w-3.5 text-destructive mr-1" />{" "}
                                      Excluir
                                    </Button>
                                  </>
                                ) : null}
                              </div>
                            )}
                            {l.origem === "caixa" &&
                              !l._mistoParte &&
                              l.caixaTipo === "sangria" &&
                              podeEstornar && (
                                <div className="flex items-center gap-1 pt-1 -ml-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 px-2 text-xs"
                                    onClick={() => setEstornoSangria(l)}
                                  >
                                    <Undo2 className="h-3.5 w-3.5 text-amber-600 mr-1" /> Solicitar
                                    estorno
                                  </Button>
                                </div>
                              )}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                }
                return (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10"></TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead>Médico</TableHead>
                        <TableHead className="text-right">Ficha</TableHead>
                        <TableHead>Forma</TableHead>
                        <TableHead>Usuário</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead className="w-32 text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginaAtual.map((l) => {
                        const userMap = new Map(usuarios.map((u) => [u.id, u.nome]));
                        return (
                          <TableRow key={`${l.origem ?? "fin"}:${l.id}`}>
                            <TableCell>
                              {l.tipo === "transferencia" ? (
                                <ArrowLeftRight
                                  className={`h-4 w-4 ${l.transferSentido === "entrada" ? "text-blue-600" : "text-amber-600"}`}
                                />
                              ) : l.tipo === "receita" ? (
                                <ArrowUpCircle className="h-4 w-4 text-green-600" />
                              ) : (
                                <ArrowDownCircle className="h-4 w-4 text-red-600" />
                              )}
                            </TableCell>
                            <TableCell className="text-sm">
                              {l.data
                                ? l.data.slice(8, 10) +
                                  "/" +
                                  l.data.slice(5, 7) +
                                  "/" +
                                  l.data.slice(0, 4) +
                                  (l.hora ? " " + l.hora : "")
                                : ""}
                            </TableCell>
                            <TableCell>{l.descricao}</TableCell>
                            <TableCell className="text-sm whitespace-nowrap">
                              {l.medico_nome || "—"}
                            </TableCell>
                            <TableCell className="text-sm text-right tabular-nums">
                              {typeof l.ficha_numero === "number"
                                ? String(l.ficha_numero).padStart(3, "0")
                                : "—"}
                            </TableCell>
                            <TableCell
                              className="text-sm whitespace-nowrap"
                              // O texto original fica no tooltip: nos lançamentos
                              // antigos ele é a bandeira (MASTER, MAESTRO…).
                              title={l.forma_pagamento ?? "sem forma registrada"}
                            >
                              {LABEL_FORMA[baldeDaLinha(l)]}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                              {l.criado_por ? (userMap.get(l.criado_por) ?? "—") : "—"}
                            </TableCell>
                            <TableCell>
                              <Badge variant={l.status === "confirmado" ? "default" : "secondary"}>
                                {l.status}
                              </Badge>
                            </TableCell>
                            <TableCell
                              className={`text-right font-medium whitespace-nowrap ${
                                l.tipo === "transferencia"
                                  ? l.transferSentido === "entrada"
                                    ? "text-blue-600"
                                    : "text-amber-600"
                                  : l.tipo === "receita"
                                    ? "text-green-600"
                                    : "text-red-600"
                              }`}
                            >
                              <span className="whitespace-nowrap inline-block">
                                {`${
                                  l.tipo === "transferencia"
                                    ? l.transferSentido === "entrada"
                                      ? "↑"
                                      : "↓"
                                    : l.tipo === "receita"
                                      ? "+"
                                      : "-"
                                }\u00A0${fmt(Number(l.valor))}`}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-0.5">
                                {podeEstornar &&
                                !l._mistoParte &&
                                l.origem !== "caixa" &&
                                l.tipo !== "transferencia" &&
                                l.status !== "cancelado" ? (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    title="Estornar lançamento — mantém o registro no histórico com status 'cancelado' e desvincula o laudo (recomendado para repasses)."
                                    disabled={estornando === l.id}
                                    onClick={() => estornar(l)}
                                  >
                                    <Undo2 className="h-3.5 w-3.5 text-amber-600" />
                                  </Button>
                                ) : null}
                                {podeEstornar &&
                                !l._mistoParte &&
                                l.origem === "caixa" &&
                                l.caixaTipo === "sangria" ? (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    title="Solicitar estorno da sangria — gera pedido para o Financeiro aprovar (compensação por suprimento)."
                                    onClick={() => setEstornoSangria(l)}
                                  >
                                    <Undo2 className="h-3.5 w-3.5 text-amber-600" />
                                  </Button>
                                ) : null}
                                {!l._mistoParte &&
                                l.origem !== "caixa" &&
                                l.tipo !== "transferencia" ? (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    title="Reimprimir recibo — gera a segunda via do comprovante em folha A4. Não altera o lançamento."
                                    onClick={() => reimprimirRecibo(l)}
                                  >
                                    <Printer className="h-3.5 w-3.5" />
                                  </Button>
                                ) : null}
                                {podeEscrever && !l._mistoParte && l.origem !== "caixa" ? (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      title="Editar lançamento — alterar descrição, valor, categoria, conta ou forma de pagamento."
                                      onClick={() => openEdit(l)}
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      title="Excluir lançamento — remove definitivamente do banco (sem histórico). Use apenas para lançamentos criados por engano; para repasses prefira Estornar."
                                      onClick={() => remove(l)}
                                    >
                                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                    </Button>
                                  </>
                                ) : null}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                );
              })()}
              {displayItems.length > PAGE_SIZE
                ? (() => {
                    const totalPages = Math.max(1, Math.ceil(displayItems.length / PAGE_SIZE));
                    const currentPage = Math.min(page, totalPages);
                    return (
                      <div className="flex items-center justify-between gap-2 px-4 py-3 border-t bg-muted/20">
                        <div className="text-xs text-muted-foreground">
                          Mostrando {((currentPage - 1) * PAGE_SIZE + 1).toLocaleString("pt-BR")}
                          {"–"}
                          {Math.min(currentPage * PAGE_SIZE, displayItems.length).toLocaleString(
                            "pt-BR",
                          )}{" "}
                          de {displayItems.length.toLocaleString("pt-BR")}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={currentPage <= 1}
                            onClick={() => setPage(1)}
                          >
                            Primeira
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={currentPage <= 1}
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                          >
                            Anterior
                          </Button>
                          <span className="text-xs px-2">
                            Pág. {currentPage} / {totalPages}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={currentPage >= totalPages}
                            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                          >
                            Próxima
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={currentPage >= totalPages}
                            onClick={() => setPage(totalPages)}
                          >
                            Última
                          </Button>
                        </div>
                      </div>
                    );
                  })()
                : null}
            </>
          )}
        </CardContent>
      </Card>
      <SolicitarEstornoDialog
        open={!!estornoSangria}
        onOpenChange={(v) => {
          if (!v) setEstornoSangria(null);
        }}
        descricao={estornoSangria?.descricao ?? null}
        valor={estornoSangria ? Number(estornoSangria.valor) : null}
        caixaMovimentoId={estornoSangria?.id ?? null}
        onCreated={() => {
          setEstornoSangria(null);
          load();
        }}
      />
      <AlertDialog
        open={!!confirmDel}
        onOpenChange={(v) => {
          if (!v && !deleting) setConfirmDel(null);
        }}
      >
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <Trash2 className="h-4 w-4" />
              </span>
              Excluir lançamento
            </AlertDialogTitle>
            <AlertDialogDescription className="pt-1">
              Esta ação não pode ser desfeita. O lançamento abaixo será removido definitivamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {confirmDel && (
            <div className="rounded-lg border bg-muted/40 p-3 text-sm">
              <p className="font-medium leading-snug">{confirmDel.descricao}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {new Date(`${confirmDel.data}T00:00:00`).toLocaleDateString("pt-BR")} ·{" "}
                {fmt(Number(confirmDel.valor))}
              </p>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                void confirmarExclusao();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={!!confirmEst}
        onOpenChange={(v) => {
          if (!v) setConfirmEst(null);
        }}
      >
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-500/10 text-amber-600">
                <AlertTriangle className="h-4 w-4" />
              </span>
              Confirmar Estorno
            </AlertDialogTitle>
            <AlertDialogDescription className="pt-1">
              O lançamento abaixo será marcado como estornado e o atendimento vinculado voltará a
              ficar pendente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {confirmEst && (
            <div className="space-y-2">
              <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                <p className="font-medium leading-snug">{confirmEst.lanc.descricao}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(`${confirmEst.lanc.data}T00:00:00`).toLocaleDateString("pt-BR")}
                </p>
                <p className="mt-2 text-base font-semibold tabular-nums">
                  {fmt(Number(confirmEst.lanc.valor))}
                </p>
              </div>
              {confirmEst.aviso && (
                <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs leading-relaxed text-amber-700">
                  {confirmEst.aviso}
                </p>
              )}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void executarEstorno();
              }}
              className="bg-amber-600 text-white hover:bg-amber-600/90"
            >
              Confirmar Estorno
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
