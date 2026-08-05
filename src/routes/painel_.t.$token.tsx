import { createFileRoute } from "@tanstack/react-router";
import { PainelPage } from "@/components/painel/painel-page";
import { PublicClinicaProvider } from "@/components/public-clinica-provider";

// Sufixo "_" no segmento pai des-aninha esta rota de /painel (que não
// renderiza <Outlet/>). O path público continua /painel/t/$token.
export const Route = createFileRoute("/painel_/t/$token")({
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