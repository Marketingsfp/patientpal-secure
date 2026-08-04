import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { AgendaHeaderFilters } from "@/components/agenda/agenda-header-filters";

export const Route = createFileRoute("/_authenticated/app/dev-agenda-header")({
  component: DevAgendaHeaderPage,
  head: () => ({
    meta: [
      { title: "Preview — Cabeçalho e Filtros da Agenda | ClinicaOS" },
      { name: "description", content: "Pré-visualização isolada do cabeçalho, barra de ações e card de filtros da tela de Agendas." },
      { property: "og:title", content: "Preview — Cabeçalho e Filtros da Agenda" },
      { property: "og:description", content: "Componente isolado de cabeçalho e filtros premium da Agenda." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function DevAgendaHeaderPage() {
  return (
    <div className="mx-auto max-w-7xl p-6">
      <AgendaHeaderFilters
        onAddEncaixe={() => toast.info("Adicionar encaixe")}
        onSubmit={(v) => toast.success(`Filtrar: ${JSON.stringify(v)}`)}
        onClear={() => toast.info("Filtros limpos")}
      />
    </div>
  );
}