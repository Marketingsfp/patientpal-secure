import { createFileRoute } from "@tanstack/react-router";
import { SectionTabs, SERVICOS_TABS, SERVICOS_META } from "@/components/section-tabs";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Plus, Search, Pencil, Trash2, ClipboardList, Sparkles, CreditCard, Download, ArrowUp, ArrowDown, ArrowUpDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { exportToExcel } from "@/lib/export-csv";
import { invalidateAgendaRefs } from "@/lib/agenda/refs-cache";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

import { findRegra, computeValor, type CbRegra } from "@/lib/cb-regras";

export const Route = createFileRoute("/_authenticated/app/procedimentos")({
  component: ProcedimentosPageWithTabs,
  head: () => ({ meta: [{ title: "Catálogo de Serviços — ClinicaOS" }] }),
});

type Tipo = string;
interface Procedimento {
  id: string;
  nome: string;
  grupo: string | null;
  tipo: Tipo;
  codigo: string | null;
  valor_padrao: number;
  valor_dinheiro_pix: number;
  valor_dinheiro: number;
  valor_pix: number;
  valor_cartao: number;
  valor_cartao_credito: number;
  valor_cartao_debito: number;
  valor_cartao_consulta: number;
  valor_cartao_desconto: number;
  duracao_minutos: number;
  observacoes: string | null;
  preparo: string | null;
  ativo: boolean;
  fluxo_atendimento?: string | null;
  agenda_obrigatoria?: boolean | null;
  medico_obrigatorio?: boolean | null;
  sala_obrigatoria?: boolean | null;
  equipamento_obrigatorio?: boolean | null;
  permite_venda_direta?: boolean | null;
  permite_encaixe?: boolean | null;
  tempo_padrao_min?: number | null;
  valor_variavel?: boolean | null;
}
interface Cartao {
  id: string;
  nome: string;
  descricao: string | null;
  percentual_desconto: number;
  ativo: boolean;
}
interface CbConvenio {
  id: string;
  nome: string;
  ativo: boolean;
  acrescimo_cartao_modo?: "percentual" | "valor_fixo" | null;
  acrescimo_cartao_percentual?: number | null;
  acrescimo_cartao_valor?: number | null;
}
interface ConvValor { valor_dinheiro: number; valor_outros: number }
interface CbConvenioRegra {
  id: string;
  convenio_id: string;
  especialidade_id: string | null;
  tipo: string | null;
  modo: "valor_fixo" | "percentual_desconto";
  valor: number | null;
  percentual: number | null;
  prioridade: number;
}

const TIPO_COR_MAP: Record<string, string> = {
  consulta: "bg-primary/10 text-primary",
  exame: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  procedimento: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  cirurgia: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
};
const tipoLabel = (t: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : "");
const tipoCor = (t: string) => TIPO_COR_MAP[t] ?? "bg-muted text-foreground";

const EMPTY = {
  nome: "", grupo: "", tipo: "exame" as Tipo, codigo: "",
  valor_dinheiro: "0", valor_pix_cartao: "0",
  valor_cartao_consulta: "0", valor_cartao_desconto: "0",
  duracao_minutos: "30", observacoes: "", preparo: "", ativo: true,
  // Regras do procedimento (arquitetura de plataforma — fn_regras_procedimento)
  fluxo_atendimento: "consulta_medica",
  agenda_obrigatoria: true,
  medico_obrigatorio: false,
  sala_obrigatoria: false,
  equipamento_obrigatorio: false,
  permite_venda_direta: false,
  permite_encaixe: true,
  tempo_padrao_min: "30",
  valor_variavel: false,
};

const EMPTY_CARTAO = { nome: "", descricao: "", percentual_desconto: "0", ativo: true };

