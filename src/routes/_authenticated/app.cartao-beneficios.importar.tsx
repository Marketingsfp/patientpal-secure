import { createFileRoute } from "@tanstack/react-router";
import { ImportarBeneficiariosPage } from "@/components/cartao/importar-page";

export const Route = createFileRoute("/_authenticated/app/cartao-beneficios/importar")({
  component: () => <ImportarBeneficiariosPage produto="beneficios" />,
  head: () => ({ meta: [{ title: "Importar planilha — Cartão Benefícios" }] }),
});
