import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useClinica } from "@/hooks/use-clinica";
import { MedicoFormDialog } from "@/components/medicos/MedicoFormDialog";

export const Route = createFileRoute("/_authenticated/app/equipe/medico/$medicoId/editar")({
  component: EditarMedicoPage,
  head: () => ({ meta: [{ title: "Editar médico — ClinicaOS" }] }),
});

function EditarMedicoPage() {
  const { medicoId } = Route.useParams();
  const { clinicaAtual } = useClinica();
  const navigate = useNavigate();

  const voltar = () => navigate({ to: "/app/equipe", search: { tab: "medicos" } });

  if (!clinicaAtual) return <p className="text-muted-foreground">Selecione uma clínica primeiro.</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/app/equipe" search={{ tab: "medicos" }}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
          </Link>
        </Button>
        <h1 className="text-2xl font-bold text-foreground">Editar médico</h1>
      </div>
      <Card>
        <CardContent className="p-6">
          <MedicoFormDialog
            asPage
            open
            onOpenChange={(o) => { if (!o) voltar(); }}
            clinicaId={clinicaAtual.clinica_id}
            editingMedicoId={medicoId}
            onSaved={voltar}
          />
        </CardContent>
      </Card>
    </div>
  );
}