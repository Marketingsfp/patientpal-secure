import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
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
      <Button variant="ghost" size="sm" asChild>
        <Link to="/app/equipe" search={{ tab: "medicos" }}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Voltar para Equipe
        </Link>
      </Button>
      <MedicoFormDialog
        asPage
        open
        onOpenChange={(o) => { if (!o) voltar(); }}
        clinicaId={clinicaAtual.clinica_id}
        editingMedicoId={medicoId}
        onSaved={voltar}
      />
    </div>
  );
}