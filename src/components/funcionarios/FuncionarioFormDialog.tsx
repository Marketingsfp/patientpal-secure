import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { cadastrarUsuario } from "@/lib/equipe.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";

const PERFIS = [
  { value: "admin", label: "Administrador" },
  { value: "gestor", label: "Gestor" },
  { value: "medico", label: "Médico" },
  { value: "enfermeiro", label: "Enfermeiro" },
  { value: "recepcao", label: "Recepção" },
  { value: "financeiro", label: "Financeiro" },
] as const;

interface Ref { id: string; nome: string }

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  clinicaId: string;
  editingUserId?: string | null;
  onSaved?: () => void;
}

const emptyForm = (clinicaId: string) => ({
  clinica_id: clinicaId,
  funcionario_nome: "", cpf: "", cargo_id: "", setor_id: "",
  regime: "clt", carga_horaria_semanal: "44", salario: "0",
  data_admissao: new Date().toISOString().slice(0, 10), data_demissao: "", status: "ativo",
  sexo: "nao_informar",
  criar_login: false, email: "", senha: "", perfil: "recepcao",
});

export function FuncionarioFormDialog({ open, onOpenChange, clinicaId, editingUserId, onSaved }: Props) {
  const cadastrarUsuarioFn = useServerFn(cadastrarUsuario);
  const [cargos, setCargos] = useState<Ref[]>([]);
  const [setores, setSetores] = useState<Ref[]>([]);
  const [form, setForm] = useState(() => emptyForm(clinicaId));
  const [editingContratoId, setEditingContratoId] = useState<string | null>(null);
  const [prefillUserId, setPrefillUserId] = useState<string | null>(null);
  const [existingEmail, setExistingEmail] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  // Load cargos/setores when dialog opens
  useEffect(() => {
    if (!open || !clinicaId) return;
    void (async () => {
      const [cg, st] = await Promise.all([
        supabase.from("cargos").select("id,nome").eq("clinica_id", clinicaId).eq("ativo", true).order("nome"),
        supabase.from("setores").select("id,nome").eq("clinica_id", clinicaId).eq("ativo", true).order("nome"),
      ]);
      setCargos((cg.data ?? []) as Ref[]);
      setSetores((st.data ?? []) as Ref[]);
    })();
  }, [open, clinicaId]);

  // Load contract/profile when editing
  useEffect(() => {
    if (!open) return;
    if (!editingUserId) {
      setEditingContratoId(null);
      setPrefillUserId(null);
      setExistingEmail(null);
      setForm(emptyForm(clinicaId));
      return;
    }
    void (async () => {
      setLoading(true);
      const [{ data: contrato }, { data: prof }] = await Promise.all([
        supabase.from("hr_contratos").select("*").eq("clinica_id", clinicaId).eq("user_id", editingUserId).maybeSingle(),
        supabase.from("profiles").select("nome").eq("id", editingUserId).maybeSingle(),
      ]);
      const nome = (contrato?.funcionario_nome as string | undefined) ?? (prof?.nome as string | undefined) ?? "";
      if (contrato) {
        setEditingContratoId(contrato.id as string);
        setPrefillUserId(null);
        setForm({
          clinica_id: clinicaId,
          funcionario_nome: nome,
          cpf: (contrato.cpf as string) ?? "",
          cargo_id: (contrato.cargo_id as string) ?? "",
          setor_id: (contrato.setor_id as string) ?? "",
          regime: (contrato.regime as string) ?? "clt",
          carga_horaria_semanal: String(contrato.carga_horaria_semanal ?? "44"),
          salario: String(contrato.salario ?? "0"),
          data_admissao: (contrato.data_admissao as string) ?? new Date().toISOString().slice(0, 10),
          data_demissao: (contrato.data_demissao as string) ?? "",
          status: (contrato.status as string) ?? "ativo",
          sexo: (contrato.sexo as string) ?? "nao_informar",
          criar_login: false, email: "", senha: "", perfil: "recepcao",
        });
      } else {
        setEditingContratoId(null);
        setPrefillUserId(editingUserId);
        setForm({ ...emptyForm(clinicaId), funcionario_nome: nome });
      }
      // Try to get email of this user
      try {
        const { data: u } = await supabase.auth.getUser();
        if (u.user && u.user.id === editingUserId) setExistingEmail(u.user.email ?? null);
        else setExistingEmail(null);
      } catch { setExistingEmail(null); }
      setLoading(false);
    })();
  }, [open, editingUserId, clinicaId]);

  async function salvar() {
    if (!form.clinica_id) { toast.error("Clínica não definida"); return; }
    if (!form.funcionario_nome.trim()) { toast.error("Informe o nome"); return; }
    const isNew = !editingContratoId && !prefillUserId;
    if (form.criar_login && isNew) {
      if (!form.email.trim()) { toast.error("Informe o e-mail do login"); return; }
      if (form.senha.length < 6) { toast.error("Senha deve ter pelo menos 6 caracteres"); return; }
    }
    setSaving(true);
    let userId: string | null = null;
    if (form.criar_login && isNew) {
      try {
        const res = await cadastrarUsuarioFn({
          data: {
            clinicaId: form.clinica_id,
            email: form.email.trim(),
            password: form.senha,
            nome: form.funcionario_nome.trim(),
            role: form.perfil as "recepcao",
          },
        });
        userId = (res as { userId?: string })?.userId ?? null;
      } catch (e) {
        setSaving(false);
        toast.error((e as Error)?.message ?? "Erro ao criar login");
        return;
      }
    }

    const payload = {
      clinica_id: form.clinica_id,
      funcionario_nome: form.funcionario_nome.trim(),
      cpf: form.cpf.trim() || null,
      cargo_id: form.cargo_id || null,
      setor_id: form.setor_id || null,
      regime: form.regime,
      carga_horaria_semanal: Number(form.carga_horaria_semanal),
      salario: Number(form.salario),
      data_admissao: form.data_admissao,
      data_demissao: form.data_demissao || null,
      status: form.status,
      sexo: form.sexo,
      ...(userId ? { user_id: userId } : prefillUserId ? { user_id: prefillUserId } : {}),
    };
    const { error } = editingContratoId
      ? await supabase.from("hr_contratos").update(payload).eq("id", editingContratoId)
      : await supabase.from("hr_contratos").insert(payload);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editingContratoId || prefillUserId ? "Funcionário atualizado" : "Funcionário cadastrado");
    onOpenChange(false);
    onSaved?.();
  }

  const isEditingExisting = !!editingUserId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEditingExisting ? "Editar funcionário" : "Novo funcionário"}</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Carregando…</div>
        ) : (
          <Tabs defaultValue="dados" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="dados">Dados</TabsTrigger>
              <TabsTrigger value="login">Login e perfil</TabsTrigger>
            </TabsList>
            <TabsContent value="dados" className="space-y-3 min-h-[480px] max-h-[70vh] overflow-y-auto pr-1">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2"><Label>Nome do funcionário *</Label><Input value={form.funcionario_nome} onChange={e => setForm({ ...form, funcionario_nome: e.target.value })} /></div>
                <div><Label>CPF</Label><Input value={form.cpf} onChange={e => setForm({ ...form, cpf: e.target.value })} /></div>
                <div>
                  <Label>Sexo</Label>
                  <Select value={form.sexo} onValueChange={v => setForm({ ...form, sexo: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="masculino">Masculino</SelectItem>
                      <SelectItem value="feminino">Feminino</SelectItem>
                      <SelectItem value="outro">Outro</SelectItem>
                      <SelectItem value="nao_informar">Prefiro não informar</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Regime</Label>
                  <Select value={form.regime} onValueChange={v => setForm({ ...form, regime: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="clt">CLT</SelectItem>
                      <SelectItem value="pj">PJ</SelectItem>
                      <SelectItem value="autonomo">Autônomo</SelectItem>
                      <SelectItem value="estagio">Estágio</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Cargo</Label>
                  <Select value={form.cargo_id} onValueChange={v => setForm({ ...form, cargo_id: v })}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>{cargos.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Setor</Label>
                  <Select value={form.setor_id} onValueChange={v => setForm({ ...form, setor_id: v })}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>{setores.map(s => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Carga semanal (h)</Label><Input type="number" step="0.5" value={form.carga_horaria_semanal} onChange={e => setForm({ ...form, carga_horaria_semanal: e.target.value })} /></div>
                <div><Label>Salário (R$)</Label><Input type="number" step="0.01" value={form.salario} onChange={e => setForm({ ...form, salario: e.target.value })} /></div>
                <div><Label>Admissão</Label><Input type="date" value={form.data_admissao} onChange={e => setForm({ ...form, data_admissao: e.target.value })} /></div>
                <div><Label>Demissão</Label><Input type="date" value={form.data_demissao} onChange={e => setForm({ ...form, data_demissao: e.target.value })} /></div>
                <div>
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ativo">Ativo</SelectItem>
                      <SelectItem value="afastado">Afastado</SelectItem>
                      <SelectItem value="ferias">Em férias</SelectItem>
                      <SelectItem value="desligado">Desligado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </TabsContent>
            <TabsContent value="login" className="space-y-3 min-h-[480px] max-h-[70vh] overflow-y-auto pr-1">
              {isEditingExisting ? (
                <div className="space-y-3 py-2 text-sm">
                  {existingEmail ? (
                    <p><span className="text-muted-foreground">E-mail de login:</span> <span className="font-medium">{existingEmail}</span></p>
                  ) : (
                    <p className="text-muted-foreground">Funcionário com login criado anteriormente. Para alterar e-mail ou senha use a tela de perfil do funcionário.</p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-primary"
                      checked={form.criar_login}
                      onChange={e => setForm({ ...form, criar_login: e.target.checked })}
                    />
                    Criar login de acesso ao sistema para este funcionário
                  </label>
                  <fieldset disabled={!form.criar_login} className="grid grid-cols-2 gap-3 disabled:opacity-60">
                    <div className="col-span-2">
                      <Label>Perfil de acesso *</Label>
                      <Select value={form.perfil} onValueChange={v => setForm({ ...form, perfil: v })} disabled={!form.criar_login}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {PERFIS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div><Label>E-mail (login) *</Label><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} disabled={!form.criar_login} /></div>
                    <div><Label>Senha inicial *</Label><Input type="text" value={form.senha} onChange={e => setForm({ ...form, senha: e.target.value })} placeholder="Mín. 6 caracteres" disabled={!form.criar_login} /></div>
                  </fieldset>
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving || loading}>{saving ? "Salvando…" : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}