import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Pencil, Stethoscope, Download } from "lucide-react";
import { toast } from "sonner";
import { useClinica } from "@/hooks/use-clinica";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { supabase } from "@/integrations/supabase/client";
import { exportToExcel } from "@/lib/export-csv";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MedicoFormDialog } from "@/components/medicos/MedicoFormDialog";

export const Route = createFileRoute("/_authenticated/app/equipe/")({
  component: EquipePage,
  head: () => ({ meta: [{ title: "Médicos — ClinicaOS" }] }),
  validateSearch: (search: Record<string, unknown>) => ({
    abrir: typeof search.abrir === "string" && search.abrir.length > 0 ? search.abrir : undefined,
    new: search.new === "1" || search.new === 1 ? "1" : undefined,
  }),
});

interface Medico {
  id: string;
  nome: string;
  crm: string | null;
  crm_uf: string | null;
  email: string | null;
  telefone: string | null;
  ativo: boolean;
  especialidades?: string[];
  // Repasse padrão do médico — só populado quando a RPC restrita
  // `medicos_repasse_lista` responde (perfis de gestão). Para os demais,
  // fica null e a coluna exibe "—".
  tipo_repasse?: "percentual" | "valor" | null;
  percentual_repasse_padrao?: number | null;
  valor_repasse_padrao?: number | null;
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
  const { abrir: autoAbrir, new: autoNew } = Route.useSearch();
  const navigate = useNavigate();
  const [medicos, setMedicos] = useState<Medico[]>([]);
  const [loading, setLoading] = useState(false);
  const [busca, setBusca] = useState("");
  const [medicoStatus, setMedicoStatus] = useState<"ativos" | "inativos" | "todos">("ativos");
  const [medicoDialog, setMedicoDialog] = useState<{ open: boolean; id: string | null }>({ open: false, id: null });
  const [medicoPrefillNome, setMedicoPrefillNome] = useState<string | undefined>(undefined);
  const [medicoPrefillUserId, setMedicoPrefillUserId] = useState<string | undefined>(undefined);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!clinicaAtual) return;
    setLoading(true);
    void Promise.all([
      // Precisamos dos memberships só para localizar perfis "Médico" que
      // ainda não têm cadastro em `medicos` (falta CRM). Esses aparecem
      // aqui como "cadastro pendente".
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
      const idsMedicoPendente = Array.from(new Set(
        mems.filter((r) => r.role === "medico" && !medicosUserIds.has(r.user_id)).map((r) => r.user_id)
      ));
      const nomeMap = new Map<string, string>();
      if (idsMedicoPendente.length) {
        const { data: profs } = await supabase.from("profiles").select("id, nome").in("id", idsMedicoPendente);
        (profs ?? []).forEach((p: any) => nomeMap.set(p.id, p.nome));
      }
      // Perfil "Médico" sem cadastro completo em `medicos` (falta CRM): mantém
      // visível como pendente — nunca deve desaparecer do sistema.
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
      // Repasse só é retornado pela RPC para perfis de gestão. Se o usuário
      // não tiver acesso, `rep` vem vazio e a coluna aparece como "—".
      const { data: rep } = await supabase.rpc("medicos_repasse_lista", {
        _clinica_id: clinicaAtual.clinica_id,
      });
      const repMap = new Map<string, {
        tipo_repasse: string | null;
        percentual_repasse_padrao: number | null;
        valor_repasse_padrao: number | null;
      }>();
      for (const r of (rep as any[] | null) ?? []) repMap.set(r.id, r);
      setMedicos([
        ...medicosBase.map((md) => {
          const r = repMap.get(md.id);
          return {
            ...md,
            especialidades: espMap.get(md.id) ?? [],
            tipo_repasse: (r?.tipo_repasse as Medico["tipo_repasse"]) ?? null,
            percentual_repasse_padrao: r?.percentual_repasse_padrao ?? null,
            valor_repasse_padrao: r?.valor_repasse_padrao ?? null,
          };
        }),
        ...medicosPendentes,
      ]);
      setLoading(false);
    });
  }, [clinicaAtual?.clinica_id, reloadKey]);

  // Abrir dialog automaticamente via ?abrir=<id> (busca universal) ou ?new=1.
  useEffect(() => {
    if (autoNew === "1") {
      if (podeEscrever) {
        setMedicoPrefillNome(undefined);
        setMedicoPrefillUserId(undefined);
        setMedicoDialog({ open: true, id: null });
      }
      void navigate({ to: "/app/equipe", search: {}, replace: true });
    } else if (autoAbrir) {
      if (podeEscrever) setMedicoDialog({ open: true, id: autoAbrir });
      void navigate({ to: "/app/equipe", search: {}, replace: true });
    }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [autoAbrir, autoNew, podeEscrever]);

  const fmtRepasse = (m: Medico) => {
    if (m.pending || m.tipo_repasse == null) return "—";
    return m.tipo_repasse === "valor"
      ? `R$ ${Number(m.valor_repasse_padrao ?? 0).toFixed(2)}`
      : `${m.percentual_repasse_padrao ?? 0}%`;
  };

  const handleExport = () => {
    if (medicos.length === 0) {
      toast.info("Sem dados para exportar.");
      return;
    }
    exportToExcel(
      medicos.map((m) => ({
        nome: m.nome,
        crm: m.crm ? `${m.crm}/${m.crm_uf ?? ""}` : "",
        especialidades: (m.especialidades ?? []).join(", "),
        telefone: m.telefone ?? "",
        repasse: fmtRepasse(m),
        status: m.pending ? "Cadastro pendente" : m.ativo ? "Ativo" : "Inativo",
      })),
      `medicos-${new Date().toISOString().slice(0, 10)}`,
      [
        { key: "nome", label: "Nome" },
        { key: "crm", label: "CRM" },
        { key: "especialidades", label: "Especialidades" },
        { key: "telefone", label: "Telefone" },
        { key: "repasse", label: "Repasse" },
        { key: "status", label: "Status" },
      ],
    );
  };

  const novoMedico = () => {
    setMedicoPrefillNome(undefined);
    setMedicoPrefillUserId(undefined);
    setMedicoDialog({ open: true, id: null });
  };
  if (!clinicaAtual) return <p className="text-muted-foreground">Selecione uma clínica primeiro.</p>;

  const q = busca.trim().toLowerCase();
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
          <h1 className="text-2xl font-semibold">Médicos</h1>
          <p className="text-sm text-muted-foreground">
            Cadastro de médicos de {clinicaAtual.clinica.nome} (CRM, especialidades e repasse).
            Funcionários administrativos ficam em <Link to="/app/hr-contratos" className="underline">Recursos Humanos → Funcionários</Link>.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" /> Exportar Excel
          </Button>
          {podeEscrever && (
            <Button onClick={novoMedico}>
              <Plus className="h-4 w-4 mr-2" /> Novo médico
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-end">
          <Input
            placeholder="Buscar por nome ou CRM…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full sm:w-72"
          />
        </div>
        <div>
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
                  <TableHead className="text-right">Repasse</TableHead>
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
                      <TableCell className="text-right text-sm">{fmtRepasse(m)}</TableCell>
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
        </div>
      </div>

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