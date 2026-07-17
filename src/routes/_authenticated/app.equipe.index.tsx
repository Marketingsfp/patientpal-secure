import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { useEffect, useState } from "react";
import { Plus, Pencil, Users, Stethoscope } from "lucide-react";
import { useClinica } from "@/hooks/use-clinica";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { FuncionarioFormDialog } from "@/components/funcionarios/FuncionarioFormDialog";
import { MedicoFormDialog } from "@/components/medicos/MedicoFormDialog";

export const Route = createFileRoute("/_authenticated/app/equipe/")({
  component: EquipePage,
  head: () => ({ meta: [{ title: "Equipe — ClinicaOS" }] }),
  validateSearch: z.object({
    tab: z.enum(["funcionarios", "medicos"]).optional(),
  }),
});

interface Funcionario {
  id: string;
  user_id: string;
  nome: string;
  role: string;
  ativo: boolean;
}

interface Medico {
  id: string;
  nome: string;
  crm: string | null;
  crm_uf: string | null;
  email: string | null;
  telefone: string | null;
  ativo: boolean;
  especialidades?: string[];
  // Perfil de acesso já é "Médico" (clinica_memberships), mas ainda não existe
  // registro em `medicos` (falta CRM). Aparece aqui, na aba Médicos, com um
  // aviso — nunca deve sumir do sistema. `id` sintético = "pending-<user_id>".
  pending?: boolean;
  user_id?: string;
}

const limparPrefixoMedico = (nome: string) =>
  nome.replace(/^(\s*(dr|dra)\.?\s+)+/i, "").trim();

