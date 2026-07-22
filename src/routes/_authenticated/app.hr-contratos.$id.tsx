import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { useServerFn } from "@tanstack/react-start";
import {
  cadastrarUsuario,
  editarMembro,
  getFuncionarioLogin,
  definirSenhaFuncionario,
} from "@/lib/equipe.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { DateInputBR } from "@/components/ui/date-input-br";
import { ConvenioFuncionarioTab } from "@/components/funcionarios/ConvenioFuncionarioTab";
import { PatientSearchInput, type PatientOption } from "@/components/patient-search-input";
import { QuickPatientDialog } from "@/components/pacientes/quick-patient-dialog";
import { UserPlus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/hr-contratos/$id")({
  component: EditarFuncionarioPage,
  head: () => ({ meta: [{ title: "Funcionário — ClinicaOS" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    prefillUserId: typeof s.prefillUserId === "string" ? s.prefillUserId : undefined,
  }),
});

interface Ref { id: string; nome: string }

const PERFIS = [
  { value: "admin", label: "Administrador" },
  { value: "gestor", label: "Gestor" },
  { value: "medico", label: "Médico" },
  { value: "enfermeiro", label: "Enfermeiro" },
  { value: "recepcao", label: "Recepção" },
  { value: "financeiro", label: "Financeiro" },
] as const;

function EditarFuncionarioPage() {
  const { id } = Route.useParams();
  const { prefillUserId: prefillFromSearch } = Route.useSearch();
  const isNovo = id === "novo";
  const { clinicaAtual, memberships } = useClinica();
  const podeEscrever = usePodeEscrever("hr-contratos");
  const navigate = useNavigate();
  const cadastrarUsuarioFn = useServerFn(cadastrarUsuario);
  const editarMembroFn = useServerFn(editarMembro);
  const getLoginFn = useServerFn(getFuncionarioLogin);
  const definirSenhaFn = useServerFn(definirSenhaFuncionario);

  const [cargos, setCargos] = useState<Ref[]>([]);
  const [setores, setSetores] = useState<Ref[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [prefillUserId, setPrefillUserId] = useState<string | null>(prefillFromSearch ?? null);
  // Estado de "Acesso ao sistema" para edição (contrato já existente).
  const [linkedUserId, setLinkedUserId] = useState<string | null>(null);
  const [membershipId, setMembershipId] = useState<string | null>(null);
  const [membershipRole, setMembershipRole] = useState<string>("recepcao");
  const [membershipAtivo, setMembershipAtivo] = useState<boolean>(true);
  const [loginEmail, setLoginEmail] = useState<string | null>(null);
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [savingSenha, setSavingSenha] = useState(false);
  const [savingAcesso, setSavingAcesso] = useState(false);
  // Vincular a um login existente (memberships sem contrato).
  const [loginsDisponiveis, setLoginsDisponiveis] = useState<Array<{ user_id: string; nome: string; email: string | null }>>([]);
  const [vincularUserId, setVincularUserId] = useState<string>("");
  const [form, setForm] = useState({
    clinica_id: "", paciente_id: "", funcionario_nome: "", cpf: "", cargo_id: "", setor_id: "", unidade_id: "",
    regime: "clt", carga_horaria_semanal: "44", salario: "0",
    data_admissao: new Date().toISOString().slice(0, 10), data_demissao: "", status: "ativo",
    sexo: "nao_informar",
    criar_login: false, email: "", senha: "", perfil: "recepcao",
  });
  const [pacienteSel, setPacienteSel] = useState<PatientOption | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);

  useEffect(() => {
    if (!clinicaAtual) return;
    void (async () => {
      setLoading(true);
      const [cg, st] = await Promise.all([
        supabase.from("cargos").select("id,nome").eq("clinica_id", clinicaAtual.clinica_id).eq("ativo", true).order("nome"),
        supabase.from("setores").select("id,nome").eq("clinica_id", clinicaAtual.clinica_id).eq("ativo", true).order("nome"),
      ]);
      setCargos((cg.data ?? []) as Ref[]);
      setSetores((st.data ?? []) as Ref[]);

      if (isNovo) {
        let nomePref = "";
        if (prefillFromSearch) {
          const { data: prof } = await supabase.from("profiles").select("nome").eq("id", prefillFromSearch).maybeSingle();
          nomePref = (prof?.nome ?? "").toString();
          setPrefillUserId(prefillFromSearch);
        }
        setForm(f => ({
          ...f,
          clinica_id: clinicaAtual.clinica_id,
          funcionario_nome: nomePref,
        }));
      } else {
        const { data: c, error } = await supabase.from("hr_contratos").select("*").eq("id", id).maybeSingle();
        if (error) mostrarErro(error);
        if (c) {
          setForm({
            clinica_id: (c.clinica_id as string) ?? clinicaAtual.clinica_id,
            paciente_id: ((c as { paciente_id?: string | null }).paciente_id as string | null) ?? "",
            funcionario_nome: (c.funcionario_nome as string) ?? "",
            cpf: (c.cpf as string) ?? "",
            cargo_id: (c.cargo_id as string) ?? "",
            setor_id: (c.setor_id as string) ?? "",
            unidade_id: (c.unidade_id as string) ?? "",
            regime: (c.regime as string) ?? "clt",
            carga_horaria_semanal: String(c.carga_horaria_semanal ?? "44"),
            salario: String(c.salario ?? "0"),
            data_admissao: (c.data_admissao as string) ?? new Date().toISOString().slice(0, 10),
            data_demissao: (c.data_demissao as string) ?? "",
            status: (c.status as string) ?? "ativo",
            sexo: (c.sexo as string) ?? "nao_informar",
            criar_login: false, email: "", senha: "", perfil: "recepcao",
          });
          const pid = ((c as { paciente_id?: string | null }).paciente_id as string | null) ?? null;
          if (pid) {
            const { data: p } = await supabase
              .from("pacientes")
              .select("id, nome, cpf, telefone, data_nascimento, clinica_id")
              .eq("id", pid)
              .maybeSingle();
            if (p) setPacienteSel(p as unknown as PatientOption);
          }
          const uid = (c.user_id as string | null) ?? null;
          setLinkedUserId(uid);
          if (uid) {
            // Carrega membership + email do login vinculado.
            const [mem, emailRes] = await Promise.all([
              supabase
                .from("clinica_memberships")
                .select("id, role, ativo")
                .eq("clinica_id", clinicaAtual.clinica_id)
                .eq("user_id", uid)
                .maybeSingle(),
              getLoginFn({ data: { clinicaId: clinicaAtual.clinica_id, userId: uid } })
                .catch(() => ({ email: null as string | null })),
            ]);
            setMembershipId((mem.data?.id as string | undefined) ?? null);
            setMembershipRole(((mem.data?.role as string | undefined) ?? "recepcao"));
            setMembershipAtivo(((mem.data?.ativo as boolean | undefined) ?? true));
            setLoginEmail(((emailRes as { email?: string | null })?.email) ?? null);
          } else {
            // Contrato sem login: lista memberships que ainda não foram
            // amarrados a nenhum hr_contratos para permitir "Vincular".
            const [mems, ctos] = await Promise.all([
              supabase.from("clinica_memberships").select("user_id, ativo").eq("clinica_id", clinicaAtual.clinica_id),
              supabase.from("hr_contratos").select("user_id").eq("clinica_id", clinicaAtual.clinica_id).not("user_id", "is", null),
            ]);
            const usados = new Set((ctos.data ?? []).map((x) => x.user_id as string));
            const livresIds = ((mems.data ?? []) as Array<{ user_id: string }>)
              .map((x) => x.user_id)
              .filter((uid) => !usados.has(uid));
            if (livresIds.length) {
              const { data: profs } = await supabase.from("profiles").select("id, nome").in("id", livresIds);
              const nomeMap = new Map((profs ?? []).map((p: { id: string; nome: string }) => [p.id, p.nome]));
              const emails = await Promise.all(livresIds.map(async (uid) => {
                try {
                  const r = await getLoginFn({ data: { clinicaId: clinicaAtual.clinica_id, userId: uid } });
                  return [uid, ((r as { email?: string | null })?.email) ?? null] as const;
                } catch { return [uid, null] as const; }
              }));
              const emailMap = new Map(emails);
              setLoginsDisponiveis(livresIds.map((uid) => ({
                user_id: uid,
                nome: nomeMap.get(uid) ?? "(sem nome)",
                email: emailMap.get(uid) ?? null,
              })).sort((a, b) => a.nome.localeCompare(b.nome)));
            } else {
              setLoginsDisponiveis([]);
            }
          }
        }
      }
      setLoading(false);
    })();
  }, [clinicaAtual?.clinica_id, id]);

  async function salvar() {
    if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
    if (!form.clinica_id) { toast.error("Selecione a clínica"); return; }
    if (!form.funcionario_nome.trim()) { toast.error("Informe o nome"); return; }
    if (isNovo && !form.paciente_id) { toast.error("Selecione o cliente vinculado ao funcionário"); return; }
    // "Criar login" pode ser marcado tanto no cadastro novo quanto ao editar
    // um contrato existente que ainda não tem login vinculado.
    const criandoLogin = form.criar_login && (isNovo || !linkedUserId);
    if (criandoLogin) {
      if (!form.email.trim()) { toast.error("Informe o e-mail do login"); return; }
      if (form.senha.length < 6) { toast.error("Senha deve ter pelo menos 6 caracteres"); return; }
    }
    setSaving(true);

    let userId: string | null = null;
    if (criandoLogin) {
      try {
        const res = await cadastrarUsuarioFn({
          data: {
            clinicaId: form.clinica_id,
            email: form.email.trim(),
            password: form.senha,
            nome: form.funcionario_nome.trim(),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            role: form.perfil as any,
          },
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        userId = (res as any)?.userId ?? null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (e: any) {
        setSaving(false);
        mostrarErro(e);
        return;
      }
    }

    const payload = {
      clinica_id: form.clinica_id,
      paciente_id: form.paciente_id || null,
      funcionario_nome: form.funcionario_nome.trim(),
      cpf: form.cpf.trim() || null,
      cargo_id: form.cargo_id || null,
      setor_id: form.setor_id || null,
      unidade_id: form.unidade_id || null,
      regime: form.regime,
      carga_horaria_semanal: Number(form.carga_horaria_semanal),
      salario: Number(form.salario),
      data_admissao: form.data_admissao,
      data_demissao: form.data_demissao || null,
      status: form.status,
      sexo: form.sexo,
      ...(userId ? { user_id: userId } : prefillUserId ? { user_id: prefillUserId } : {}),
    };
    const { error } = isNovo
      ? await supabase.from("hr_contratos").insert(payload)
      : await supabase.from("hr_contratos").update(payload).eq("id", id);
    setSaving(false);
    if (error) { mostrarErro(error); return; }
    toast.success(isNovo ? "Funcionário cadastrado" : "Funcionário atualizado");
    void navigate({ to: "/app/hr-contratos" });
  }

  async function salvarAcesso() {
    if (!membershipId) return;
    setSavingAcesso(true);
    try {
      await editarMembroFn({
        data: {
          clinicaId: form.clinica_id,
          membershipId,
          role: membershipRole as "recepcao",
          ativo: membershipAtivo,
        },
      });
      toast.success("Acesso atualizado");
    } catch (e) {
      mostrarErro(e as { message: string });
    } finally {
      setSavingAcesso(false);
    }
  }

  async function salvarNovaSenha() {
    if (!linkedUserId) return;
    if (novaSenha.length < 6) { toast.error("Senha deve ter pelo menos 6 caracteres"); return; }
    if (novaSenha !== confirmarSenha) { toast.error("As senhas não conferem"); return; }
    setSavingSenha(true);
    try {
      await definirSenhaFn({ data: { clinicaId: form.clinica_id, userId: linkedUserId, novaSenha } });
      toast.success("Senha atualizada");
      setNovaSenha("");
      setConfirmarSenha("");
    } catch (e) {
      mostrarErro(e as { message: string });
    } finally {
      setSavingSenha(false);
    }
  }

  async function vincularLoginExistente() {
    if (!vincularUserId || isNovo) return;
    setSavingAcesso(true);
    const { error } = await supabase
      .from("hr_contratos")
      .update({ user_id: vincularUserId })
      .eq("id", id);
    setSavingAcesso(false);
    if (error) { mostrarErro(error); return; }
    toast.success("Login vinculado ao funcionário");
    // Recarrega dados do membership.
    setLinkedUserId(vincularUserId);
    if (!clinicaAtual) return;
    const [mem, emailRes] = await Promise.all([
      supabase.from("clinica_memberships").select("id, role, ativo").eq("clinica_id", clinicaAtual.clinica_id).eq("user_id", vincularUserId).maybeSingle(),
      getLoginFn({ data: { clinicaId: clinicaAtual.clinica_id, userId: vincularUserId } }).catch(() => ({ email: null as string | null })),
    ]);
    setMembershipId((mem.data?.id as string | undefined) ?? null);
    setMembershipRole(((mem.data?.role as string | undefined) ?? "recepcao"));
    setMembershipAtivo(((mem.data?.ativo as boolean | undefined) ?? true));
    setLoginEmail(((emailRes as { email?: string | null })?.email) ?? null);
  }

  return (
    <div className="p-6 space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/app/hr-contratos">
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar para funcionários
          </Link>
        </Button>
      </div>

      <div>
        <h1 className="text-xl font-bold">
          {isNovo ? "Novo funcionário" : `Editar funcionário${form.funcionario_nome ? ` — ${form.funcionario_nome}` : ""}`}
        </h1>
        <p className="text-sm text-muted-foreground">Contrato de trabalho da clínica.</p>
      </div>

      <Card className="p-4">
        {loading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Carregando…</div>
        ) : (
        <Tabs defaultValue="dados" className="w-full">
          <TabsList className={`grid w-full ${isNovo ? "grid-cols-2" : "grid-cols-3"}`}>
            <TabsTrigger value="dados">Dados do funcionário</TabsTrigger>
            <TabsTrigger value="login">Acesso ao sistema</TabsTrigger>
            {!isNovo && <TabsTrigger value="convenio">Convênio</TabsTrigger>}
          </TabsList>
          <TabsContent value="dados" className="space-y-3 pt-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Unidade *</Label>
                <Select value={form.clinica_id} onValueChange={v => setForm({ ...form, clinica_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione a unidade" /></SelectTrigger>
                  <SelectContent>
                    {memberships.map(m => (
                      <SelectItem key={m.clinica_id} value={m.clinica_id}>{m.clinica.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label>Nome do funcionário *</Label>
                <div className="flex gap-2 items-start">
                  <div className="flex-1">
                    <PatientSearchInput
                      value={pacienteSel}
                      onSelect={(p) => {
                        setPacienteSel(p);
                        setForm(f => ({
                          ...f,
                          paciente_id: p?.id ?? "",
                          funcionario_nome: p?.nome ?? "",
                          cpf: (p?.cpf ?? "").toString(),
                        }));
                      }}
                      clinicaIdsOverride={form.clinica_id ? [form.clinica_id] : undefined}
                      placeholder="Buscar cliente cadastrado…"
                      onRequestCreate={() => setQuickOpen(true)}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setQuickOpen(true)}
                    disabled={!form.clinica_id}
                    title="Cadastrar novo cliente"
                  >
                    <UserPlus className="h-4 w-4 mr-1" /> Cadastrar
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Escolha o cliente correspondente. Nome e CPF vêm do cadastro do paciente.
                </p>
              </div>
              <div>
                <Label>CPF</Label>
                <Input value={form.cpf} readOnly placeholder="—" />
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
              <div><Label>Admissão</Label><DateInputBR value={form.data_admissao} onChange={e => setForm({ ...form, data_admissao: e.target.value })} /></div>
              <div><Label>Demissão</Label><DateInputBR value={form.data_demissao} onChange={e => setForm({ ...form, data_demissao: e.target.value })} /></div>
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
            </div>
          </TabsContent>
          <TabsContent value="login" className="space-y-3 pt-3">
            {!isNovo ? (
              linkedUserId ? (
                <div className="space-y-5">
                  <div className="text-sm">
                    <span className="text-muted-foreground">E-mail de login: </span>
                    <span className="font-medium">{loginEmail ?? "(indisponível)"}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Perfil de acesso *</Label>
                      <Select value={membershipRole} onValueChange={setMembershipRole}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {PERFIS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Situação do acesso</Label>
                      <Select value={membershipAtivo ? "ativo" : "inativo"} onValueChange={(v) => setMembershipAtivo(v === "ativo")}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ativo">Ativo (pode acessar o sistema)</SelectItem>
                          <SelectItem value="inativo">Inativo (bloqueado)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {podeEscrever && (
                    <div>
                      <Button size="sm" onClick={salvarAcesso} disabled={savingAcesso || !membershipId}>
                        {savingAcesso ? "Salvando…" : "Salvar perfil e situação"}
                      </Button>
                    </div>
                  )}
                  <div className="border-t pt-4 space-y-3">
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
                    {podeEscrever && (
                      <Button size="sm" onClick={salvarNovaSenha} disabled={savingSenha}>
                        {savingSenha ? "Salvando…" : "Salvar nova senha"}
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Este funcionário ainda não tem login de acesso. Você pode vincular um login já existente na clínica ou criar um novo abaixo.
                  </p>
                  {loginsDisponiveis.length > 0 && (
                    <div className="space-y-2">
                      <Label>Vincular a um login existente</Label>
                      <div className="flex gap-2">
                        <Select value={vincularUserId} onValueChange={setVincularUserId}>
                          <SelectTrigger className="max-w-md"><SelectValue placeholder="Selecione um login sem funcionário" /></SelectTrigger>
                          <SelectContent>
                            {loginsDisponiveis.map((l) => (
                              <SelectItem key={l.user_id} value={l.user_id}>
                                {l.nome}{l.email ? ` — ${l.email}` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {podeEscrever && (
                          <Button size="sm" onClick={vincularLoginExistente} disabled={!vincularUserId || savingAcesso}>
                            {savingAcesso ? "Vinculando…" : "Vincular"}
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                  <div className="border-t pt-4 space-y-3">
                    <div className="text-sm font-medium">Ou criar um novo login</div>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" className="h-4 w-4 accent-primary" checked={form.criar_login} onChange={(e) => setForm({ ...form, criar_login: e.target.checked })} />
                      Criar login de acesso ao sistema
                    </label>
                    <fieldset disabled={!form.criar_login} className="grid grid-cols-2 gap-3 disabled:opacity-60">
                      <div className="col-span-2">
                        <Label>Perfil de acesso *</Label>
                        <Select value={form.perfil} onValueChange={(v) => setForm({ ...form, perfil: v })} disabled={!form.criar_login}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>{PERFIS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div><Label>E-mail (login) *</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} disabled={!form.criar_login} /></div>
                      <div><Label>Senha inicial *</Label><Input type="text" value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} placeholder="Mín. 6 caracteres" disabled={!form.criar_login} /></div>
                    </fieldset>
                    <p className="text-xs text-muted-foreground">
                      O novo login será criado e vinculado a este contrato ao clicar em "Salvar" no rodapé.
                    </p>
                  </div>
                </div>
              )
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
          {!isNovo && (
            <TabsContent value="convenio" className="pt-3">
              <ConvenioFuncionarioTab
                hrContratoId={id}
                clinicaId={form.clinica_id}
                pacienteId={form.paciente_id || null}
                pacienteNome={form.funcionario_nome}
                podeEscrever={podeEscrever}
              />
            </TabsContent>
          )}
        </Tabs>
        )}

        <div className="flex justify-end gap-2 pt-4 mt-4 border-t">
          <Button variant="outline" asChild>
            <Link to="/app/hr-contratos">Cancelar</Link>
          </Button>
          {podeEscrever && (
            <Button onClick={salvar} disabled={saving || loading}>{saving ? "Salvando…" : "Salvar"}</Button>
          )}
        </div>
      </Card>
      {form.clinica_id && (
        <QuickPatientDialog
          open={quickOpen}
          onOpenChange={setQuickOpen}
          clinicaId={form.clinica_id}
          nomeInicial={form.funcionario_nome}
          onCreated={(p) => {
            setPacienteSel(p);
            setForm(f => ({
              ...f,
              paciente_id: p.id,
              funcionario_nome: p.nome,
              cpf: (p.cpf ?? "").toString(),
            }));
            setQuickOpen(false);
          }}
        />
      )}
    </div>
  );
}