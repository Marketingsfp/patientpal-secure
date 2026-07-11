import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useClinica } from "@/hooks/use-clinica";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { FuncionarioFormDialog } from "@/components/funcionarios/FuncionarioFormDialog";

export const Route = createFileRoute("/_authenticated/app/equipe/funcionario/$userId/editar")({
  component: EditarFuncionarioPage,
  head: () => ({ meta: [{ title: "Editar funcionário — ClinicaOS" }] }),
});

function EditarFuncionarioPage() {
  const { userId } = Route.useParams();
  const { clinicaAtual } = useClinica();
  const podeEscrever = usePodeEscrever("equipe");
  const navigate = useNavigate();

  const voltar = () => navigate({ to: "/app/equipe", search: { tab: "funcionarios" } });

  if (!clinicaAtual) return <p className="text-muted-foreground">Selecione uma clínica primeiro.</p>;
  if (!podeEscrever) return <p className="text-muted-foreground">Você não tem permissão de edição neste módulo.</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/app/equipe" search={{ tab: "funcionarios" }}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
          </Link>
        </Button>
        <h1 className="text-2xl font-bold text-foreground">Editar funcionário</h1>
      </div>
      <Card>
        <CardContent className="p-6">
          <FuncionarioFormDialog
            asPage
            open
            onOpenChange={(o) => { if (!o) voltar(); }}
            clinicaId={clinicaAtual.clinica_id}
            editingUserId={userId}
            onSaved={voltar}
          />
        </CardContent>
      </Card>
    </div>
  );
}