const fmtBRL = (n: number) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const especialidadeKey = (nome?: string | null) =>
  (nome ?? "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const displayEspecialidadeNome = (nome: string) =>
  especialidadeKey(nome) === "ginecologia" ? "Ginecologia" : nome;

// Pacotes pré-prontos de exames por grupo
type PacoteExames = { id: string; label: string; grupo: string; duracao: number; itens: string[] };
const PACOTES_EXAMES: PacoteExames[] = [
  {
    id: "ultrassom",
    label: "Ultrassonografia (todos)",
    grupo: "Ultrassonografia",
    duracao: 30,
    itens: [
      "Ultrassonografia Abdominal Total",
      "Ultrassonografia Abdominal Superior",
      "Ultrassonografia Abdominal Inferior",
      "Ultrassonografia de Rins e Vias Urinárias",
      "Ultrassonografia de Aparelho Urinário",
      "Ultrassonografia de Bexiga com Resíduo Pós-Miccional",
      "Ultrassonografia de Fígado e Vias Biliares",
      "Ultrassonografia de Vesícula Biliar",
      "Ultrassonografia de Pâncreas",
      "Ultrassonografia de Baço",
      "Ultrassonografia de Suprarrenais",
      "Ultrassonografia de Alças Intestinais",
      "Ultrassonografia de Apêndice",
      "Ultrassonografia de Tireoide",
      "Ultrassonografia de Tireoide com Doppler",
      "Ultrassonografia de Paratireoides",
      "Ultrassonografia Cervical",
      "Ultrassonografia Cervical (Linfonodos)",
      "Ultrassonografia de Mama",
      "Ultrassonografia de Mama com Doppler",
      "Ultrassonografia das Axilas",
      "Ultrassonografia Transvaginal",
      "Ultrassonografia Transvaginal com Doppler",
      "Ultrassonografia Transvaginal para Reserva Ovariana",
      "Ultrassonografia Pélvica",
      "Ultrassonografia Pélvica (Ginecológica)",
      "Ultrassonografia Obstétrica",
      "Ultrassonografia Obstétrica Inicial (1º Trimestre)",
      "Ultrassonografia Obstétrica Morfológica 1º Trimestre",
      "Ultrassonografia Obstétrica Morfológica 2º Trimestre",
      "Ultrassonografia Obstétrica com Doppler",
      "Ultrassonografia Obstétrica 3D/4D",
      "Ultrassonografia de Translucência Nucal",
      "Ultrassonografia de Colo Uterino (gestacional)",
      "Perfil Biofísico Fetal",
      "Ultrassonografia Próstata Suprapúbica",
      "Ultrassonografia Próstata Transretal",
      "Ultrassonografia de Bolsa Escrotal",
      "Ultrassonografia de Bolsa Escrotal com Doppler",
      "Ultrassonografia de Testículo",
      "Ultrassonografia de Pênis com Doppler",
      "Ultrassonografia de Glândulas Salivares",
      "Ultrassonografia de Parótidas",
      "Ultrassonografia de Submandibulares",
      "Ultrassonografia de Articulação (Ombro)",
      "Ultrassonografia de Articulação (Joelho)",
      "Ultrassonografia de Articulação (Punho)",
      "Ultrassonografia de Articulação (Cotovelo)",
      "Ultrassonografia de Articulação (Tornozelo)",
      "Ultrassonografia de Articulação (Quadril)",
      "Ultrassonografia de Articulação (Coxofemoral)",
      "Ultrassonografia de Articulação (Mão)",
      "Ultrassonografia de Articulação (Pé)",
      "Ultrassonografia de Articulação Temporomandibular (ATM)",
      "Ultrassonografia de Partes Moles",
      "Ultrassonografia de Partes Moles - Cervical",
      "Ultrassonografia de Partes Moles - Tórax/Parede Torácica",
      "Ultrassonografia de Partes Moles - Abdome/Parede Abdominal",
      "Ultrassonografia de Partes Moles - Dorso",
      "Ultrassonografia de Partes Moles - MMSS (Membro Superior)",
      "Ultrassonografia de Partes Moles - MMII (Membro Inferior)",
      "Ultrassonografia de Partes Moles - Região Glútea",
      "Ultrassonografia de Partes Moles - Couro Cabeludo",
      "Ultrassonografia de Parede Abdominal (Hérnias)",
      "Ultrassonografia de Região Inguinal (Hérnia Inguinal)",
      "Ultrassonografia de Região Inguinal Bilateral",
      "Ultrassonografia de Região Umbilical (Hérnia Umbilical)",
      "Ultrassonografia de Cicatriz Cirúrgica (Hérnia Incisional)",
      "Ultrassonografia de Linfonodos (qualquer cadeia)",
      "Ultrassonografia de Nódulo/Cisto - Punção Guiada",
      "Ultrassonografia Muscular",
      "Ultrassonografia de Tendões",
      "Ultrassonografia de Tendão de Aquiles",
      "Ultrassonografia do Manguito Rotador",
      "Ultrassonografia de Fáscia Plantar",
      "Ultrassonografia de Nervo Periférico",
      "Ultrassonografia de Túnel do Carpo",
      "Ultrassonografia Doppler de Carótidas",
      "Ultrassonografia Doppler Vertebral",
      "Ultrassonografia Doppler Venoso de MMII",
      "Ultrassonografia Doppler Venoso de MMSS",
      "Ultrassonografia Doppler Arterial de MMII",
      "Ultrassonografia Doppler Arterial de MMSS",
      "Ultrassonografia Doppler de Aorta Abdominal",
      "Ultrassonografia Doppler Renal",
      "Ultrassonografia Doppler de Artérias Renais",
      "Ultrassonografia Doppler Portal/Hepático",
      "Ultrassonografia Doppler de Fístula Arteriovenosa",
      "Ultrassonografia Pediátrica - Quadril",
      "Ultrassonografia Pediátrica - Transfontanela",
      "Ultrassonografia Pediátrica - Abdome Total",
      "Ultrassonografia Pediátrica - Rins e Vias Urinárias",
      "Ultrassonografia Pediátrica - Pilórica",
      "Ultrassonografia Pediátrica - Coluna (RN)",
      "Ultrassonografia de Globo Ocular",
      "Ultrassonografia de Mamas (Masculina/Ginecomastia)",
    ],
  },
  {
    id: "tomografia",
    label: "Tomografia (TC)",
    grupo: "Tomografia",
    duracao: 20,
    itens: [
      "Tomografia de Crânio",
      "Tomografia de Seios da Face",
      "Tomografia de Pescoço",
      "Tomografia de Tórax",
      "Tomografia de Abdome Superior",
      "Tomografia de Abdome Total",
      "Tomografia de Pelve",
      "Tomografia de Coluna Cervical",
      "Tomografia de Coluna Torácica",
      "Tomografia de Coluna Lombar",
      "Tomografia de Articulação (Ombro)",
      "Tomografia de Articulação (Joelho)",
      "Tomografia de Articulação (Quadril)",
      "Angiotomografia de Aorta",
      "Angiotomografia de Carótidas",
      "Angiotomografia Coronariana",
      "Tomografia de Tórax de Alta Resolução",
      "Tomografia de Mastoides",
    ],
  },
  {
    id: "rx",
    label: "Raio-X (RX)",
    grupo: "Raio-X",
    duracao: 15,
    itens: [
      "RX de Tórax (PA e Perfil)",
      "RX de Tórax (AP)",
      "RX de Abdome Simples",
      "RX de Abdome Agudo (3 incidências)",
      "RX de Crânio",
      "RX de Seios da Face",
      "RX de Coluna Cervical",
      "RX de Coluna Torácica",
      "RX de Coluna Lombossacra",
      "RX de Bacia",
      "RX de Ombro",
      "RX de Cotovelo",
      "RX de Punho",
      "RX de Mão",
      "RX de Dedos",
      "RX de Quadril",
      "RX de Joelho",
      "RX de Tornozelo",
      "RX de Pé",
      "RX Panorâmico de MMII",
      "RX Escanometria de MMII",
    ],
  },
  {
    id: "cardio",
    label: "Exames Cardiológicos",
    grupo: "Cardiologia",
    duracao: 30,
    itens: [
      "Eletrocardiograma (ECG)",
      "Teste Ergométrico",
      "Ecocardiograma Transtorácico",
      "Ecocardiograma com Doppler",
      "Ecocardiograma Transesofágico",
      "Ecocardiograma de Estresse",
      "Ecocardiograma Fetal",
      "Holter 24h",
      "Holter 48h",
      "MAPA - Monitorização Ambulatorial da Pressão Arterial",
      "Tilt Test",
      "Estudo Eletrofisiológico",
      "Consulta Cardiológica",
    ],
  },
  {
    id: "endoscopia",
    label: "Endoscopia / Colonoscopia",
    grupo: "Endoscopia",
    duracao: 40,
    itens: [
      "Endoscopia Digestiva Alta",
      "Endoscopia Digestiva Alta com Biópsia",
      "Colonoscopia",
      "Colonoscopia com Polipectomia",
      "Retossigmoidoscopia",
    ],
  },
  {
    id: "mamografia",
    label: "Mamografia / Densitometria",
    grupo: "Mamografia",
    duracao: 20,
    itens: [
      "Mamografia Bilateral",
      "Mamografia Diagnóstica",
      "Densitometria Óssea Coluna e Fêmur",
      "Densitometria Óssea Corpo Total",
    ],
  },
];

function ProcedimentosPage() {
  const { clinicaAtual } = useClinica();
  const podeEscrever = usePodeEscrever("procedimentos");

  // ----- Procedimentos -----
  const [items, setItems] = useState<Procedimento[]>([]);
  const [busca, setBusca] = useState("");
  const [filtroGrupo, setFiltroGrupo] = useState<string>("todos");
  const [filtroTipo, setFiltroTipo] = useState<"todos" | Tipo>("todos");
  const [filtroSituacao, setFiltroSituacao] = useState<"todos" | "ativos" | "inativos">("ativos");
  // Valores aplicados (só mudam ao clicar em Pesquisar)
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [grupoAplicado, setGrupoAplicado] = useState<string>("todos");
  const [tipoAplicado, setTipoAplicado] = useState<"todos" | Tipo>("todos");
  const [situacaoAplicada, setSituacaoAplicada] = useState<"todos" | "ativos" | "inativos">("ativos");
  // Ordenação
  type SortCol = "nome" | "grupo" | "tipo";
  const [sort, setSort] = useState<{ col: SortCol; dir: "asc" | "desc" } | null>(null);
  // Paginação
  const PAGE_SIZE = 50;
  const [pagina, setPagina] = useState(1);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Procedimento | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  // Confirmação de cadastro com nome duplicado
  const [dupConflitos, setDupConflitos] = useState<
    { id: string; nome: string; especialidades: string[]; valor: number }[]
  >([]);
  const [pendingPayload, setPendingPayload] = useState<any | null>(null);
  const [tipos, setTipos] = useState<{ id: string; nome: string }[]>([]);
  const [openTipoPicker, setOpenTipoPicker] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase
        .from("tipos_servico")
        .select("id,nome")
        .eq("ativo", true)
        .order("nome");
      if (error) { mostrarErro(error); return; }
      setTipos((data ?? []) as { id: string; nome: string }[]);
    })();
  }, []);
  const [especialidades, setEspecialidades] = useState<{ id: string; nome: string }[]>([]);
  // Map: procedimento_id -> Set de especialidade_id vinculadas
  const [vincEspMap, setVincEspMap] = useState<Map<string, Set<string>>>(new Map());
  // Especialidades marcadas no diálogo (apenas para tipo === 'consulta')
  const [formEspIds, setFormEspIds] = useState<string[]>([]);
  const loadEspecialidades = async () => {
    const { data, error } = await supabase
      .from("especialidades")
      .select("id,nome")
      .eq("ativo", true)
      .order("nome");
    if (error) { mostrarErro(error); return; }
    setEspecialidades((data ?? []) as { id: string; nome: string }[]);
  };
  useEffect(() => {
    void loadEspecialidades();
  }, []);

  const loadVincEsp = async () => {
    if (!clinicaAtual) return;
    const { data, error } = await supabase
      .from("procedimento_especialidades")
      .select("procedimento_id,especialidade_id")
      .eq("clinica_id", clinicaAtual.clinica_id);
    if (error) { mostrarErro(error); return; }
    const m = new Map<string, Set<string>>();
    (data ?? []).forEach((r: any) => {
      if (!m.has(r.procedimento_id)) m.set(r.procedimento_id, new Set());
      m.get(r.procedimento_id)!.add(r.especialidade_id);
    });
    setVincEspMap(m);
  };

  const load = async () => {
    if (!clinicaAtual) return;
    setLoading(true);
    const pageSize = 1000;
    let from = 0;
    const all: any[] = [];
    while (true) {
      const { data, error } = await supabase
        .from("procedimentos")
        .select("*")
        .eq("clinica_id", clinicaAtual.clinica_id)
        .order("grupo", { ascending: true, nullsFirst: false })
        .order("nome")
        .range(from, from + pageSize - 1);
      if (error) { setLoading(false); mostrarErro(error); return; }
      all.push(...(data ?? []));
      if (!data || data.length < pageSize) break;
      from += pageSize;
    }
    setLoading(false);
    setItems(all as any);
  };

  // ----- Cartões -----
  const [cartoes, setCartoes] = useState<Cartao[]>([]);
  const [openCartao, setOpenCartao] = useState(false);
  const [editingCartao, setEditingCartao] = useState<Cartao | null>(null);
  const [formCartao, setFormCartao] = useState(EMPTY_CARTAO);

  const loadCartoes = async () => {
    if (!clinicaAtual) return;
    const { data, error } = await supabase
      .from("cartoes_convenio")
      .select("*")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .order("nome");
    if (error) { mostrarErro(error); return; }
    setCartoes((data ?? []) as any);
  };

  // ----- Convênios Cartão Benefícios + valores por (procedimento, convênio) -----
  const [convenios, setConvenios] = useState<CbConvenio[]>([]);
  // Map: `${procedimento_id}::${convenio_id}` -> ConvValor
  const [convValores, setConvValores] = useState<Map<string, ConvValor>>(new Map());
  // Formulário do diálogo: convenio_id -> { dinheiro, outros } (strings)
  const [formConvValores, setFormConvValores] = useState<Record<string, { dinheiro: string; outros: string }>>({});
  // Convenios cujo valor foi editado manualmente no diálogo (não recalcula automaticamente).
  const [formConvManual, setFormConvManual] = useState<Record<string, boolean>>({});
  // Regras de preço por convênio
  const [regras, setRegras] = useState<CbRegra[]>([]);

  const loadConvenios = async () => {
    if (!clinicaAtual) return;
    const { data, error } = await (supabase as any)
      .from("cb_convenios")
      .select("id,nome,ativo")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .eq("ativo", true)
      .order("nome");
    if (error) { mostrarErro(error); return; }
    setConvenios((data ?? []) as CbConvenio[]);
  };

  const loadConvValores = async () => {
    if (!clinicaAtual) return;
    const m = new Map<string, ConvValor>();
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await (supabase as any)
        .from("procedimento_cb_convenio_valores")
        .select("procedimento_id,convenio_id,valor_dinheiro,valor_outros")
        .eq("clinica_id", clinicaAtual.clinica_id)
        .range(from, from + PAGE - 1);
      if (error) { mostrarErro(error); return; }
      const rows = (data ?? []) as any[];
      rows.forEach((r) => {
        m.set(`${r.procedimento_id}::${r.convenio_id}`, {
          valor_dinheiro: Number(r.valor_dinheiro) || 0,
          valor_outros: Number(r.valor_outros) || 0,
        });
      });
      if (rows.length < PAGE) break;
    }
    setConvValores(m);
  };

  const loadRegras = async () => {
    if (!clinicaAtual) return;
    const { data, error } = await (supabase as any)
      .from("cb_convenio_regras")
      .select("id,convenio_id,especialidade_id,procedimento_id,tipo,modo,valor,valor_cartao,percentual,percentual_cartao,prioridade,ativo")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .eq("ativo", true);
    if (error) { mostrarErro(error); return; }
    setRegras((data ?? []) as CbRegra[]);
  };

  useEffect(() => {
    void load();
    void loadCartoes();
    void loadVincEsp();
    void loadConvenios();
    void loadConvValores();
    void loadRegras();
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [clinicaAtual?.clinica_id]);

  // ---- Auto-preenchimento dos valores por convênio a partir das regras ----
  // Recalcula APENAS quando os valores base (Dinheiro / Pix·Déb·Créd) mudam.
  // Mudar especialidade ou tipo NÃO recalcula. Convenios marcados como manuais
  // (qualquer edição feita pelo usuário) também ficam intactos.
  useEffect(() => {
    if (!open || convenios.length === 0) return;
    const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const espId = form.grupo
      ? (especialidades.find(e => norm(e.nome) === norm(form.grupo))?.id ?? null)
      : null;
    const baseDin = Number(form.valor_dinheiro) || 0;
    const baseOut = Number(form.valor_pix_cartao) || 0;
    setFormConvValores(prev => {
      const next = { ...prev };
      for (const c of convenios) {
        if (formConvManual[c.id]) continue;
        const regrasDoConv = regras.filter(r => r.convenio_id === c.id);
        const r = findRegra(regrasDoConv, espId, form.tipo, editing?.id ?? null);
        const calc = computeValor(r, baseDin, baseOut);
        if (calc) {
          next[c.id] = { dinheiro: calc.dinheiro.toFixed(2), outros: calc.outros.toFixed(2) };
        } else if (!prev[c.id]) {
          next[c.id] = { dinheiro: "0", outros: "0" };
        }
      }
      return next;
    });
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [open, form.valor_dinheiro, form.valor_pix_cartao, regras, convenios]);

  const grupos = useMemo(() => {
    const s = new Set<string>();
    items.forEach(p => { if (p.grupo) s.add(p.grupo); });
    return Array.from(s).sort();
  }, [items]);

  const filtrados = useMemo(() => {
    const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const q = norm(buscaAplicada.trim());
    const espIdByNome = new Map<string, string>();
    especialidades.forEach(e => espIdByNome.set(norm(e.nome), e.id));
    const espIdFiltro = grupoAplicado !== "todos" ? espIdByNome.get(norm(grupoAplicado)) : undefined;
    return items.filter(p => {
      if (tipoAplicado !== "todos" && p.tipo !== tipoAplicado) return false;
      if (situacaoAplicada === "ativos" && !p.ativo) return false;
      if (situacaoAplicada === "inativos" && p.ativo) return false;
      if (grupoAplicado !== "todos") {
        const matchGrupo = norm(p.grupo ?? "") === norm(grupoAplicado);
        const extras = vincEspMap.get(p.id);
        const matchExtra = !!espIdFiltro && !!extras && extras.has(espIdFiltro);
        if (!matchGrupo && !matchExtra) return false;
      }
      if (q && !norm(p.nome).includes(q) && !norm(p.codigo ?? "").includes(q) && !norm(p.grupo ?? "").includes(q)) return false;
      return true;
    });
  }, [items, buscaAplicada, tipoAplicado, grupoAplicado, situacaoAplicada, vincEspMap, especialidades]);

  const ordenados = useMemo(() => {
    if (!sort) return filtrados;
    const cmp = (a: string, b: string) =>
      a.localeCompare(b, "pt-BR", { sensitivity: "base" });
    const get = (p: Procedimento): string => {
      if (sort.col === "nome") return p.nome ?? "";
      if (sort.col === "grupo") return p.grupo ?? "";
      return tipoLabel(p.tipo ?? "");
    };
    const arr = [...filtrados].sort((a, b) => {
      const va = get(a), vb = get(b);
      // vazios sempre ao fim
      if (!va && vb) return 1;
      if (va && !vb) return -1;
      const r = cmp(va, vb);
      return sort.dir === "asc" ? r : -r;
    });
    return arr;
  }, [filtrados, sort]);

  const totalPaginas = Math.max(1, Math.ceil(ordenados.length / PAGE_SIZE));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const visiveis = ordenados.slice((paginaAtual - 1) * PAGE_SIZE, paginaAtual * PAGE_SIZE);
  const grupoSelecionadoKey = form.grupo ? especialidadeKey(form.grupo) : "__none__";
  const grupoExisteNasEspecialidades = especialidades.some(e => especialidadeKey(e.nome) === grupoSelecionadoKey);

  const getConvValorExibicao = (p: Procedimento, c: CbConvenio): ConvValor => {
    // Fonte única: sempre calcula a partir da regra viva (cb_convenio_regras).
    // O cache procedimento_cb_convenio_valores continua sendo gravado pelo
    // "Reaplicar", mas nunca é lido aqui — evita divergência entre o valor
    // exibido nesta grade e o valor cobrado na Agenda quando o operador
    // altera uma regra sem reaplicar.
    const espId = p.grupo
      ? (especialidades.find(e => especialidadeKey(e.nome) === especialidadeKey(p.grupo))?.id ?? null)
      : null;
    const regra = findRegra(regras.filter(r => r.convenio_id === c.id), espId, p.tipo, p.id);
    const calculado = computeValor(
      regra,
      Number(p.valor_dinheiro ?? p.valor_dinheiro_pix ?? p.valor_padrao ?? 0),
      Number(p.valor_pix ?? p.valor_cartao_credito ?? p.valor_cartao_debito ?? p.valor_cartao ?? 0),
    );
    if (calculado) {
      return { valor_dinheiro: calculado.dinheiro, valor_outros: calculado.outros };
    }
    // Fallback: se não há regra, mas há valor manual salvo em cache
    // (origem='manual' pelo cadastro individual), respeita o manual.
    const salvo = convValores.get(`${p.id}::${c.id}`);
    return salvo ?? { valor_dinheiro: 0, valor_outros: 0 };
  };

  // Reset de página quando filtros aplicados ou ordenação mudam
  useEffect(() => { setPagina(1); }, [buscaAplicada, tipoAplicado, grupoAplicado, situacaoAplicada, sort]);

  // Aplica filtros automaticamente ao digitar/alterar (com debounce na busca)
  useEffect(() => {
    const t = setTimeout(() => {
      setBuscaAplicada(busca);
      setGrupoAplicado(filtroGrupo);
      setTipoAplicado(filtroTipo);
      setSituacaoAplicada(filtroSituacao);
    }, 200);
    return () => clearTimeout(t);
  }, [busca, filtroGrupo, filtroTipo, filtroSituacao]);

  const aplicarFiltros = () => {
    setBuscaAplicada(busca);
    setGrupoAplicado(filtroGrupo);
    setTipoAplicado(filtroTipo);
    setSituacaoAplicada(filtroSituacao);
  };
  const limparFiltros = () => {
    setBusca(""); setFiltroGrupo("todos"); setFiltroTipo("todos"); setFiltroSituacao("ativos");
    setBuscaAplicada(""); setGrupoAplicado("todos"); setTipoAplicado("todos"); setSituacaoAplicada("ativos");
  };
  const toggleSort = (col: SortCol) => {
    setSort(prev => {
      if (!prev || prev.col !== col) return { col, dir: "asc" };
      if (prev.dir === "asc") return { col, dir: "desc" };
      return null;
    });
  };
  const SortIcon = ({ col }: { col: SortCol }) => {
    if (!sort || sort.col !== col) return <ArrowUpDown className="h-3 w-3 opacity-50" />;
    return sort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };

  const openNew = () => {
    setOpenTipoPicker(true);
  };
  const startNewComTipo = (tipo: Tipo) => {
    void loadEspecialidades();
    setEditing(null);
    setForm({ ...EMPTY, tipo });
    setFormEspIds([]);
    setFormConvValores(
      Object.fromEntries(convenios.map(c => [c.id, { dinheiro: "0", outros: "0" }])),
    );
    setFormConvManual({});
    setOpenTipoPicker(false);
    setOpen(true);
  };
  const openEdit = (p: Procedimento) => {
    void loadEspecialidades();
    setEditing(p);
    setFormEspIds(Array.from(vincEspMap.get(p.id) ?? []));
    setFormConvValores(
      Object.fromEntries(
        convenios.map(c => {
          const v = convValores.get(`${p.id}::${c.id}`);
          return [c.id, {
            dinheiro: String(v?.valor_dinheiro ?? 0),
            outros: String(v?.valor_outros ?? 0),
          }];
        }),
      ),
    );
    // Ao editar, considera valores existentes como manuais — não sobrescreve.
    setFormConvManual(Object.fromEntries(convenios.map(c => {
      const v = convValores.get(`${p.id}::${c.id}`);
      return [c.id, !!(v && (v.valor_dinheiro || v.valor_outros))];
    })));
    setForm({
      nome: p.nome, grupo: p.grupo ?? "", tipo: p.tipo, codigo: p.codigo ?? "",
      valor_dinheiro: String(p.valor_dinheiro ?? p.valor_dinheiro_pix ?? p.valor_padrao ?? 0),
      valor_pix_cartao: String(
        p.valor_cartao_credito ?? p.valor_cartao_debito ?? p.valor_cartao ?? p.valor_pix ?? 0
      ),
      valor_cartao_consulta: String(p.valor_cartao_consulta ?? 0),
      valor_cartao_desconto: String(p.valor_cartao_desconto ?? 0),
      duracao_minutos: String(p.duracao_minutos), observacoes: p.observacoes ?? "", preparo: p.preparo ?? "", ativo: p.ativo,
      fluxo_atendimento: p.fluxo_atendimento ?? "consulta_medica",
      agenda_obrigatoria: p.agenda_obrigatoria ?? true,
      medico_obrigatorio: p.medico_obrigatorio ?? false,
      sala_obrigatoria: p.sala_obrigatoria ?? false,
      equipamento_obrigatorio: p.equipamento_obrigatorio ?? false,
      permite_venda_direta: p.permite_venda_direta ?? false,
      permite_encaixe: p.permite_encaixe ?? true,
      tempo_padrao_min: String(p.tempo_padrao_min ?? p.duracao_minutos ?? 30),
      valor_variavel: !!p.valor_variavel,
    });
    setOpen(true);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!clinicaAtual) return;
    if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
    if (!form.nome.trim()) { toast.error("Informe o nome."); return; }
    const isVariavel = !!form.valor_variavel;
    const vDinheiro = isVariavel ? 0 : (Number(form.valor_dinheiro) || 0);
    const vCartao = isVariavel ? 0 : (Number(form.valor_pix_cartao) || 0);
    const payload = {
      clinica_id: clinicaAtual.clinica_id,
      nome: form.nome.trim(),
      grupo: form.grupo.trim() || null,
      tipo: form.tipo,
      codigo: form.codigo.trim() || null,
      valor_padrao: vDinheiro, // mantém compatibilidade com agenda/financeiro
      valor_dinheiro: vDinheiro,
      valor_dinheiro_pix: vDinheiro, // legado
      valor_pix: vCartao,
      valor_cartao_credito: vCartao,
      valor_cartao_debito: vCartao,
      valor_cartao: vCartao, // legado
      valor_cartao_consulta: isVariavel ? 0 : (Number(form.valor_cartao_consulta) || 0),
      valor_cartao_desconto: isVariavel ? 0 : (Number(form.valor_cartao_desconto) || 0),
      duracao_minutos: Math.max(0, Number(form.duracao_minutos) || 0),
      observacoes: form.observacoes.trim() || null,
      preparo: form.preparo.trim() || null,
      ativo: form.ativo,
      valor_variavel: isVariavel,
      // Regras do procedimento (configuração > código)
      fluxo_atendimento: form.fluxo_atendimento || null,
      agenda_obrigatoria: !!form.agenda_obrigatoria,
      medico_obrigatorio: !!form.medico_obrigatorio,
      sala_obrigatoria: !!form.sala_obrigatoria,
      equipamento_obrigatorio: !!form.equipamento_obrigatorio,
      permite_venda_direta: !!form.permite_venda_direta,
      permite_encaixe: !!form.permite_encaixe,
      tempo_padrao_min: Math.max(0, Number(form.tempo_padrao_min) || 30),
    };
    // Ao criar (não editar), verifica se já existe procedimento com o mesmo nome
    // nesta clínica e pergunta antes de cadastrar.
    if (!editing) {
      const normalizado = payload.nome.trim().toUpperCase();
      const conflitos = items
        .filter(p => (p.nome ?? "").trim().toUpperCase() === normalizado)
        .map(p => {
          const espIds = vincEspMap.get(p.id);
          const espNomes = espIds
            ? especialidades.filter(e => espIds.has(e.id)).map(e => e.nome)
            : [];
          return {
            id: p.id,
            nome: p.nome,
            especialidades: espNomes.length > 0 ? espNomes : (p.grupo ? [p.grupo] : []),
            valor: Number(p.valor_dinheiro ?? p.valor_padrao ?? 0),
          };
        });
      if (conflitos.length > 0) {
        setDupConflitos(conflitos);
        setPendingPayload(payload);
        return;
      }
    }
    await executarSalvar(payload);
  };

  const executarSalvar = async (payload: any) => {
    if (!clinicaAtual) return;
    if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
    setSaving(true);
    let procId = editing?.id;
    if (editing) {
      // Ao atualizar não devemos sobrescrever clinica_id — isso poderia violar
      // o índice único (clinica_id, upper(btrim(nome))) caso a clínica do
      // registro original seja diferente da clínica atualmente selecionada.
      const { clinica_id: _ignoreClinica, ...updatePayload } = payload;
      const { error } = await supabase.from("procedimentos").update(updatePayload).eq("id", editing.id);
      if (error) { setSaving(false); mostrarErro(error); return; }
    } else {
      const { data, error } = await supabase.from("procedimentos").insert(payload).select("id").single();
      if (error) { setSaving(false); mostrarErro(error); return; }
      procId = data?.id;
    }
    // Sincroniza vínculos N:N de especialidades (todos os tipos)
    if (procId) {
      await supabase.from("procedimento_especialidades").delete().eq("procedimento_id", procId);
      if (formEspIds.length > 0) {
        const rows = formEspIds.map(eid => ({
          procedimento_id: procId!,
          especialidade_id: eid,
          clinica_id: clinicaAtual.clinica_id,
        }));
        const { error: errVinc } = await supabase.from("procedimento_especialidades").insert(rows);
        if (errVinc) { setSaving(false); mostrarErro(errVinc); return; }
      }
    }
    // Sincroniza valores por convênio (cartão benefícios)
    if (procId && convenios.length > 0) {
      const rows = convenios
        .map(c => {
          const v = formConvValores[c.id] ?? { dinheiro: "0", outros: "0" };
          return {
            clinica_id: clinicaAtual.clinica_id,
            procedimento_id: procId!,
            convenio_id: c.id,
            valor_dinheiro: Number(v.dinheiro) || 0,
            valor_outros: Number(v.outros) || 0,
            // Digitado à mão no cadastro do serviço — "Reaplicar regras" (cartão
            // benefícios) preserva linhas origem='manual' e só limpa/recalcula
            // as origem='regra'.
            origem: "manual",
          };
        });
      const { error: errConv } = await (supabase as any)
        .from("procedimento_cb_convenio_valores")
        .upsert(rows, { onConflict: "procedimento_id,convenio_id" });
      if (errConv) { setSaving(false); mostrarErro(errConv); return; }
    }
    setSaving(false);
    toast.success(editing ? "Atualizado." : "Cadastrado.");
    setOpen(false);
    invalidateAgendaRefs(clinicaAtual.clinica_id);
    void load();
    void loadVincEsp();
    void loadConvValores();
  };

  const onDelete = async (p: Procedimento) => {
    if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
    if (!confirm(`Excluir ${p.nome}?`)) return;
    const { error } = await supabase.from("procedimentos").delete().eq("id", p.id);
    if (error) { mostrarErro(error); return; }
    toast.success("Excluído.");
    if (clinicaAtual) invalidateAgendaRefs(clinicaAtual.clinica_id);
    void load();
  };

  const seedPacote = async (pacote: PacoteExames) => {
    if (!clinicaAtual) return;
    if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
    setSeeding(true);
    const { data: existentes } = await supabase
      .from("procedimentos")
      .select("nome")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .eq("grupo", pacote.grupo);
    const existSet = new Set((existentes ?? []).map((r: any) => String(r.nome).toLowerCase()));
    const novos = pacote.itens
      .filter(n => !existSet.has(n.toLowerCase()))
      .map(nome => ({
        clinica_id: clinicaAtual.clinica_id,
        nome, grupo: pacote.grupo, tipo: "exame" as Tipo,
        valor_padrao: 0, valor_dinheiro_pix: 0, valor_cartao: 0,
        valor_cartao_consulta: 0, valor_cartao_desconto: 0,
        duracao_minutos: pacote.duracao, ativo: true,
      }));
    if (novos.length === 0) {
      toast.info(`Todos os exames de ${pacote.grupo} já estão cadastrados.`);
      setSeeding(false); return;
    }
    const { error } = await supabase.from("procedimentos").insert(novos);
    setSeeding(false);
    if (error) { mostrarErro(error); return; }
    toast.success(`${novos.length} exames de ${pacote.grupo} cadastrados. Ajuste os valores em cada um.`);
    void load();
  };

  const seedTodosPacotes = async () => {
    for (const p of PACOTES_EXAMES) {
      // eslint-disable-next-line no-await-in-loop
      await seedPacote(p);
    }
  };

  const seedCartoesPadrao = async () => {
    if (!clinicaAtual) return;
    const nomes = new Set(cartoes.map(c => c.nome.toLowerCase()));
    const novos = [
      { nome: "Cartão Consulta", descricao: "Cartão de benefício para consultas", percentual_desconto: 0 },
      { nome: "Cartão Desconto", descricao: "Cartão de benefício com desconto em exames", percentual_desconto: 0 },
    ]
      .filter(c => !nomes.has(c.nome.toLowerCase()))
      .map(c => ({ ...c, ativo: true, clinica_id: clinicaAtual.clinica_id }));
    if (novos.length === 0) { toast.info("Cartões padrão já cadastrados."); return; }
    const { error } = await supabase.from("cartoes_convenio").insert(novos);
    if (error) { mostrarErro(error); return; }
    toast.success("Cartões cadastrados.");
    void loadCartoes();
  };

  const openNewCartao = () => { setEditingCartao(null); setFormCartao(EMPTY_CARTAO); setOpenCartao(true); };
  const openEditCartao = (c: Cartao) => {
    setEditingCartao(c);
    setFormCartao({
      nome: c.nome, descricao: c.descricao ?? "",
      percentual_desconto: String(c.percentual_desconto ?? 0), ativo: c.ativo,
    });
    setOpenCartao(true);
  };
  const onSubmitCartao = async (e: FormEvent) => {
    e.preventDefault();
    if (!clinicaAtual) return;
    if (!formCartao.nome.trim()) { toast.error("Informe o nome."); return; }
    const payload = {
      clinica_id: clinicaAtual.clinica_id,
      nome: formCartao.nome.trim(),
      descricao: formCartao.descricao.trim() || null,
      percentual_desconto: Number(formCartao.percentual_desconto) || 0,
      ativo: formCartao.ativo,
    };
    const { error } = editingCartao
      ? await supabase.from("cartoes_convenio").update(payload).eq("id", editingCartao.id)
      : await supabase.from("cartoes_convenio").insert(payload);
    if (error) { mostrarErro(error); return; }
    toast.success(editingCartao ? "Cartão atualizado." : "Cartão cadastrado.");
    setOpenCartao(false);
    void loadCartoes();
  };
  const onDeleteCartao = async (c: Cartao) => {
    if (!confirm(`Excluir ${c.nome}?`)) return;
    const { error } = await supabase.from("cartoes_convenio").delete().eq("id", c.id);
    if (error) { mostrarErro(error); return; }
    toast.success("Excluído.");
    void loadCartoes();
  };

  return (
    <div className="space-y-6">
      {/* ============ SERVIÇOS (unificado) ============ */}
      <div className="space-y-4 pt-4 pb-16">
          <div className="flex flex-wrap gap-2 justify-end">
            {podeEscrever && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" disabled={seeding}>
                    <Sparkles className="h-4 w-4 mr-2" />
                    {seeding ? "Cadastrando…" : "Carregar pacote de exames"}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuLabel>Pacotes prontos</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {PACOTES_EXAMES.map(p => (
                    <DropdownMenuItem key={p.id} onClick={() => seedPacote(p)}>
                      <span className="font-medium">{p.label}</span>
                      <span className="ml-auto text-xs text-muted-foreground">{p.itens.length}</span>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={seedTodosPacotes}>
                    <Sparkles className="h-4 w-4 mr-2 text-primary" />
                    Carregar todos os pacotes
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button
              variant="outline"
              onClick={() => {
                if (!filtrados.length) { toast.info("Sem dados para exportar."); return; }
                exportToExcel(
                  filtrados.map((p) => ({
                    nome: p.nome,
                    grupo: p.grupo ?? "",
                    tipo: tipoLabel(p.tipo),
                    codigo: p.codigo ?? "",
                    dinheiro: Number(p.valor_dinheiro ?? p.valor_dinheiro_pix ?? 0).toFixed(2),
                    cartao: Number(p.valor_cartao_credito ?? p.valor_cartao_debito ?? p.valor_cartao ?? 0).toFixed(2),
                    duracao: p.duracao_minutos,
                    preparo: p.preparo ?? "",
                    ativo: p.ativo ? "Sim" : "Não",
                  })),
                  `servicos-${new Date().toISOString().slice(0, 10)}`,
                  [
                    { key: "nome", label: "Nome" },
                    { key: "grupo", label: "Especialidade" },
                    { key: "tipo", label: "Categoria" },
                    { key: "codigo", label: "Código" },
                    { key: "dinheiro", label: "Dinheiro (R$)" },
                    { key: "cartao", label: "Cartão (R$)" },
                    { key: "duracao", label: "Duração (min)" },
                    { key: "preparo", label: "Preparo" },
                    { key: "ativo", label: "Ativo" },
                  ],
                );
              }}
            >
              <Download className="h-4 w-4 mr-2" /> Exportar Excel
            </Button>
            {podeEscrever && (
              <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" /> Novo</Button>
            )}
          </div>

          <div className="rounded-lg border border-border bg-card p-4 flex flex-wrap gap-3">
            <Select value={filtroGrupo} onValueChange={setFiltroGrupo}>
              <SelectTrigger className="w-56"><SelectValue placeholder="Especialidade" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Especialidades</SelectItem>
                {especialidades.map(e => <SelectItem key={e.id} value={e.nome}>{e.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filtroTipo} onValueChange={(v) => setFiltroTipo(v as typeof filtroTipo)}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Categorias</SelectItem>
                {tipos.map(t => (
                  <SelectItem key={t.id} value={t.nome}>{tipoLabel(t.nome)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filtroSituacao} onValueChange={(v) => setFiltroSituacao(v as typeof filtroSituacao)}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Situação" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ativos">Ativos</SelectItem>
                <SelectItem value="inativos">Inativos</SelectItem>
                <SelectItem value="todos">Todos</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); aplicarFiltros(); } }}
                placeholder="Serviço"
                className="pl-9"
              />
            </div>
            <Button onClick={aplicarFiltros}><Search className="h-4 w-4 mr-2" />Pesquisar</Button>
            <Button variant="outline" onClick={limparFiltros}>Limpar</Button>
          </div>

          <div className="rounded-lg border border-border bg-card overflow-x-auto">
            <Table className="[&_td]:py-1 [&_td]:px-2 [&_th]:py-1.5 [&_th]:px-2 text-sm">
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="w-44">
                    <button type="button" onClick={() => toggleSort("grupo")} className="inline-flex items-center gap-1 hover:text-foreground">
                      Especialidade <SortIcon col="grupo" />
                    </button>
                  </TableHead>
                  <TableHead className="w-24">
                    <button type="button" onClick={() => toggleSort("tipo")} className="inline-flex items-center gap-1 hover:text-foreground">
                      Categoria <SortIcon col="tipo" />
                    </button>
                  </TableHead>
                  <TableHead>
                    <button type="button" onClick={() => toggleSort("nome")} className="inline-flex items-center gap-1 hover:text-foreground">
                      Serviço <SortIcon col="nome" />
                    </button>
                  </TableHead>
                  <TableHead className="w-24 text-right">Dinheiro</TableHead>
                  <TableHead className="w-28 text-right">Pix / Débito / Crédito</TableHead>
                  {convenios.map(c => (
                    <TableHead key={c.id} className="w-28 text-right">{c.nome}</TableHead>
                  ))}
                  <TableHead className="w-24">Situação</TableHead>
                  <TableHead className="w-28 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={7 + convenios.length} className="text-center py-8 text-muted-foreground">Carregando…</TableCell></TableRow>
                ) : !clinicaAtual ? (
                  <TableRow><TableCell colSpan={7 + convenios.length} className="text-center py-8 text-muted-foreground">Selecione uma clínica.</TableCell></TableRow>
                ) : filtrados.length === 0 ? (
                  <TableRow><TableCell colSpan={7 + convenios.length} className="text-center py-8 text-muted-foreground">Nenhum serviço.</TableCell></TableRow>
                ) : visiveis.map(p => (
                  <TableRow key={p.id} className="h-8">
                    <TableCell className="text-xs text-muted-foreground">
                      {(() => {
                        const extras = vincEspMap.get(p.id);
                        const nomes = extras
                          ? especialidades.filter(e => extras.has(e.id)).map(e => e.nome)
                          : [];
                        if (p.grupo && !nomes.some(n => n.toLowerCase() === p.grupo!.toLowerCase())) {
                          nomes.unshift(p.grupo);
                        }
                        return nomes.length > 0 ? nomes.join(", ") : "—";
                      })()}
                    </TableCell>
                    <TableCell>
                      <span className={`text-[10px] px-1.5 py-0 rounded-full ${tipoCor(p.tipo)}`}>{tipoLabel(p.tipo)}</span>
                    </TableCell>
                    <TableCell className="font-medium">{p.nome}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {p.valor_variavel
                        ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400">Variável</span>
                        : fmtBRL(Number(p.valor_dinheiro ?? p.valor_dinheiro_pix))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {p.valor_variavel
                        ? <span className="text-muted-foreground">—</span>
                        : fmtBRL(Number(p.valor_pix ?? p.valor_cartao_credito ?? p.valor_cartao_debito ?? p.valor_cartao))}
                    </TableCell>
                    {convenios.map(c => {
                      const v = getConvValorExibicao(p, c);
                      return (
                        <TableCell key={c.id} className="text-right tabular-nums">
                          {p.valor_variavel ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                          <div className="leading-tight">
                            <div title={`Dinheiro: ${fmtBRL(v.valor_dinheiro)}`}>
                              <span className="text-muted-foreground mr-1">D</span>{fmtBRL(v.valor_dinheiro)}
                            </div>
                            <div className="text-[10px] text-muted-foreground" title={`Pix / Débito / Crédito: ${fmtBRL(v.valor_outros)}`}>
                              <span className="mr-1">C</span>{fmtBRL(v.valor_outros)}
                            </div>
                          </div>
                          )}
                        </TableCell>
                      );
                    })}
                    <TableCell>
                      <span className={`text-[10px] px-1.5 py-0 rounded-full ${p.ativo ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>
                        {p.ativo ? "Ativo" : "Inativo"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {podeEscrever && (
                        <>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEdit(p)}><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onDelete(p)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* ========== Paginação ========== */}
          {ordenados.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 px-1">
              <p className="text-xs text-muted-foreground">
                Mostrando {(paginaAtual - 1) * PAGE_SIZE + 1}–{Math.min(paginaAtual * PAGE_SIZE, ordenados.length)} de {ordenados.length} serviços
              </p>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" className="h-8 w-8" disabled={paginaAtual === 1} onClick={() => setPagina(1)}>
                  <ChevronsLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" className="h-8 w-8" disabled={paginaAtual === 1} onClick={() => setPagina(p => Math.max(1, p - 1))}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs px-3">Página {paginaAtual} de {totalPaginas}</span>
                <Button variant="outline" size="icon" className="h-8 w-8" disabled={paginaAtual === totalPaginas} onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" className="h-8 w-8" disabled={paginaAtual === totalPaginas} onClick={() => setPagina(totalPaginas)}>
                  <ChevronsRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
      </div>

      {/* ============ DIALOG TIPO PICKER ============ */}
      <Dialog open={openTipoPicker} onOpenChange={setOpenTipoPicker}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Qual o tipo de serviço?</DialogTitle>
            <DialogDescription>Escolha o tipo para começar o cadastro.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-2 py-2">
            {tipos.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => startNewComTipo(t.nome as Tipo)}
                className={`flex items-center justify-between rounded-lg border border-border px-4 py-3 text-left transition hover:border-primary hover:bg-muted/50`}
              >
                <span className="flex items-center gap-3">
                  <span className={`inline-flex h-8 w-8 items-center justify-center rounded-md ${tipoCor(t.nome)}`}>
                    <ClipboardList className="h-4 w-4" />
                  </span>
                  <span className="font-medium">{tipoLabel(t.nome)}</span>
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenTipoPicker(false)}>Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ DIALOG PROCEDIMENTO ============ */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-3 border-b shrink-0 bg-background">
            <DialogTitle>{editing ? "Editar serviço" : "Novo serviço"}</DialogTitle>
            <DialogDescription>Preencha valores para cada forma de pagamento.</DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} className="flex flex-col min-h-0 flex-1 overflow-hidden">
            <div className="space-y-4 overflow-y-auto overflow-x-hidden px-6 py-4 flex-1 min-h-0">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1 sm:col-span-2">
                <Label>Nome *</Label>
                <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
              </div>
              <div className="space-y-1">
                <Label>Código</Label>
                <Input value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} placeholder="TUSS" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1 sm:col-span-2">
                <Label>Especialidade</Label>
                <Select
                  value={grupoSelecionadoKey}
                  onValueChange={(v) => {
                    const esp = especialidades.find(e => especialidadeKey(e.nome) === v);
                    setForm({ ...form, grupo: v === "__none__" ? "" : displayEspecialidadeNome(esp?.nome ?? form.grupo) });
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhuma</SelectItem>
                    {form.grupo && !grupoExisteNasEspecialidades && (
                      <SelectItem value={grupoSelecionadoKey}>{displayEspecialidadeNome(form.grupo)}</SelectItem>
                    )}
                    {especialidades.map(e => (
                      <SelectItem key={e.id} value={especialidadeKey(e.nome)}>{displayEspecialidadeNome(e.nome)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Categoria</Label>
                <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v as Tipo })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {tipos.map(t => (
                      <SelectItem key={t.id} value={t.nome}>{tipoLabel(t.nome)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase">
                  Especialidades em que este serviço aparece
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Marque todas as especialidades que devem listar este serviço. A especialidade do campo "Especialidade" acima é a principal e já é incluída automaticamente.
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-56 overflow-y-auto pt-1">
                  {especialidades.length === 0 && (
                    <p className="col-span-full text-xs text-muted-foreground">Nenhuma especialidade cadastrada.</p>
                  )}
                  {especialidades.map(e => {
                    const checked = formEspIds.includes(e.id);
                    return (
                      <label key={e.id} className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => {
                            setFormEspIds(prev =>
                              v ? Array.from(new Set([...prev, e.id])) : prev.filter(x => x !== e.id),
                            );
                          }}
                        />
                        <span className="truncate">{e.nome}</span>
                      </label>
                    );
                  })}
                </div>
            </div>

            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase">Valores por forma de pagamento</p>
                  {form.valor_variavel && (
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Valor variável ativo — o valor será informado na hora da cobrança.
                    </p>
                  )}
                </div>
                <label className="flex items-center gap-2 text-sm cursor-pointer whitespace-nowrap">
                  <Switch
                    checked={!!form.valor_variavel}
                    onCheckedChange={(v) => setForm({ ...form, valor_variavel: !!v })}
                  />
                  <span className="font-medium">Valor variável</span>
                </label>
              </div>
              <div className={`grid grid-cols-2 gap-3 ${form.valor_variavel ? "opacity-50 pointer-events-none" : ""}`}>
                <div className="space-y-1">
                  <Label>Dinheiro (R$)</Label>
                  <CurrencyInput value={form.valor_variavel ? "0" : form.valor_dinheiro} disabled={form.valor_variavel}
                    onChange={(v) => setForm({ ...form, valor_dinheiro: v })} />
                </div>
                <div className="space-y-1">
                  <Label>Pix / Débito / Crédito (R$)</Label>
                  <CurrencyInput value={form.valor_variavel ? "0" : form.valor_pix_cartao} disabled={form.valor_variavel}
                    onChange={(v) => setForm({ ...form, valor_pix_cartao: v })} />
                  <p className="text-[10px] text-muted-foreground">Mesmo valor para Pix, Cartão de Débito e Crédito.</p>
                </div>
              </div>
            </div>

            {convenios.length > 0 && !form.valor_variavel && (
              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3">
                <p className="text-xs font-medium text-muted-foreground uppercase">Valores por convênio (Cartão Benefícios)</p>
                <div className="space-y-3">
                  {convenios.map(c => {
                    const v = formConvValores[c.id] ?? { dinheiro: "0", outros: "0" };
                    return (
                      <div key={c.id} className="space-y-2 border-l-2 border-primary/30 pl-3">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium">
                            {c.nome}
                            {!formConvManual[c.id] && (
                              <span className="ml-2 text-[10px] font-normal text-muted-foreground">(auto pela regra)</span>
                            )}
                          </p>
                          {formConvManual[c.id] && (
                            <button
                              type="button"
                              className="text-[10px] text-primary hover:underline"
                              onClick={() => setFormConvManual(prev => ({ ...prev, [c.id]: false }))}
                            >
                              Recalcular pela regra
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs">Dinheiro (R$)</Label>
                            <CurrencyInput
                              value={v.dinheiro}
                              onChange={(val) => {
                                setFormConvValores(prev => ({ ...prev, [c.id]: { ...v, dinheiro: val } }));
                                setFormConvManual(prev => ({ ...prev, [c.id]: true }));
                              }}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Pix / Débito / Crédito (R$)</Label>
                            <CurrencyInput
                              value={v.outros}
                              onChange={(val) => {
                                setFormConvValores(prev => ({ ...prev, [c.id]: { ...v, outros: val } }));
                                setFormConvManual(prev => ({ ...prev, [c.id]: true }));
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={form.ativo} onCheckedChange={(v) => setForm({ ...form, ativo: !!v })} />
              Ativo
            </label>
            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase">Regras do procedimento</p>
                <p className="text-[11px] text-muted-foreground">
                  Como este procedimento se comporta na Agenda, Caixa, Financeiro e NFS-e. Vale para todas as unidades — a unidade pode sobrescrever.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Fluxo de atendimento</Label>
                  <Select
                    value={form.fluxo_atendimento}
                    onValueChange={(v) => setForm({ ...form, fluxo_atendimento: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="consulta_medica">Consulta padrão (com médico)</SelectItem>
                      <SelectItem value="exame_agendado">Exame com laudo</SelectItem>
                      <SelectItem value="equipamento">Exame sem laudo</SelectItem>
                      <SelectItem value="lab_agendado">Coleta laboratorial</SelectItem>
                      <SelectItem value="domiciliar">Entrega/retirada domiciliar (MAPA/Holter)</SelectItem>
                      <SelectItem value="venda_balcao">Venda de balcão</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Duração padrão (min)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.tempo_padrao_min}
                    onChange={(e) => setForm({ ...form, tempo_padrao_min: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-y-2 gap-x-3 pt-1">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={!!form.agenda_obrigatoria}
                    onCheckedChange={(v) => setForm({ ...form, agenda_obrigatoria: !!v })}
                  />
                  Agenda obrigatória
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={!!form.permite_venda_direta}
                    onCheckedChange={(v) => setForm({ ...form, permite_venda_direta: !!v })}
                  />
                  Permite venda direta (sem agenda)
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={!!form.medico_obrigatorio}
                    onCheckedChange={(v) => setForm({ ...form, medico_obrigatorio: !!v })}
                  />
                  Médico obrigatório
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={!!form.sala_obrigatoria}
                    onCheckedChange={(v) => setForm({ ...form, sala_obrigatoria: !!v })}
                  />
                  Sala obrigatória
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={!!form.equipamento_obrigatorio}
                    onCheckedChange={(v) => setForm({ ...form, equipamento_obrigatorio: !!v })}
                  />
                  Equipamento obrigatório
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={!!form.permite_encaixe}
                    onCheckedChange={(v) => setForm({ ...form, permite_encaixe: !!v })}
                  />
                  Permite encaixe
                </label>
              </div>
              <p className="text-[11px] text-muted-foreground">
                O modo de emissão de NFS-e (por item ou agrupada) é definido na configuração da clínica em <strong>Configurações → NFS-e</strong>.
              </p>
            </div>
            <div className="space-y-1">
              <Label>Observações</Label>
              <Textarea rows={2} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Preparo do exame</Label>
              <Textarea
                rows={3}
                placeholder="Ex.: Jejum de 8h. Trazer pedido médico. Suspender medicamentos X..."
                value={form.preparo}
                onChange={(e) => setForm({ ...form, preparo: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Aparece nas Informações rápidas e a Nina responde quando perguntarem sobre o preparo.
              </p>
            </div>
            </div>
            <DialogFooter className="bg-background border-t px-6 py-3 shrink-0">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ============ DIALOG CARTÃO ============ */}
      <Dialog open={openCartao} onOpenChange={setOpenCartao}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCartao ? "Editar cartão" : "Novo cartão"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmitCartao} className="space-y-4">
            <div className="space-y-1">
              <Label>Nome *</Label>
              <Input value={formCartao.nome} onChange={(e) => setFormCartao({ ...formCartao, nome: e.target.value })} required />
            </div>
            <div className="space-y-1">
              <Label>Descrição</Label>
              <Textarea rows={2} value={formCartao.descricao} onChange={(e) => setFormCartao({ ...formCartao, descricao: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Desconto padrão (%)</Label>
              <Input type="number" min="0" max="100" step="0.1" value={formCartao.percentual_desconto}
                onChange={(e) => setFormCartao({ ...formCartao, percentual_desconto: e.target.value })} />
              <p className="text-xs text-muted-foreground">Informativo. O valor real cobrado vem do procedimento.</p>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={formCartao.ativo} onCheckedChange={(v) => setFormCartao({ ...formCartao, ativo: !!v })} />
              Ativo
            </label>
            <DialogFooter className="sticky bottom-0 bg-background border-t -mx-6 -mb-6 px-6 py-3 z-10">
              <Button type="button" variant="outline" onClick={() => setOpenCartao(false)}>Cancelar</Button>
              <Button type="submit">Salvar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={dupConflitos.length > 0}
        onOpenChange={(o) => { if (!o) { setDupConflitos([]); setPendingPayload(null); } }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nome já cadastrado</DialogTitle>
            <DialogDescription>
              Já existe(m) {dupConflitos.length} serviço(s) com este nome nesta clínica.
              Deseja cadastrar mesmo assim?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-64 overflow-auto">
            {dupConflitos.map((d) => (
              <div key={d.id} className="rounded-md border p-2 text-sm">
                <div className="font-medium">{d.nome}</div>
                <div className="text-muted-foreground">
                  Especialidade: {d.especialidades.length > 0 ? d.especialidades.join(", ") : "—"}
                </div>
                <div className="text-muted-foreground">Valor: {fmtBRL(d.valor)}</div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setDupConflitos([]); setPendingPayload(null); }}
            >
              Cancelar
            </Button>
            <Button
              onClick={async () => {
                const p = pendingPayload;
                setDupConflitos([]);
                setPendingPayload(null);
                if (p) await executarSalvar(p);
              }}
              disabled={saving}
            >
              {saving ? "Salvando…" : "Cadastrar mesmo assim"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProcedimentosPageWithTabs() {
  return (
    <>
      <SectionTabs title={SERVICOS_META.title} icon={SERVICOS_META.icon} tabs={SERVICOS_TABS} />
      <ProcedimentosPage />
    </>
  );
}
