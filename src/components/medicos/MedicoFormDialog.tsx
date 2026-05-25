import { useEffect, useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
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

interface Especialidade { id: string; nome: string }
interface Procedimento { id: string; nome: string; grupo: string | null; tipo: string; valor_padrao: number }
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

const emptyForm = () => ({
  nome: "", crm: "", crm_uf: "",
  especialidades: [] as string[],
  tem_rqe: false,
  rqe_especialidade: "",
  tipo_repasse: "percentual" as "percentual" | "valor",
  percentual: "50",
  valor: "",
  cpf: "", rg: "", data_nascimento: "", email: "", telefone: "",
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
}

export function MedicoFormDialog({ open, onOpenChange, clinicaId, editingMedicoId, onSaved }: Props) {
  const cadastrarUsuarioFn = useServerFn(cadastrarUsuario);
  const getLoginFn = useServerFn(getFuncionarioLogin);
  const definirSenhaFn = useServerFn(definirSenhaFuncionario);

  const [esps, setEsps] = useState<Especialidade[]>([]);
  const [procs, setProcs] = useState<Procedimento[]>([]);
  const [procFilter, setProcFilter] = useState("");
  const [procGrupo, setProcGrupo] = useState<string>("__todos__");
  const [espFilter, setEspFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [medicoUserId, setMedicoUserId] = useState<string | null>(null);
  const [existingEmail, setExistingEmail] = useState<string | null>(null);
  const [convenios, setConvenios] = useState<ConvenioRow[]>(CONVENIOS_PADRAO);
  const [form, setForm] = useState(emptyForm());

  const [showSenha, setShowSenha] = useState(false);
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [savingSenha, setSavingSenha] = useState(false);

  // Load reference data
  useEffect(() => {
    if (!open || !clinicaId) return;
    void supabase.from("especialidades").select("id, nome").order("nome").then(({ data }) => setEsps(data ?? []));
    void supabase
      .from("procedimentos")
      .select("id, nome, grupo, tipo, valor_padrao")
      .eq("clinica_id", clinicaId)
      .eq("ativo", true)
      .order("nome")
      .limit(5000)
      .then(({ data }) => setProcs((data as Procedimento[]) ?? []));
  }, [open, clinicaId]);

  // Load medico when editing
  useEffect(() => {
    if (!open) return;
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
        .select("id, user_id, nome, crm, crm_uf, email, telefone, nacionalidade, estado_civil, sexo, cep, logradouro, numero, complemento, bairro, cidade, estado, tem_rqe, rqe_especialidade, medico_especialidades(especialidade:especialidades(id, nome))")
        .eq("id", editingMedicoId)
        .maybeSingle();
      if (!m) { setLoading(false); toast.error("Médico não encontrado"); return; }
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
      setForm({
        nome: limparPrefixoMedico(med.nome ?? ""),
        crm: med.crm,
        crm_uf: med.crm_uf,
        especialidades: (med.medico_especialidades ?? []).map((me: any) => me.especialidade?.id).filter(Boolean) as string[],
        tem_rqe: !!med.tem_rqe,
        rqe_especialidade: med.rqe_especialidade ?? "",
        tipo_repasse: (sens.tipo_repasse as "percentual" | "valor") ?? "percentual",
        percentual: sens.percentual_repasse_padrao != null ? String(sens.percentual_repasse_padrao) : "",
        valor: sens.valor_repasse_padrao != null ? String(sens.valor_repasse_padrao) : "",
        cpf: sens.cpf ?? "", rg: sens.rg ?? "", data_nascimento: sens.data_nascimento ?? "",
        email: med.email ?? "", telefone: med.telefone ?? "",
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
  }, [open, editingMedicoId, clinicaId]);

  const toggleEsp = (id: string) => {
    setForm((f) => ({
      ...f,
      especialidades: f.especialidades.includes(id)
        ? f.especialidades.filter((x) => x !== id)
        : [...f.especialidades, id],
    }));
  };

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
    if (form.tem_rqe && !form.rqe_especialidade.trim()) {
      toast.error("Informe a Especialidade de RQE");
      return;
    }
    setSaving(true);
    const nomeLimpo = limparPrefixoMedico(form.nome);
    const payload = {
      clinica_id: clinicaId,
      nome: nomeLimpo,
      crm: form.crm,
      crm_uf: form.crm_uf.toUpperCase(),
      especialidade_id: form.especialidades[0] || null,
      tem_rqe: form.tem_rqe,
      rqe_especialidade: form.tem_rqe ? form.rqe_especialidade.trim() : null,
      tipo_repasse: form.tipo_repasse,
      percentual_repasse_padrao: form.tipo_repasse === "percentual" ? parseFloat(form.percentual || "0") : 0,
      valor_repasse_padrao: form.tipo_repasse === "valor" ? parseFloat(form.valor || "0") : null,
      cpf: form.cpf || null,
      rg: form.rg || null,
      data_nascimento: form.data_nascimento || null,
      email: form.email || null,
      telefone: form.telefone || null,
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
    } else {
      const { data: novo, error } = await supabase.from("medicos").insert(payload).select("id").single();
      if (error || !novo) { setSaving(false); toast.error(error?.message ?? "Erro"); return; }
      medicoId = novo.id;
    }
    if (medicoId && form.especialidades.length) {
      const rows = form.especialidades.map((eid) => ({ medico_id: medicoId!, especialidade_id: eid }));
      const { error: e2 } = await supabase.from("medico_especialidades").insert(rows);
      if (e2) { setSaving(false); toast.error(e2.message); return; }
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editId ? "Editar médico" : "Novo médico"}</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Carregando…</div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <Tabs defaultValue="dados">
              <TabsList className="grid grid-cols-7 w-full">
                <TabsTrigger value="dados">Dados</TabsTrigger>
                <TabsTrigger value="especialidades">Especialidades</TabsTrigger>
                <TabsTrigger value="contato">Contato</TabsTrigger>
                <TabsTrigger value="endereco">Endereço</TabsTrigger>
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
                </div>
              </TabsContent>

              <TabsContent value="especialidades" className="space-y-2 pt-4">
                <div className="border rounded-md p-3 space-y-3">
                  <label className="flex items-center gap-2 cursor-pointer text-sm font-medium">
                    <Checkbox
                      checked={form.tem_rqe}
                      onCheckedChange={(v) =>
                        setForm({
                          ...form,
                          tem_rqe: !!v,
                          rqe_especialidade: v ? form.rqe_especialidade : "",
                        })
                      }
                    />
                    RQE (Registro de Qualificação de Especialista)
                  </label>
                  {form.tem_rqe && (
                    <div className="space-y-2">
                      <Label>Especialidade de RQE</Label>
                      <Input
                        value={form.rqe_especialidade}
                        maxLength={200}
                        placeholder="Ex.: Cardiologia"
                        onChange={(e) => setForm({ ...form, rqe_especialidade: e.target.value })}
                      />
                    </div>
                  )}
                </div>
                <Label>Especialidades</Label>
                <Input
                  placeholder="Filtrar especialidade..."
                  value={espFilter}
                  onChange={(e) => setEspFilter(e.target.value)}
                  className="h-8"
                />
                <div className="border rounded-md p-3 max-h-80 overflow-y-auto space-y-2">
                  {esps.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma especialidade cadastrada.</p>}
                  {esps
                    .filter((e) => e.nome.toLowerCase().includes(espFilter.toLowerCase()))
                    .map((e) => (
                      <label key={e.id} className="flex items-center gap-2 cursor-pointer text-sm">
                        <Checkbox
                          checked={form.especialidades.includes(e.id)}
                          onCheckedChange={() => toggleEsp(e.id)}
                        />
                        {e.nome}
                      </label>
                    ))}
                </div>
              </TabsContent>

              <TabsContent value="contato" className="space-y-4 pt-4 pb-16">
                <div className="space-y-2">
                  <Label>E-mail</Label>
                  <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Telefone</Label>
                  <Input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
                </div>
              </TabsContent>

              <TabsContent value="endereco" className="space-y-4 pt-4 pb-16">
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
                <div className="space-y-2">
                  <Label>Tipo de repasse</Label>
                  <div className="flex gap-4 text-sm">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="tipo_repasse" checked={form.tipo_repasse === "percentual"}
                        onChange={() => setForm({ ...form, tipo_repasse: "percentual" })} />
                      Percentual (%)
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="tipo_repasse" checked={form.tipo_repasse === "valor"}
                        onChange={() => setForm({ ...form, tipo_repasse: "valor" })} />
                      Valor fixo (R$)
                    </label>
                  </div>
                </div>
                {form.tipo_repasse === "percentual" ? (
                  <div className="space-y-2">
                    <Label>% repasse padrão</Label>
                    <Input type="number" min={0} max={100} step={0.01} value={form.percentual}
                      onChange={(e) => setForm({ ...form, percentual: e.target.value })} />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label>Valor repasse padrão (R$)</Label>
                    <CurrencyInput value={form.valor} onChange={(v) => setForm({ ...form, valor: v })} />
                  </div>
                )}
                <div className="pt-4 border-t space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Convênios / Procedimentos</Label>
                      <p className="text-xs text-muted-foreground">Selecione procedimentos cadastrados ou adicione manualmente (ex: Cartão Consulta).</p>
                    </div>
                    <Button type="button" size="sm" variant="outline"
                      onClick={() => setConvenios((cs) => [...cs, { nome: "", tipo_repasse: "percentual", percentual: "50", valor: "", ativo: true }])}>
                      <Plus className="h-4 w-4 mr-1" /> Manual
                    </Button>
                  </div>
                  <div className="rounded-md border p-2 space-y-2 bg-muted/30">
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        placeholder="Filtrar procedimento..."
                        value={procFilter}
                        onChange={(e) => setProcFilter(e.target.value)}
                        className="h-8"
                      />
                      <select
                        className="h-8 rounded-md border bg-background px-2 text-sm"
                        value={procGrupo}
                        onChange={(e) => setProcGrupo(e.target.value)}
                      >
                        <option value="__todos__">Todos os grupos</option>
                        {Array.from(new Set(procs.map((p) => p.grupo).filter(Boolean) as string[]))
                          .sort()
                          .map((g) => (
                            <option key={g} value={g}>{g}</option>
                          ))}
                      </select>
                    </div>
                    <div className="max-h-48 overflow-y-auto space-y-1">
                      {procs.length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-3">
                          Nenhum procedimento cadastrado. Cadastre em "Procedimentos".
                        </p>
                      )}
                      {procs
                        .filter((p) => procGrupo === "__todos__" || p.grupo === procGrupo)
                        .filter((p) => p.nome.toLowerCase().includes(procFilter.toLowerCase()))
                        .map((p) => {
                          const checked = convenios.some((c) => c.nome.trim().toLowerCase() === p.nome.toLowerCase());
                          return (
                            <label key={p.id} className="flex items-center gap-2 text-sm py-1 px-1 hover:bg-background rounded cursor-pointer">
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(v) => {
                                  if (v) {
                                    setConvenios((cs) => [...cs, {
                                      nome: p.nome, tipo_repasse: form.tipo_repasse,
                                      percentual: form.percentual || "50",
                                      valor: form.valor || "",
                                      ativo: true,
                                    }]);
                                  } else {
                                    setConvenios((cs) => cs.filter((c) => c.nome.trim().toLowerCase() !== p.nome.toLowerCase()));
                                  }
                                }}
                              />
                              <span className="flex-1 truncate">{p.nome}</span>
                              {p.grupo && <span className="text-xs text-muted-foreground">{p.grupo}</span>}
                            </label>
                          );
                        })}
                    </div>
                  </div>
                  <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                    {convenios.map((c, i) => (
                      <div key={i} className="grid grid-cols-12 gap-2 items-end border rounded-md p-2">
                        <div className="col-span-5 space-y-1">
                          <Label className="text-xs">Nome</Label>
                          <Input value={c.nome} placeholder="Ex: Fimose"
                            onChange={(e) => setConvenios((cs) => cs.map((x, j) => j === i ? { ...x, nome: e.target.value } : x))} />
                        </div>
                        <div className="col-span-3 space-y-1">
                          <Label className="text-xs">Tipo</Label>
                          <select className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                            value={c.tipo_repasse}
                            onChange={(e) => setConvenios((cs) => cs.map((x, j) => j === i ? { ...x, tipo_repasse: e.target.value as "percentual" | "valor" } : x))}>
                            <option value="percentual">% Percentual</option>
                            <option value="valor">R$ Valor</option>
                          </select>
                        </div>
                        <div className="col-span-3 space-y-1">
                          <Label className="text-xs">{c.tipo_repasse === "percentual" ? "%" : "R$"}</Label>
                          <Input type="number" step="0.01" min={0}
                            value={c.tipo_repasse === "percentual" ? c.percentual : c.valor}
                            onChange={(e) => setConvenios((cs) => cs.map((x, j) => j === i ? (c.tipo_repasse === "percentual" ? { ...x, percentual: e.target.value } : { ...x, valor: e.target.value }) : x))} />
                        </div>
                        <div className="col-span-1">
                          <Button type="button" size="icon" variant="ghost"
                            onClick={() => setConvenios((cs) => cs.filter((_, j) => j !== i))} aria-label="Remover">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    {convenios.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">Nenhum convênio. Clique em "Adicionar".</p>
                    )}
                  </div>
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
                        Cria um usuário com o e-mail informado na aba <b>Contato</b> e vincula este médico à equipe da clínica. Se já existir usuário com este e-mail, ele será apenas adicionado à equipe.
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
                              <p className="text-xs text-amber-600">Informe um e-mail (também na aba Contato).</p>
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
            <DialogFooter className="sticky bottom-0 bg-background border-t -mx-6 -mb-6 px-6 py-3 z-10">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}