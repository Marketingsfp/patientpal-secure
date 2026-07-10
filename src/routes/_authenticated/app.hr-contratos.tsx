import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { useServerFn } from "@tanstack/react-start";
import { cadastrarUsuario } from "@/lib/equipe.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Users, Plus, Pencil, Search } from "lucide-react";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { formatDatePura } from "@/lib/date-utils";

export const Route = createFileRoute("/_authenticated/app/hr-contratos")({
  component: ContratosPage,
  head: () => ({ meta: [{ title: "Funcionários — ClinicaOS" }] }),
  validateSearch: (search: Record<string, unknown>) => ({
    new: search.new === "1" || search.new === 1 ? "1" : undefined,
    edit: typeof search.edit === "string" ? search.edit : undefined,
  }),
});

interface Contrato {
  id: string;
  numero: number;
  funcionario_nome: string;
  cpf: string | null;
  clinica_id: string;
  cargo_id: string | null;
  setor_id: string | null;
  unidade_id: string | null;
  regime: string;
  carga_horaria_semanal: number;
  salario: number;
  data_admissao: string;
  data_demissao: string | null;
  status: string;
  user_id: string | null;
  sexo?: string | null;
}
interface Ref {
  id: string;
  nome: string;
}

const PERFIS = [
  { value: "admin", label: "Administrador" },
  { value: "gestor", label: "Gestor" },
  { value: "medico", label: "Médico" },
  { value: "enfermeiro", label: "Enfermeiro" },
  { value: "recepcao", label: "Recepção" },
  { value: "financeiro", label: "Financeiro" },
] as const;

