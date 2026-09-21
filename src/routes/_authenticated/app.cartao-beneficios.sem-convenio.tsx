import { createFileRoute } from "@tanstack/react-router";
import { SemConvenioPage } from "@/components/cartao/sem-convenio-page";

export const Route = createFileRoute("/_authenticated/app/cartao-beneficios/sem-convenio")({
  component: SemConvenioPage,
  head: () => ({ meta: [{ title: "Contratos sem convênio — Cartão Benefícios" }] }),
});
