import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useClinica } from "@/hooks/use-clinica";
import { Button } from "@/components/ui/button";
import { FuncionarioFormDialog } from "@/components/funcionarios/FuncionarioFormDialog";

export const Route = createFileRoute("/_authenticated/app/funcionario/$userId/editar")({
  component: EditarFuncionarioPage,
  head: () => ({ meta: [{ title: "Editar funcionário — ClinicaOS" }] }),
});

function EditarFuncionarioPage() {
  const { userId } = Route.useParams();
  const { clinicaAtual } = useClinica();
  const navigate = useNavigate();
  if (!clinicaAtual) return <p className="text-muted-foreground">Selecione uma clínica primeiro.</p>;
  const voltar = () => void navigate({ to: "/app/funcionario/$userId", params: { userId } });
  return (
    <div className="space-y-4 max-w-3xl mx-auto p-4">
      <Button asChild variant="ghost" size="sm">
        <Link to="/app/funcionario/$userId" params={{ userId }}><ArrowLeft className="h-4 w-4 mr-1" />Voltar</Link>
      </Button>
      <FuncionarioFormDialog
        mode="page"
        clinicaId={clinicaAtual.clinica_id}
        editingUserId={userId}
        onSaved={voltar}
        onClose={voltar}
      />
    </div>
  );
}