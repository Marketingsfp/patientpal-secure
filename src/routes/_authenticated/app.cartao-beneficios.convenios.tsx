import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, ShieldCheck, Layers, Lightbulb, ArrowLeft, FileText, Info, Printer, Gift, FileSignature, Stethoscope, Scale } from "lucide-react";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RichEditor } from "@/components/cartao-beneficios/rich-editor";
import { INFORMATIVO_CARTAO_CONSULTA_SEGUROS_HTML } from "@/components/cartao-beneficios/informativo-seed";
import { RegrasConvenioTab } from "@/components/cartao-beneficios/regras-tab";
import { z } from "zod";
import DOMPurify from "dompurify";

const NOME_MAX = 120;
const DESCRICAO_MAX = 1000;
const BENEFICIOS_MAX = 2000;

const stripHtml = (v: string) =>
  DOMPurify.sanitize(v, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });

const convenioSchema = z
  .object({
    nome: z.string().trim().min(2, "Nome deve ter ao menos 2 caracteres").max(NOME_MAX, `Nome pode ter no máximo ${NOME_MAX} caracteres`),
    descricao: z.string().trim().max(DESCRICAO_MAX, `Descrição pode ter no máximo ${DESCRICAO_MAX} caracteres`).optional(),
    beneficios: z.string().trim().max(BENEFICIOS_MAX, `Benefícios pode ter no máximo ${BENEFICIOS_MAX} caracteres`).optional(),
    taxa_adesao: z.number().min(0, "Taxa não pode ser negativa").max(100000, "Taxa acima do permitido"),
    taxa_inclusao_dependente: z
      .number()
      .min(0, "Taxa não pode ser negativa")
      .max(100000, "Taxa acima do permitido"),
    num_parcelas: z.number().int().min(1, "Nº de parcelas deve ser ≥ 1").max(60, "Máximo de 60 parcelas"),
    max_dependentes: z.number().int().min(0).max(50, "Máximo de 50 dependentes"),
    fidelidade_meses: z.number().int().min(0).max(120),
    vigencia_meses: z.number().int().min(1, "Vigência deve ser ≥ 1 mês").max(120),
  })
  .refine((d) => d.fidelidade_meses <= d.vigencia_meses, {
    message: "Fidelidade não pode ser maior que a vigência",
    path: ["fidelidade_meses"],
  });

const CONTRATO_VARIAVEIS: { label: string; token: string }[] = [
  { label: "Nome da clínica", token: "CLINICA_NOME" },
  { label: "CNPJ da clínica", token: "CLINICA_CNPJ" },
  { label: "Endereço da clínica", token: "CLINICA_ENDERECO" },
  { label: "Cidade", token: "CIDADE" },
  { label: "Nome do paciente", token: "PACIENTE_NOME" },
  { label: "CPF do paciente", token: "PACIENTE_CPF" },
  { label: "Nascimento do paciente", token: "PACIENTE_NASCIMENTO" },
  { label: "Endereço do paciente", token: "PACIENTE_ENDERECO" },
  { label: "Telefone do paciente", token: "PACIENTE_TELEFONE" },
  { label: "E-mail do paciente", token: "PACIENTE_EMAIL" },
  { label: "Valor mensal", token: "VALOR_MENSAL" },
  { label: "Taxa de adesão", token: "TAXA_ADESAO" },
  { label: "Nº de parcelas", token: "NUM_PARCELAS" },
  { label: "Vigência (meses)", token: "VIGENCIA_MESES" },
  { label: "Fidelidade (meses)", token: "FIDELIDADE_MESES" },
  { label: "Data de hoje (por extenso)", token: "DATA_HOJE" },
  { label: "Dependentes (lista completa)", token: "DEPENDENTES" },
];

function buildContratoVariaveis(maxDeps: number): { label: string; token: string }[] {
  const base = [...CONTRATO_VARIAVEIS];
  const n = Math.max(0, Number(maxDeps) || 0);
  for (let i = 1; i <= n; i++) {
    base.push({ label: `Dependente ${i} — nome`, token: `DEPENDENTE_${i}` });
    base.push({ label: `Dependente ${i} — parentesco`, token: `DEPENDENTE_${i}_PARENTESCO` });
    base.push({ label: `Dependente ${i} — CPF`, token: `DEPENDENTE_${i}_CPF` });
    base.push({ label: `Dependente ${i} — nascimento`, token: `DEPENDENTE_${i}_NASCIMENTO` });
    base.push({ label: `Dependente ${i} — telefone`, token: `DEPENDENTE_${i}_TELEFONE` });
    base.push({ label: `Dependente ${i} — INÍCIO do bloco condicional`, token: `#DEPENDENTE_${i}` });
    base.push({ label: `Dependente ${i} — FIM do bloco condicional`, token: `/DEPENDENTE_${i}` });
  }
  return base;
}

