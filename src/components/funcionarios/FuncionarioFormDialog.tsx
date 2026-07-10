import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { cadastrarUsuario, getFuncionarioLogin, definirSenhaFuncionario, editarMembro } from "@/lib/equipe.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";

const PERFIS = [
  { value: "admin", label: "Administrador" },
  { value: "gestor", label: "Gestor" },
  { value: "medico", label: "Médico" },
  { value: "enfermeiro", label: "Enfermeiro" },
  { value: "recepcao", label: "Recepção" },
  { value: "caixa", label: "Caixa" },
  { value: "financeiro", label: "Financeiro" },
  { value: "supervisor", label: "Supervisor" },
] as const;

interface Ref { id: string; nome: string }

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  clinicaId: string;
  editingUserId?: string | null;
  onSaved?: () => void;
  asPage?: boolean;
}

const emptyForm = (clinicaId: string) => ({
  clinica_id: clinicaId,
  contrato_id: "",
  funcionario_nome: "",
  telefone: "",
  telefone2: "",
  setor_id: "",
  status: "ativo",
  criar_login: false, email: "", senha: "", perfil: "recepcao",
});

export function FuncionarioFormDialog({ open, onOpenChange, clinicaId, editingUserId, onSaved, asPage = false }: Props) {
  const cadastrarUsuarioFn = useServerFn(cadastrarUsuario);
  const getLoginFn = useServerFn(getFuncionarioLogin);
  const definirSenhaFn = useServerFn(definirSenhaFuncionario);
  const editarMembroFn = useServerFn(editarMembro);
  const [setores, setSetores] = useState<Ref[]>([]);
  const [disponiveis, setDisponiveis] = useState<Array<{ id: string; nome: string; setor_id: string | null; status: string }>>([]);
  const [form, setForm] = useState(() => emptyForm(clinicaId));
  const [editingContratoId, setEditingContratoId] = useState<string | null>(null);
  const [prefillUserId, setPrefillUserId] = useState<string | null>(null);
  const [existingEmail, setExistingEmail] = useState<string | null>(null);
  const [membershipId, setMembershipId] = useState<string | null>(null);
  const [perfilOriginal, setPerfilOriginal] = useState<string | null>(null);
  const [ativoOriginal, setAtivoOriginal] = useState<boolean>(true);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showSenha, setShowSenha] = useState(false);
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [savingSenha, setSavingSenha] = useState(false);

  // Load setores + funcionários disponíveis (sem login) when dialog opens
  useEffect(() => {
    if (!open || !clinicaId) return;
    void (async () => {
      const [st, disp] = await Promise.all([
        supabase.from("setores").select("id,nome").eq("clinica_id", clinicaId).eq("ativo", true).order("nome"),
        supabase.from("hr_contratos")
          .select("id, nome:funcionario_nome, setor_id, status")
          .eq("clinica_id", clinicaId)
          .is("user_id", null)
          .order("funcionario_nome"),
      ]);
      setSetores((st.data ?? []) as Ref[]);
      setDisponiveis((disp.data ?? []) as Array<{ id: string; nome: string; setor_id: string | null; status: string }>);
    })();
  }, [open, clinicaId]);

  // Load contract/profile when editing
  useEffect(() => {
    if (!open) return;
    if (!editingUserId) {
      setEditingContratoId(null);
      setPrefillUserId(null);
      setExistingEmail(null);
      setMembershipId(null);
      setPerfilOriginal(null);
      setAtivoOriginal(true);
      setForm(emptyForm(clinicaId));
      return;
    }
    void (async () => {
      setLoading(true);
      const [{ data: contratos }, { data: prof }, { data: mem }] = await Promise.all([
        supabase.from("hr_contratos").select("*").eq("clinica_id", clinicaId).eq("user_id", editingUserId)
          .order("created_at", { ascending: false }),
        supabase.from("profiles").select("nome, telefone, telefone2").eq("id", editingUserId).maybeSingle(),
        supabase.from("clinica_memberships").select("id, role, ativo").eq("clinica_id", clinicaId).eq("user_id", editingUserId).maybeSingle(),
      ]);
      // Um funcionário pode ter mais de um hr_contratos na mesma clínica (histórico
      // de contratos, ou duplicatas legadas de um bug de salvamento). Nunca usar
      // .maybeSingle() aqui: com 2+ linhas ela falha silenciosamente (data null),
      // fazendo a tela achar que não existe contrato e criar OUTRO ao salvar — é
      // assim que as duplicatas se multiplicam. Preferimos o contrato ativo mais
      // recente; sem nenhum ativo, o mais recente de qualquer status.
      const contrato = (contratos ?? []).find((c) => c.status === "ativo") ?? (contratos ?? [])[0] ?? null;
      const nome = (contrato?.funcionario_nome as string | undefined) ?? (prof?.nome as string | undefined) ?? "";
      const telefone = (prof?.telefone as string | undefined) ?? "";
      const telefone2 = ((prof as { telefone2?: string | null } | null)?.telefone2 as string | undefined) ?? "";
      const currentRole = (mem?.role as string | undefined) ?? "recepcao";
      setMembershipId((mem?.id as string | undefined) ?? null);
      setPerfilOriginal(currentRole);
      setAtivoOriginal((mem?.ativo as boolean | undefined) ?? true);
      if (contrato) {
        setEditingContratoId(contrato.id as string);
        setPrefillUserId(null);
        setForm({
          clinica_id: clinicaId,
          contrato_id: contrato.id as string,
          funcionario_nome: nome,
          telefone,
          telefone2,
          setor_id: (contrato.setor_id as string) ?? "",
          status: (contrato.status as string) ?? "ativo",
          criar_login: false, email: "", senha: "", perfil: currentRole,
        });
      } else {
        setEditingContratoId(null);
        setPrefillUserId(editingUserId);
        setForm({ ...emptyForm(clinicaId), funcionario_nome: nome, telefone, telefone2, perfil: currentRole });
      }
      // Try to get email of this user
      try {
        const res = await getLoginFn({ data: { clinicaId, userId: editingUserId } });
        setExistingEmail((res as { email?: string | null })?.email ?? null);
      } catch { setExistingEmail(null); }
      setShowSenha(false);
      setNovaSenha("");
      setConfirmarSenha("");
      setLoading(false);
    })();
  }, [open, editingUserId, clinicaId]);

  async function salvarNovaSenha() {
    if (!editingUserId) return;
    if (novaSenha.length < 6) { toast.error("Senha deve ter pelo menos 6 caracteres"); return; }
    if (novaSenha !== confirmarSenha) { toast.error("As senhas não conferem"); return; }
    setSavingSenha(true);
    try {
      await definirSenhaFn({ data: { clinicaId, userId: editingUserId, novaSenha } });
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

  async function salvar() {
    if (!form.clinica_id) { toast.error("Clínica não definida"); return; }
    const isNew = !editingContratoId && !prefillUserId;
    if (isNew && !form.contrato_id) { toast.error("Selecione um funcionário"); return; }
    if (!isNew && !form.funcionario_nome.trim()) { toast.error("Informe o nome"); return; }
    if (form.criar_login && isNew) {
      if (!form.email.trim()) { toast.error("Informe o e-mail do login"); return; }
      if (form.senha.length < 6) { toast.error("Senha deve ter pelo menos 6 caracteres"); return; }
    }
    setSaving(true);
    let userId: string | null = null;
    // Resolve o nome do funcionário escolhido (necessário ao criar login)
    const escolhido = disponiveis.find((d) => d.id === form.contrato_id);
    const nomeParaLogin = (escolhido?.nome ?? form.funcionario_nome).trim();
    if (form.criar_login && isNew) {
      try {
        const res = await cadastrarUsuarioFn({
          data: {
            clinicaId: form.clinica_id,
            email: form.email.trim(),
            password: form.senha,
            nome: nomeParaLogin,
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

    let error: { message: string } | null = null;
    if (editingContratoId) {
      const { error: e } = await supabase
        .from("hr_contratos")
        .update({ setor_id: form.setor_id || null, status: form.status })
        .eq("id", editingContratoId);
      error = e;
    } else if (isNew && form.contrato_id) {
      // Vincula o login (se criado) ao contrato escolhido e atualiza setor/status
      const updatePayload: { setor_id: string | null; status: string; user_id?: string } = {
        setor_id: form.setor_id || null,
        status: form.status,
      };
      if (userId) updatePayload.user_id = userId;
      const { error: e } = await supabase
        .from("hr_contratos")
        .update(updatePayload)
        .eq("id", form.contrato_id);
      error = e;
    } else if (prefillUserId) {
      // Caso raro: usuário existente sem contrato — cria um mínimo
      const { error: e } = await supabase.from("hr_contratos").insert({
        clinica_id: form.clinica_id,
        funcionario_nome: nomeParaLogin || "(sem nome)",
        setor_id: form.setor_id || null,
        status: form.status,
        user_id: prefillUserId,
      });
      error = e;
    }
    setSaving(false);
    if (error) { mostrarErro(error); return; }
    // Atualiza perfil de acesso (membership) quando mudou
    if (editingUserId && membershipId && form.perfil !== perfilOriginal) {
      try {
        await editarMembroFn({
          data: {
            clinicaId: form.clinica_id,
            membershipId,
            role: form.perfil as "recepcao",
            ativo: ativoOriginal,
          },
        });
        setPerfilOriginal(form.perfil);
      } catch (e) {
        toast.error((e as Error)?.message ?? "Erro ao atualizar perfil de acesso");
        return;
      }
    }
    // Atualiza telefones em profiles quando há um usuário vinculado
    const targetUserId = editingUserId ?? userId ?? prefillUserId ?? null;
    if (targetUserId) {
      await supabase.from("profiles")
        .update({ telefone: form.telefone.trim() || null, telefone2: form.telefone2.trim() || null })
        .eq("id", targetUserId);
    }
    toast.success(editingContratoId || prefillUserId ? "Funcionário atualizado" : "Funcionário cadastrado");
    onOpenChange(false);
    onSaved?.();
  }

  const isEditingExisting = !!editingUserId;

  const title = isEditingExisting ? "Editar funcionário" : "Novo funcionário";
  const body = (
    <>
      {loading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Carregando…</div>
        ) : (
          <Tabs defaultValue="dados" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="dados">Dados</TabsTrigger>
              <TabsTrigger value="login">Login e perfil</TabsTrigger>
            </TabsList>
            <TabsContent value="dados" className={asPage ? "space-y-3 pt-4" : "space-y-3 min-h-[480px] max-h-[70vh] overflow-y-auto pr-1"}>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>Nome do funcionário *</Label>
                  {isEditingExisting ? (
                    <Input value={form.funcionario_nome} disabled />
                  ) : (
                    <Select
                      value={form.contrato_id}
                      onValueChange={(v) => {
                        const d = disponiveis.find((x) => x.id === v);
                        setForm({
                          ...form,
                          contrato_id: v,
                          funcionario_nome: d?.nome ?? "",
                          setor_id: d?.setor_id ?? "",
                          status: d?.status ?? "ativo",
                        });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={disponiveis.length === 0 ? "Nenhum funcionário disponível — cadastre em Gestão de Pessoas" : "Selecione um funcionário"} />
                      </SelectTrigger>
                      <SelectContent>
                        {disponiveis.map((d) => (
                          <SelectItem key={d.id} value={d.id}>{d.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div>
                  <Label>Setor</Label>
                  <Select value={form.setor_id} onValueChange={v => setForm({ ...form, setor_id: v })}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>{setores.map(s => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
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
                <div>
                  <Label>Telefone</Label>
                  <Input value={form.telefone} onChange={e => setForm({ ...form, telefone: e.target.value })} placeholder="Telefone principal" />
                </div>
                <div>
                  <Label>Telefone 2</Label>
                  <Input value={form.telefone2} onChange={e => setForm({ ...form, telefone2: e.target.value })} placeholder="Telefone secundário (opcional)" />
                </div>
              </div>
            </TabsContent>
            <TabsContent value="login" className={asPage ? "space-y-3 pt-4" : "space-y-3 min-h-[480px] max-h-[70vh] overflow-y-auto pr-1"}>
              {isEditingExisting ? (
                <div className="space-y-4 py-2 text-sm">
                  {existingEmail ? (
                    <p><span className="text-muted-foreground">E-mail de login:</span> <span className="font-medium">{existingEmail}</span></p>
                  ) : (
                    <p className="text-muted-foreground">Não foi possível recuperar o e-mail de login deste funcionário.</p>
                  )}
                  {membershipId && (
                    <div className="border-t pt-4">
                      <Label>Perfil de acesso *</Label>
                      <Select value={form.perfil} onValueChange={v => setForm({ ...form, perfil: v })}>
                        <SelectTrigger className="max-w-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {PERFIS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground mt-1">
                        Alterações no perfil são salvas ao clicar em "Salvar".
                      </p>
                    </div>
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
                            <Input type="text" value={novaSenha} onChange={e => setNovaSenha(e.target.value)} placeholder="Mín. 6 caracteres" />
                          </div>
                          <div>
                            <Label>Confirmar senha *</Label>
                            <Input type="text" value={confirmarSenha} onChange={e => setConfirmarSenha(e.target.value)} />
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
    </>
  );

  const footer = (
    <>
      <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
      <Button onClick={salvar} disabled={saving || loading}>{saving ? "Salvando…" : "Salvar"}</Button>
    </>
  );

  if (asPage) {
    return (
      <div className="space-y-4">
        {body}
        <div className="flex justify-end gap-2 border-t pt-3">{footer}</div>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {body}
        <DialogFooter>{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}