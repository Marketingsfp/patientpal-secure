import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { cadastrarUsuario, getFuncionarioLogin, definirSenhaFuncionario } from "@/lib/equipe.functions";
import { salvarVinculosAgendas, listarVinculosAgendas } from "@/lib/enfermagem-equipe.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";

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
  criar_login: false,
  email: "",
  senha: "",
});

export function EnfermeiroFormDialog({ open, onOpenChange, clinicaId, editingUserId, onSaved, asPage = false }: Props) {
  const cadastrarUsuarioFn = useServerFn(cadastrarUsuario);
  const getLoginFn = useServerFn(getFuncionarioLogin);
  const definirSenhaFn = useServerFn(definirSenhaFuncionario);
  const salvarVinculosFn = useServerFn(salvarVinculosAgendas);
  const listarVinculosFn = useServerFn(listarVinculosAgendas);

  const [setores, setSetores] = useState<Ref[]>([]);
  const [disponiveis, setDisponiveis] = useState<Array<{ id: string; nome: string; setor_id: string | null; status: string }>>([]);
  const [recursos, setRecursos] = useState<Ref[]>([]);
  const [recursosSelecionados, setRecursosSelecionados] = useState<Set<string>>(new Set());
  const [form, setForm] = useState(() => emptyForm(clinicaId));
  const [editingContratoId, setEditingContratoId] = useState<string | null>(null);
  const [prefillUserId, setPrefillUserId] = useState<string | null>(null);
  const [existingEmail, setExistingEmail] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showSenha, setShowSenha] = useState(false);
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [savingSenha, setSavingSenha] = useState(false);

  useEffect(() => {
    if (!open || !clinicaId) return;
    void (async () => {
      const [st, disp, rec] = await Promise.all([
        supabase.from("setores").select("id,nome").eq("clinica_id", clinicaId).eq("ativo", true).order("nome"),
        supabase.from("hr_contratos")
          .select("id, nome:funcionario_nome, setor_id, status")
          .eq("clinica_id", clinicaId)
          .is("user_id", null)
          .order("funcionario_nome"),
        supabase.from("enfermagem_recursos")
          .select("id, nome")
          .eq("clinica_id", clinicaId)
          .eq("ativo", true)
          .order("nome"),
      ]);
      setSetores((st.data ?? []) as Ref[]);
      setDisponiveis((disp.data ?? []) as Array<{ id: string; nome: string; setor_id: string | null; status: string }>);
      setRecursos((rec.data ?? []) as Ref[]);
    })();
  }, [open, clinicaId]);

  useEffect(() => {
    if (!open) return;
    if (!editingUserId) {
      setEditingContratoId(null);
      setPrefillUserId(null);
      setExistingEmail(null);
      setForm(emptyForm(clinicaId));
      setRecursosSelecionados(new Set());
      return;
    }
    void (async () => {
      setLoading(true);
      const [{ data: contrato }, { data: prof }] = await Promise.all([
        supabase.from("hr_contratos").select("*").eq("clinica_id", clinicaId).eq("user_id", editingUserId).maybeSingle(),
        supabase.from("profiles").select("nome, telefone, telefone2").eq("id", editingUserId).maybeSingle(),
      ]);
      const nome = (contrato?.funcionario_nome as string | undefined) ?? (prof?.nome as string | undefined) ?? "";
      const telefone = (prof?.telefone as string | undefined) ?? "";
      const telefone2 = ((prof as { telefone2?: string | null } | null)?.telefone2 as string | undefined) ?? "";
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
          criar_login: false, email: "", senha: "",
        });
      } else {
        setEditingContratoId(null);
        setPrefillUserId(editingUserId);
        setForm({ ...emptyForm(clinicaId), funcionario_nome: nome, telefone, telefone2 });
      }
      try {
        const res = await getLoginFn({ data: { clinicaId, userId: editingUserId } });
        setExistingEmail((res as { email?: string | null })?.email ?? null);
      } catch { setExistingEmail(null); }
      try {
        const ids = await listarVinculosFn({ data: { clinicaId, userId: editingUserId } });
        setRecursosSelecionados(new Set(ids as string[]));
      } catch { setRecursosSelecionados(new Set()); }
      setShowSenha(false);
      setNovaSenha("");
      setConfirmarSenha("");
      setLoading(false);
    })();
  }, [open, editingUserId, clinicaId]);

  function toggleRecurso(id: string, checked: boolean) {
    setRecursosSelecionados((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  }

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
            role: "enfermeiro",
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
      const { error: e } = await supabase.from("hr_contratos").insert({
        clinica_id: form.clinica_id,
        funcionario_nome: nomeParaLogin || "(sem nome)",
        setor_id: form.setor_id || null,
        status: form.status,
        user_id: prefillUserId,
      });
      error = e;
    }
    if (error) { setSaving(false); mostrarErro(error); return; }

    const targetUserId = editingUserId ?? userId ?? prefillUserId ?? null;
    if (targetUserId) {
      await supabase.from("profiles")
        .update({ telefone: form.telefone.trim() || null, telefone2: form.telefone2.trim() || null })
        .eq("id", targetUserId);
      try {
        await salvarVinculosFn({
          data: {
            clinicaId: form.clinica_id,
            userId: targetUserId,
            recursoIds: Array.from(recursosSelecionados),
          },
        });
      } catch (e) {
        setSaving(false);
        toast.error((e as Error)?.message ?? "Erro ao salvar agendas");
        return;
      }
    }

    setSaving(false);
    toast.success(editingContratoId || prefillUserId ? "Enfermeiro atualizado" : "Enfermeiro cadastrado");
    onOpenChange(false);
    onSaved?.();
  }

  const isEditingExisting = !!editingUserId;
  const title = isEditingExisting ? "Editar enfermeiro" : "Novo enfermeiro";

  const tabClass = asPage ? "space-y-3 pt-4" : "space-y-3 min-h-[480px] max-h-[70vh] overflow-y-auto pr-1";

  const body = (
    <>
      {loading ? (
        <div className="py-10 text-center text-sm text-muted-foreground">Carregando…</div>
      ) : (
        <Tabs defaultValue="dados" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="dados">Dados</TabsTrigger>
            <TabsTrigger value="agendas">Agendas</TabsTrigger>
            <TabsTrigger value="login">Login</TabsTrigger>
          </TabsList>

          <TabsContent value="dados" className={tabClass}>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Nome do enfermeiro *</Label>
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

          <TabsContent value="agendas" className={tabClass}>
            <p className="text-sm text-muted-foreground">
              Selecione as agendas (recursos de enfermagem) que este enfermeiro poderá atender.
            </p>
            {recursos.length === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                Nenhuma agenda de enfermagem cadastrada. Cadastre em <span className="font-medium">Enfermagem → Recursos</span>.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {recursos.map((r) => {
                  const checked = recursosSelecionados.has(r.id);
                  return (
                    <label
                      key={r.id}
                      className="flex items-center gap-2 rounded-md border p-3 cursor-pointer hover:bg-accent"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(c) => toggleRecurso(r.id, !!c)}
                      />
                      <span className="text-sm">{r.nome}</span>
                    </label>
                  );
                })}
              </div>
            )}
            {!isEditingExisting && (
              <p className="text-xs text-muted-foreground">
                Os vínculos serão salvos após cadastrar o enfermeiro com login de acesso.
              </p>
            )}
          </TabsContent>

          <TabsContent value="login" className={tabClass}>
            {isEditingExisting ? (
              <div className="space-y-4 py-2 text-sm">
                {existingEmail ? (
                  <p><span className="text-muted-foreground">E-mail de login:</span> <span className="font-medium">{existingEmail}</span></p>
                ) : (
                  <p className="text-muted-foreground">Não foi possível recuperar o e-mail de login deste enfermeiro.</p>
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
                  Criar login de acesso ao sistema para este enfermeiro
                </label>
                <fieldset disabled={!form.criar_login} className="grid grid-cols-2 gap-3 disabled:opacity-60">
                  <div><Label>E-mail (login) *</Label><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} disabled={!form.criar_login} /></div>
                  <div><Label>Senha inicial *</Label><Input type="text" value={form.senha} onChange={e => setForm({ ...form, senha: e.target.value })} placeholder="Mín. 6 caracteres" disabled={!form.criar_login} /></div>
                </fieldset>
                <p className="text-xs text-muted-foreground">Perfil: <span className="font-medium">Enfermeiro</span></p>
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