export const Route = createFileRoute("/_authenticated/app/cartao-beneficios/convenios")({
  component: ConveniosPage,
  head: () => ({ meta: [{ title: "Convênios — Cartão Benefícios" }] }),
});

type Convenio = {
  id: string;
  clinica_id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  valor_mensal: number;
  taxa_adesao: number;
  taxa_inclusao_dependente: number;
  num_parcelas: number;
  max_dependentes: number;
  fidelidade_meses: number;
  vigencia_meses: number;
  beneficios: string | null;
  modelo_contrato: string | null;
  informativo_html: string | null;
  termo_inclusao_html: string | null;
};

type Faixa = {
  vidas_de: number;
  vidas_ate: number | null;
  valor_mensal: number;
};

type Beneficio = {
  id?: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  escopo: "servico" | "especialidade" | "consulta";
  procedimento_id: string | null;
  especialidade_id: string | null;
  tipo_desconto: "percentual" | "valor" | "gratuidade";
  valor_desconto: number | null;
  inicio_a_partir: 1 | 2 | 6;
  limite_uso: "ilimitado" | "1";
  periodicidade: "dia" | "mes" | "contrato";
  pessoa: "titular" | "titular_dependentes_soma" | "titular_ou_dependentes";
  prioridade: number;
  procedimento_ids: string[];
};

type ProcOpt = { id: string; nome: string; tipo?: string | null };
type EspOpt = { id: string; nome: string };