function EquipePage() {
  const { clinicaAtual } = useClinica();
  const podeEscrever = usePodeEscrever("equipe");
  const { tab: tabFromUrl } = Route.useSearch();
  const [tab, setTab] = useState<"funcionarios" | "medicos">(tabFromUrl ?? "funcionarios");
  useEffect(() => { if (tabFromUrl) setTab(tabFromUrl); }, [tabFromUrl]);
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [medicos, setMedicos] = useState<Medico[]>([]);
  const [loading, setLoading] = useState(false);
  const [openChooser, setOpenChooser] = useState(false);
  const [busca, setBusca] = useState("");
  const [medicoStatus, setMedicoStatus] = useState<"ativos" | "inativos" | "todos">("ativos");
  const [funcDialog, setFuncDialog] = useState<{ open: boolean; userId?: string | null }>({ open: false, userId: null });
  const [medicoDialog, setMedicoDialog] = useState<{ open: boolean; id: string | null }>({ open: false, id: null });
  const [medicoPrefillNome, setMedicoPrefillNome] = useState<string | undefined>(undefined);
  const [medicoPrefillUserId, setMedicoPrefillUserId] = useState<string | undefined>(undefined);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!clinicaAtual) return;
    setLoading(true);
    void Promise.all([
      // Todos os vínculos, inclusive role="medico": um perfil trocado para
      // Médico só deve sair da lista de Funcionários quando o cadastro em
      // `medicos` (CRM etc.) já existir — antes disso, some da lista de
      // Funcionários E não aparece em Médicos por falta desse registro,
      // desaparecendo do sistema por completo. Ver filtro abaixo.
      supabase
        .from("clinica_memberships")
        .select("id, user_id, role, ativo")
        .eq("clinica_id", clinicaAtual.clinica_id),
      supabase
        .from("medicos")
        .select("id, user_id, nome, crm, crm_uf, email, telefone, ativo")
        .eq("clinica_id", clinicaAtual.clinica_id)
        .order("nome"),
    ]).then(async ([f, m]) => {
      const mems = (f.data ?? []) as Array<{ id: string; user_id: string; role: string; ativo: boolean }>;
      const medicosRaw = (m.data ?? []) as Array<{ user_id: string | null }>;
      const medicosUserIds = new Set(medicosRaw.map((x) => x.user_id).filter((x): x is string => !!x));
      const ids = Array.from(new Set(mems.map((x) => x.user_id)));
      const nomeMap = new Map<string, string>();
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("id, nome").in("id", ids);
        (profs ?? []).forEach((p: any) => nomeMap.set(p.id, p.nome));
      }
      const allRows: Funcionario[] = mems.map((r) => ({
        id: r.id,
        user_id: r.user_id,
        nome: nomeMap.get(r.user_id) ?? "(sem nome)",
        role: r.role,
        ativo: r.ativo,
      }));
      allRows.sort((a, b) => a.nome.localeCompare(b.nome));
      // Quem é médico nunca aparece em Funcionários (nem "pendente" — esses
      // vão para a aba Médicos, mesclados via medicosPendentes abaixo).
      setFuncionarios(allRows.filter((r) => r.role !== "medico"));
      // Perfil "Médico" sem cadastro completo em `medicos` (falta CRM): mantém
      // visível na aba Médicos como pendente — nunca deve desaparecer do
      // sistema. Usa o próprio membership como linha sintética (id prefixado).
      const medicosPendentes: Medico[] = mems
        .filter((r) => r.role === "medico" && !medicosUserIds.has(r.user_id))
        .map((r) => ({
          id: `pending-${r.user_id}`,
          nome: nomeMap.get(r.user_id) ?? "(sem nome)",
          crm: null,
          crm_uf: null,
          email: null,
          telefone: null,
          ativo: r.ativo,
          especialidades: [],
          pending: true,
          user_id: r.user_id,
        }));

      const medicosBase = ((m.data ?? []) as Medico[]).map((medico) => ({
        ...medico,
        nome: limparPrefixoMedico(medico.nome),
      }));
      const medicoIds = medicosBase.map((x) => x.id);
      const espMap = new Map<string, string[]>();
      if (medicoIds.length) {
        const { data: vincs } = await supabase
          .from("medico_especialidades")
          .select("medico_id, especialidade:especialidades(nome)")
          .in("medico_id", medicoIds);
        for (const v of (vincs ?? []) as Array<{ medico_id: string; especialidade: { nome: string } | null }>) {
          const nome = v.especialidade?.nome;
          if (!nome) continue;
          const arr = espMap.get(v.medico_id) ?? [];
          if (!arr.includes(nome)) arr.push(nome);
          espMap.set(v.medico_id, arr);
        }
      }
      setMedicos([
        ...medicosBase.map((md) => ({ ...md, especialidades: espMap.get(md.id) ?? [] })),
        ...medicosPendentes,
      ]);
      setLoading(false);
    });
  }, [clinicaAtual?.clinica_id, reloadKey]);

  const escolherFuncionario = () => {
    setOpenChooser(false);
    setFuncDialog({ open: true, userId: null });
  };
  const escolherMedico = () => {
    setOpenChooser(false);
    setMedicoPrefillNome(undefined);
    setMedicoPrefillUserId(undefined);
    setMedicoDialog({ open: true, id: null });
  };
  if (!clinicaAtual) return <p className="text-muted-foreground">Selecione uma clínica primeiro.</p>;

  const q = busca.trim().toLowerCase();
  const funcsFiltrados = q
    ? funcionarios.filter((f) => f.nome.toLowerCase().includes(q) || f.role.toLowerCase().includes(q))
    : funcionarios;
  const medicosPorStatus = medicos.filter((m) =>
    medicoStatus === "todos" ? true : medicoStatus === "ativos" ? m.ativo : !m.ativo
  );
  const medicosFiltrados = q
    ? medicosPorStatus.filter((m) => m.nome.toLowerCase().includes(q) || (m.crm ?? "").includes(q))
    : medicosPorStatus;
  const medicosAtivosCount = medicos.filter((m) => m.ativo).length;
  const medicosInativosCount = medicos.length - medicosAtivosCount;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Equipe</h1>
          <p className="text-sm text-muted-foreground">
            Funcionários e médicos de {clinicaAtual.clinica.nome}. Aqui você cadastra a equipe e libera acesso ao sistema.
          </p>
        </div>
        {podeEscrever && (
          <Button onClick={() => setOpenChooser(true)}>
            <Plus className="h-4 w-4 mr-2" /> Novo cadastro
          </Button>
        )}
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
              <Badge variant="secondary" className="ml-2">{medicosAtivosCount}</Badge>
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
                  <TableHead>Nome</TableHead>
                  <TableHead>Função</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-16 text-right">Ações</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {funcsFiltrados.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell>{f.nome}</TableCell>
                      <TableCell className="text-sm text-muted-foreground capitalize">{f.role}</TableCell>
                      <TableCell>
                        <Badge variant={f.ativo ? "default" : "outline"}>{f.ativo ? "Ativo" : "Inativo"}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {podeEscrever && (
                          <Button size="icon" variant="ghost" asChild>
                            <Link to="/app/equipe/funcionario/$userId/editar" params={{ userId: f.user_id }}>
                              <Pencil className="h-4 w-4" />
                            </Link>
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="medicos" className="mt-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground mr-1">Status:</span>
            <Select value={medicoStatus} onValueChange={(v) => setMedicoStatus(v as typeof medicoStatus)}>
              <SelectTrigger className="w-[200px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ativos">Ativos ({medicosAtivosCount})</SelectItem>
                <SelectItem value="inativos">Inativos ({medicosInativosCount})</SelectItem>
                <SelectItem value="todos">Todos ({medicos.length})</SelectItem>
              </SelectContent>
            </Select>
          </div>
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
                  <TableHead>Especialidade</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-16 text-right">Ações</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {medicosFiltrados.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell>{m.nome}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{m.crm ? `${m.crm}/${m.crm_uf ?? ""}` : "—"}</TableCell>
                      <TableCell className="text-sm">
                        {m.especialidades && m.especialidades.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {m.especialidades.map((e, i) => (
                              <Badge key={i} variant="outline">{e}</Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{m.telefone ?? "—"}</TableCell>
                      <TableCell>
                        {m.pending ? (
                          <Badge variant="destructive">Cadastro pendente (falta CRM)</Badge>
                        ) : m.ativo ? (
                          <Badge>Ativo</Badge>
                        ) : (
                          <Badge variant="outline">Inativo</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {podeEscrever && (
                          m.pending ? (
                            <Button
                              size="icon"
                              variant="ghost"
                              title="Completar cadastro de médico"
                              onClick={() => {
                                setMedicoPrefillNome(m.nome);
                                setMedicoPrefillUserId(m.user_id);
                                setMedicoDialog({ open: true, id: null });
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          ) : (
                            <Button size="icon" variant="ghost" asChild>
                              <Link to="/app/equipe/medico/$medicoId/editar" params={{ medicoId: m.id }}>
                                <Pencil className="h-4 w-4" />
                              </Link>
                            </Button>
                          )
                        )}
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={escolherFuncionario}
              className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-border bg-background p-4 text-center transition hover:border-primary hover:bg-accent"
            >
              <Users className="h-8 w-8 text-primary" />
              <span className="font-medium">Funcionário</span>
              <span className="text-xs text-muted-foreground">Administrativo, recepção, financeiro…</span>
            </button>
            <button
              type="button"
              onClick={escolherMedico}
              className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-border bg-background p-4 text-center transition hover:border-primary hover:bg-accent"
            >
              <Stethoscope className="h-8 w-8 text-primary" />
              <span className="font-medium">Médico</span>
              <span className="text-xs text-muted-foreground">CRM, especialidades e repasse</span>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {clinicaAtual && (
        <FuncionarioFormDialog
          open={funcDialog.open}
          onOpenChange={(o) => setFuncDialog((s) => ({ ...s, open: o }))}
          clinicaId={clinicaAtual.clinica_id}
          editingUserId={funcDialog.userId ?? null}
          onSaved={() => setReloadKey((k) => k + 1)}
        />
      )}
      {clinicaAtual && (
        <MedicoFormDialog
          open={medicoDialog.open}
          onOpenChange={(o) => setMedicoDialog((s) => ({ ...s, open: o }))}
          clinicaId={clinicaAtual.clinica_id}
          editingMedicoId={medicoDialog.id}
          prefillNome={medicoPrefillNome}
          prefillUserId={medicoPrefillUserId}
          onSaved={() => setReloadKey((k) => k + 1)}
        />
      )}
    </div>
  );
}