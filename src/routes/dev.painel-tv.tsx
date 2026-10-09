import { createFileRoute, notFound } from "@tanstack/react-router";
import { PainelTvDemonstracao } from "@/components/atendimento/PainelTvAtendimento";

// Prévia local do painel real com dados fictícios. Indisponível em produção.
export const Route = createFileRoute("/dev/painel-tv")({
  ssr: false,
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  component: PainelTvDemonstracao,
});
