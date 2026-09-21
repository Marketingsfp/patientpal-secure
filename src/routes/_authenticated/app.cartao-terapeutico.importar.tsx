import { createFileRoute } from "@tanstack/react-router";
import { ImportarBeneficiariosPage } from "@/components/cartao/importar-page";

export const Route = createFileRoute("/_authenticated/app/cartao-terapeutico/importar")({
  component: () => <ImportarBeneficiariosPage produto="terapeutico" />,
  head: () => ({ meta: [{ title: "Importar planilha — Cartão Terapêutico" }] }),
});