function ContratosPage() {
  const { clinicaAtual, memberships } = useClinica();
  const { new: autoNew, edit: autoEdit } = Route.useSearch();
  const navigate = useNavigate();
  const cadastrarUsuarioFn = useServerFn(cadastrarUsuario);
  const [rows, setRows] = useState<Contrato[]>([]);
  const [cargos, setCargos] = useState<Ref[]>([]);
  const [setores, setSetores] = useState<Ref[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Contrato | null>(null);
  const [form, setForm] = useState({
    clinica_id: "",
    funcionario_nome: "",
    cpf: "",
    cargo_id: "",
    setor_id: "",
    unidade_id: "",
    regime: "clt",
    carga_horaria_semanal: "44",
    salario: "0",
    data_admissao: new Date().toISOString().slice(0, 10),
    data_demissao: "",
    status: "ativo",
    sexo: "nao_informar",
    criar_login: false,
    email: "",
    senha: "",
    perfil: "recepcao",
  });
  const [saving, setSaving] = useState(false);
  const [prefillUserId, setPrefillUserId] = useState<string | null>(null);

  async function load() {
    if (!clinicaAtual) return;
    setLoading(true);
    const [c, cg, st] = await Promise.all([
      supabase
        .from("hr_contratos")
        .select("*")
        .eq("clinica_id", clinicaAtual.clinica_id)
        .order("numero", { ascending: false }),
      supabase
        .from("cargos")
        .select("id,nome")
        .eq("clinica_id", clinicaAtual.clinica_id)
        .eq("ativo", true)
        .order("nome"),
      supabase
        .from("setores")
        .select("id,nome")
        .eq("clinica_id", clinicaAtual.clinica_id)
        .eq("ativo", true)
        .order("nome"),
    ]);
    if (c.error) mostrarErro(c.error);
    setRows((c.data ?? []) as Contrato[]);
    setCargos((cg.data ?? []) as Ref[]);
    setSetores((st.data ?? []) as Ref[]);
    setLoading(false);
  }
  useEffect(() => {
    void load();
  }, [clinicaAtual?.clinica_id]);

  useEffect(() => {
    if (autoNew === "1" && clinicaAtual) {
      openNew();
      void navigate({ to: "/app/hr-contratos", search: {}, replace: true });
    }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [autoNew, clinicaAtual?.clinica_id]);

  useEffect(() => {
    if (!autoEdit || !clinicaAtual || loading) return;
    void (async () => {
      const existing = rows.find((r) => r.user_id === autoEdit);
      if (existing) {
        openEdit(existing);
      } else {
        const { data: prof } = await supabase
          .from("profiles")
          .select("nome")
          .eq("id", autoEdit)
          .maybeSingle();
        setEditing(null);
        setForm({
          clinica_id: clinicaAtual.clinica_id,
          funcionario_nome: (prof?.nome ?? "").toString(),
          cpf: "",
          cargo_id: "",
          setor_id: "",
          unidade_id: "",
          regime: "clt",
          carga_horaria_semanal: "44",
          salario: "0",
          data_admissao: new Date().toISOString().slice(0, 10),
          data_demissao: "",
          status: "ativo",
          sexo: "nao_informar",
          criar_login: false,
          email: "",
          senha: "",
          perfil: "recepcao",
        });
        setPrefillUserId(autoEdit);
        setOpen(true);
      }
      void navigate({ to: "/app/hr-contratos", search: {}, replace: true });
    })();
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [autoEdit, clinicaAtual?.clinica_id, loading]);

  function openNew() {
    setEditing(null);
    setPrefillUserId(null);
    setForm({
      clinica_id: clinicaAtual?.clinica_id ?? "",
      funcionario_nome: "",
      cpf: "",
      cargo_id: "",
      setor_id: "",
      unidade_id: "",
      regime: "clt",
      carga_horaria_semanal: "44",
      salario: "0",
      data_admissao: new Date().toISOString().slice(0, 10),
      data_demissao: "",
      status: "ativo",
      sexo: "nao_informar",
      criar_login: false,
      email: "",
      senha: "",
      perfil: "recepcao",
    });
    setOpen(true);
  }
  function openEdit(c: Contrato) {
    setEditing(c);
    setPrefillUserId(null);
    setForm({
      clinica_id: c.clinica_id,
      funcionario_nome: c.funcionario_nome,
      cpf: c.cpf ?? "",
      cargo_id: c.cargo_id ?? "",
      setor_id: c.setor_id ?? "",
      unidade_id: c.unidade_id ?? "",
      regime: c.regime,
      carga_horaria_semanal: String(c.carga_horaria_semanal),
      salario: String(c.salario),
      data_admissao: c.data_admissao,
      data_demissao: c.data_demissao ?? "",
      status: c.status,
      sexo: c.sexo ?? "nao_informar",
      criar_login: false,
      email: "",
      senha: "",
      perfil: "recepcao",
    });
    setOpen(true);
  }

  async function salvar() {
    if (!form.clinica_id) {
      toast.error("Selecione a clínica");
      return;
    }
    if (!form.funcionario_nome.trim()) {
      toast.error("Informe o nome");
      return;
    }
    if (form.criar_login && !editing) {
      if (!form.email.trim()) {
        toast.error("Informe o e-mail do login");
        return;
      }
      if (form.senha.length < 6) {
        toast.error("Senha deve ter pelo menos 6 caracteres");
        return;
      }
    }
    setSaving(true);

    // 1) Se for novo funcionário e marcou "criar login", cria usuário + membership
    let userId: string | null = null;
    if (!editing && form.criar_login) {
      try {
        const res = await cadastrarUsuarioFn({
          data: {
            clinicaId: form.clinica_id,
            email: form.email.trim(),
            password: form.senha,
            nome: form.funcionario_nome.trim(),
            role: form.perfil as any,
          },
        });
        userId = (res as any)?.userId ?? null;
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
    const { error } = editing
      ? await supabase.from("hr_contratos").update(payload).eq("id", editing.id)
      : await supabase.from("hr_contratos").insert(payload);
    setSaving(false);
    if (error) {
      mostrarErro(error);
      return;
    }
    toast.success(editing ? "Funcionário atualizado" : "Funcionário cadastrado");
    setOpen(false);
    void load();
  }

  const filtered = rows.filter((r) => r.funcionario_nome.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Users className="h-6 w-6 text-primary" />
        <div className="flex-1">
          <h1 className="text-xl font-bold">Funcionários</h1>
          <p className="text-sm text-muted-foreground">Contratos de trabalho da clínica.</p>
        </div>
        <Button asChild variant="outline">
          <a href="/app/equipe">
            <Users className="h-4 w-4 mr-1" /> Gerenciar em Equipe
          </a>
        </Button>
      </div>

      <Card className="p-3">
        <div className="relative">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Nº</TableHead>
              <TableHead>Funcionário</TableHead>
              <TableHead>Cargo</TableHead>
              <TableHead className="w-28">Regime</TableHead>
              <TableHead className="w-32 text-right">Salário</TableHead>
              <TableHead className="w-32">Admissão</TableHead>
              <TableHead className="w-24">Situação</TableHead>
              <TableHead className="w-20 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-6 text-muted-foreground">
                  Carregando…
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-6 text-muted-foreground">
                  Nenhum funcionário cadastrado.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>#{r.numero}</TableCell>
                  <TableCell className="font-medium">{r.funcionario_nome}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {cargos.find((c) => c.id === r.cargo_id)?.nome ?? "-"}
                  </TableCell>
                  <TableCell className="text-sm uppercase">{r.regime}</TableCell>
                  <TableCell className="text-right">
                    {Number(r.salario).toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })}
                  </TableCell>
                  <TableCell className="text-sm">{formatDatePura(r.data_admissao)}</TableCell>
                  <TableCell>
                    <Badge variant={r.status === "ativo" ? "default" : "secondary"}>
                      {r.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">—</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar funcionário" : "Novo funcionário"}</DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="dados" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="dados">Dados</TabsTrigger>
              <TabsTrigger value="login">Login e perfil</TabsTrigger>
            </TabsList>
            <TabsContent
              value="dados"
              className="space-y-3 min-h-[480px] max-h-[70vh] overflow-y-auto pr-1"
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>Unidade *</Label>
                  <Select
                    value={form.clinica_id}
                    onValueChange={(v) => setForm({ ...form, clinica_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a unidade" />
                    </SelectTrigger>
                    <SelectContent>
                      {memberships.map((m) => (
                        <SelectItem key={m.clinica_id} value={m.clinica_id}>
                          {m.clinica.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <Label>Nome do funcionário *</Label>
                  <Input
                    value={form.funcionario_nome}
                    onChange={(e) => setForm({ ...form, funcionario_nome: e.target.value })}
                  />
                </div>
                <div>
                  <Label>CPF</Label>
                  <Input
                    value={form.cpf}
                    onChange={(e) => setForm({ ...form, cpf: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Regime</Label>
                  <Select
                    value={form.regime}
                    onValueChange={(v) => setForm({ ...form, regime: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
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
                  <Select
                    value={form.cargo_id}
                    onValueChange={(v) => setForm({ ...form, cargo_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      {cargos.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Setor</Label>
                  <Select
                    value={form.setor_id}
                    onValueChange={(v) => setForm({ ...form, setor_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      {setores.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Carga semanal (h)</Label>
                  <Input
                    type="number"
                    step="0.5"
                    value={form.carga_horaria_semanal}
                    onChange={(e) => setForm({ ...form, carga_horaria_semanal: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Salário (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.salario}
                    onChange={(e) => setForm({ ...form, salario: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Admissão</Label>
                  <Input
                    type="date"
                    value={form.data_admissao}
                    onChange={(e) => setForm({ ...form, data_admissao: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Demissão</Label>
                  <Input
                    type="date"
                    value={form.data_demissao}
                    onChange={(e) => setForm({ ...form, data_demissao: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Status</Label>
                  <Select
                    value={form.status}
                    onValueChange={(v) => setForm({ ...form, status: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
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
                  <Select value={form.sexo} onValueChange={(v) => setForm({ ...form, sexo: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
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
            <TabsContent
              value="login"
              className="space-y-3 min-h-[480px] max-h-[70vh] overflow-y-auto pr-1"
            >
              {editing ? (
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
                      onChange={(e) => setForm({ ...form, criar_login: e.target.checked })}
                    />
                    Criar login de acesso ao sistema para este funcionário
                  </label>
                  <fieldset
                    disabled={!form.criar_login}
                    className="grid grid-cols-2 gap-3 disabled:opacity-60"
                  >
                    <div className="col-span-2">
                      <Label>Perfil de acesso *</Label>
                      <Select
                        value={form.perfil}
                        onValueChange={(v) => setForm({ ...form, perfil: v })}
                        disabled={!form.criar_login}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PERFIS.map((p) => (
                            <SelectItem key={p.value} value={p.value}>
                              {p.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>E-mail (login) *</Label>
                      <Input
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                        disabled={!form.criar_login}
                      />
                    </div>
                    <div>
                      <Label>Senha inicial *</Label>
                      <Input
                        type="text"
                        value={form.senha}
                        onChange={(e) => setForm({ ...form, senha: e.target.value })}
                        placeholder="Mín. 6 caracteres"
                        disabled={!form.criar_login}
                      />
                    </div>
                  </fieldset>
                </div>
              )}
            </TabsContent>
          </Tabs>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={saving}>
              {saving ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
