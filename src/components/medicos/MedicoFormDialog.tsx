import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Plus, Trash2, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { cadastrarUsuario, getFuncionarioLogin, definirSenhaFuncionario } from "@/lib/equipe.functions";
import { useClinica } from "@/hooks/use-clinica";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MedicoAgendasTab } from "@/components/medicos/MedicoAgendasTab";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DateInputBR } from "@/components/ui/date-input-br";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface Especialidade { id: string; nome: string }
interface Procedimento { id: string; nome: string; grupo: string | null; tipo: string; valor_padrao: number }
interface EspecialidadeRow { especialidade_id: string; tem_rqe: boolean; rqe_numero: string }
interface ConvenioRow {
  id?: string;
  nome: string;
  tipo_repasse: "percentual" | "valor";
  percentual: string;
  valor: string;
  ativo: boolean;
}

interface LaudadorOption { id: string; nome: string; crm: string | null; crm_uf: string | null }
interface LaudadorRow {
  laudador_medico_id: string;
  tipo_repasse: "percentual" | "valor";
  percentual: string;
  valor: string;
}

// Repasse individual agora é sempre vinculado a um serviço (ou categoria
// sentinela auto-gerada). Não há seed de linhas avulsas.
const CONVENIOS_PADRAO: ConvenioRow[] = [];

const limparPrefixoMedico = (nome: string) =>
  nome.replace(/^(\s*(dr|dra)\.?\s+)+/i, "").trim();

const fetchProcedimentosAtivos = async (clinicaId: string) => {
  const pageSize = 1000;
  const all: Procedimento[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("procedimentos")
      .select("id, nome, grupo, tipo, valor_padrao")
      .eq("clinica_id", clinicaId)
      .eq("ativo", true)
      .order("nome")
      .range(from, from + pageSize - 1);

    if (error) throw error;

    const rows = (data as Procedimento[]) ?? [];
    all.push(...rows);

    if (rows.length < pageSize) break;
  }

  return all;
};

const emptyForm = () => ({
  nome: "", crm: "", crm_uf: "",
  especialidades: [] as EspecialidadeRow[],
  procedimentos: [] as string[],
  procedimento_padrao_id: "" as string,
  procedimento_padrao_em_branco: false,
  tipo_repasse: "percentual" as "percentual" | "valor",
  percentual: "50",
  valor: "",
  aceita_cartao_beneficios: true,
  cb_tipo_repasse: "valor" as "percentual" | "valor",
  cb_percentual: "",
  cb_valor: "",
  duracao_consulta_min: "15",
  usa_sistema: true,
  cpf: "", rg: "", data_nascimento: "", email: "", telefone: "", telefone2: "",
  nacionalidade: "Brasileira", estado_civil: "",
  sexo: "nao_informar",
  cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", estado: "",
  banco: "", agencia: "", conta: "", pix_chave: "",
  criarUsuario: false,
  senhaUsuario: "",
  roleUsuario: "medico" as "admin" | "gestor" | "medico" | "enfermeiro" | "recepcao" | "financeiro",
  ativo: true,
});

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  clinicaId: string;
  editingMedicoId?: string | null;
  onSaved?: () => void;
  asPage?: boolean;
  // Pré-preenche o nome ao abrir em modo "novo médico" — usado para completar
  // o cadastro de alguém cujo perfil de acesso já é "Médico" (clinica_memberships)
  // mas ainda não tem registro em `medicos` (CRM etc.).
  prefillNome?: string;
  // Vincula o registro `medicos` recém-criado a este user_id existente (mesmo
  // caso acima). Sem isso, o médico completado ficaria com um login "solto"
  // (sem user_id), sem contar como cadastro completo para quem já tinha
  // perfil de acesso "Médico" — continuaria aparecendo como pendente.
  prefillUserId?: string;
}

