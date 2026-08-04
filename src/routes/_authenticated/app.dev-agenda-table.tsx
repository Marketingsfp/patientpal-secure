import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AgendaTable, type AgendaTableItem } from "@/components/agenda/agenda-table";

export const Route = createFileRoute("/_authenticated/app/dev-agenda-table")({
  component: DevAgendaTablePage,
  head: () => ({
    meta: [
      { title: "Preview — Tabela de Agenda | ClinicaOS" },
      {
        name: "description",
        content:
          "Pré-visualização isolada do componente de listagem de agendamentos, com versões desktop e mobile.",
      },
      { property: "og:title", content: "Preview — Tabela de Agenda" },
      {
        property: "og:description",
        content: "Componente reutilizável de listagem de agendamentos da clínica.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const DUMMY: AgendaTableItem[] = [
  { id: "1", ficha: "#10231", dia: "Seg", data: "03/08/2026", horaInicio: "08:00", horaFim: "08:30", profissional: "Dra. Rosângela Lima", cliente: "Maria Aparecida Souza", servico: "Consulta clínica geral", status: "realizado" },
  { id: "2", ficha: "#10232", dia: "Seg", data: "03/08/2026", horaInicio: "08:30", horaFim: "09:00", profissional: "Dr. Paulo Andrade", cliente: "João Batista Ferreira", servico: "Raio-X de tórax", status: "agendado" },
  { id: "3", ficha: "#10233", dia: "Ter", data: "04/08/2026", horaInicio: "09:00", horaFim: "09:30", profissional: "Laboratório", cliente: "Ana Cláudia Ribeiro", servico: "Hemograma + Glicemia", status: "agendado" },
  { id: "4", ficha: "#10234", dia: "Ter", data: "04/08/2026", horaInicio: "09:30", horaFim: "10:00", profissional: "—", cliente: "—", servico: "—", status: "livre" },
  { id: "5", ficha: "#10235", dia: "Ter", data: "04/08/2026", horaInicio: "10:00", horaFim: "10:40", profissional: "Dra. Helena Prado", cliente: "Carlos Eduardo Nunes", servico: "Ultrassonografia abdominal", status: "agendado" },
  { id: "6", ficha: "#10236", dia: "Qua", data: "05/08/2026", horaInicio: "11:00", horaFim: "11:30", profissional: "Dr. Paulo Andrade", cliente: "Beatriz Menezes", servico: "Retorno ortopedia", status: "cancelado" },
  { id: "7", ficha: "#10237", dia: "Qua", data: "05/08/2026", horaInicio: "13:30", horaFim: "14:10", profissional: "Dra. Rosângela Lima", cliente: "Fernando Tavares", servico: "Tomografia de crânio", status: "realizado" },
  { id: "8", ficha: "#10238", dia: "Qui", data: "06/08/2026", horaInicio: "15:00", horaFim: "15:30", profissional: "Enf. Juliana Reis", cliente: "Sônia Regina Alves", servico: "Curativo / Enfermagem", status: "agendado" },
];

function DevAgendaTablePage() {
  const [isLoading, setIsLoading] = useState(false);
  const [vazio, setVazio] = useState(false);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Tabela de Agenda</h1>
        <p className="text-sm text-muted-foreground">
          Pré-visualização isolada do componente. Reduza a janela para ver a versão em cards.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => setIsLoading((v) => !v)}>
          {isLoading ? "Mostrar dados" : "Simular carregamento"}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setVazio((v) => !v)}>
          {vazio ? "Mostrar registros" : "Simular lista vazia"}
        </Button>
      </div>

      <AgendaTable
        items={vazio ? [] : DUMMY}
        isLoading={isLoading}
        onEdit={(item) => toast.info(`Editar ficha ${item.ficha}`)}
        onPayment={(item) => toast.success(`Pagamento da ficha ${item.ficha}`)}
      />
    </div>
  );
}