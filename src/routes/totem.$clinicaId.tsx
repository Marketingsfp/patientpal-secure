import { createFileRoute } from "@tanstack/react-router";
import { TotemPage } from "./totem";
import { PublicClinicaProvider } from "@/components/public-clinica-provider";

export const Route = createFileRoute("/totem/$clinicaId")({
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