function ConveniosPage() {
  const { clinicaAtual } = useClinica();
  const podeEscrever = usePodeEscrever("cartao-beneficios");
  const [rows, setRows] = useState<Convenio[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"list" | "form">("list");
  const [editing, setEditing] = useState<Convenio | null>(null);
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [taxaAdesao, setTaxaAdesao] = useState<number>(0);
  const [taxaInclusaoDep, setTaxaInclusaoDep] = useState<number>(0);
  const [numParcelas, setNumParcelas] = useState<number>(12);
  const [maxDependentes, setMaxDependentes] = useState<number>(0);
  const [fidelidadeMeses, setFidelidadeMeses] = useState<number>(0);
  const [vigenciaMeses, setVigenciaMeses] = useState<number>(12);
  const [beneficiosTxt, setBeneficiosTxt] = useState("");
  const [modeloContrato, setModeloContrato] = useState("");
  const [informativoHtml, setInformativoHtml] = useState("");
  const [termoInclusaoHtml, setTermoInclusaoHtml] = useState("");
  const [faixas, setFaixas] = useState<Faixa[]>([{ vidas_de: 1, vidas_ate: null, valor_mensal: 0 }]);
  const [valoresMin, setValoresMin] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<Convenio | null>(null);

  // Benefícios do convênio (aba)
  const [beneficios, setBeneficios] = useState<Beneficio[]>([]);
  const [benLoading, setBenLoading] = useState(false);
  const [procedimentosList, setProcedimentosList] = useState<ProcOpt[]>([]);
  const [especialidadesList, setEspecialidadesList] = useState<EspOpt[]>([]);
  const [escopoDialogOpen, setEscopoDialogOpen] = useState(false);
  const [editingBenIdx, setEditingBenIdx] = useState<number | null>(null);

  const loadBeneficios = async (convenioId: string) => {
    setBenLoading(true);
    const { data, error } = await supabase
      .from("cb_beneficios")
      .select("id, nome, descricao, ativo, escopo, procedimento_id, especialidade_id, tipo_desconto, valor_desconto, inicio_a_partir, limite_uso, periodicidade, pessoa, prioridade, procedimento_ids")
      .eq("convenio_id", convenioId)
      .order("nome");
    if (error) mostrarErro(error);
    setBeneficios(((data ?? []) as any[]).map((b) => ({
      id: b.id,
      nome: b.nome,
      descricao: b.descricao,
      ativo: b.ativo,
      escopo: (b.escopo ?? "servico") as Beneficio["escopo"],
      procedimento_id: b.procedimento_id ?? null,
      especialidade_id: b.especialidade_id ?? null,
      tipo_desconto: (b.tipo_desconto ?? "percentual") as "percentual" | "valor" | "gratuidade",
      valor_desconto: b.valor_desconto !== null && b.valor_desconto !== undefined ? Number(b.valor_desconto) : null,
      inicio_a_partir: (b.inicio_a_partir ?? 1) as 1 | 2 | 6,
      limite_uso: (b.limite_uso ?? "ilimitado") as "ilimitado" | "1",
      periodicidade: (b.periodicidade ?? "contrato") as "dia" | "mes" | "contrato",
      pessoa: (b.pessoa ?? "titular") as Beneficio["pessoa"],
      prioridade: Number(b.prioridade ?? 1),
      procedimento_ids: Array.isArray(b.procedimento_ids) ? (b.procedimento_ids as string[]) : [],
    })));
    setBenLoading(false);
  };

  const loadCatalogos = async () => {
    if (!clinicaAtual) return;
    // PostgREST aplica db-max-rows=1000 mesmo com .range() amplo —
    // precisamos paginar manualmente para obter todos os serviços.
    const PAGE = 1000;
    const allProcs: ProcOpt[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("procedimentos")
        .select("id, nome, tipo")
        .eq("clinica_id", clinicaAtual.clinica_id)
        .eq("ativo", true)
        .order("nome")
        .range(from, from + PAGE - 1);
      if (error) break;
      const page = (data ?? []) as ProcOpt[];
      allProcs.push(...page);
      if (page.length < PAGE) break;
    }
    const { data: esps } = await supabase
      .from("especialidades").select("id, nome").eq("ativo", true).order("nome").range(0, 9999);
    setProcedimentosList(allProcs);
    setEspecialidadesList((esps ?? []) as EspOpt[]);
  };

  const addBeneficio = (escopo: "servico" | "especialidade" | "consulta") => {
    setBeneficios((prev) => {
      const next = [...prev, {
        nome: "",
        descricao: "",
        ativo: true,
        escopo,
        procedimento_id: null,
        especialidade_id: null,
        tipo_desconto: (escopo === "consulta" ? "valor" : "percentual") as Beneficio["tipo_desconto"],
        valor_desconto: null,
        inicio_a_partir: 1 as 1 | 2 | 6,
        limite_uso: "ilimitado" as const,
        periodicidade: "contrato" as const,
        pessoa: "titular" as Beneficio["pessoa"],
        prioridade: 1,
        procedimento_ids: [] as string[],
      }];
      setEditingBenIdx(next.length - 1);
      return next;
    });
    setEscopoDialogOpen(false);
  };

  const load = async () => {
    if (!clinicaAtual) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("cb_convenios")
      .select("*")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .order("nome");
    if (error) mostrarErro(error);
    const list = (data ?? []) as Convenio[];
    setRows(list);
    if (list.length) {
      const { data: vs } = await supabase
        .from("cb_convenio_faixas")
        .select("convenio_id, valor_mensal")
        .in("convenio_id", list.map((c) => c.id));
      const minMap: Record<string, number> = {};
      (vs ?? []).forEach((v: any) => {
        const val = Number(v.valor_mensal);
        if (minMap[v.convenio_id] === undefined || val < minMap[v.convenio_id]) {
          minMap[v.convenio_id] = val;
        }
      });
      setValoresMin(minMap);
    } else {
      setValoresMin({});
    }
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [clinicaAtual?.clinica_id]);

  const openNew = () => {
    if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
    setEditing(null);
    setEditingBenIdx(null);
    setNome(""); setDescricao(""); setAtivo(true);
    setTaxaAdesao(0); setTaxaInclusaoDep(0); setNumParcelas(12);
    setMaxDependentes(0); setFidelidadeMeses(0); setVigenciaMeses(12);
    setBeneficiosTxt(""); setModeloContrato("");
    setInformativoHtml("");
    setTermoInclusaoHtml("");
    setFaixas([{ vidas_de: 1, vidas_ate: null, valor_mensal: 0 }]);
    setBeneficios([]);
    loadCatalogos();
    setView("form");
  };

  const openEdit = async (c: Convenio) => {
    if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
    setEditing(c);
    setEditingBenIdx(null);
    setNome(c.nome);
    setDescricao(c.descricao ?? "");
    setAtivo(c.ativo);
    setTaxaAdesao(Number(c.taxa_adesao ?? 0));
    setTaxaInclusaoDep(Number((c as unknown as { taxa_inclusao_dependente?: number }).taxa_inclusao_dependente ?? 0));
    setNumParcelas(c.num_parcelas ?? 12);
    setMaxDependentes(c.max_dependentes ?? 0);
    setFidelidadeMeses(c.fidelidade_meses ?? 0);
    setVigenciaMeses(c.vigencia_meses ?? 12);
    setBeneficiosTxt(c.beneficios ?? "");
    setModeloContrato(c.modelo_contrato ?? "");
    const stripped = (c.informativo_html ?? "").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, "").trim();
    if (stripped) {
      setInformativoHtml(c.informativo_html ?? "");
    } else if (/CART[ÃA]O\s*CONSULTA.*SEGUROS/i.test(c.nome)) {
      setInformativoHtml(INFORMATIVO_CARTAO_CONSULTA_SEGUROS_HTML);
    } else {
      setInformativoHtml("");
    }
    setTermoInclusaoHtml(c.termo_inclusao_html ?? "");
    const { data: fs } = await supabase
      .from("cb_convenio_faixas")
      .select("vidas_de, vidas_ate, valor_mensal")
      .eq("convenio_id", c.id)
      .order("vidas_de");
    const list = (fs ?? []).map((f: any) => ({
      vidas_de: Number(f.vidas_de),
      vidas_ate: f.vidas_ate === null ? null : Number(f.vidas_ate),
      valor_mensal: Number(f.valor_mensal),
    }));
    setFaixas(list.length ? list : [{ vidas_de: 1, vidas_ate: null, valor_mensal: 0 }]);
    loadBeneficios(c.id);
    loadCatalogos();
    setView("form");
  };

  const save = async () => {
    if (!clinicaAtual) return;
    if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
    // 1) Sanitiza campos texto (remove HTML/scripts) antes de validar
    const nomeClean = stripHtml(nome.trim());
    const descClean = stripHtml(descricao.trim());
    const benefClean = stripHtml(beneficiosTxt.trim());
    // 2) Validação com Zod
    const parsed = convenioSchema.safeParse({
      nome: nomeClean,
      descricao: descClean || undefined,
      beneficios: benefClean || undefined,
      taxa_adesao: taxaAdesao,
      num_parcelas: numParcelas,
      max_dependentes: maxDependentes,
      fidelidade_meses: fidelidadeMeses,
      vigencia_meses: vigenciaMeses,
    });
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      toast.error(first?.message ?? "Dados inválidos.");
      return;
    }
    // 3) Faixas: exigir pelo menos 1, valor > 0 e sem vidas_de duplicado
    if (!faixas.length) { toast.error("Adicione pelo menos uma faixa de preço."); return; }
    const vistas = new Set<number>();
    for (const f of faixas) {
      if (!f.vidas_de || f.vidas_de < 1) { toast.error("Campo 'De' inválido em uma faixa."); return; }
      if (f.vidas_ate !== null && f.vidas_ate < f.vidas_de) {
        toast.error("Campo 'Até' deve ser maior ou igual a 'De'."); return;
      }
      if (!(Number(f.valor_mensal) > 0)) {
        toast.error(`Valor mensal da faixa de ${f.vidas_de} pessoa(s) deve ser maior que zero.`); return;
      }
      if (vistas.has(f.vidas_de)) {
        toast.error(`Faixa duplicada para ${f.vidas_de} pessoa(s). Remova a repetição.`); return;
      }
      vistas.add(f.vidas_de);
    }
    setSaving(true);
    const valorMin = faixas.reduce((m, f) => Math.min(m, Number(f.valor_mensal) || 0), Number(faixas[0].valor_mensal) || 0);
    const payload = {
      clinica_id: clinicaAtual.clinica_id,
      nome: nomeClean,
      descricao: descClean || null,
      ativo,
      valor_mensal: valorMin,
      taxa_adesao: taxaAdesao,
      num_parcelas: numParcelas,
      max_dependentes: maxDependentes,
      fidelidade_meses: fidelidadeMeses,
      vigencia_meses: vigenciaMeses,
      beneficios: benefClean || null,
      modelo_contrato: modeloContrato.trim() || null,
      informativo_html: informativoHtml.trim() || null,
      termo_inclusao_html: termoInclusaoHtml.trim() || null,
    };
    let convenioId = editing?.id;
    if (editing) {
      const { error } = await supabase.from("cb_convenios").update(payload).eq("id", editing.id);
      if (error) { setSaving(false); mostrarErro(error); return; }
    } else {
      const { data, error } = await supabase.from("cb_convenios").insert(payload).select("id").single();
      if (error || !data) { setSaving(false); mostrarErro(error); return; }
      convenioId = data.id;
    }
    // Substitui faixas de preço
    await supabase.from("cb_convenio_faixas").delete().eq("convenio_id", convenioId!);
    const rowsToInsert = faixas.map((f) => ({
      convenio_id: convenioId!,
      vidas_de: Number(f.vidas_de),
      vidas_ate: f.vidas_ate === null ? null : Number(f.vidas_ate),
      valor_mensal: Number(f.valor_mensal) || 0,
    }));
    if (rowsToInsert.length) {
      const { error: fErr } = await supabase.from("cb_convenio_faixas").insert(rowsToInsert);
      if (fErr) { setSaving(false); mostrarErro(fErr); return; }
    }
    // Substitui benefícios
    await supabase.from("cb_beneficios").delete().eq("convenio_id", convenioId!);
    const bensToInsert: any[] = [];
    for (const b of beneficios) {
      if (b.escopo === "servico" && !b.procedimento_id) {
        setSaving(false); toast.error("Selecione o serviço em todos os benefícios de serviço único."); return;
      }
      if (b.escopo === "especialidade" && !b.especialidade_id) {
        setSaving(false); toast.error("Selecione a especialidade em todos os benefícios."); return;
      }
      if (b.tipo_desconto !== "gratuidade" && (b.valor_desconto === null || b.valor_desconto <= 0)) {
        setSaving(false); toast.error("Informe o valor do desconto."); return;
      }
      const nomeAuto = b.escopo === "servico"
        ? (procedimentosList.find((p) => p.id === b.procedimento_id)?.nome ?? "Serviço")
        : b.escopo === "especialidade"
          ? "Especialidade: " + (especialidadesList.find((e) => e.id === b.especialidade_id)?.nome ?? "")
          : ((b.nome ?? "").toString().trim() || "Consultas");
      bensToInsert.push({
        clinica_id: clinicaAtual.clinica_id,
        convenio_id: convenioId!,
        nome: nomeAuto,
        descricao: (b.descricao ?? "").toString().trim() || null,
        ativo: b.ativo,
        escopo: b.escopo,
        procedimento_id: b.escopo === "servico" ? b.procedimento_id : null,
        especialidade_id: b.escopo === "especialidade" ? b.especialidade_id : null,
        tipo_desconto: b.tipo_desconto,
        valor_desconto: b.tipo_desconto === "gratuidade" ? null : b.valor_desconto,
        inicio_a_partir: b.inicio_a_partir,
        limite_uso: b.limite_uso,
        periodicidade: b.periodicidade,
        pessoa: b.pessoa,
        prioridade: b.prioridade,
        procedimento_ids: b.escopo === "consulta" ? (b.procedimento_ids ?? []) : [],
      });
    }
    if (bensToInsert.length) {
      const { error: bErr } = await supabase.from("cb_beneficios").insert(bensToInsert);
      if (bErr) { setSaving(false); mostrarErro(bErr); return; }
    }
    setSaving(false);
    toast.success(editing ? "Convênio atualizado." : "Convênio criado.");
    // Se for um novo convênio, passa a editar o recém-criado para permanecer na tela.
    if (!editing && convenioId) {
      setEditing({ ...(payload as any), id: convenioId } as Convenio);
    }
    load();
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
    const { error } = await supabase.from("cb_convenios").delete().eq("id", toDelete.id);
    if (error) { mostrarErro(error); return; }
    toast.success("Convênio excluído.");
    setToDelete(null);
    load();
  };

  if (!clinicaAtual) return <p className="text-sm text-muted-foreground">Selecione uma clínica.</p>;

  return (
    <div className="space-y-4">
      {view === "list" ? (
        <>
        <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" />
          Tipos de cartão benefícios oferecidos pela clínica.
        </p>
        {podeEscrever && (
          <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />Novo convênio</Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table className="table-fixed w-full">
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead className="w-[140px]">A partir de</TableHead>
                <TableHead className="w-[240px]">Descrição</TableHead>
                <TableHead className="w-[100px]">Status</TableHead>
                <TableHead className="w-[110px] text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Carregando…</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Nenhum convênio cadastrado.</TableCell></TableRow>
              ) : rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium truncate" title={c.nome}>{c.nome}</TableCell>
                  <TableCell>{valoresMin[c.id] !== undefined ? `R$ ${valoresMin[c.id].toFixed(2)}` : "—"}</TableCell>
                  <TableCell className="text-muted-foreground truncate" title={c.descricao ?? ""}>{c.descricao ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={c.ativo ? "default" : "outline"}>{c.ativo ? "Ativo" : "Inativo"}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {podeEscrever && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => setToDelete(c)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
        </>
      ) : (
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <Button variant="ghost" size="sm" onClick={() => setView("list")}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
              </Button>
              <h2 className="text-lg font-semibold">{editing ? `Editar convênio: ${editing.nome}` : "Novo convênio"}</h2>
              <div />
            </div>
            <Tabs defaultValue="info" className="w-full">
            <TabsList>
              <TabsTrigger value="info">Informações</TabsTrigger>
              <TabsTrigger value="faixas"><Layers className="h-4 w-4 mr-1" />Faixas de Preço</TabsTrigger>
              <TabsTrigger value="regras"><Gift className="h-4 w-4 mr-1" />Benefícios</TabsTrigger>
              <TabsTrigger value="contrato"><FileText className="h-4 w-4 mr-1" />Contrato</TabsTrigger>
              <TabsTrigger value="informativo"><Info className="h-4 w-4 mr-1" />Informativo</TabsTrigger>
              <TabsTrigger value="termo"><FileSignature className="h-4 w-4 mr-1" />Termo de Inclusão</TabsTrigger>
            </TabsList>
            <TabsContent value="info" className="space-y-3 mt-3">
              <div>
                <Label>Nome *</Label>
                <Input
                  value={nome}
                  maxLength={NOME_MAX}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Ex: Convênio Família"
                />
                <p className={`text-xs mt-1 text-right ${nome.trim().length > NOME_MAX ? "text-red-600" : "text-muted-foreground"}`}>
                  {nome.trim().length} / {NOME_MAX}
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <Label>Taxa de adesão (R$)</Label>
                  <CurrencyInput
                    value={taxaAdesao ? taxaAdesao.toFixed(2) : ""}
                    onChange={(v) => setTaxaAdesao(v ? parseFloat(v) : 0)}
                  />
                </div>
                <div>
                  <Label>Nº parcelas</Label>
                  <Input type="number" min="1" value={numParcelas}
                    onChange={(e) => setNumParcelas(parseInt(e.target.value) || 0)} />
                </div>
                <div>
                  <Label>Máx. dependentes</Label>
                  <Input type="number" min="0" value={maxDependentes}
                    onChange={(e) => setMaxDependentes(parseInt(e.target.value) || 0)} />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label>Fidelidade (meses)</Label>
                  <Input type="number" min="0" value={fidelidadeMeses}
                    onChange={(e) => setFidelidadeMeses(parseInt(e.target.value) || 0)} />
                </div>
                <div>
                  <Label>Vigência (meses)</Label>
                  <Input type="number" min="0" value={vigenciaMeses}
                    onChange={(e) => setVigenciaMeses(parseInt(e.target.value) || 0)} />
                </div>
              </div>
              <div>
                <Label>Descrição</Label>
                <Textarea
                  value={descricao}
                  maxLength={DESCRICAO_MAX}
                  onChange={(e) => setDescricao(e.target.value)}
                  rows={3}
                />
                <p className={`text-xs mt-1 text-right ${descricao.trim().length > DESCRICAO_MAX ? "text-red-600" : "text-muted-foreground"}`}>
                  {descricao.trim().length} / {DESCRICAO_MAX}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={ativo} onCheckedChange={setAtivo} />
                <Label>Ativo</Label>
              </div>
            </TabsContent>
            <TabsContent value="faixas" className="mt-3">
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 font-medium">
                      <Layers className="h-4 w-4" /> Faixas de Preço por Quantidade de Vidas
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Configure o valor mensal conforme a quantidade de vidas (titular + dependentes).
                    </p>
                  </div>
                  <Button
                    variant="ghost" size="sm"
                    onClick={() => {
                      const last = faixas[faixas.length - 1];
                      const nextDe = last ? last.vidas_de + 1 : 1;
                      setFaixas([...faixas, { vidas_de: nextDe, vidas_ate: null, valor_mensal: 0 }]);
                    }}
                  >
                    <Plus className="h-4 w-4 mr-1" /> Adicionar Faixa
                  </Button>
                </div>
                <div className="border rounded-md overflow-hidden max-w-xl">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Quantidade de pessoas</TableHead>
                        <TableHead className="text-right">Valor Mensal (R$)</TableHead>
                        <TableHead className="w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {faixas.map((f, idx) => (
                        <TableRow key={idx}>
                          <TableCell>
                            <Input
                              type="number" min="1"
                              className="border-0 rounded-none shadow-none focus-visible:ring-0 bg-transparent"
                              value={f.vidas_de}
                              onChange={(e) => {
                                const v = parseInt(e.target.value) || 1;
                                setFaixas(faixas.map((x, i) => i === idx ? { ...x, vidas_de: v, vidas_ate: v } : x));
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <CurrencyInput
                              className="text-right border-0 rounded-none shadow-none focus-visible:ring-0 bg-transparent"
                              value={f.valor_mensal ? Number(f.valor_mensal).toFixed(2) : ""}
                              onChange={(v) => {
                                const num = v ? parseFloat(v) : 0;
                                setFaixas(faixas.map((x, i) => i === idx ? { ...x, valor_mensal: num } : x));
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm" variant="ghost"
                              onClick={() => setFaixas(faixas.filter((_, i) => i !== idx))}
                              disabled={faixas.length === 1}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Lightbulb className="h-3.5 w-3.5" />
                  Exemplo: 1 pessoa = R$200, 2 pessoas = R$350, 3 pessoas = R$500. Adicione uma linha para cada quantidade.
                </p>
              </div>
            </TabsContent>
            <TabsContent value="regras" className="mt-3">
              <RegrasConvenioTab
                clinicaId={clinicaAtual.clinica_id}
                convenioId={editing?.id ?? null}
                convenioNome={editing?.nome ?? nome}
              />
            </TabsContent>
            <TabsContent value="contrato" className="mt-3">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 font-medium">
                    <FileText className="h-4 w-4" /> Modelo do Contrato
                  </div>
                  <Button variant="outline" size="sm" onClick={() => window.print()}>
                    <Printer className="h-4 w-4 mr-1" /> Imprimir
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  Este modelo será usado para gerar o contrato nas novas vendas. Use o seletor
                  <span className="font-medium"> Inserir variável </span>
                  na barra de ferramentas para incluir campos como{" "}
                  <code>{"{{PACIENTE_NOME}}"}</code>, <code>{"{{VALOR_MENSAL}}"}</code>,{" "}
                  <code>{"{{DEPENDENTE_1}}"}</code>, <code>{"{{DEPENDENTE_1_PARENTESCO}}"}</code>,{" "}
                  <code>{"{{CLINICA_NOME}}"}</code>. Use as variáveis numeradas
                  (<code>{"{{DEPENDENTE_1}}"}</code>… até o máximo de dependentes do convênio)
                  para um slot por dependente; slots não preenchidos ficam vazios.
                </p>
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium">Esconder slots vazios:</span> envolva o trecho de cada
                  dependente entre <code>{"{{#DEPENDENTE_2}}"}</code> e <code>{"{{/DEPENDENTE_2}}"}</code>{" "}
                  (idem para 3, 4 e 5). Use no seletor <em>Inserir variável</em> as opções
                  "Dependente N — INÍCIO/FIM do bloco condicional". O bloco só será impresso se o
                  dependente N existir no contrato.
                </p>
                <div id="convenio-contrato-print">
                  <RichEditor
                    value={modeloContrato}
                    onChange={setModeloContrato}
                    clinicaId={clinicaAtual.clinica_id}
                    variables={buildContratoVariaveis(maxDependentes)}
                  />
                </div>
                <style>{`
                  @media print {
                    @page { size: A4; margin: 0; }
                    body * { visibility: hidden !important; }
                    #convenio-contrato-print, #convenio-contrato-print * { visibility: visible !important; }
                    #convenio-contrato-print { position: absolute; left: 0; top: 0; width: 100%; }
                    #convenio-contrato-print .print\\:hidden { display: none !important; }
                    #convenio-contrato-print .rt-shell { border: 0 !important; border-radius: 0 !important; overflow: visible !important; background: transparent !important; }
                    #convenio-contrato-print .rt-scroll { max-height: none !important; overflow: visible !important; background: transparent !important; }
                    #convenio-contrato-print .rt-page { width: 210mm !important; min-height: 297mm !important; margin: 0 auto !important; box-shadow: none !important; background: white !important; }
                    #convenio-contrato-print .ProseMirror { min-height: 0 !important; }
                    #convenio-contrato-print table { page-break-inside: auto; }
                    #convenio-contrato-print tr { page-break-inside: avoid; page-break-after: auto; }
                    #convenio-contrato-print img { max-width: 100% !important; height: auto !important; }
                  }
                `}</style>
              </div>
            </TabsContent>
            <TabsContent value="informativo" className="mt-3">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 font-medium">
                    <Info className="h-4 w-4" /> Informativo do Convênio
                  </div>
                  <Button variant="outline" size="sm" onClick={() => window.print()}>
                    <Printer className="h-4 w-4 mr-1" /> Imprimir
                  </Button>
                </div>
                <div id="convenio-informativo-print">
                  <RichEditor
                    value={informativoHtml}
                    onChange={setInformativoHtml}
                    clinicaId={clinicaAtual.clinica_id}
                  />
                </div>
                <style>{`
                  @media print {
                    @page { size: A4; margin: 0; }
                    body * { visibility: hidden !important; }
                    #convenio-informativo-print, #convenio-informativo-print * { visibility: visible !important; }
                    #convenio-informativo-print { position: absolute; left: 0; top: 0; width: 100%; }
                    #convenio-informativo-print .print\\:hidden { display: none !important; }
                    /* Neutralize the editor chrome (scroll wrapper + A4 mock page) for print */
                    #convenio-informativo-print .rt-shell { border: 0 !important; border-radius: 0 !important; overflow: visible !important; background: transparent !important; }
                    #convenio-informativo-print .rt-scroll { max-height: none !important; overflow: visible !important; background: transparent !important; }
                    #convenio-informativo-print .rt-page { width: 210mm !important; min-height: 297mm !important; margin: 0 auto !important; box-shadow: none !important; background: white !important; }
                    #convenio-informativo-print .ProseMirror { min-height: 0 !important; }
                    #convenio-informativo-print table { page-break-inside: auto; }
                    #convenio-informativo-print tr { page-break-inside: avoid; page-break-after: auto; }
                    #convenio-informativo-print img { max-width: 100% !important; height: auto !important; }
                  }
                `}</style>
              </div>
            </TabsContent>
            <TabsContent value="termo" className="mt-3">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 font-medium">
                    <FileSignature className="h-4 w-4" /> Termo de Inclusão
                  </div>
                  <Button variant="outline" size="sm" onClick={() => window.print()}>
                    <Printer className="h-4 w-4 mr-1" /> Imprimir
                  </Button>
                </div>
                <div id="convenio-termo-print">
                  <RichEditor
                    value={termoInclusaoHtml}
                    onChange={setTermoInclusaoHtml}
                    clinicaId={clinicaAtual.clinica_id}
                  />
                </div>
                <style>{`
                  @media print {
                    @page { size: A4; margin: 0; }
                    body * { visibility: hidden !important; }
                    #convenio-termo-print, #convenio-termo-print * { visibility: visible !important; }
                    #convenio-termo-print { position: absolute; left: 0; top: 0; width: 100%; }
                    #convenio-termo-print .print\\:hidden { display: none !important; }
                    #convenio-termo-print .rt-shell { border: 0 !important; border-radius: 0 !important; overflow: visible !important; background: transparent !important; }
                    #convenio-termo-print .rt-scroll { max-height: none !important; overflow: visible !important; background: transparent !important; }
                    #convenio-termo-print .rt-page { width: 210mm !important; min-height: 297mm !important; margin: 0 auto !important; box-shadow: none !important; background: white !important; }
                    #convenio-termo-print .ProseMirror { min-height: 0 !important; }
                    #convenio-termo-print table { page-break-inside: auto; }
                    #convenio-termo-print tr { page-break-inside: avoid; page-break-after: auto; }
                    #convenio-termo-print img { max-width: 100% !important; height: auto !important; }
                  }
                `}</style>
              </div>
            </TabsContent>
          </Tabs>
            <div className="flex justify-end gap-2 border-t pt-4">
              <Button variant="outline" onClick={() => setView("list")}>Cancelar</Button>
              <Button
                onClick={save}
                disabled={saving || !nome.trim() || faixas.length === 0}
                title={
                  !nome.trim()
                    ? "Informe o nome do convênio"
                    : faixas.length === 0
                      ? "Adicione pelo menos uma faixa de preço"
                      : undefined
                }
              >
                {saving ? "Salvando…" : "Salvar"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={!!toDelete} onOpenChange={(v) => !v && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir convênio?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Os benefícios vinculados a "{toDelete?.nome}" também serão excluídos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={escopoDialogOpen} onOpenChange={setEscopoDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo benefício</DialogTitle>
            <DialogDescription>O desconto será aplicado a um serviço único ou a uma especialidade inteira?</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 py-2">
            <Button variant="outline" className="h-24 flex-col gap-2" onClick={() => addBeneficio("servico")}>
              <Gift className="h-6 w-6" />
              <span>Serviço único</span>
            </Button>
            <Button variant="outline" className="h-24 flex-col gap-2" onClick={() => addBeneficio("especialidade")}>
              <Layers className="h-6 w-6" />
              <span>Especialidade</span>
            </Button>
            <Button variant="outline" className="h-24 flex-col gap-2" onClick={() => addBeneficio("consulta")}>
              <Stethoscope className="h-6 w-6" />
              <span>Consultas</span>
            </Button>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEscopoDialogOpen(false)}>Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}