export function MedicoFormDialog({ open, onOpenChange, clinicaId, editingMedicoId, onSaved, asPage = false, prefillNome, prefillUserId }: Props) {
  const cadastrarUsuarioFn = useServerFn(cadastrarUsuario);
  const getLoginFn = useServerFn(getFuncionarioLogin);
  const definirSenhaFn = useServerFn(definirSenhaFuncionario);
  const { clinicaAtual } = useClinica();
  const podeGerenciarEquipe = clinicaAtual?.role === "admin" || clinicaAtual?.role === "gestor";

  const [esps, setEsps] = useState<Especialidade[]>([]);
  const [procs, setProcs] = useState<Procedimento[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formClinicaId, setFormClinicaId] = useState(clinicaId);
  const [medicoUserId, setMedicoUserId] = useState<string | null>(null);
  const [existingEmail, setExistingEmail] = useState<string | null>(null);
  const [convenios, setConvenios] = useState<ConvenioRow[]>(CONVENIOS_PADRAO);
  const [form, setForm] = useState(emptyForm());
  // Laudo Terceiro: catálogo de cardiologistas ativos da clínica + linhas configuradas
  const [laudadoresCatalog, setLaudadoresCatalog] = useState<LaudadorOption[]>([]);
  const [laudadores, setLaudadores] = useState<LaudadorRow[]>([]);
  // Map procedimento_id -> Map(normalizedSpecialtyKey -> originalSpecialtyName)
  const [procEspMap, setProcEspMap] = useState<Map<string, Map<string, string>>>(new Map());

  const [showSenha, setShowSenha] = useState(false);
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [savingSenha, setSavingSenha] = useState(false);
  // Troca de perfil de acesso (mover médico → funcionário)
  const [novoPerfilAcesso, setNovoPerfilAcesso] = useState<string>("medico");
  const [confirmTrocaPerfil, setConfirmTrocaPerfil] = useState(false);
  const [trocandoPerfil, setTrocandoPerfil] = useState(false);
  const navigateEquipe = useNavigate();
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [bulkQuery, setBulkQuery] = useState("");
  const activeClinicaId = formClinicaId || clinicaId;

  const normalizarNome = (s: string) =>
    s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();

  const especialidadesSelecionadasNomes = useMemo(() => {
    const nomes = new Set<string>();
    for (const er of form.especialidades) {
      const esp = esps.find((e) => e.id === er.especialidade_id);
      if (esp?.nome) nomes.add(normalizarNome(esp.nome));
    }
    return nomes;
  }, [form.especialidades, esps]);

  // Especialidades selecionadas pelo médico (objetos completos), preservando a ordem
  const especialidadesSelecionadas = useMemo(() => {
    const out: Especialidade[] = [];
    const seen = new Set<string>();
    for (const er of form.especialidades) {
      if (!er.especialidade_id || seen.has(er.especialidade_id)) continue;
      const esp = esps.find((e) => e.id === er.especialidade_id);
      if (!esp) continue;
      seen.add(esp.id);
      out.push(esp);
    }
    return out;
  }, [form.especialidades, esps]);

  // Para cada procedimento, lista as especialidades (entre as que o médico tem)
  // a que ele está associado (via grupo direto ou via procedimento_especialidades).
  const procEspChoices = useMemo(() => {
    const map = new Map<string, { id: string; nome: string }[]>();
    for (const p of procs) {
      const out: { id: string; nome: string }[] = [];
      const grupoKey = p.grupo ? normalizarNome(p.grupo) : "";
      const extras = procEspMap.get(p.id);
      for (const e of especialidadesSelecionadas) {
        const key = normalizarNome(e.nome);
        if ((grupoKey && grupoKey === key) || extras?.has(key)) {
          out.push({ id: e.id, nome: e.nome });
        }
      }
      map.set(p.id, out);
    }
    return map;
  }, [procs, especialidadesSelecionadas, procEspMap]);

  const procsFiltradosPorEspecialidade = useMemo(() => {
    if (especialidadesSelecionadasNomes.size === 0) return [] as Procedimento[];
    return procs.filter((p) => {
      if (p.grupo && especialidadesSelecionadasNomes.has(normalizarNome(p.grupo))) return true;
      const extras = procEspMap.get(p.id);
      if (extras) {
        for (const key of extras.keys()) {
          if (especialidadesSelecionadasNomes.has(key)) return true;
        }
      }
      return false;
    });
  }, [procs, especialidadesSelecionadasNomes, procEspMap]);

  // Codifica/decodifica um item da lista de serviços do médico como `procId|espId`.
  // Quando não há especialidade associada (legado), usa só `procId|`.
  const splitItem = (v: string): { pid: string; eid: string | null } => {
    if (!v) return { pid: "", eid: null };
    const [pid, eid] = v.split("|");
    return { pid: pid ?? "", eid: eid && eid.length > 0 ? eid : null };
  };
  const joinItem = (pid: string, eid: string | null) => `${pid}|${eid ?? ""}`;

  // Rótulo da opção, sempre "NOME (ESPECIALIDADE)" quando houver especialidade.
  const labelProcedimentoEsp = (p: Procedimento, esp: Especialidade | null): string => {
    if (esp) return `${p.nome} (${esp.nome.toUpperCase()})`;
    return p.nome;
  };

  // Remove automaticamente da lista de serviços do médico qualquer item cujo
  // procedimento não pertença a nenhuma das especialidades atualmente selecionadas
  // (via `grupo` do procedimento ou via procedimento_especialidades). Também
  // descarta itens legados sem procedimento válido. Só roda depois que `procs`
  // e `procEspMap` estão carregados para não apagar tudo no primeiro render.
  useEffect(() => {
    if (!procs.length) return;
    const idsValidos = new Set(procsFiltradosPorEspecialidade.map((p) => p.id));
    setForm((f) => {
      if (!f.procedimentos.length) return f;
      const filtrados = f.procedimentos.filter((item) => {
        if (!item) return true; // preserva linhas em branco (novo serviço manual)
        const { pid } = splitItem(item);
        if (!pid) return true;
        return idsValidos.has(pid);
      });
      if (filtrados.length === f.procedimentos.length) return f;
      return { ...f, procedimentos: filtrados };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [procs, procEspMap, especialidadesSelecionadasNomes, procsFiltradosPorEspecialidade]);

  // Sincroniza a aba "Repasse" com os serviços selecionados em Especialidades:
  //  • Cada categoria distinta (Consulta / Exame / Procedimento) dos serviços
  //    selecionados vira automaticamente uma linha em REPASSE INDIVIDUAL,
  //    armazenada com nome sentinela `__CAT__:<TIPO>`.
  //  • Cada SERVIÇO distinto selecionado também vira automaticamente uma linha
  //    (chave = nome do procedimento) — permite definir repasse por serviço
  //    específico direto, sem precisar clicar em "Manual".
  //  • Linhas de serviço cujo procedimento foi desmarcado são removidas
  //    somente se estiverem em branco; se preenchidas, permanecem como manual.
  //  • Linhas manuais avulsas (ex.: "Cartão Consulta") são preservadas.
  useEffect(() => {
    if (!procs.length) return;
    setConvenios((cs) => {
      const tiposSelecionados = new Set<string>();
      const nomesServicosSelecionados = new Set<string>();
      // Preserva o nome original (case) para exibir na tabela.
      const nomeOriginalPorKey = new Map<string, string>();
      for (const item of form.procedimentos) {
        const { pid } = splitItem(item);
        if (!pid) continue;
        const proc = procs.find((p) => p.id === pid);
        if (proc?.tipo) tiposSelecionados.add(String(proc.tipo).toUpperCase());
        if (proc?.nome) {
          const key = normalizarNome(proc.nome);
          nomesServicosSelecionados.add(key);
          if (!nomeOriginalPorKey.has(key)) nomeOriginalPorKey.set(key, proc.nome);
        }
      }

      // Mantém sentinelas de categoria ainda usadas, linhas de serviço em uso
      // (ou já preenchidas) e todas as manuais.
      const mantidos = cs.filter((c) => {
        const nome = c.nome ?? "";
        if (nome.startsWith("__CAT__:")) {
          const tipo = nome.slice("__CAT__:".length).toUpperCase();
          return tiposSelecionados.has(tipo);
        }
        // Se o nome corresponde a um serviço que NÃO está mais selecionado
        // em Especialidades E a linha está em branco (auto-linha vazia),
        // descarta. Caso contrário (preenchida ou nome livre), preserva.
        const key = normalizarNome(nome);
        const isServicoCadastrado = procs.some((p) => normalizarNome(p.nome) === key);
        if (isServicoCadastrado && !nomesServicosSelecionados.has(key)) {
          const vazio = !c.percentual && !c.valor;
          if (vazio) return false;
        }
        return true;
      });

      const existentesCat = new Set(
        mantidos
          .filter((c) => (c.nome ?? "").startsWith("__CAT__:"))
          .map((c) => c.nome.slice("__CAT__:".length).toUpperCase()),
      );
      const existentesServico = new Set(
        mantidos
          .filter((c) => !(c.nome ?? "").startsWith("__CAT__:") && c.nome)
          .map((c) => normalizarNome(c.nome)),
      );
      const novos: ConvenioRow[] = [];
      const ordem = ["CONSULTA", "EXAME", "PROCEDIMENTO"];
      for (const tipo of ordem) {
        if (!tiposSelecionados.has(tipo)) continue;
        if (existentesCat.has(tipo)) continue;
        novos.push({
          nome: `__CAT__:${tipo}`,
          tipo_repasse: form.tipo_repasse,
          percentual: "",
          valor: "",
          ativo: true,
        });
      }
      // Uma linha por serviço selecionado que ainda não tenha linha.
      for (const [key, nomeOriginal] of nomeOriginalPorKey) {
        if (existentesServico.has(key)) continue;
        novos.push({
          nome: nomeOriginal,
          tipo_repasse: form.tipo_repasse,
          percentual: "",
          valor: "",
          ativo: true,
        });
      }

      if (mantidos.length === cs.length && novos.length === 0) return cs;
      return [...mantidos, ...novos];
    });
  }, [form.procedimentos, procs, form.tipo_repasse]);

  // Rótulo amigável da categoria sentinela.
  const labelCategoria = (nome: string): string | null => {
    if (!nome.startsWith("__CAT__:")) return null;
    const tipo = nome.slice("__CAT__:".length).toUpperCase();
    if (tipo === "CONSULTA") return "Consultas";
    if (tipo === "EXAME") return "Exames";
    if (tipo === "PROCEDIMENTO") return "Procedimentos";
    return tipo;
  };

  // Lista de serviços selecionados pelo médico (para o picker do Manual override).
  // Cada item: { value: nome do procedimento (usado no lookup), label }.
  const servicosDoMedico = useMemo(() => {
    const out: { value: string; label: string }[] = [];
    const seen = new Set<string>();
    for (const item of form.procedimentos) {
      const { pid, eid } = splitItem(item);
      const proc = procs.find((p) => p.id === pid);
      if (!proc) continue;
      const key = normalizarNome(proc.nome);
      if (seen.has(key)) continue;
      seen.add(key);
      const esp = eid ? esps.find((e) => e.id === eid) ?? null : null;
      out.push({ value: proc.nome, label: labelProcedimentoEsp(proc, esp) });
    }
    out.sort((a, b) => a.label.localeCompare(b.label));
    return out;
  }, [form.procedimentos, procs, esps]);

  // Map: chave normalizada do nome do serviço -> rótulo "NOME (ESPECIALIDADE)"
  // usado para exibir as linhas automáticas por serviço na aba Repasse.
  const labelServicoPorNomeKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of servicosDoMedico) {
      m.set(normalizarNome(s.value), s.label);
    }
    return m;
  }, [servicosDoMedico]);

  // Load reference data
  useEffect(() => {
    if (!open || !activeClinicaId) return;
    let cancelled = false;
    void supabase.from("especialidades").select("id, nome").order("nome").then(({ data }) => setEsps(data ?? []));
    void fetchProcedimentosAtivos(activeClinicaId)
      .then((data) => {
        if (!cancelled) setProcs(data);
      })
      .catch(() => {
        if (!cancelled) {
          setProcs([]);
          toast.error("Não foi possível carregar os serviços.");
        }
      });
    void supabase
      .from("procedimento_especialidades")
      .select("procedimento_id, especialidade:especialidades(nome)")
      .eq("clinica_id", activeClinicaId)
      .then(({ data }) => {
        if (cancelled) return;
        const m = new Map<string, Map<string, string>>();
        for (const row of (data as any[]) ?? []) {
          const nome = row?.especialidade?.nome;
          if (!nome) continue;
          const key = nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
          if (!m.has(row.procedimento_id)) m.set(row.procedimento_id, new Map());
          m.get(row.procedimento_id)!.set(key, nome);
        }
        setProcEspMap(m);
      });

    return () => {
      cancelled = true;
    };
  }, [open, activeClinicaId]);

  // Load medico when editing
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setShowSenha(false);
    setNovaSenha("");
    setConfirmarSenha("");
    setFormClinicaId(clinicaId);
    if (!editingMedicoId) {
      setEditId(null);
      setMedicoUserId(null);
      setExistingEmail(null);
      setConvenios(CONVENIOS_PADRAO.map((c) => ({ ...c })));
      setLaudadores([]);
      setLaudadoresCatalog([]);
      setForm({ ...emptyForm(), nome: prefillNome ?? "" });
      return;
    }
    void (async () => {
      setLoading(true);
      const { data: m } = await supabase
        .from("medicos")
        .select("id, clinica_id, user_id, nome, crm, crm_uf, email, telefone, telefone2, nacionalidade, estado_civil, sexo, duracao_consulta_min, usa_sistema, procedimento_padrao_id, cep, logradouro, numero, complemento, bairro, cidade, estado, ativo, medico_especialidades(especialidade_id, tem_rqe, rqe_numero, especialidade:especialidades(id, nome))")
        .eq("id", editingMedicoId)
        .maybeSingle();
      if (cancelled) return;
      if (!m) {
        setLoading(false);
        setEditId(null);
        setMedicoUserId(null);
        setExistingEmail(null);
        setConvenios(CONVENIOS_PADRAO.map((c) => ({ ...c })));
        setForm(emptyForm());
        return;
      }
      const med = m as any;
      setFormClinicaId(med.clinica_id ?? clinicaId);
      // Dados sensíveis (CPF, RG, banco, PIX) vêm via RPC restrita a gestores/próprio médico
      let sens: any = {};
      try {
        const { data: s } = await supabase.rpc("medico_dados_sensiveis", { _medico_id: editingMedicoId });
        sens = (s as any) ?? {};
      } catch { sens = {}; }
      setEditId(med.id);
      setMedicoUserId(med.user_id ?? null);
      const { data: convs } = await supabase
        .from("medico_convenios")
        .select("id, nome, tipo_repasse, percentual, valor, ativo")
        .eq("medico_id", med.id)
        .order("created_at");
      if (convs && convs.length) {
        setConvenios(convs.map((c) => ({
          id: c.id,
          nome: c.nome,
          tipo_repasse: (c.tipo_repasse as "percentual" | "valor") ?? "percentual",
          percentual: c.percentual != null ? String(c.percentual) : "",
          valor: c.valor != null ? String(c.valor) : "",
          ativo: c.ativo ?? true,
        })));
      } else {
        setConvenios(CONVENIOS_PADRAO.map((c) => ({ ...c })));
      }
      // Laudo terceiro — catálogo de cardiologistas ativos + linhas já cadastradas
      const cliId = med.clinica_id ?? clinicaId;
      try {
        const { data: cardios } = await supabase
          .from("medicos")
          .select("id, nome, crm, crm_uf, ativo, medico_especialidades!inner(especialidade:especialidades!inner(nome))")
          .eq("clinica_id", cliId)
          .eq("ativo", true)
          .ilike("medico_especialidades.especialidade.nome", "%cardio%")
          .neq("id", med.id)
          .order("nome");
        const catalog: LaudadorOption[] = ((cardios as any[]) ?? []).map((c) => ({
          id: c.id, nome: c.nome, crm: c.crm ?? null, crm_uf: c.crm_uf ?? null,
        }));
        // dedup (join pode duplicar se médico tiver múltiplas linhas em cardio)
        const seen = new Set<string>();
        setLaudadoresCatalog(catalog.filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true))));
      } catch { setLaudadoresCatalog([]); }
      const { data: laudos } = await supabase
        .from("medico_repasse_laudo")
        .select("laudador_medico_id, tipo_repasse, percentual, valor")
        .eq("agenda_medico_id", med.id);
      setLaudadores(((laudos as any[]) ?? []).map((r) => ({
        laudador_medico_id: r.laudador_medico_id,
        tipo_repasse: (r.tipo_repasse as "percentual" | "valor") ?? "percentual",
        percentual: r.percentual != null ? String(r.percentual) : "",
        valor: r.valor != null ? String(r.valor) : "",
      })));
      const { data: mprocs } = await supabase
        .from("medico_procedimentos")
        .select("procedimento_id, especialidade_id")
        .eq("medico_id", med.id);
      if (cancelled) return;
      setForm({
        nome: limparPrefixoMedico(med.nome ?? ""),
        crm: med.crm,
        crm_uf: med.crm_uf,
        especialidades: ((med.medico_especialidades ?? []) as any[])
          .filter((me) => me?.especialidade_id)
          .map((me) => ({
            especialidade_id: me.especialidade_id as string,
            tem_rqe: !!me.tem_rqe,
            rqe_numero: me.rqe_numero ?? "",
          })),
        procedimentos: (mprocs ?? []).map(
          (p: any) => `${p.procedimento_id}|${p.especialidade_id ?? ""}`,
        ),
        procedimento_padrao_id: (med as any).procedimento_padrao_id ?? "",
        procedimento_padrao_em_branco: !!(med as any).procedimento_padrao_em_branco,
        tipo_repasse: (sens.tipo_repasse as "percentual" | "valor") ?? "percentual",
        percentual: sens.percentual_repasse_padrao != null ? String(sens.percentual_repasse_padrao) : "",
        valor: sens.valor_repasse_padrao != null ? String(sens.valor_repasse_padrao) : "",
        aceita_cartao_beneficios: sens.aceita_cartao_beneficios !== false,
        cb_tipo_repasse: (sens.cb_tipo_repasse as "percentual" | "valor") ?? "valor",
        cb_percentual: sens.cb_percentual_repasse != null ? String(sens.cb_percentual_repasse) : "",
        cb_valor: sens.cb_valor_repasse != null ? String(sens.cb_valor_repasse) : "",
        duracao_consulta_min: med.duracao_consulta_min != null ? String(med.duracao_consulta_min) : "15",
        usa_sistema: (med as { usa_sistema?: boolean }).usa_sistema !== false,
        cpf: sens.cpf ?? "", rg: sens.rg ?? "", data_nascimento: sens.data_nascimento ?? "",
        email: med.email ?? "", telefone: med.telefone ?? "", telefone2: med.telefone2 ?? "",
        nacionalidade: med.nacionalidade ?? "Brasileira", estado_civil: med.estado_civil ?? "",
        sexo: med.sexo ?? "nao_informar",
        cep: med.cep ?? "", logradouro: med.logradouro ?? "", numero: med.numero ?? "",
        complemento: med.complemento ?? "", bairro: med.bairro ?? "", cidade: med.cidade ?? "", estado: med.estado ?? "",
        banco: sens.banco ?? "", agencia: sens.agencia ?? "", conta: sens.conta ?? "", pix_chave: sens.pix_chave ?? "",
        criarUsuario: false, senhaUsuario: "", roleUsuario: "medico",
        ativo: (med as { ativo?: boolean }).ativo !== false,
      });
      if (med.user_id) {
        if (podeGerenciarEquipe) {
          try {
            const res = await getLoginFn({ data: { clinicaId: med.clinica_id ?? clinicaId, userId: med.user_id } });
            setExistingEmail((res as { email?: string | null })?.email ?? null);
          } catch { setExistingEmail(null); }
        } else {
          setExistingEmail(null);
        }
      } else {
        setExistingEmail(null);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, editingMedicoId, clinicaId, prefillNome]);

  async function salvarNovaSenha() {
    if (!medicoUserId) return;
    if (novaSenha.length < 6) { toast.error("Senha deve ter pelo menos 6 caracteres"); return; }
    if (novaSenha !== confirmarSenha) { toast.error("As senhas não conferem"); return; }
    setSavingSenha(true);
    try {
      await definirSenhaFn({ data: { clinicaId: activeClinicaId, userId: medicoUserId, novaSenha } });
      toast.success("Senha atualizada");
      setShowSenha(false);
      setNovaSenha("");
      setConfirmarSenha("");
    } catch (e) {
      toast.error((e as Error)?.message ?? "Erro ao atualizar senha");
    } finally {
      setSavingSenha(false);
    }
  }

  // Troca o perfil de acesso deste usuário na clínica ativa e desativa o
  // cadastro em `public.medicos` (o histórico é preservado). RLS de
  // `clinica_memberships` já restringe a admin/gestor via
  // `can_manage_clinica`; a UI só oferece o botão para essa mesma faixa.
  async function trocarPerfilAcesso() {
    if (!medicoUserId || !activeClinicaId) return;
    if (novoPerfilAcesso === "medico") {
      toast.info("Selecione um perfil diferente de Médico.");
      return;
    }
    setTrocandoPerfil(true);
    try {
      const { data: memUpd, error: e1 } = await supabase
        .from("clinica_memberships")
        .update({ role: novoPerfilAcesso as "recepcao" })
        .eq("user_id", medicoUserId)
        .eq("clinica_id", activeClinicaId)
        .select("id");
      if (e1) { mostrarErro(e1); return; }
      if (!memUpd || memUpd.length === 0) {
        toast.error("Sem permissão para trocar o perfil deste usuário.");
        return;
      }
      if (editId) {
        const { error: e2 } = await supabase
          .from("medicos")
          .update({ ativo: false })
          .eq("id", editId);
        if (e2) { mostrarErro(e2, "erro ao desativar cadastro do médico"); return; }
      }
      toast.success("Perfil de acesso alterado. O usuário agora aparece em Funcionários.");
      setConfirmTrocaPerfil(false);
      navigateEquipe({ to: "/app/equipe", search: { tab: "funcionarios" } });
    } catch (err) {
      toast.error((err as Error)?.message ?? "Erro ao trocar perfil");
    } finally {
      setTrocandoPerfil(false);
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    for (const er of form.especialidades) {
      if (er.tem_rqe && !er.rqe_numero.trim()) {
        toast.error("Informe o número do RQE da especialidade marcada");
        return;
      }
    }
    setSaving(true);
    const nomeLimpo = limparPrefixoMedico(form.nome);
    const payload = {
      clinica_id: activeClinicaId,
      nome: nomeLimpo,
      crm: form.crm,
      crm_uf: form.crm_uf.toUpperCase(),
      especialidade_id: form.especialidades[0]?.especialidade_id ?? null,
      tipo_repasse: form.tipo_repasse,
      percentual_repasse_padrao: form.tipo_repasse === "percentual" ? parseFloat(form.percentual || "0") : 0,
      valor_repasse_padrao: form.tipo_repasse === "valor" ? parseFloat(form.valor || "0") : null,
      aceita_cartao_beneficios: form.aceita_cartao_beneficios,
      cb_tipo_repasse: form.aceita_cartao_beneficios ? form.cb_tipo_repasse : null,
      cb_percentual_repasse: form.aceita_cartao_beneficios && form.cb_tipo_repasse === "percentual"
        ? parseFloat(form.cb_percentual || "0")
        : null,
      cb_valor_repasse: form.aceita_cartao_beneficios && form.cb_tipo_repasse === "valor"
        ? parseFloat(form.cb_valor || "0")
        : null,
      duracao_consulta_min: parseInt(form.duracao_consulta_min || "15") || 15,
      usa_sistema: form.usa_sistema,
      procedimento_padrao_id: form.procedimento_padrao_id || null,
      procedimento_padrao_em_branco: form.procedimento_padrao_em_branco,
      cpf: form.cpf || null,
      rg: form.rg || null,
      data_nascimento: form.data_nascimento || null,
      email: form.email || null,
      telefone: form.telefone || null,
      telefone2: form.telefone2 || null,
      nacionalidade: form.nacionalidade || null,
      estado_civil: form.estado_civil || null,
      sexo: form.sexo,
      cep: form.cep || null,
      logradouro: form.logradouro || null,
      numero: form.numero || null,
      complemento: form.complemento || null,
      bairro: form.bairro || null,
      cidade: form.cidade || null,
      estado: form.estado ? form.estado.toUpperCase() : null,
      banco: form.banco || null,
      agencia: form.agencia || null,
      conta: form.conta || null,
      pix_chave: form.pix_chave || null,
      ativo: form.ativo,
      // Só entra no INSERT (nunca no UPDATE, para não sobrescrever o vínculo
      // de um médico já existente): liga este novo registro a um user_id que
      // já tinha perfil de acesso "Médico" mas cadastro incompleto.
      ...(!editId && prefillUserId ? { user_id: prefillUserId } : {}),
    };
    let medicoId = editId;
    if (editId) {
      const { data: upd, error } = await supabase
        .from("medicos")
        .update(payload)
        .eq("id", editId)
        .select("id");
      if (error) { setSaving(false); mostrarErro(error); return; }
      if (!upd || upd.length === 0) {
        setSaving(false);
        toast.error(
          "Sem permissão para alterar este médico. Apenas gestores/administradores da clínica podem salvar essas alterações.",
        );
        return;
      }
      const { error: delEsp } = await supabase.from("medico_especialidades").delete().eq("medico_id", editId);
      if (delEsp) { setSaving(false); mostrarErro(delEsp, "erro ao limpar especialidades"); return; }
      const { error: delProc } = await supabase.from("medico_procedimentos").delete().eq("medico_id", editId);
      if (delProc) { setSaving(false); mostrarErro(delProc, "erro ao limpar procedimentos"); return; }
    } else {
      const { data: novo, error } = await supabase.from("medicos").insert(payload).select("id").single();
      if (error || !novo) { setSaving(false); mostrarErro(error); return; }
      medicoId = novo.id;
      // C-2: Cria agenda padrão imediatamente para o novo médico,
      // garantindo que disponibilidades possam ser cadastradas sem violar a FK.
      const { error: agErr } = await supabase
        .from("medico_agendas")
        .insert({ clinica_id: clinicaId, medico_id: medicoId, nome: "AGENDA", ordem: 0, ativo: true } as never);
      if (agErr) {
        toast.warning(`Médico criado, mas agenda padrão falhou: ${agErr.message}`);
      }
    }
    const especialidadesValidas = form.especialidades.filter((x) => !!x.especialidade_id);
    if (medicoId && especialidadesValidas.length) {
      const seen = new Set<string>();
      const rows = form.especialidades
        .filter((er) => {
          if (!er.especialidade_id || seen.has(er.especialidade_id)) return false;
          seen.add(er.especialidade_id);
          return true;
        })
        .map((er) => ({
          medico_id: medicoId!,
          especialidade_id: er.especialidade_id,
          tem_rqe: er.tem_rqe,
          rqe_numero: er.tem_rqe ? er.rqe_numero.trim() || null : null,
        }));
      const { error: e2 } = await supabase.from("medico_especialidades").insert(rows);
      if (e2) { setSaving(false); mostrarErro(e2); return; }
    }
    const itensUnicos = Array.from(new Set(form.procedimentos.filter((x) => !!x)));
    if (medicoId && itensUnicos.length) {
      const procRows = itensUnicos
        .map((item) => splitItem(item))
        .filter((x) => !!x.pid)
        .map((x) => ({
          medico_id: medicoId!,
          procedimento_id: x.pid,
          especialidade_id: x.eid,
        }));
      const { error: ep } = await supabase.from("medico_procedimentos").insert(procRows);
      if (ep) { setSaving(false); mostrarErro(ep); return; }
    }
    if (medicoId) {
      await supabase.from("medico_convenios").delete().eq("medico_id", medicoId);
      const convRows = convenios
        .filter((c) => c.nome.trim())
        .map((c) => ({
          medico_id: medicoId!,
          nome: c.nome.trim(),
          tipo_repasse: c.tipo_repasse,
          percentual: c.tipo_repasse === "percentual" ? parseFloat(c.percentual || "0") : 0,
          valor: c.tipo_repasse === "valor" ? parseFloat(c.valor || "0") : null,
          ativo: c.ativo,
        }));
      if (convRows.length) {
        const { error: e3 } = await supabase.from("medico_convenios").insert(convRows);
        if (e3) { setSaving(false); mostrarErro(e3); return; }
      }
    }
    // Laudo terceiro — replace-all
    if (medicoId) {
      await supabase.from("medico_repasse_laudo").delete().eq("agenda_medico_id", medicoId);
      const laudoRows = laudadores
        .filter((l) => l.laudador_medico_id && (
          (l.tipo_repasse === "percentual" && l.percentual.trim() !== "" && Number(l.percentual) > 0) ||
          (l.tipo_repasse === "valor" && l.valor.trim() !== "" && Number(l.valor) > 0)
        ))
        .map((l) => ({
          clinica_id: activeClinicaId,
          agenda_medico_id: medicoId!,
          laudador_medico_id: l.laudador_medico_id,
          tipo_repasse: l.tipo_repasse,
          percentual: l.tipo_repasse === "percentual" ? Number(l.percentual) : null,
          valor: l.tipo_repasse === "valor" ? Number(l.valor) : null,
          ativo: true,
        }));
      if (laudoRows.length) {
        const { error: eLaudo } = await supabase.from("medico_repasse_laudo").insert(laudoRows);
        if (eLaudo) { setSaving(false); mostrarErro(eLaudo); return; }
      }
    }
    toast.success(editId ? "Médico atualizado!" : "Médico cadastrado!");

    // Auto-create paciente on new medico
    if (!editId && nomeLimpo) {
      try {
        let existe: { id: string } | null = null;
        if (form.cpf) {
          const { data } = await supabase
            .from("pacientes")
            .select("id")
            .eq("clinica_id", clinicaId)
            .eq("cpf", form.cpf)
            .maybeSingle();
          existe = data;
        }
        if (!existe && form.email) {
          const { data } = await supabase
            .from("pacientes")
            .select("id")
            .eq("clinica_id", clinicaId)
            .ilike("email", form.email)
            .maybeSingle();
          existe = data;
        }
        if (!existe) {
          await supabase.from("pacientes").insert({
            clinica_id: clinicaId,
            nome: nomeLimpo,
            cpf: form.cpf || null,
            data_nascimento: form.data_nascimento || null,
            email: form.email || null,
            telefone: form.telefone || null,
            telefone2: form.telefone2 || null,
            cep: form.cep || null,
            logradouro: form.logradouro || null,
            numero: form.numero || null,
            complemento: form.complemento || null,
            bairro: form.bairro || null,
            cidade: form.cidade || null,
            estado: form.estado ? form.estado.toUpperCase() : null,
            ativo: true,
          } as never);
          toast.success("Cadastro de paciente criado automaticamente.");
        }
      } catch (err: any) {
        toast.warning(`Médico salvo, mas paciente não foi criado: ${err?.message ?? err}`);
      }
    }

    // Optionally create system user / add to clinic team
    if (form.criarUsuario && form.email && form.senhaUsuario.length >= 6) {
      try {
        await cadastrarUsuarioFn({
          data: {
            clinicaId: activeClinicaId,
            email: form.email,
            password: form.senhaUsuario,
            nome: nomeLimpo,
            role: form.roleUsuario,
          },
        });
        toast.success("Usuário do sistema criado e vinculado à equipe!");
      } catch (err: any) {
        mostrarErro(err, "médico salvo, mas erro ao criar usuário");
      }
    } else if (form.criarUsuario) {
      toast.warning("Informe e-mail e senha (mín. 6 caracteres) para criar o usuário.");
    }

    setSaving(false);
    onOpenChange(false);
    onSaved?.();
  };

  const hasLogin = !!medicoUserId;

  const title = editId ? "Editar médico" : "Novo médico";

  const inner = loading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Carregando…</div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <Tabs defaultValue="dados">
              <TabsList className={asPage ? "grid grid-cols-6 w-full" : "grid grid-cols-6 w-full sticky top-[3.25rem] z-10"}>
                <TabsTrigger value="dados">Dados</TabsTrigger>
                <TabsTrigger value="especialidades">Especialidades</TabsTrigger>
                <TabsTrigger value="agendas" disabled={!editingMedicoId}>Agendas</TabsTrigger>
                <TabsTrigger value="banco">Banco</TabsTrigger>
                <TabsTrigger value="repasse">Repasse</TabsTrigger>
                <TabsTrigger value="acesso">Acesso</TabsTrigger>
              </TabsList>

              <TabsContent value="dados" className="space-y-4 pt-4 pb-16">
                <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-3">
                  <Checkbox
                    id="medico-ativo"
                    checked={form.ativo}
                    onCheckedChange={(v) => setForm({ ...form, ativo: v === true })}
                  />
                  <Label htmlFor="medico-ativo" className="cursor-pointer">
                    Médico ativo {form.ativo ? "" : "(desmarque para inativar)"}
                  </Label>
                </div>
                <div className="space-y-2">
                  <Label>Nome completo *</Label>
                  <Input required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2 space-y-2">
                    <Label>CRM *</Label>
                    <Input required value={form.crm} onChange={(e) => setForm({ ...form, crm: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>UF *</Label>
                    <Input required maxLength={2} value={form.crm_uf} onChange={(e) => setForm({ ...form, crm_uf: e.target.value.toUpperCase() })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>CPF</Label>
                    <Input value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>RG</Label>
                    <Input value={form.rg} onChange={(e) => setForm({ ...form, rg: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label>Data de nascimento</Label>
                    <DateInputBR value={form.data_nascimento} onChange={(e) => setForm({ ...form, data_nascimento: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Nacionalidade</Label>
                    <Input value={form.nacionalidade} onChange={(e) => setForm({ ...form, nacionalidade: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Estado civil</Label>
                    <Input value={form.estado_civil} onChange={(e) => setForm({ ...form, estado_civil: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label>Sexo</Label>
                    <Select value={form.sexo} onValueChange={(v) => setForm({ ...form, sexo: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="masculino">Masculino</SelectItem>
                        <SelectItem value="feminino">Feminino</SelectItem>
                        <SelectItem value="outro">Outro</SelectItem>
                        <SelectItem value="nao_informar">Prefiro não informar</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="pt-2">
                  <div className="rounded-md border p-3 flex items-start gap-3 bg-muted/30">
                    <Checkbox
                      id="usa_sistema"
                      checked={form.usa_sistema}
                      onCheckedChange={(c) => setForm({ ...form, usa_sistema: c === true })}
                    />
                    <div className="space-y-1">
                      <Label htmlFor="usa_sistema" className="cursor-pointer">
                        Médico usa o sistema (prontuário digital)
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Quando <b>desmarcado</b>, o médico faz prontuário em papel. Na agenda, em vez de abrir o prontuário, aparece o botão <b>"Concluir atendimento"</b> (1 clique) para finalizar a consulta e liberar o repasse normalmente.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <div className="border-t pt-4 space-y-4">
                    <div>
                      <h3 className="text-sm font-semibold">Contato</h3>
                      <p className="text-xs text-muted-foreground">Formas de contato do médico.</p>
                    </div>
                    <div className="space-y-2">
                      <Label>E-mail</Label>
                      <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Telefone</Label>
                      <Input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Telefone 2</Label>
                      <Input value={form.telefone2} onChange={(e) => setForm({ ...form, telefone2: e.target.value })} placeholder="Telefone secundário (opcional)" />
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <div className="border-t pt-4 space-y-4">
                    <div>
                      <h3 className="text-sm font-semibold">Endereço</h3>
                      <p className="text-xs text-muted-foreground">Endereço de referência do médico.</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="space-y-2">
                        <Label>CEP</Label>
                        <Input value={form.cep} onChange={(e) => setForm({ ...form, cep: e.target.value })} />
                      </div>
                      <div className="sm:col-span-2 space-y-2">
                        <Label>Logradouro</Label>
                        <Input value={form.logradouro} onChange={(e) => setForm({ ...form, logradouro: e.target.value })} />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="space-y-2">
                        <Label>Número</Label>
                        <Input value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} />
                      </div>
                      <div className="sm:col-span-2 space-y-2">
                        <Label>Complemento</Label>
                        <Input value={form.complemento} onChange={(e) => setForm({ ...form, complemento: e.target.value })} />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="space-y-2">
                        <Label>Bairro</Label>
                        <Input value={form.bairro} onChange={(e) => setForm({ ...form, bairro: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label>Cidade</Label>
                        <Input value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label>UF</Label>
                        <Input maxLength={2} value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value.toUpperCase() })} />
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="especialidades" className="space-y-2 pt-4">
                <div className="border rounded-md p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium">Especialidades</Label>
                      <p className="text-xs text-muted-foreground">Adicione uma ou mais especialidades. Marque "Tem RQE" e informe o número quando aplicável.</p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setForm({
                          ...form,
                          especialidades: [
                            ...form.especialidades,
                            { especialidade_id: "", tem_rqe: false, rqe_numero: "" },
                          ],
                        })
                      }
                    >
                      <Plus className="h-4 w-4 mr-1" /> Adicionar especialidade
                    </Button>
                  </div>
                  {esps.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Nenhuma especialidade cadastrada no sistema.</p>
                  ) : form.especialidades.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Nenhuma especialidade selecionada.</p>
                  ) : (
                    <div className="space-y-2">
                      {form.especialidades.map((er, idx) => (
                        <div key={idx} className="space-y-2 border rounded-md p-2">
                          <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
                            <SearchableSelect
                              options={esps.map((e) => ({ value: e.id, label: e.nome }))}
                              value={er.especialidade_id}
                              onChange={(v) => {
                                if (v && form.especialidades.some((x, i) => i !== idx && x.especialidade_id === v)) {
                                  toast.warning("Especialidade já adicionada");
                                  return;
                                }
                                setForm({
                                  ...form,
                                  especialidades: form.especialidades.map((x, i) =>
                                    i === idx ? { ...x, especialidade_id: v } : x,
                                  ),
                                });
                              }}
                              placeholder="Selecione"
                              searchPlaceholder="Buscar especialidade..."
                            />
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              onClick={() =>
                                setForm({
                                  ...form,
                                  especialidades: form.especialidades.filter((_, i) => i !== idx),
                                })
                              }
                              aria-label="Remover especialidade"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                          <div className="flex items-center gap-3 pl-1">
                            <label className="flex items-center gap-2 text-sm">
                              <Checkbox
                                checked={er.tem_rqe}
                                onCheckedChange={(v) =>
                                  setForm({
                                    ...form,
                                    especialidades: form.especialidades.map((x, i) =>
                                      i === idx
                                        ? { ...x, tem_rqe: !!v, rqe_numero: v ? x.rqe_numero : "" }
                                        : x,
                                    ),
                                  })
                                }
                              />
                              Tem RQE
                            </label>
                            {er.tem_rqe && (
                              <div className="flex items-center gap-2 flex-1">
                                <Label className="text-xs whitespace-nowrap">Nº RQE</Label>
                                <Input
                                  className="h-8"
                                  maxLength={50}
                                  value={er.rqe_numero}
                                  placeholder="Ex.: 12345"
                                  onChange={(e) =>
                                    setForm({
                                      ...form,
                                      especialidades: form.especialidades.map((x, i) =>
                                        i === idx ? { ...x, rqe_numero: e.target.value } : x,
                                      ),
                                    })
                                  }
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="border rounded-md p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium">Serviços</Label>
                      <p className="text-xs text-muted-foreground">Adicione os serviços que o médico realiza. A lista mostra apenas serviços das especialidades selecionadas.</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={especialidadesSelecionadasNomes.size === 0 || procsFiltradosPorEspecialidade.length === 0}
                          >
                            <Plus className="h-4 w-4 mr-1" /> Adicionar todos da especialidade
                            <ChevronDown className="h-4 w-4 ml-1" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-72">
                          <DropdownMenuLabel>Selecione a especialidade</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          {form.especialidades.length === 0 ? (
                            <DropdownMenuItem disabled>Nenhuma especialidade selecionada</DropdownMenuItem>
                          ) : (
                            form.especialidades.map((er, i) => {
                              const esp = esps.find((e) => e.id === er.especialidade_id);
                              if (!esp) return null;
                              const key = normalizarNome(esp.nome);
                              const procsDaEsp = procs.filter((p) => {
                                if (p.grupo && normalizarNome(p.grupo) === key) return true;
                                const extras = procEspMap.get(p.id);
                                if (extras && extras.has(key)) return true;
                                return false;
                              });
                              return (
                                <DropdownMenuItem
                                  key={`${er.especialidade_id}-${i}`}
                                  disabled={procsDaEsp.length === 0}
                                  onSelect={() => {
                                    const jaSel = new Set(form.procedimentos.filter(Boolean));
                                    const novos = procsDaEsp
                                      .map((p) => joinItem(p.id, esp.id))
                                      .filter((v) => !jaSel.has(v));
                                    if (novos.length === 0) {
                                      toast.info("Todos os serviços dessa especialidade já estão adicionados.");
                                      return;
                                    }
                                    setForm({
                                      ...form,
                                      procedimentos: [
                                        ...form.procedimentos.filter(Boolean),
                                        ...novos,
                                      ],
                                    });
                                    toast.success(`${novos.length} serviço(s) adicionado(s).`);
                                  }}
                                >
                                  <span className="truncate">{esp.nome}</span>
                                  <span className="ml-auto text-xs text-muted-foreground">
                                    {procsDaEsp.length}
                                  </span>
                                </DropdownMenuItem>
                              );
                            })
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={especialidadesSelecionadasNomes.size === 0 || procsFiltradosPorEspecialidade.length === 0}
                        onClick={() => setForm({ ...form, procedimentos: [...form.procedimentos, ""] })}
                      >
                        <Plus className="h-4 w-4 mr-1" /> Adicionar serviço
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={especialidadesSelecionadasNomes.size === 0 || procsFiltradosPorEspecialidade.length === 0}
                        onClick={() => {
                          setBulkSelected(new Set());
                          setBulkQuery("");
                          setBulkOpen(true);
                        }}
                      >
                        <Plus className="h-4 w-4 mr-1" /> Adicionar vários
                      </Button>
                    </div>
                  </div>
                  {especialidadesSelecionadasNomes.size === 0 ? (
                    <p className="text-xs text-muted-foreground">Selecione ao menos uma especialidade na seção acima para ver os serviços disponíveis.</p>
                  ) : procsFiltradosPorEspecialidade.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Nenhum serviço cadastrado para as especialidades selecionadas.</p>
                  ) : procs.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Nenhum serviço cadastrado na clínica.</p>
                  ) : form.procedimentos.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Nenhum serviço selecionado.</p>
                  ) : (
                    <div className="space-y-2 max-h-[420px] overflow-y-auto pr-2 rounded-md border border-border/40 p-2 bg-muted/20">
                      {form.procedimentos
                        .map((item, idx) => {
                          const { pid, eid } = splitItem(item);
                          const p = procs.find((pp) => pp.id === pid);
                          const esp = eid ? esps.find((e) => e.id === eid) ?? null : null;
                          const label = p ? labelProcedimentoEsp(p, esp) : "";
                          return { item, idx, label };
                        })
                        .sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }))
                        .map(({ item, idx }) => (
                        <div key={idx} className="grid grid-cols-[1fr_auto] gap-2 items-center">
                          <SearchableSelect
                            options={(() => {
                              const opts: { value: string; label: string }[] = [];
                              const pushed = new Set<string>();
                              const selecionados = new Set(
                                form.procedimentos.filter((x, i) => i !== idx && !!x),
                              );
                              const addProcOpts = (p: Procedimento) => {
                                const choices = procEspChoices.get(p.id) ?? [];
                                if (choices.length === 0) {
                                  const v = joinItem(p.id, null);
                                  if (!pushed.has(v) && !selecionados.has(v)) { pushed.add(v); opts.push({ value: v, label: p.nome }); }
                                } else {
                                  for (const c of choices) {
                                    const v = joinItem(p.id, c.id);
                                    if (pushed.has(v) || selecionados.has(v)) continue;
                                    pushed.add(v);
                                    opts.push({ value: v, label: `${p.nome} (${c.nome.toUpperCase()})` });
                                  }
                                }
                              };
                              for (const p of procsFiltradosPorEspecialidade) addProcOpts(p);
                              // garante que o item atual (mesmo fora do filtro) apareça com rótulo
                              for (const sel of [item]) {
                                if (!sel || pushed.has(sel)) continue;
                                const { pid, eid } = splitItem(sel);
                                const extra = procs.find((p) => p.id === pid);
                                if (!extra) continue;
                                const esp = eid ? esps.find((e) => e.id === eid) ?? null : null;
                                pushed.add(sel);
                                opts.push({ value: sel, label: labelProcedimentoEsp(extra, esp) });
                              }
                              return opts;
                            })()}
                            value={item}
                            onChange={(v) => {
                              if (v && form.procedimentos.some((x, i) => i !== idx && x === v)) {
                                toast.warning("Serviço já adicionado para essa especialidade");
                                return;
                              }
                              setForm({
                                ...form,
                                procedimentos: form.procedimentos.map((x, i) => (i === idx ? v : x)),
                              });
                            }}
                            placeholder="Selecione"
                            searchPlaceholder="Buscar serviço..."
                          />
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={() =>
                              setForm({
                                ...form,
                                procedimentos: form.procedimentos.filter((_, i) => i !== idx),
                              })
                            }
                            aria-label="Remover serviço"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  {form.procedimentos.length > 0 && (
                    <div className="border-t pt-3 mt-2 space-y-1">
                      <Label className="text-sm font-medium">Procedimento padrão (pré-selecionado na agenda)</Label>
                      <p className="text-xs text-muted-foreground">
                        Ao agendar com este médico, o sistema já preenche este serviço — agiliza o atendimento.
                        Ex.: Ortopedista → CONSULTA. Médico que só faz USG → o exame mais comum.
                      </p>
                      <SearchableSelect
                        value={
                          form.procedimento_padrao_em_branco
                            ? "blank"
                            : form.procedimento_padrao_id || "none"
                        }
                        onChange={(v) =>
                          setForm({
                            ...form,
                            procedimento_padrao_id: v === "none" || v === "blank" ? "" : v,
                            procedimento_padrao_em_branco: v === "blank",
                          })
                        }
                        placeholder="— Sem padrão (usa CONSULTA) —"
                        searchPlaceholder="Buscar serviço..."
                        options={[
                          { value: "none", label: "— Sem padrão (usa CONSULTA) —" },
                          { value: "blank", label: "— Em branco —" },
                          ...Array.from(new Set(form.procedimentos.map((it) => splitItem(it).pid).filter(Boolean)))
                            .map((pid) => procs.find((p) => p.id === pid))
                            .filter((p): p is Procedimento => !!p)
                            .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
                            .map((p) => ({ value: p.id, label: p.nome })),
                        ]}
                      />
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="agendas" className="space-y-4 pt-4 pb-16">
                {editingMedicoId && (
                  <MedicoAgendasTab
                    clinicaId={activeClinicaId}
                    medicoId={editingMedicoId}
                    procedimentoIds={Array.from(
                      new Set(
                        form.procedimentos
                          .map((it) => splitItem(it).pid)
                          .filter((x): x is string => !!x),
                      ),
                    )}
                  />
                )}
              </TabsContent>

              <TabsContent value="banco" className="space-y-4 pt-4 pb-16">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Banco</Label>
                    <Input value={form.banco} onChange={(e) => setForm({ ...form, banco: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Agência</Label>
                    <Input value={form.agencia} onChange={(e) => setForm({ ...form, agencia: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Conta</Label>
                    <Input value={form.conta} onChange={(e) => setForm({ ...form, conta: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Chave PIX</Label>
                    <Input value={form.pix_chave} onChange={(e) => setForm({ ...form, pix_chave: e.target.value })} />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="repasse" className="space-y-4 pt-4 pb-16">
                <div className="space-y-3">
                  <Label>REPASSE CARTÕES BENEFÍCIOS</Label>
                  <div className="rounded-md border p-3 flex items-start gap-3 bg-muted/30">
                    <Checkbox
                      id="aceita_cartao_beneficios"
                      checked={form.aceita_cartao_beneficios}
                      onCheckedChange={(c) => setForm({ ...form, aceita_cartao_beneficios: c === true })}
                    />
                    <div className="space-y-1">
                      <Label htmlFor="aceita_cartao_beneficios" className="cursor-pointer">
                        Aceita Cartões Benefícios
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Quando marcado, este médico aceita os preços/descontos dos cartões benefícios. Defina abaixo o repasse aplicado às <b>consultas</b> pagas com cartão benefício.
                      </p>
                    </div>
                  </div>
                  {form.aceita_cartao_beneficios && (
                    <div className="grid grid-cols-[1fr_1fr] gap-2">
                      <select
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                        value={form.cb_tipo_repasse}
                        onChange={(e) => setForm({ ...form, cb_tipo_repasse: e.target.value as "percentual" | "valor" })}
                      >
                        <option value="percentual">% Percentual</option>
                        <option value="valor">R$ Valor</option>
                      </select>
                      {form.cb_tipo_repasse === "percentual" ? (
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          step={0.01}
                          placeholder="% repasse"
                          value={form.cb_percentual}
                          onChange={(e) => setForm({ ...form, cb_percentual: e.target.value })}
                        />
                      ) : (
                        <CurrencyInput value={form.cb_valor} onChange={(v) => setForm({ ...form, cb_valor: v })} />
                      )}
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>REPASSE PADRÃO</Label>
                  <p className="text-xs text-muted-foreground">
                    Usado quando o serviço abaixo não tem tipo/valor preenchido.
                  </p>
                  <div className="grid grid-cols-[1fr_1fr] gap-2">
                    <select
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                      value={form.tipo_repasse}
                      onChange={(e) => setForm({ ...form, tipo_repasse: e.target.value as "percentual" | "valor" })}
                    >
                      <option value="percentual">% Percentual</option>
                      <option value="valor">R$ Valor</option>
                    </select>
                    {form.tipo_repasse === "percentual" ? (
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step={0.01}
                        placeholder="% repasse"
                        value={form.percentual}
                        onChange={(e) => setForm({ ...form, percentual: e.target.value })}
                      />
                    ) : (
                      <CurrencyInput value={form.valor} onChange={(v) => setForm({ ...form, valor: v })} />
                    )}
                  </div>
                </div>
                <div className="pt-4 border-t space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>REPASSE INDIVIDUAL</Label>
                      <p className="text-xs text-muted-foreground">
                        As <b>categorias</b> dos serviços selecionados na aba <b>Especialidades</b> aparecem aqui automaticamente (Consulta, Exame, Procedimento). Defina o tipo e o valor de repasse por categoria — vale para todos os serviços daquela categoria. Use <b>Manual</b> para sobrescrever o repasse de um <b>serviço específico</b> (prevalece sobre a categoria).
                      </p>
                    </div>
                    <Button type="button" size="sm" variant="outline"
                      onClick={() => setConvenios((cs) => [...cs, { nome: "", tipo_repasse: "percentual", percentual: "50", valor: "", ativo: true }])}>
                      <Plus className="h-4 w-4 mr-1" /> Manual
                    </Button>
                  </div>
                  {convenios.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Nenhum repasse individual. Clique em "Manual" para sobrescrever o repasse de um serviço específico.</p>
                  ) : (
                    <div className="border rounded-md overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                          <tr className="text-left">
                            <th className="px-2 py-2 font-medium">Nome</th>
                            <th className="px-2 py-2 font-medium w-40">Tipo</th>
                            <th className="px-2 py-2 font-medium w-32">Valor</th>
                            <th className="px-2 py-2 w-10"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {convenios.map((c, i) => {
                            const catLbl = labelCategoria(c.nome);
                            const servicoLbl = !catLbl && c.nome
                              ? labelServicoPorNomeKey.get(normalizarNome(c.nome)) ?? null
                              : null;
                            return (
                            <tr key={i} className="border-t align-middle">
                              <td className="px-2 py-1">
                                {catLbl ? (
                                  <div className="px-2 py-1.5 text-sm font-medium uppercase tracking-wide text-foreground/80">
                                    {catLbl}
                                  </div>
                                ) : servicoLbl ? (
                                  <div className="px-2 py-1.5 text-sm text-foreground/90">
                                    {servicoLbl}
                                  </div>
                                ) : (
                                  <select
                                    className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                                    value={c.nome}
                                    onChange={(e) => setConvenios((cs) => cs.map((x, j) => j === i ? { ...x, nome: e.target.value } : x))}
                                  >
                                    <option value="">Selecione um serviço…</option>
                                    {servicosDoMedico.map((s) => (
                                      <option key={s.value} value={s.value}>{s.label}</option>
                                    ))}
                                  </select>
                                )}
                              </td>
                              <td className="px-2 py-1">
                                <select className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                                  value={c.tipo_repasse}
                                  onChange={(e) => setConvenios((cs) => cs.map((x, j) => j === i ? { ...x, tipo_repasse: e.target.value as "percentual" | "valor" } : x))}>
                                  <option value="percentual">% Percentual</option>
                                  <option value="valor">R$ Valor</option>
                                </select>
                              </td>
                              <td className="px-2 py-1">
                                {c.tipo_repasse === "percentual" ? (
                                  <Input type="number" step="0.01" min={0}
                                    value={c.percentual}
                                    onChange={(e) => setConvenios((cs) => cs.map((x, j) => j === i ? { ...x, percentual: e.target.value } : x))} />
                                ) : (
                                  <CurrencyInput
                                    value={c.valor}
                                    onChange={(v) => setConvenios((cs) => cs.map((x, j) => j === i ? { ...x, valor: v } : x))}
                                  />
                                )}
                              </td>
                              <td className="px-2 py-1 text-right">
                                {catLbl || servicoLbl ? null : (
                                  <Button type="button" size="icon" variant="ghost"
                                    onClick={() => setConvenios((cs) => cs.filter((_, j) => j !== i))} aria-label="Remover">
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </td>
                            </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                {form.nome.trim().toUpperCase() === "ELETROCARDIOGRAMA" && (
                <div className="space-y-3 pt-4 border-t mt-4">
                  <div>
                    <Label>REPASSE LAUDO TERCEIRO</Label>
                    <p className="text-xs text-muted-foreground">
                      Use quando este cadastro representa uma <b>agenda de exame</b> (ex.: ELETROCARDIOGRAMA) e o laudo é feito por <b>outro médico</b>.
                      Liste abaixo os cardiologistas ativos da clínica e defina o repasse (percentual ou valor fixo por exame) que cada um recebe pelo laudo.
                      O financeiro vincula este repasse em <b>Financeiro → Atendimentos</b>, filtrando pelo nome do médico da agenda.
                    </p>
                  </div>
                  {!editingMedicoId ? (
                    <p className="text-sm text-muted-foreground text-center py-6">Salve o médico antes de configurar o repasse de laudo.</p>
                  ) : laudadoresCatalog.length === 0 ? (
                    <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground text-center">
                      Nenhum cardiologista ativo encontrado nesta clínica. Cadastre médicos com a especialidade <b>Cardiologia</b> para poder configurar o laudo.
                    </div>
                  ) : (
                    <div className="border rounded-md overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                          <tr className="text-left">
                            <th className="px-2 py-2 font-medium">Laudador (Cardiologia)</th>
                            <th className="px-2 py-2 font-medium w-40">Tipo</th>
                            <th className="px-2 py-2 font-medium w-36">Valor</th>
                            <th className="px-2 py-2 font-medium w-12"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {laudadoresCatalog.map((cardio) => {
                            const row = laudadores.find((l) => l.laudador_medico_id === cardio.id);
                            const setRow = (patch: Partial<LaudadorRow>) => {
                              setLaudadores((rows) => {
                                const idx = rows.findIndex((l) => l.laudador_medico_id === cardio.id);
                                if (idx === -1) {
                                  return [...rows, {
                                    laudador_medico_id: cardio.id,
                                    tipo_repasse: "percentual",
                                    percentual: "",
                                    valor: "",
                                    ...patch,
                                  }];
                                }
                                return rows.map((r, j) => j === idx ? { ...r, ...patch } : r);
                              });
                            };
                            const tipo = row?.tipo_repasse ?? "percentual";
                            const value = tipo === "percentual" ? (row?.percentual ?? "") : (row?.valor ?? "");
                            return (
                              <tr key={cardio.id} className="border-t align-middle">
                                <td className="px-2 py-1.5">
                                  <div className="text-sm text-foreground/90">
                                    {cardio.nome}
                                    {cardio.crm && (
                                      <span className="ml-2 text-xs text-muted-foreground">
                                        CRM {cardio.crm}{cardio.crm_uf ? `/${cardio.crm_uf}` : ""}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-2 py-1">
                                  <select
                                    className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                                    value={tipo}
                                    onChange={(e) => setRow({ tipo_repasse: e.target.value as "percentual" | "valor" })}
                                  >
                                    <option value="percentual">% Percentual</option>
                                    <option value="valor">R$ Valor</option>
                                  </select>
                                </td>
                                <td className="px-2 py-1">
                                  {tipo === "percentual" ? (
                                    <Input
                                      type="number"
                                      step="0.01"
                                      min={0}
                                      max={100}
                                      placeholder="% do faturado"
                                      value={value}
                                      onChange={(e) => setRow({ percentual: e.target.value })}
                                    />
                                  ) : (
                                    <CurrencyInput
                                      value={value}
                                      onChange={(v) => setRow({ valor: v })}
                                    />
                                  )}
                                </td>
                                <td className="px-2 py-1 text-right">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                    title="Remover configuração de repasse deste laudador"
                                    disabled={!row}
                                    onClick={() => {
                                      setLaudadores((rows) => rows.filter((l) => l.laudador_medico_id !== cardio.id));
                                      setLaudadoresCatalog((cat) => cat.filter((c) => c.id !== cardio.id));
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Deixe o valor em branco / 0 para o médico que <b>não recebe laudo</b>. Este cadastro não gera lançamento automático — o financeiro decide quando lançar.
                  </p>
                </div>
                )}
              </TabsContent>

              <TabsContent value="acesso" className="space-y-4 pt-4 pb-16">
                {hasLogin ? (
                  <div className="space-y-4 py-2 text-sm">
                    {existingEmail ? (
                      <p><span className="text-muted-foreground">E-mail de login:</span> <span className="font-medium">{existingEmail}</span></p>
                    ) : (
                      <p className="text-muted-foreground">Não foi possível recuperar o e-mail de login deste médico.</p>
                    )}
                    <div className="border-t pt-4 space-y-3">
                      {!showSenha ? (
                        <Button type="button" variant="outline" size="sm" onClick={() => setShowSenha(true)}>
                          Trocar senha
                        </Button>
                      ) : (
                        <div className="space-y-3">
                          <div className="text-sm font-medium">Definir nova senha</div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <Label>Nova senha *</Label>
                              <Input type="text" value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} placeholder="Mín. 6 caracteres" />
                            </div>
                            <div>
                              <Label>Confirmar senha *</Label>
                              <Input type="text" value={confirmarSenha} onChange={(e) => setConfirmarSenha(e.target.value)} />
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button type="button" size="sm" onClick={salvarNovaSenha} disabled={savingSenha}>
                              {savingSenha ? "Salvando…" : "Salvar nova senha"}
                            </Button>
                            <Button type="button" size="sm" variant="ghost" onClick={() => { setShowSenha(false); setNovaSenha(""); setConfirmarSenha(""); }}>
                              Cancelar
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="rounded-md border p-3 space-y-3">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="criar-usuario-medico"
                          checked={form.criarUsuario}
                          onCheckedChange={(c) => setForm({ ...form, criarUsuario: c === true })}
                        />
                        <Label htmlFor="criar-usuario-medico" className="cursor-pointer">
                          Criar login de acesso ao sistema
                        </Label>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Cria um usuário com o e-mail informado na seção <b>Contato</b> (aba Dados) e vincula este médico à equipe da clínica. Se já existir usuário com este e-mail, ele será apenas adicionado à equipe.
                      </p>
                      {form.criarUsuario && (
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-2 col-span-2">
                            <Label>E-mail (login)</Label>
                            <Input
                              type="email"
                              value={form.email}
                              onChange={(e) => setForm({ ...form, email: e.target.value })}
                              placeholder="medico@exemplo.com"
                            />
                            {!form.email && (
                              <p className="text-xs text-amber-600">Informe um e-mail (também na seção Contato da aba Dados).</p>
                            )}
                          </div>
                          <div className="space-y-2">
                            <Label>Senha inicial *</Label>
                            <Input
                              type="text"
                              placeholder="mín. 6 caracteres"
                              value={form.senhaUsuario}
                              onChange={(e) => setForm({ ...form, senhaUsuario: e.target.value })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Perfil de acesso</Label>
                            <Select
                              value={form.roleUsuario}
                              onValueChange={(v) => setForm({ ...form, roleUsuario: v as typeof form.roleUsuario })}
                            >
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="medico">Médico</SelectItem>
                                <SelectItem value="enfermeiro">Enfermeiro</SelectItem>
                                <SelectItem value="recepcao">Recepção</SelectItem>
                                <SelectItem value="financeiro">Financeiro</SelectItem>
                                <SelectItem value="gestor">Gestor</SelectItem>
                                <SelectItem value="admin">Admin</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      )}
                    </div>
                    {!editId && (
                      <p className="text-xs text-muted-foreground">
                        Ao salvar, também será criado automaticamente um cadastro de <b>paciente</b> com o mesmo nome, CPF, e-mail e telefone — caso ainda não exista nesta clínica.
                      </p>
                    )}
                  </>
                )}
              </TabsContent>
            </Tabs>
            {asPage ? (
              <div className="flex justify-end gap-2 border-t pt-3">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                <Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
              </div>
            ) : (
              <DialogFooter className="sticky bottom-0 bg-background border-t -mx-6 -mb-6 px-6 py-3 z-10">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                <Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
              </DialogFooter>
            )}
            <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
              <DialogContent className="sm:max-w-2xl w-[calc(100vw-2rem)] max-h-[85vh] overflow-hidden flex flex-col">
                <DialogHeader>
                  <DialogTitle>Adicionar vários serviços</DialogTitle>
                </DialogHeader>
                {(() => {
                  const jaSel = new Set(form.procedimentos.filter(Boolean));
                  const opts: { value: string; label: string }[] = [];
                  const pushed = new Set<string>();
                  for (const p of procsFiltradosPorEspecialidade) {
                    const choices = procEspChoices.get(p.id) ?? [];
                    if (choices.length === 0) {
                      const v = joinItem(p.id, null);
                      if (!pushed.has(v) && !jaSel.has(v)) { pushed.add(v); opts.push({ value: v, label: p.nome }); }
                    } else {
                      for (const c of choices) {
                        const v = joinItem(p.id, c.id);
                        if (pushed.has(v) || jaSel.has(v)) continue;
                        pushed.add(v);
                        opts.push({ value: v, label: `${p.nome} (${c.nome.toUpperCase()})` });
                      }
                    }
                  }
                  opts.sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }));
                  const q = bulkQuery.trim().toLowerCase();
                  const filtered = q ? opts.filter((o) => o.label.toLowerCase().includes(q)) : opts;
                  const allChecked = filtered.length > 0 && filtered.every((o) => bulkSelected.has(o.value));
                  return (
                    <div className="flex flex-col gap-3 min-h-0">
                      <Input
                        placeholder="Buscar serviço..."
                        value={bulkQuery}
                        onChange={(e) => setBulkQuery(e.target.value)}
                      />
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <Checkbox
                            checked={allChecked}
                            onCheckedChange={(v) => {
                              const next = new Set(bulkSelected);
                              if (v) filtered.forEach((o) => next.add(o.value));
                              else filtered.forEach((o) => next.delete(o.value));
                              setBulkSelected(next);
                            }}
                          />
                          <span>Selecionar todos {q ? "(filtrados)" : ""}</span>
                        </label>
                        <span>{bulkSelected.size} selecionado(s)</span>
                      </div>
                      <div className="flex-1 overflow-y-auto border rounded-md p-2 space-y-1 min-h-[240px] max-h-[50vh]">
                        {filtered.length === 0 ? (
                          <p className="text-xs text-muted-foreground p-2">Nenhum serviço disponível.</p>
                        ) : (
                          filtered.map((o) => (
                            <label key={o.value} className="flex items-center gap-2 py-1 px-1 rounded hover:bg-muted/50 cursor-pointer">
                              <Checkbox
                                checked={bulkSelected.has(o.value)}
                                onCheckedChange={(v) => {
                                  const next = new Set(bulkSelected);
                                  if (v) next.add(o.value);
                                  else next.delete(o.value);
                                  setBulkSelected(next);
                                }}
                              />
                              <span className="text-sm">{o.label}</span>
                            </label>
                          ))
                        )}
                      </div>
                      <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setBulkOpen(false)}>Cancelar</Button>
                        <Button
                          type="button"
                          disabled={bulkSelected.size === 0}
                          onClick={() => {
                            const novos = Array.from(bulkSelected).filter((v) => !jaSel.has(v));
                            if (novos.length === 0) {
                              toast.info("Nenhum serviço novo para adicionar.");
                              setBulkOpen(false);
                              return;
                            }
                            setForm({
                              ...form,
                              procedimentos: [...form.procedimentos.filter(Boolean), ...novos],
                            });
                            toast.success(`${novos.length} serviço(s) adicionado(s).`);
                            setBulkOpen(false);
                          }}
                        >
                          Adicionar {bulkSelected.size > 0 ? `(${bulkSelected.size})` : ""}
                        </Button>
                      </DialogFooter>
                    </div>
                  );
                })()}
              </DialogContent>
            </Dialog>
          </form>
        );

  if (asPage) {
    return (
      <div className="space-y-4">{inner}</div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl w-[calc(100vw-2rem)] max-h-[95vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader className="sticky top-0 z-20 bg-background -mx-6 px-6 pt-6 -mt-6 pb-2 border-b">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {inner}
      </DialogContent>
    </Dialog>
  );
}