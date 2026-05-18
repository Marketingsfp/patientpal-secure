import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Plus, Search, Pencil, Trash2, ClipboardList, Sparkles, CreditCard, Download } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { exportToExcel } from "@/lib/export-csv";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

export const Route = createFileRoute("/_authenticated/app/procedimentos")({
  component: ProcedimentosPage,
  head: () => ({ meta: [{ title: "Procedimentos — ClinicaOS" }] }),
});

type Tipo = "consulta" | "exame" | "procedimento";
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
}
interface Cartao {
  id: string;
  nome: string;
  descricao: string | null;
  percentual_desconto: number;
  ativo: boolean;
}

const TIPO_LABEL: Record<Tipo, string> = { consulta: "Consulta", exame: "Exame", procedimento: "Procedimento" };
const TIPO_COR: Record<Tipo, string> = {
  consulta: "bg-primary/10 text-primary",
  exame: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  procedimento: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
};

const EMPTY = {
  nome: "", grupo: "", tipo: "exame" as Tipo, codigo: "",
  valor_dinheiro: "0", valor_pix_cartao: "0",
  valor_cartao_consulta: "0", valor_cartao_desconto: "0",
  duracao_minutos: "30", observacoes: "", preparo: "", ativo: true,
};

const EMPTY_CARTAO = { nome: "", descricao: "", percentual_desconto: "0", ativo: true };

