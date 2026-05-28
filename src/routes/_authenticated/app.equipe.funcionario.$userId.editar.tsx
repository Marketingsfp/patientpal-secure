import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useClinica } from "@/hooks/use-clinica";
import { FuncionarioFormDialog } from "@/components/funcionarios/FuncionarioFormDialog";

export const Route = createFileRoute("/_authenticated/app/equipe/funcionario/$userId/editar")({
  component: EditarFuncionarioPage,
  head: () => ({ meta: [{ title: "Editar funcionário — ClinicaOS" }] }),
});

function EditarFuncionarioPage() {
  const { userId } = Route.useParams();
  const { clinicaAtual } = useClinica();
  const navigate = useNavigate();

  const voltar = () => navigate({ to: "/app/equipe", search: { tab: "funcionarios" } });

  if (!clinicaAtual) return <p className="text-muted-foreground">Selecione uma clínica primeiro.</p>;

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" asChild>
        <Link to="/app/equipe" search={{ tab: "funcionarios" }}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Voltar para Equipe
        </Link>
      </Button>
      <FuncionarioFormDialog
        asPage
        open
        onOpenChange={(o) => { if (!o) voltar(); }}
        clinicaId={clinicaAtual.clinica_id}
        editingUserId={userId}
        onSaved={voltar}
      />
    </div>
  );
}