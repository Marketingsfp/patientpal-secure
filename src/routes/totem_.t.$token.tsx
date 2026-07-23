import { createFileRoute } from "@tanstack/react-router";
import { TotemPage } from "./totem";
import { PublicClinicaProvider } from "@/components/public-clinica-provider";

// Sufixo "_" no segmento pai des-aninha esta rota de /totem. O path público
// continua /totem/t/$token.
export const Route = createFileRoute("/totem_/t/$token")({
  component: TotemPublicoTokenRoute,
  head: () => ({
    meta: [
      { title: "Totem de senhas — ClinicaOS" },
      { name: "description", content: "Totem público de retirada de senhas." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function TotemPublicoTokenRoute() {
  const { token } = Route.useParams();
  return (
    <PublicClinicaProvider token={token}>
      <TotemPage />
    </PublicClinicaProvider>
  );
}