import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AppointmentFormModal,
  type AppointmentFormData,
} from "@/components/agenda/appointment-form-modal";

export const Route = createFileRoute("/_authenticated/app/dev-appointment-form")({
  component: DevAppointmentFormPage,
  head: () => ({
    meta: [
      { title: "Preview — Modal de Agendamento | ClinicaOS" },
      {
        name: "description",
        content:
          "Pré-visualização isolada do modal de novo agendamento e edição de agendamento da clínica.",
      },
      { property: "og:title", content: "Preview — Modal de Agendamento" },
      {
        property: "og:description",
        content: "Componente reutilizável de formulário de agendamento médico.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const EXEMPLO: AppointmentFormData = {
  orcamento: "2026-00841",
  paciente: "Maria Aparecida Souza",
  tipoAtendimento: "convenio",
  profissional: "Dra. Rosângela Lima — Clínica Geral",
  dataHora: "2026-08-05T09:30",
  servico: "Consulta clínica geral",
  observacoes: "Paciente em jejum. Trazer exames anteriores.",
};

function DevAppointmentFormPage() {
  const [novo, setNovo] = useState(false);
  const [editar, setEditar] = useState(false);

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          Preview — Modal de Agendamento
        </h1>
        <p className="text-sm text-muted-foreground">
          Componente isolado, apenas visual, sem gravação no banco.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setNovo(true)}>Novo agendamento</Button>
        <Button variant="outline" onClick={() => setEditar(true)}>
          Editar agendamento
        </Button>
      </div>

      <AppointmentFormModal isOpen={novo} onClose={() => setNovo(false)} />
      <AppointmentFormModal
        isOpen={editar}
        onClose={() => setEditar(false)}
        initialData={EXEMPLO}
      />
    </div>
  );
}