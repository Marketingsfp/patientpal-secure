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
  pending?: boolean;
  user_id?: string;
}

const limparPrefixoMedico = (nome: string) =>
  nome.replace(/^(\s*(dr|dra)\.?\s+)+/i, "").trim();

function EquipePage() {
  const { clinicaAtual } = useClinica();
  const podeEscrever = usePodeEscrever("equipe");
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
      
      // Buscar nomes dos usuários pendentes
      const idsMedicoPendente = Array.from(new Set(
        mems.filter((r) => r.role === "medico" && !medicosUserIds.has(r.user_id)).map((r) => r.user_id)
      ));
      const nomeMap = new Map<string, string>();
      if (idsMedicoPendente.length) {
        const { data: profs } = await supabase.from("profiles").select("id, nome").in("id", idsMedicoPendente);
        (profs ?? []).forEach((p: any) => nomeMap.set(p.id, p.nome));
      }

      // Médicos pendentes (perfil médico sem cadastro completo)
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
      
      // Buscar especialidades
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
        ...medicosBase.map((md) => ({
          ...md,
          especialidades: espMap.get(md.id) ?? [],
        })),
        ...medicosPendentes,
      ]);
      setLoading(false);
    });
  }, [clinicaAtual?.clinica_id, reloadKey]);

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
        status: m.pending ? "Cadastro pendente" : m.ativo ? "Ativo" : "Inativo",
      })),
      `medicos-${new Date().toISOString().slice(0, 10)}`,
      [
        { key: "nome", label: "Nome" },
        { key: "crm", label: "CRM" },
        { key: "especialidades", label: "Especialidades" },
        { key: "telefone", label: "Telefone" },
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
    ? medicosPorStatus.filter((m) => 
        m.nome.toLowerCase().includes(q) || 
        (m.crm ?? "").includes(q) ||
        (m.especialidades?.some(e => e.toLowerCase().includes(q)) ?? false)
      )
    : medicosPorStatus;
  const medicosAtivosCount = medicos.filter((m) => m.ativo).length;
  const medicosInativosCount = medicos.length - medicosAtivosCount;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Médicos</h1>
          <p className="text-sm text-muted-foreground">
            Médicos da clínica. Cadastre e gerencie os profissionais de saúde.
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

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Stethoscope className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              {medicosAtivosCount} {medicosAtivosCount === 1 ? "médico ativo" : "médicos ativos"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{medicos.length} total</Badge>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={medicoStatus} onValueChange={(v) => setMedicoStatus(v as typeof medicoStatus)}>
            <SelectTrigger className="w-[150px] h-9">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ativos">Ativos ({medicosAtivosCount})</SelectItem>
              <SelectItem value="inativos">Inativos ({medicosInativosCount})</SelectItem>
              <SelectItem value="todos">Todos ({medicos.length})</SelectItem>
            </SelectContent>
          </Select>
          <Input
            placeholder="Buscar por nome, especialidade ou CRM..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full sm:w-64 h-9"
          />
        </div>
      </div>

      {loading ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Carregando…</CardContent></Card>
      ) : medicosFiltrados.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <Stethoscope className="h-8 w-8 mx-auto mb-2 opacity-50" /> Nenhum médico encontrado.
        </CardContent></Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>CRM</TableHead>
                <TableHead>Especialidade</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-16 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {medicosFiltrados.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.nome}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {m.crm ? `${m.crm}/${m.crm_uf ?? ""}` : "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {m.especialidades && m.especialidades.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {m.especialidades.map((e, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {e}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{m.telefone ?? "—"}</TableCell>
                  <TableCell>
                    {m.pending ? (
                      <Badge variant="destructive" className="text-xs">Cadastro pendente</Badge>
                    ) : m.ativo ? (
                      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 text-xs">Ativo</Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">Inativo</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {podeEscrever && (
                      m.pending ? (
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Completar cadastro"
                          onClick={() => {
                            setMedicoPrefillNome(m.nome);
                            setMedicoPrefillUserId(m.user_id);
                            setMedicoDialog({ open: true, id: null });
                          }}
                          className="h-8 w-8"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button
                          size="icon"
                          variant="ghost"
                          asChild
                          className="h-8 w-8"
                        >
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