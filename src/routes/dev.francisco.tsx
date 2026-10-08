import { createFileRoute, notFound } from "@tanstack/react-router";
import { FranciscoWorkspace } from "@/components/francisco/FranciscoWorkspace";
// Prévia local, sem autenticação/dados de pacientes/API. Indisponível no build de produção.
export const Route = createFileRoute("/dev/francisco")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  component: () => (
    <FranciscoWorkspace
      preview
      clinicaId="00000000-0000-4000-8000-000000000001"
      clinicaNome="Clínica de demonstração"
    />
  ),
});
