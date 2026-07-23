import { createFileRoute } from "@tanstack/react-router";
import { TotemPage } from "./totem";
import { PublicClinicaProvider } from "@/components/public-clinica-provider";

// Sufixo "_" no segmento pai (totem_.) des-aninha esta rota de /totem: o path
// público continua /totem/$clinicaId, mas ela renderiza o próprio componente —
// antes, aninhada sob /totem (que não tem <Outlet/>), o componente público
// nunca renderizava e o visitante sem login via "Nenhuma clínica selecionada".
export const Route = createFileRoute("/totem_/$clinicaId")({
  component: TotemPublicoRoute,
  head: () => ({
    meta: [
      { title: "Totem de senhas — ClinicaOS" },
      { name: "description", content: "Totem de auto-atendimento." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function TotemPublicoRoute() {
  const { clinicaId } = Route.useParams();
  return (
    <PublicClinicaProvider clinicaId={clinicaId}>
      <TotemPage />
    </PublicClinicaProvider>
  );
}