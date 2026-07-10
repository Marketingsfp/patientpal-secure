import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Stethoscope, Pencil, Download } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { exportToExcel } from "@/lib/export-csv";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MedicoFormDialog } from "@/components/medicos/MedicoFormDialog";

export const Route = createFileRoute("/_authenticated/app/medicos")({
  component: MedicosPage,
  head: () => ({ meta: [{ title: "Médicos — ClinicaOS" }] }),
  validateSearch: (search: Record<string, unknown>) => ({
    new: search.new === "1" || search.new === 1 ? "1" : undefined,
    edit: typeof search.edit === "string" && search.edit.length > 0 ? search.edit : undefined,
  }),
});

interface Medico {
  id: string;
  nome: string;
  crm: string;
  crm_uf: string;
  percentual_repasse_padrao: number | null;
  valor_repasse_padrao: number | null;
  tipo_repasse: "percentual" | "valor" | null;
  ativo: boolean;
  medico_especialidades: { especialidade: { id: string; nome: string } | null }[];
}

const limparPrefixoMedico = (nome: string) => nome.replace(/^(\s*(dr|dra)\.?\s+)+/i, "").trim();

function MedicosPage() {
  const { clinicaAtual } = useClinica();
  const { new: autoNew, edit: autoEdit } = Route.useSearch();
  const navigate = useNavigate();
  const [medicos, setMedicos] = useState<Medico[]>([]);
  const [busca, setBusca] = useState("");
  const [dialog, setDialog] = useState<{ open: boolean; id: string | null }>({
    open: false,
    id: null,
  });

  const load = async () => {
    if (!clinicaAtual) return;
    const { data } = await supabase
      .from("medicos")
      .select(
        "id, nome, crm, crm_uf, ativo, medico_especialidades(especialidade:especialidades(id, nome))",
      )
      .eq("clinica_id", clinicaAtual.clinica_id)
      .order("nome");
    const base = ((data as unknown as Medico[]) ?? []).map((m) => ({
      ...m,
      nome: limparPrefixoMedico(m.nome),
      tipo_repasse: null,
      percentual_repasse_padrao: null,
      valor_repasse_padrao: null,
    }));
    // Repasse só visível a gestores (RPC restrita)
    const { data: rep } = await supabase.rpc("medicos_repasse_lista", {
      _clinica_id: clinicaAtual.clinica_id,
    });
    const repMap = new Map<
      string,
      {
        tipo_repasse: string | null;
        percentual_repasse_padrao: number | null;
        valor_repasse_padrao: number | null;
      }
    >();
    for (const r of (rep as any[] | null) ?? []) repMap.set(r.id, r);
    setMedicos(
      base.map((m) => {
        const r = repMap.get(m.id);
        return r
          ? {
              ...m,
              tipo_repasse: r.tipo_repasse as any,
              percentual_repasse_padrao: r.percentual_repasse_padrao,
              valor_repasse_padrao: r.valor_repasse_padrao,
            }
          : m;
      }),
    );
  };

  useEffect(() => {
    void load();
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [clinicaAtual?.clinica_id]);

  useEffect(() => {
    if (autoNew === "1") {
      setDialog({ open: true, id: null });
      void navigate({ to: "/app/medicos", search: {}, replace: true });
    }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [autoNew]);

  useEffect(() => {
    if (autoEdit) {
      setDialog({ open: true, id: autoEdit });
      void navigate({ to: "/app/medicos", search: {}, replace: true });
    }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [autoEdit]);

  const fmtRepasse = (m: Medico) => {
    if (m.tipo_repasse == null) return "—";
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
        crm: `${m.crm}/${m.crm_uf}`,
        especialidades:
          m.medico_especialidades
            ?.map((me) => me.especialidade?.nome)
            .filter(Boolean)
            .join(", ") || "",
        repasse: fmtRepasse(m),
        ativo: m.ativo ? "Sim" : "Não",
      })),
      `medicos-${new Date().toISOString().slice(0, 10)}`,
      [
        { key: "nome", label: "Nome" },
        { key: "crm", label: "CRM" },
        { key: "especialidades", label: "Especialidades" },
        { key: "repasse", label: "Repasse" },
        { key: "ativo", label: "Ativo" },
      ],
    );
  };

  if (!clinicaAtual) {
    return <p className="text-muted-foreground">Selecione uma clínica primeiro.</p>;
  }

  const medicosFiltrados = medicos.filter((m) => {
    const q = busca.trim().toLowerCase();
    if (!q) return true;
    const especs =
      m.medico_especialidades
        ?.map((me) => me.especialidade?.nome ?? "")
        .join(" ")
        .toLowerCase() ?? "";
    return (
      m.nome.toLowerCase().includes(q) ||
      `${m.crm}/${m.crm_uf}`.toLowerCase().includes(q) ||
      especs.includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Médicos</h1>
          <p className="text-sm text-muted-foreground">{clinicaAtual.clinica.nome}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" /> Exportar Excel
          </Button>
          <Button onClick={() => setDialog({ open: true, id: null })}>
            <Plus className="h-4 w-4 mr-2" /> Novo médico
          </Button>
        </div>
      </div>

      {medicos.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Stethoscope className="h-8 w-8 mx-auto mb-2 opacity-50" />
            Nenhum médico cadastrado nesta clínica.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="p-3 border-b">
            <Input
              placeholder="Buscar por nome, CRM ou especialidade…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="max-w-md"
            />
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>CRM</TableHead>
                <TableHead>Especialidades</TableHead>
                <TableHead className="text-right">Repasse</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {medicosFiltrados.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.nome}</TableCell>
                  <TableCell>
                    {m.crm}/{m.crm_uf}
                  </TableCell>
                  <TableCell>
                    {m.medico_especialidades
                      ?.map((me) => me.especialidade?.nome)
                      .filter(Boolean)
                      .join(", ") || "—"}
                  </TableCell>
                  <TableCell className="text-right">{fmtRepasse(m)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setDialog({ open: true, id: m.id })}
                      aria-label="Editar"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <MedicoFormDialog
        open={dialog.open}
        onOpenChange={(o) => setDialog((s) => ({ ...s, open: o }))}
        clinicaId={clinicaAtual.clinica_id}
        editingMedicoId={dialog.id}
        onSaved={() => void load()}
      />
    </div>
  );
}
