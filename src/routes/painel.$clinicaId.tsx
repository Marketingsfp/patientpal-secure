import { createFileRoute } from "@tanstack/react-router";
import { PainelPage } from "@/components/painel/painel-page";
import { PublicClinicaProvider } from "@/components/public-clinica-provider";

export const Route = createFileRoute("/painel/$clinicaId")({
  component: PainelPublicoRoute,
  head: () => ({
    meta: [
      { title: "Painel de senhas — ClinicaOS" },
      { name: "description", content: "Painel público de chamada de senhas." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function PainelPublicoRoute() {
  const { clinicaId } = Route.useParams();
  return (
    <PublicClinicaProvider clinicaId={clinicaId}>
      <PainelPage />
    </PublicClinicaProvider>
  );
}