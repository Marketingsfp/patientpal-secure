import { createFileRoute } from "@tanstack/react-router";
import { AtendimentosPage } from "./app.financeiro.atendimentos";

export const Route = createFileRoute("/_authenticated/app/atendimentos")({
  component: AtendimentosPage,
  head: () => ({
    meta: [
      { title: "Atendimentos — ClinicaOS" },
      { name: "description", content: "Lista de atendimentos e repasses médicos." },
    ],
  }),
});