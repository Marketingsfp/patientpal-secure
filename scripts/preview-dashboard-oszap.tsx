/** Componentes e agregador reais, transportes e pessoas fictícios. */
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DashboardOsZap } from "../src/components/nina/DashboardOsZap";
import {
  resumirHistoricoDashboard,
  type MensagemHumanaDashboard,
  type EventoHistoricoDashboard,
} from "../src/lib/atendimento/dashboard-oszap";
import {
  deslocarDia,
  type PeriodoDashboard,
} from "../src/lib/atendimento/dashboard-oszap-periodos";
const g = globalThis as any;
g.__dashboardChamadas = [];
g.__dashboardModo = new URLSearchParams(location.search).get("modo") || "normal";
g.__dashboardConsultar = (periodo: PeriodoDashboard) => {
  const mensagens: MensagemHumanaDashboard[] = [],
    eventos: EventoHistoricoDashboard[] = [];
  const nomes = [
    "Ana · demonstração",
    "Beatriz · demonstração",
    "Carla · demonstração",
    "Supervisão · demonstração",
  ];
  if (g.__dashboardModo !== "vazio")
    for (let dia = periodo.de; dia <= periodo.ate; dia = deslocarDia(dia, 1)) {
      const diaSemana = new Date(`${dia}T12:00:00Z`).getUTCDay();
      if (!diaSemana) continue;
      for (let i = 0; i < 4 + diaSemana; i++) {
        const conv = `${dia}-${i}`,
          user = String(i % 3);
        const em = (min: number) =>
          new Date(
            Date.parse(`${dia}T${String(11 + (i % 6)).padStart(2, "0")}:00:00Z`) + min * 60000,
          ).toISOString();
        eventos.push({
          id: `h${conv}`,
          created_at: em(0),
          conversa_id: conv,
          evento: "HANDOFF_SOLICITADO",
          user_id: null,
        });
        for (let j = 0; j < 4 + (i % 4); j++)
          mensagens.push({
            id: `m${conv}-${j}`,
            created_at: em(2 + j),
            conversa_id: conv,
            direction: j % 2 ? "out" : "in",
            enviada_por: j % 2 ? "humano" : null,
            enviada_por_user_id: j % 2 ? user : null,
            status: j % 2 ? "sent" : "received",
          });
        eventos.push({
          id: `f${conv}`,
          created_at: em(25 + i * 3),
          conversa_id: conv,
          evento: "FINALIZADA",
          user_id: i % 6 === 0 ? "3" : user,
        });
      }
    }
  const r = resumirHistoricoDashboard(mensagens, eventos, periodo);
  return {
    ...r,
    periodo,
    inicio: `${periodo.de}T03:00:00Z`,
    fim: `${deslocarDia(periodo.ate, 1)}T03:00:00Z`,
    atualizadoEm: new Date().toISOString(),
    avisos: [],
    pessoas: r.pessoas.map((p) => ({ ...p, nome: nomes[Number(p.id)] })),
  };
};
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={client}>
    <div className="min-h-dvh bg-atd-bg p-4 sm:p-6" data-os-zap="true">
      <div className="mb-5 rounded-lg border border-atd-warn bg-atd-warn-bg p-2 text-xs text-atd-warn-ink">
        PRÉVIA LOCAL · Dados fictícios para validar o relatório. Não conectado ao WhatsApp.
      </div>
      <DashboardOsZap />
    </div>
  </QueryClientProvider>,
);
