import { createFileRoute } from "@tanstack/react-router";
import { FranciscoWorkspace } from "@/components/francisco/FranciscoWorkspace";
import { useClinica } from "@/hooks/use-clinica";

export const Route = createFileRoute("/_authenticated/app/francisco")({
  head: () => ({ meta: [{ title: "Francisco — OS ZAP" }] }),
  component: Francisco,
});
function Francisco() {
  const { clinicaAtual, modoTodas, clinicaFixada } = useClinica();
  if (!clinicaAtual || modoTodas || !clinicaFixada)
    return (
      <div className="p-8 text-muted-foreground">
        Selecione uma clínica para configurar o Francisco.
      </div>
    );
  return (
    <FranciscoWorkspace
      key={clinicaAtual.clinica_id}
      clinicaId={clinicaAtual.clinica_id}
      clinicaNome={clinicaAtual.clinica.nome}
    />
  );
}
