import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { useServerFn } from "@tanstack/react-start";
import { cadastrarUsuario } from "@/lib/equipe.functions";
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

  const [cargos, setCargos] = useState<Ref[]>([]);
  const [setores, setSetores] = useState<Ref[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [prefillUserId, setPrefillUserId] = useState<string | null>(prefillFromSearch ?? null);
  const [form, setForm] = useState({
    clinica_id: "", funcionario_nome: "", cpf: "", cargo_id: "", setor_id: "", unidade_id: "",
    regime: "clt", carga_horaria_semanal: "44", salario: "0",
    data_admissao: new Date().toISOString().slice(0, 10), data_demissao: "", status: "ativo",
    sexo: "nao_informar",
    criar_login: false, email: "", senha: "", perfil: "recepcao",
  });

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
        }
      }
      setLoading(false);
    })();
  }, [clinicaAtual?.clinica_id, id]);

  async function salvar() {
    if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
    if (!form.clinica_id) { toast.error("Selecione a clínica"); return; }
    if (!form.funcionario_nome.trim()) { toast.error("Informe o nome"); return; }
    if (form.criar_login && isNovo) {
      if (!form.email.trim()) { toast.error("Informe o e-mail do login"); return; }
      if (form.senha.length < 6) { toast.error("Senha deve ter pelo menos 6 caracteres"); return; }
    }
    setSaving(true);

    let userId: string | null = null;
    if (isNovo && form.criar_login) {
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
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="dados">Dados</TabsTrigger>
            <TabsTrigger value="login">Login e perfil</TabsTrigger>
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
              <div className="col-span-2"><Label>Nome do funcionário *</Label><Input value={form.funcionario_nome} onChange={e => setForm({ ...form, funcionario_nome: e.target.value })} /></div>
              <div><Label>CPF</Label><Input value={form.cpf} onChange={e => setForm({ ...form, cpf: e.target.value })} /></div>
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
              <p className="text-sm text-muted-foreground py-4">
                O login não pode ser alterado por aqui após o cadastro do funcionário.
              </p>
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

        <div className="flex justify-end gap-2 pt-4 mt-4 border-t">
          <Button variant="outline" asChild>
            <Link to="/app/hr-contratos">Cancelar</Link>
          </Button>
          {podeEscrever && (
            <Button onClick={salvar} disabled={saving || loading}>{saving ? "Salvando…" : "Salvar"}</Button>
          )}
        </div>
      </Card>
    </div>
  );
}