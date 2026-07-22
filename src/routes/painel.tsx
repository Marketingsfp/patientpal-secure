import { createFileRoute } from "@tanstack/react-router";
import { ClinicaProvider } from "@/hooks/use-clinica";
import { PainelPage } from "@/components/painel/painel-page";

export { PainelPage } from "@/components/painel/painel-page";

export const Route = createFileRoute("/painel")({
  component: PainelRoute,
  head: () => ({
    meta: [
      { title: "Painel de senhas — ClinicaOS" },
      { name: "description", content: "Painel público de chamada de senhas da clínica." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function PainelRoute() {
  return (
    <ClinicaProvider>
      <PainelPage />
    </ClinicaProvider>
  );
}