/** Todos os dados desta prévia são fictícios; componentes reais, serviços simulados. */
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DashboardOsZap } from "../src/components/nina/DashboardOsZap";
import {
  periodoDashboard,
  resumirMensagensHumanas,
  resumirEncerramentosHumanos,
} from "../src/lib/atendimento/dashboard-oszap";

const g = globalThis as any;
const agora = Date.parse("2026-10-03T21:10:00Z");
const espera = (min: number) => new Date(agora - min * 60000).toISOString();
g.__dashboardAgora = agora;
g.__dashboardChamadas = [];
g.__dashboardModo = new URLSearchParams(location.search).get("modo") || "normal";
const mensagens = resumirMensagensHumanas(
  Array.from({ length: 730 }, (_, i) => ({
    created_at: new Date(agora - (i % 7) * 86400000 - (i % 9) * 3600000).toISOString(),
    conversa_id: `conv${i % 62}`,
    enviada_por_user_id: i < 340 ? "ana" : i < 580 ? "bia" : "carla",
    enviada_por: "humano",
    status: "sent",
  })),
);
const encerramentos = resumirEncerramentosHumanos(
  Array.from({ length: 58 }, (_, i) => ({
    resolved_by: i < 21 ? "ana" : i < 40 ? "bia" : i < 52 ? "carla" : "supervisor",
    resolved_at: new Date(agora).toISOString(),
    handoff_em: espera(30 + i),
    assigned_at: null,
  })),
);
g.__dashboardFixtures = {
  resumo: {
    periodo: periodoDashboard(7, "2026-10-03"),
    inicio: "2026-09-27T03:00:00Z",
    fim: "2026-10-04T03:00:00Z",
    historico: { total: 1248, encerradas: 1233 },
    mensagens: { ...mensagens, parcial: false },
    encerramentos: { ...encerramentos, parcial: false },
    primeiraResposta: { mediaSeg: 128, medidas: 45, parcial: false },
    transferencias: { total: 14, parcial: false },
    pessoas: [
      { id: "ana", nome: "Ana · demonstração", mensagens: 340, encerradas: 21 },
      { id: "bia", nome: "Beatriz · demonstração", mensagens: 240, encerradas: 19 },
      { id: "carla", nome: "Carla · demonstração", mensagens: 150, encerradas: 12 },
      { id: "supervisor", nome: "Supervisão · demonstração", mensagens: 0, encerradas: 6 },
    ],
    avisos: [],
    limite: 20000,
    atualizadoEm: new Date(agora).toISOString(),
  },
  fila: {
    emAndamento: 15,
    naoAtribuidas: 3,
    espera: [espera(18), espera(12), espera(7), espera(4), espera(2)],
    resolvidasHoje: 58,
    encerramentosHojeParcial: false,
    atualizadoEm: new Date(agora).toISOString(),
    departamentos: [
      { id: "a", nome: "Telefonia", abertas: 12, semResponsavel: 1 },
      { id: null, nome: "Sem departamento", abertas: 3, semResponsavel: 2 },
    ],
    departamentosParcial: false,
    atendentes: [
      {
        id: "ana",
        nome: "Ana · demonstração",
        estado: "ONLINE",
        inicioPausa: null,
        atribuidas: 6,
        esperas: [espera(18), espera(7)],
        resolvidasHoje: 21,
      },
      {
        id: "bia",
        nome: "Beatriz · demonstração",
        estado: "ONLINE",
        inicioPausa: null,
        atribuidas: 4,
        esperas: [espera(12), espera(4)],
        resolvidasHoje: 19,
      },
      {
        id: "carla",
        nome: "Carla · demonstração",
        estado: "PAUSA",
        inicioPausa: espera(8),
        atribuidas: 2,
        esperas: [espera(2)],
        resolvidasHoje: 12,
      },
    ],
  },
};
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={client}>
    <div className="min-h-dvh bg-atd-bg p-4 sm:p-6" data-os-zap="true">
      <div className="mb-5 rounded-lg border border-atd-warn bg-atd-warn-bg p-2 text-xs text-atd-warn-ink">
        PRÉVIA LOCAL · Todos os dados são fictícios. Não conectado ao WhatsApp.
      </div>
      <DashboardOsZap />
    </div>
  </QueryClientProvider>,
);
