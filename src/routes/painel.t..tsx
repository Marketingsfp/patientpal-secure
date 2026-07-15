import { createFileRoute } from "@tanstack/react-router";
import { PainelPage } from "./painel";
import { PublicClinicaProvider } from "@/components/public-clinica-provider";

export const Route = createFileRoute("/painel/t/$token")({
  component: PainelPublicoTokenRoute,
  head: () => ({
    meta: [
      { title: "Painel de senhas — ClinicaOS" },
      { name: "description", content: "Painel público de chamada de senhas." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function PainelPublicoTokenRoute() {
  const { token } = Route.useParams();
  return (
    <PublicClinicaProvider token={token}>
      <PainelPage />
    </PublicClinicaProvider>
  );
}
