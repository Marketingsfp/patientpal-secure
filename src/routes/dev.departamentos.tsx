import { createFileRoute, notFound } from "@tanstack/react-router";
import { DepartamentosDemonstracao } from "@/components/atendimento/DepartamentosDemonstracao";

export const Route = createFileRoute("/dev/departamentos")({
  ssr: false,
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  component: DepartamentosDemonstracao,
});