const fmtBRL = (n: number) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

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
  const [tab, setTab] = useState("procedimentos");

  // ----- Procedimentos -----
  const [items, setItems] = useState<Procedimento[]>([]);
  const [busca, setBusca] = useState("");
  const [buscaDebounced, setBuscaDebounced] = useState("");
  const [filtroGrupo, setFiltroGrupo] = useState<string>("todos");
  const [filtroTipo, setFiltroTipo] = useState<"todos" | Tipo>("todos");
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Procedimento | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);

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
      if (error) { setLoading(false); toast.error(error.message); return; }
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
    if (error) { toast.error(error.message); return; }
    setCartoes((data ?? []) as any);
  };

  useEffect(() => {
    void load();
    void loadCartoes();
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [clinicaAtual?.clinica_id]);

  const grupos = useMemo(() => {
    const s = new Set<string>();
    items.forEach(p => { if (p.grupo) s.add(p.grupo); });
    return Array.from(s).sort();
  }, [items]);

  const filtrados = useMemo(() => {
    const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const q = norm(buscaDebounced.trim());
    return items.filter(p => {
      if (filtroTipo !== "todos" && p.tipo !== filtroTipo) return false;
      if (filtroGrupo !== "todos" && (p.grupo ?? "") !== filtroGrupo) return false;
      if (q && !norm(p.nome).includes(q) && !norm(p.codigo ?? "").includes(q) && !norm(p.grupo ?? "").includes(q)) return false;
      return true;
    });
  }, [items, buscaDebounced, filtroTipo, filtroGrupo]);

  useEffect(() => {
    const t = setTimeout(() => setBuscaDebounced(busca), 200);
    return () => clearTimeout(t);
  }, [busca]);

  // Performance: limita a renderização. O DOM trava com 2000+ linhas de tabela.
  const LIMITE_RENDER = 200;
  const visiveis = useMemo(() => filtrados.slice(0, LIMITE_RENDER), [filtrados]);

  const openNew = () => { setEditing(null); setForm(EMPTY); setOpen(true); };
  const openEdit = (p: Procedimento) => {
    setEditing(p);
    setForm({
      nome: p.nome, grupo: p.grupo ?? "", tipo: p.tipo, codigo: p.codigo ?? "",
      valor_dinheiro: String(p.valor_dinheiro ?? p.valor_dinheiro_pix ?? p.valor_padrao ?? 0),
      valor_pix_cartao: String(
        p.valor_cartao_credito ?? p.valor_cartao_debito ?? p.valor_cartao ?? p.valor_pix ?? 0
      ),
      valor_cartao_consulta: String(p.valor_cartao_consulta ?? 0),
      valor_cartao_desconto: String(p.valor_cartao_desconto ?? 0),
      duracao_minutos: String(p.duracao_minutos), observacoes: p.observacoes ?? "", preparo: p.preparo ?? "", ativo: p.ativo,
    });
    setOpen(true);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!clinicaAtual) return;
    if (!form.nome.trim()) { toast.error("Informe o nome."); return; }
    setSaving(true);
    const vDinheiro = Number(form.valor_dinheiro) || 0;
    const vCartao = Number(form.valor_pix_cartao) || 0;
    const payload = {
      clinica_id: clinicaAtual.clinica_id,
      nome: form.nome.trim(),
      grupo: form.grupo.trim() || null,
      tipo: form.tipo,
      codigo: form.codigo.trim() || null,
      valor_padrao: vDinheiro, // mantém compatibilidade com agenda/financeiro
      valor_dinheiro: vDinheiro,
      valor_pix: vDinheiro,
      valor_dinheiro_pix: vDinheiro, // legado
      valor_cartao_credito: vCartao,
      valor_cartao_debito: vCartao,
      valor_cartao: vCartao, // legado
      valor_cartao_consulta: Number(form.valor_cartao_consulta) || 0,
      valor_cartao_desconto: Number(form.valor_cartao_desconto) || 0,
      duracao_minutos: Math.max(0, Number(form.duracao_minutos) || 0),
      observacoes: form.observacoes.trim() || null,
      preparo: form.preparo.trim() || null,
      ativo: form.ativo,
    };
    const { error } = editing
      ? await supabase.from("procedimentos").update(payload).eq("id", editing.id)
      : await supabase.from("procedimentos").insert(payload);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editing ? "Atualizado." : "Cadastrado.");
    setOpen(false);
    void load();
  };

  const onDelete = async (p: Procedimento) => {
    if (!confirm(`Excluir ${p.nome}?`)) return;
    const { error } = await supabase.from("procedimentos").delete().eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Excluído.");
    void load();
  };

  const seedPacote = async (pacote: PacoteExames) => {
    if (!clinicaAtual) return;
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
    if (error) { toast.error(error.message); return; }
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
    if (error) { toast.error(error.message); return; }
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
    if (error) { toast.error(error.message); return; }
    toast.success(editingCartao ? "Cartão atualizado." : "Cartão cadastrado.");
    setOpenCartao(false);
    void loadCartoes();
  };
  const onDeleteCartao = async (c: Cartao) => {
    if (!confirm(`Excluir ${c.nome}?`)) return;
    const { error } = await supabase.from("cartoes_convenio").delete().eq("id", c.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Excluído.");
    void loadCartoes();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-primary" /> Procedimentos
          </h1>
          <p className="text-sm text-muted-foreground">Consultas, exames e procedimentos — com valores por forma de pagamento.</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="procedimentos">Procedimentos / Exames</TabsTrigger>
          <TabsTrigger value="cartoes">Cartões de convênio</TabsTrigger>
        </TabsList>

        {/* ============ PROCEDIMENTOS ============ */}
        <TabsContent value="procedimentos" className="space-y-4 pt-4 pb-16">
          <div className="flex flex-wrap gap-2 justify-end">
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
            <Button
              variant="outline"
              onClick={() => {
                if (!filtrados.length) { toast.info("Sem dados para exportar."); return; }
                exportToExcel(
                  filtrados.map((p) => ({
                    nome: p.nome,
                    grupo: p.grupo ?? "",
                    tipo: TIPO_LABEL[p.tipo],
                    codigo: p.codigo ?? "",
                    dinheiro: Number(p.valor_dinheiro ?? p.valor_dinheiro_pix ?? 0).toFixed(2),
                    cartao: Number(p.valor_cartao_credito ?? p.valor_cartao_debito ?? p.valor_cartao ?? 0).toFixed(2),
                    cartao_consulta: Number(p.valor_cartao_consulta ?? 0).toFixed(2),
                    cartao_desconto: Number(p.valor_cartao_desconto ?? 0).toFixed(2),
                    duracao: p.duracao_minutos,
                    preparo: p.preparo ?? "",
                    ativo: p.ativo ? "Sim" : "Não",
                  })),
                  `procedimentos-${new Date().toISOString().slice(0, 10)}`,
                  [
                    { key: "nome", label: "Nome" },
                    { key: "grupo", label: "Grupo" },
                    { key: "tipo", label: "Tipo" },
                    { key: "codigo", label: "Código" },
                    { key: "dinheiro", label: "Dinheiro (R$)" },
                    { key: "cartao", label: "Cartão (R$)" },
                    { key: "cartao_consulta", label: "C. Consulta (R$)" },
                    { key: "cartao_desconto", label: "C. Desconto (R$)" },
                    { key: "duracao", label: "Duração (min)" },
                    { key: "preparo", label: "Preparo" },
                    { key: "ativo", label: "Ativo" },
                  ],
                );
              }}
            >
              <Download className="h-4 w-4 mr-2" /> Exportar Excel
            </Button>
            <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" /> Novo</Button>
          </div>

          <div className="rounded-lg border border-border bg-card p-4 flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, grupo ou código…" className="pl-9" />
            </div>
            <Select value={filtroGrupo} onValueChange={setFiltroGrupo}>
              <SelectTrigger className="w-56"><SelectValue placeholder="Grupo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os grupos</SelectItem>
                {grupos.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filtroTipo} onValueChange={(v) => setFiltroTipo(v as typeof filtroTipo)}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os tipos</SelectItem>
                <SelectItem value="consulta">Consulta</SelectItem>
                <SelectItem value="exame">Exame</SelectItem>
                <SelectItem value="procedimento">Procedimento</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border border-border bg-card overflow-x-auto">
            <Table className="[&_td]:py-1 [&_td]:px-2 [&_th]:py-1.5 [&_th]:px-2 text-sm">
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>Nome</TableHead>
                  <TableHead className="w-44">Grupo</TableHead>
                  <TableHead className="w-24">Tipo</TableHead>
                  <TableHead className="w-24 text-right">Dinheiro</TableHead>
                  <TableHead className="w-32 text-right">Cartão</TableHead>
                  <TableHead className="w-24 text-right">C. Consulta</TableHead>
                  <TableHead className="w-24 text-right">C. Desconto</TableHead>
                  <TableHead className="w-24">Situação</TableHead>
                  <TableHead className="w-28 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Carregando…</TableCell></TableRow>
                ) : !clinicaAtual ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Selecione uma clínica.</TableCell></TableRow>
                ) : filtrados.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Nenhum procedimento.</TableCell></TableRow>
                ) : visiveis.map(p => (
                  <TableRow key={p.id} className="h-8">
                    <TableCell className="font-medium">{p.nome}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{p.grupo ?? "—"}</TableCell>
                    <TableCell>
                      <span className={`text-[10px] px-1.5 py-0 rounded-full ${TIPO_COR[p.tipo]}`}>{TIPO_LABEL[p.tipo]}</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmtBRL(Number(p.valor_dinheiro ?? p.valor_dinheiro_pix))}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtBRL(Number(p.valor_cartao_credito ?? p.valor_cartao_debito ?? p.valor_cartao))}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtBRL(Number(p.valor_cartao_consulta))}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtBRL(Number(p.valor_cartao_desconto))}</TableCell>
                    <TableCell>
                      <span className={`text-[10px] px-1.5 py-0 rounded-full ${p.ativo ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>
                        {p.ativo ? "Ativo" : "Inativo"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEdit(p)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onDelete(p)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filtrados.length > visiveis.length && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-4 text-xs text-muted-foreground bg-muted/20">
                      Mostrando {visiveis.length} de {filtrados.length}. Use a busca ou filtros para refinar.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ============ CARTÕES ============ */}
        <TabsContent value="cartoes" className="space-y-4 pt-4 pb-16">
          <div className="flex flex-wrap gap-2 justify-end">
            <Button variant="outline" onClick={seedCartoesPadrao}>
              <Sparkles className="h-4 w-4 mr-2" />Cadastrar Cartão Consulta e Desconto
            </Button>
            <Button onClick={openNewCartao}><Plus className="h-4 w-4 mr-2" /> Novo cartão</Button>
          </div>

          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>Nome</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="w-32 text-right">Desconto %</TableHead>
                  <TableHead className="w-24">Situação</TableHead>
                  <TableHead className="w-28 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cartoes.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhum cartão cadastrado.</TableCell></TableRow>
                ) : cartoes.map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium flex items-center gap-2"><CreditCard className="h-4 w-4 text-primary" />{c.nome}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{c.descricao ?? "—"}</TableCell>
                    <TableCell className="text-right text-sm">{Number(c.percentual_desconto)}%</TableCell>
                    <TableCell>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${c.ativo ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>
                        {c.ativo ? "Ativo" : "Inativo"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => openEditCartao(c)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => onDeleteCartao(c)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground">
            Os cartões aparecem como forma de pagamento. O valor cobrado vem da coluna correspondente do procedimento (C. Consulta / C. Desconto).
          </p>
        </TabsContent>
      </Tabs>

      {/* ============ DIALOG PROCEDIMENTO ============ */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar procedimento" : "Novo procedimento"}</DialogTitle>
            <DialogDescription>Preencha valores para cada forma de pagamento.</DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1 col-span-2">
                <Label>Nome *</Label>
                <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
              </div>
              <div className="space-y-1">
                <Label>Código</Label>
                <Input value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} placeholder="TUSS" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1 col-span-2">
                <Label>Grupo</Label>
                <Input value={form.grupo} list="grupos-list"
                  onChange={(e) => setForm({ ...form, grupo: e.target.value })}
                  placeholder="Ex.: Ultrassonografia, Consulta, Endoscopia…" />
                <datalist id="grupos-list">
                  {grupos.map(g => <option key={g} value={g} />)}
                </datalist>
              </div>
              <div className="space-y-1">
                <Label>Tipo</Label>
                <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v as Tipo })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="consulta">Consulta</SelectItem>
                    <SelectItem value="exame">Exame</SelectItem>
                    <SelectItem value="procedimento">Procedimento</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase">Valores por forma de pagamento</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Dinheiro (R$)</Label>
                  <CurrencyInput value={form.valor_dinheiro}
                    onChange={(v) => setForm({ ...form, valor_dinheiro: v })} />
                </div>
                <div className="space-y-1">
                  <Label>Cartão (R$)</Label>
                  <CurrencyInput value={form.valor_pix_cartao}
                    onChange={(v) => setForm({ ...form, valor_pix_cartao: v })} />
                </div>
                <div className="space-y-1">
                  <Label>Cartão Consulta (R$)</Label>
                  <CurrencyInput value={form.valor_cartao_consulta}
                    onChange={(v) => setForm({ ...form, valor_cartao_consulta: v })} />
                </div>
                <div className="space-y-1">
                  <Label>Cartão Desconto (R$)</Label>
                  <CurrencyInput value={form.valor_cartao_desconto}
                    onChange={(v) => setForm({ ...form, valor_cartao_desconto: v })} />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Duração (min)</Label>
                <Input type="number" min="0" value={form.duracao_minutos}
                  onChange={(e) => setForm({ ...form, duracao_minutos: e.target.value })} />
              </div>
              <label className="flex items-end gap-2 text-sm cursor-pointer pb-2">
                <Checkbox checked={form.ativo} onCheckedChange={(v) => setForm({ ...form, ativo: !!v })} />
                Ativo
              </label>
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
            <DialogFooter className="sticky bottom-0 bg-background border-t -mx-6 -mb-6 px-6 py-3 z-10">
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
    </div>
  );
}
