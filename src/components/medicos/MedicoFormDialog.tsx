import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Plus, Trash2, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { cadastrarUsuario, getFuncionarioLogin, definirSenhaFuncionario } from "@/lib/equipe.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
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

const CONVENIOS_PADRAO: ConvenioRow[] = [
  { nome: "Cartão Consulta", tipo_repasse: "percentual", percentual: "50", valor: "", ativo: true },
  { nome: "Cartão Desconto", tipo_repasse: "percentual", percentual: "50", valor: "", ativo: true },
];

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
});

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  clinicaId: string;
  editingMedicoId?: string | null;
  onSaved?: () => void;
  asPage?: boolean;
}

export function MedicoFormDialog({ open, onOpenChange, clinicaId, editingMedicoId, onSaved, asPage = false }: Props) {
  const cadastrarUsuarioFn = useServerFn(cadastrarUsuario);
  const getLoginFn = useServerFn(getFuncionarioLogin);
  const definirSenhaFn = useServerFn(definirSenhaFuncionario);

  const [esps, setEsps] = useState<Especialidade[]>([]);
  const [procs, setProcs] = useState<Procedimento[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [medicoUserId, setMedicoUserId] = useState<string | null>(null);
  const [existingEmail, setExistingEmail] = useState<string | null>(null);
  const [convenios, setConvenios] = useState<ConvenioRow[]>(CONVENIOS_PADRAO);
  const [form, setForm] = useState(emptyForm());
  // Map procedimento_id -> Map(normalizedSpecialtyKey -> originalSpecialtyName)
  const [procEspMap, setProcEspMap] = useState<Map<string, Map<string, string>>>(new Map());

  const [showSenha, setShowSenha] = useState(false);
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [savingSenha, setSavingSenha] = useState(false);

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

  // Auto-adiciona um item em "REPASSE INDIVIDUAL" (aba Repasse) sempre que um
  // serviço for selecionado na aba Especialidades. Não remove nada — cadastros
  // de repasse existentes são preservados para ajuste manual.
  useEffect(() => {
    if (!form.procedimentos.length || !procs.length) return;
    setConvenios((cs) => {
      const existentes = new Set(cs.map((c) => normalizarNome(c.nome)));
      const novos: ConvenioRow[] = [];
      for (const item of form.procedimentos) {
        const { pid } = splitItem(item);
        if (!pid) continue;
        const proc = procs.find((p) => p.id === pid);
        if (!proc) continue;
        const chave = normalizarNome(proc.nome);
        if (existentes.has(chave)) continue;
        existentes.add(chave);
        novos.push({
          nome: proc.nome,
          tipo_repasse: form.tipo_repasse,
          percentual: "",
          valor: "",
          ativo: true,
        });
      }
      return novos.length ? [...cs, ...novos] : cs;
    });
  }, [form.procedimentos, procs, form.tipo_repasse]);

  // Load reference data
  useEffect(() => {
    if (!open || !clinicaId) return;
    let cancelled = false;
    void supabase.from("especialidades").select("id, nome").order("nome").then(({ data }) => setEsps(data ?? []));
    void fetchProcedimentosAtivos(clinicaId)
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
      .eq("clinica_id", clinicaId)
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
  }, [open, clinicaId]);

  // Load medico when editing
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setShowSenha(false);
    setNovaSenha("");
    setConfirmarSenha("");
    if (!editingMedicoId) {
      setEditId(null);
      setMedicoUserId(null);
      setExistingEmail(null);
      setConvenios(CONVENIOS_PADRAO.map((c) => ({ ...c })));
      setForm(emptyForm());
      return;
    }
    void (async () => {
      setLoading(true);
      const { data: m } = await supabase
        .from("medicos")
        .select("id, user_id, nome, crm, crm_uf, email, telefone, telefone2, nacionalidade, estado_civil, sexo, duracao_consulta_min, usa_sistema, cep, logradouro, numero, complemento, bairro, cidade, estado, medico_especialidades(especialidade_id, tem_rqe, rqe_numero, especialidade:especialidades(id, nome))")
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
      const { data: mprocs } = await supabase
        .from("medico_procedimentos")
        .select("procedimento_id")
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
        procedimentos: (mprocs ?? []).map((p: any) => p.procedimento_id),
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
      });
      if (med.user_id) {
        try {
          const res = await getLoginFn({ data: { clinicaId, userId: med.user_id } });
          setExistingEmail((res as { email?: string | null })?.email ?? null);
        } catch { setExistingEmail(null); }
      } else {
        setExistingEmail(null);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, editingMedicoId, clinicaId]);

  async function salvarNovaSenha() {
    if (!medicoUserId) return;
    if (novaSenha.length < 6) { toast.error("Senha deve ter pelo menos 6 caracteres"); return; }
    if (novaSenha !== confirmarSenha) { toast.error("As senhas não conferem"); return; }
    setSavingSenha(true);
    try {
      await definirSenhaFn({ data: { clinicaId, userId: medicoUserId, novaSenha } });
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
      clinica_id: clinicaId,
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
    };
    let medicoId = editId;
    if (editId) {
      const { error } = await supabase.from("medicos").update(payload).eq("id", editId);
      if (error) { setSaving(false); toast.error(error.message); return; }
      await supabase.from("medico_especialidades").delete().eq("medico_id", editId);
      await supabase.from("medico_procedimentos").delete().eq("medico_id", editId);
    } else {
      const { data: novo, error } = await supabase.from("medicos").insert(payload).select("id").single();
      if (error || !novo) { setSaving(false); toast.error(error?.message ?? "Erro"); return; }
      medicoId = novo.id;
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
      if (e2) { setSaving(false); toast.error(e2.message); return; }
    }
    const procedimentosIds = Array.from(new Set(form.procedimentos.filter((x) => !!x)));
    if (medicoId && procedimentosIds.length) {
      const procRows = procedimentosIds.map((pid) => ({ medico_id: medicoId!, procedimento_id: pid }));
      const { error: ep } = await supabase.from("medico_procedimentos").insert(procRows);
      if (ep) { setSaving(false); toast.error(ep.message); return; }
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
        if (e3) { setSaving(false); toast.error(e3.message); return; }
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
            clinicaId,
            email: form.email,
            password: form.senhaUsuario,
            nome: nomeLimpo,
            role: form.roleUsuario,
          },
        });
        toast.success("Usuário do sistema criado e vinculado à equipe!");
      } catch (err: any) {
        toast.error(`Médico salvo, mas erro ao criar usuário: ${err?.message ?? err}`);
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
              <TabsList className={asPage ? "grid grid-cols-5 w-full" : "grid grid-cols-5 w-full sticky top-[3.25rem] z-10"}>
                <TabsTrigger value="dados">Dados</TabsTrigger>
                <TabsTrigger value="especialidades">Especialidades</TabsTrigger>
                <TabsTrigger value="banco">Banco</TabsTrigger>
                <TabsTrigger value="repasse">Repasse</TabsTrigger>
                <TabsTrigger value="acesso">Acesso</TabsTrigger>
              </TabsList>

              <TabsContent value="dados" className="space-y-4 pt-4 pb-16">
                <div className="space-y-2">
                  <Label>Nome completo *</Label>
                  <Input required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2 space-y-2">
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
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label>Data de nascimento</Label>
                    <Input type="date" value={form.data_nascimento} onChange={(e) => setForm({ ...form, data_nascimento: e.target.value })} />
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
                <div className="grid grid-cols-3 gap-3">
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
                  <div className="space-y-2">
                    <Label>Duração da consulta (min)</Label>
                    <Select value={form.duracao_consulta_min} onValueChange={(v) => setForm({ ...form, duracao_consulta_min: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["5","10","15","20","30","40","45","60"].map((v) => <SelectItem key={v} value={v}>{v} min</SelectItem>)}
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
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-2">
                        <Label>CEP</Label>
                        <Input value={form.cep} onChange={(e) => setForm({ ...form, cep: e.target.value })} />
                      </div>
                      <div className="col-span-2 space-y-2">
                        <Label>Logradouro</Label>
                        <Input value={form.logradouro} onChange={(e) => setForm({ ...form, logradouro: e.target.value })} />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-2">
                        <Label>Número</Label>
                        <Input value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} />
                      </div>
                      <div className="col-span-2 space-y-2">
                        <Label>Complemento</Label>
                        <Input value={form.complemento} onChange={(e) => setForm({ ...form, complemento: e.target.value })} />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
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
                                    const novos = procsDaEsp.map((p) => p.id).filter((id) => !jaSel.has(id));
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
                    <div className="space-y-2">
                      {form.procedimentos
                        .map((pid, idx) => {
                          const p = procs.find((pp) => pp.id === pid);
                          const label = p ? labelProcedimento(p) : "";
                          return { pid, idx, label };
                        })
                        .sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }))
                        .map(({ pid, idx }) => (
                        <div key={idx} className="grid grid-cols-[1fr_auto] gap-2 items-center">
                          <SearchableSelect
                            options={(() => {
                              const base = [...procsFiltradosPorEspecialidade];
                              // garante que serviços já selecionados (mesmo fora da especialidade) apareçam com rótulo
                              for (const selId of form.procedimentos) {
                                if (!selId) continue;
                                if (base.some((p) => p.id === selId)) continue;
                                const extra = procs.find((p) => p.id === selId);
                                if (extra) base.push(extra);
                              }
                              return base.map((p) => ({ value: p.id, label: labelProcedimento(p) }));
                            })()}
                            value={pid}
                            onChange={(v) => {
                              if (v && form.procedimentos.some((x, i) => i !== idx && x === v)) {
                                toast.warning("Procedimento já adicionado");
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
                </div>
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
                        Os serviços selecionados na aba <b>Especialidades</b> aparecem aqui automaticamente. Defina o tipo e o valor de repasse de cada um. Use "Manual" para adicionar itens avulsos (ex: Cartão Consulta).
                      </p>
                    </div>
                    <Button type="button" size="sm" variant="outline"
                      onClick={() => setConvenios((cs) => [...cs, { nome: "", tipo_repasse: "percentual", percentual: "50", valor: "", ativo: true }])}>
                      <Plus className="h-4 w-4 mr-1" /> Manual
                    </Button>
                  </div>
                  {convenios.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Nenhum convênio. Clique em "Manual" para adicionar.</p>
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
                          {convenios.map((c, i) => (
                            <tr key={i} className="border-t align-middle">
                              <td className="px-2 py-1">
                                <Input value={c.nome} placeholder="Ex: Fimose"
                                  onChange={(e) => setConvenios((cs) => cs.map((x, j) => j === i ? { ...x, nome: e.target.value } : x))} />
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
                                <Input type="number" step="0.01" min={0}
                                  value={c.tipo_repasse === "percentual" ? c.percentual : c.valor}
                                  onChange={(e) => setConvenios((cs) => cs.map((x, j) => j === i ? (c.tipo_repasse === "percentual" ? { ...x, percentual: e.target.value } : { ...x, valor: e.target.value }) : x))} />
                              </td>
                              <td className="px-2 py-1 text-right">
                                <Button type="button" size="icon" variant="ghost"
                                  onClick={() => setConvenios((cs) => cs.filter((_, j) => j !== i))} aria-label="Remover">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
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