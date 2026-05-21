import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Pencil, Users, Stethoscope } from "lucide-react";
import { useClinica } from "@/hooks/use-clinica";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/app/equipe")({
  component: EquipePage,
  head: () => ({ meta: [{ title: "Equipe — ClinicaOS" }] }),
});

interface Funcionario {
  id: string;
  numero: number | null;
  funcionario_nome: string;
  cpf: string | null;
  status: string | null;
  salario: number | null;
  data_admissao: string | null;
  user_id: string | null;
}

interface Medico {
  id: string;
  nome: string;
  crm: string | null;
  crm_uf: string | null;
  email: string | null;
  telefone: string | null;
  ativo: boolean;
}

function EquipePage() {
  const { clinicaAtual } = useClinica();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"funcionarios" | "medicos">("funcionarios");
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [medicos, setMedicos] = useState<Medico[]>([]);
  const [loading, setLoading] = useState(false);
  const [openChooser, setOpenChooser] = useState(false);
  const [busca, setBusca] = useState("");

  useEffect(() => {
    if (!clinicaAtual) return;
    setLoading(true);
    void Promise.all([
      supabase
        .from("hr_contratos")
        .select("id, numero, funcionario_nome, cpf, status, salario, data_admissao, user_id")
        .eq("clinica_id", clinicaAtual.clinica_id)
        .order("funcionario_nome"),
      supabase
        .from("medicos")
        .select("id, nome, crm, crm_uf, email, telefone, ativo")
        .eq("clinica_id", clinicaAtual.clinica_id)
        .order("nome"),
    ]).then(([f, m]) => {
      setFuncionarios((f.data ?? []) as Funcionario[]);
      setMedicos((m.data ?? []) as Medico[]);
      setLoading(false);
    });
  }, [clinicaAtual?.clinica_id]);

  const escolherFuncionario = () => {
    setOpenChooser(false);
    void navigate({ to: "/app/hr-contratos", search: { new: "1" } });
  };
  const escolherMedico = () => {
    setOpenChooser(false);
    void navigate({ to: "/app/medicos", search: { new: "1" } });
  };

  if (!clinicaAtual) return <p className="text-muted-foreground">Selecione uma clínica primeiro.</p>;

  const q = busca.trim().toLowerCase();
  const funcsFiltrados = q
    ? funcionarios.filter((f) => f.funcionario_nome.toLowerCase().includes(q) || (f.cpf ?? "").includes(q))
    : funcionarios;
  const medicosFiltrados = q
    ? medicos.filter((m) => m.nome.toLowerCase().includes(q) || (m.crm ?? "").includes(q))
    : medicos;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Equipe</h1>
          <p className="text-sm text-muted-foreground">
            Funcionários e médicos de {clinicaAtual.clinica.nome}. Aqui você cadastra a equipe e libera acesso ao sistema.
          </p>
        </div>
        <Button onClick={() => setOpenChooser(true)}>
          <Plus className="h-4 w-4 mr-2" /> Novo cadastro
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "funcionarios" | "medicos")}>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <TabsList>
            <TabsTrigger value="funcionarios">
              <Users className="h-4 w-4 mr-2" /> Funcionários
              <Badge variant="secondary" className="ml-2">{funcionarios.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="medicos">
              <Stethoscope className="h-4 w-4 mr-2" /> Médicos
              <Badge variant="secondary" className="ml-2">{medicos.length}</Badge>
            </TabsTrigger>
          </TabsList>
          <Input
            placeholder="Buscar por nome, CPF ou CRM…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full sm:w-72"
          />
        </div>

        <TabsContent value="funcionarios" className="mt-4">
          {loading ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">Carregando…</CardContent></Card>
          ) : funcsFiltrados.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              <Users className="h-8 w-8 mx-auto mb-2 opacity-50" /> Nenhum funcionário cadastrado.
            </CardContent></Card>
          ) : (
            <Card>
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="w-16">Nº</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>CPF</TableHead>
                  <TableHead>Admissão</TableHead>
                  <TableHead>Acesso</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-16 text-right">Ações</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {funcsFiltrados.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell className="text-muted-foreground">{f.numero ?? "—"}</TableCell>
                      <TableCell>{f.funcionario_nome}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{f.cpf ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{f.data_admissao ?? "—"}</TableCell>
                      <TableCell>{f.user_id ? <Badge>Tem login</Badge> : <Badge variant="outline">Sem login</Badge>}</TableCell>
                      <TableCell>
                        <Badge variant={f.status === "ativo" ? "default" : "outline"} className="capitalize">{f.status ?? "—"}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild size="icon" variant="ghost">
                          <Link to="/app/hr-contratos"><Pencil className="h-4 w-4" /></Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="medicos" className="mt-4">
          {loading ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">Carregando…</CardContent></Card>
          ) : medicosFiltrados.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              <Stethoscope className="h-8 w-8 mx-auto mb-2 opacity-50" /> Nenhum médico cadastrado.
            </CardContent></Card>
          ) : (
            <Card>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>CRM</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-16 text-right">Ações</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {medicosFiltrados.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell>{m.nome}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{m.crm ? `${m.crm}/${m.crm_uf ?? ""}` : "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{m.email ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{m.telefone ?? "—"}</TableCell>
                      <TableCell>{m.ativo ? <Badge>Ativo</Badge> : <Badge variant="outline">Inativo</Badge>}</TableCell>
                      <TableCell className="text-right">
                        <Button asChild size="icon" variant="ghost">
                          <Link to="/app/medicos"><Pencil className="h-4 w-4" /></Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={openChooser} onOpenChange={setOpenChooser}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>O que você quer cadastrar?</DialogTitle>
            <DialogDescription>
              Escolha o tipo de cadastro. Em ambos é possível liberar acesso ao sistema.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={escolherFuncionario}
              className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-border bg-background p-6 text-center transition hover:border-primary hover:bg-accent"
            >
              <Users className="h-8 w-8 text-primary" />
              <span className="font-medium">Funcionário</span>
              <span className="text-xs text-muted-foreground">Equipe administrativa, recepção, enfermagem…</span>
            </button>
            <button
              type="button"
              onClick={escolherMedico}
              className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-border bg-background p-6 text-center transition hover:border-primary hover:bg-accent"
            >
              <Stethoscope className="h-8 w-8 text-primary" />
              <span className="font-medium">Médico</span>
              <span className="text-xs text-muted-foreground">Profissionais com CRM, especialidades e repasse</span>
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}