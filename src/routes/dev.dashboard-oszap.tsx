import { useMemo, useState } from "react";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { DashboardOsZapView } from "@/components/nina/DashboardOsZapView";
import {
  montarDashboardOsZap,
  type ConversaDashboard,
  type EventoDashboard,
  type MensagemDashboard,
} from "@/lib/atendimento/dashboard-oszap";
import {
  periodoComparacao,
  periodoPadraoDashboard,
  type AgrupamentoDashboard,
} from "@/lib/atendimento/dashboard-oszap-periodos";
import { janelaDiaClinica } from "@/lib/date-utils";
import "@/components/nina/os-zap.css";

// Prévia local do dashboard real com dados fictícios. Indisponível em produção.
export const Route = createFileRoute("/dev/dashboard-oszap")({
  ssr: false,
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  component: DemonstracaoDashboard,
});

function aleatorio(semente: number) {
  let s = semente;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

function dadosFicticios(periodo: { de: string; ate: string }) {
  const r = aleatorio(42);
  const ini = Date.parse(janelaDiaClinica(periodoComparacao(periodo).de).inicio);
  const fim = Date.parse(janelaDiaClinica(periodo.ate).fimExclusivo);
  const pessoas = ["ana", "bia", "caio", "duda"];
  const conversas: ConversaDashboard[] = [];
  const mensagens: MensagemDashboard[] = [];
  const eventos: EventoDashboard[] = [];
  const nina = [];
  const iso = (t: number) => new Date(t).toISOString();
  for (let t = ini, i = 0; t < fim; t += 23 * 60000 + r() * 50 * 60000, i++) {
    const hora = new Date(t).getUTCHours() - 3;
    if ((hora + 24) % 24 < 7 && r() < 0.85) continue;
    const id = `c${i}`;
    const quem = pessoas[Math.floor(r() * pessoas.length)];
    conversas.push({
      id,
      created_at: iso(t),
      status: "closed",
      departamento_id: r() < 0.6 ? "dep-agenda" : "dep-orc",
      atribuida_user_id: quem,
      awaiting_patient_since: null,
      aguardando_desde: null,
      inbox_entrada_em: null,
      assigned_at: null,
      ultima_msg_em: null,
      unread_count: 0,
      sentimento: ["positivo", "neutro", "neutro", "negativo", null][Math.floor(r() * 5)],
    });
    const n = 2 + Math.floor(r() * 4);
    for (let k = 0; k < n; k++) {
      mensagens.push({
        id: `${id}-in${k}`,
        created_at: iso(t + k * 120000),
        conversa_id: id,
        direction: "in",
        enviada_por: "paciente",
        enviada_por_user_id: null,
        status: "received",
      });
      mensagens.push({
        id: `${id}-n${k}`,
        created_at: iso(t + k * 120000 + 6000),
        conversa_id: id,
        direction: "out",
        enviada_por: "nina",
        enviada_por_user_id: null,
        status: "read",
      });
      nina.push({
        created_at: iso(t + k * 120000 + 1000),
        conversation_id: id,
        success: r() > 0.02,
        handoff: k === n - 1 && r() < 0.5,
        latency_ms: 3000 + r() * 4000,
        input_tokens: 30000 + Math.round(r() * 8000),
        output_tokens: 150 + Math.round(r() * 80),
        model: r() < 0.6 ? "google/gemini-3.8-flash" : "google/gemini-3.7-flash",
        perfil: "whatsapp",
        error_category: null,
      });
    }
    if (r() < 0.45) {
      const h = t + n * 120000;
      const fila = h + 30000;
      const assumida = fila + (1 + r() * 14) * 60000;
      eventos.push({
        id: `${id}-h`,
        created_at: iso(h),
        conversa_id: id,
        evento: "HANDOFF_SOLICITADO",
        user_id: null,
      });
      eventos.push({
        id: `${id}-f`,
        created_at: iso(fila),
        conversa_id: id,
        evento: "ENTROU_NA_FILA",
        user_id: null,
      });
      eventos.push({
        id: `${id}-a`,
        created_at: iso(assumida),
        conversa_id: id,
        evento: "ASSUMIDA",
        user_id: quem,
      });
      for (let k = 0; k < 3; k++)
        mensagens.push({
          id: `${id}-e${k}`,
          created_at: iso(assumida + (k + 1) * 90000),
          conversa_id: id,
          direction: "out",
          enviada_por: "humano",
          enviada_por_user_id: quem,
          status: k === 2 && r() < 0.05 ? "failed" : "delivered",
        });
      if (r() < 0.1)
        eventos.push({
          id: `${id}-t`,
          created_at: iso(assumida + 300000),
          conversa_id: id,
          evento: "TRANSFERIDA",
          user_id: quem,
        });
      eventos.push({
        id: `${id}-fim`,
        created_at: iso(assumida + (8 + r() * 30) * 60000),
        conversa_id: id,
        evento: "FINALIZADA",
        user_id: quem,
      });
    }
  }
  const agora = new Date(Math.min(Date.now(), fim));
  const aberta = (
    id: string,
    status: string,
    min: number,
    patch: Partial<ConversaDashboard> = {},
  ): ConversaDashboard => ({
    id,
    created_at: iso(+agora - min * 60000),
    status,
    departamento_id: "dep-agenda",
    atribuida_user_id: status === "active" ? "ana" : null,
    awaiting_patient_since: null,
    aguardando_desde: status === "waiting" ? iso(+agora - min * 60000) : null,
    inbox_entrada_em: null,
    assigned_at: status === "active" ? iso(+agora - min * 60000) : null,
    ultima_msg_em: iso(+agora - min * 60000),
    unread_count: 1,
    sentimento: null,
    ...patch,
  });
  return montarDashboardOsZap({
    periodo,
    agora,
    abertas: [
      aberta("a1", "bot_attending", 3),
      aberta("a2", "bot_attending", 7),
      aberta("a3", "waiting", 12),
      aberta("a4", "active", 25),
      aberta("a5", "active", 40, { awaiting_patient_since: iso(+agora - 18 * 60000) }),
    ],
    criadas: conversas,
    mensagens,
    eventos,
    seguintes: { eventos: [], mensagens: [] },
    avaliacoes: conversas
      .filter(() => r() < 0.15)
      .map((c) => ({
        respondida_em: c.created_at,
        nota: [5, 5, 4, 4, 3, 2, 1][Math.floor(r() * 7)],
        atendente_user_id: r() > 0.5 ? "ana" : "bia",
      })),
    transferencias: eventos
      .filter((e) => e.evento === "TRANSFERIDA")
      .map((e) => ({ created_at: e.created_at, para_departamento_id: "dep-orc" })),
    departamentos: [
      { id: "dep-agenda", nome: "Agendamento" },
      { id: "dep-orc", nome: "Orçamentos" },
    ],
    presencas: [
      { user_id: "ana", status: "ONLINE", estado_manual: "ONLINE" },
      { user_id: "bia", status: "ONLINE", estado_manual: "PAUSA" },
      { user_id: "caio", status: "OFFLINE", estado_manual: null },
      { user_id: "duda", status: "ONLINE", estado_manual: "ONLINE" },
    ],
    pausas: pessoas.flatMap((p, i) => [
      {
        user_id: p,
        reason_id: i % 2 ? "almoco" : "cafe",
        iniciada_em: iso(+agora - (i + 2) * 86400000),
        finalizada_em: iso(+agora - (i + 2) * 86400000 + (15 + i * 20) * 60000),
      },
    ]),
    motivosPausa: [
      { id: "almoco", nome: "Almoço" },
      { id: "cafe", nome: "Café" },
    ],
    // Duda faz papel de supervisora (não é telefonia): some da tabela e das contagens.
    telefonia: new Set(["ana", "bia", "caio"]),
    nomes: new Map([
      ["ana", "Ana (fictícia)"],
      ["bia", "Bia (fictícia)"],
      ["caio", "Caio (fictício)"],
      ["duda", "Duda (fictícia)"],
    ]),
    nina,
    francisco: Array.from({ length: 40 }, (_, i) => ({
      etapa: i % 3 ? "d1" : "d4",
      status: ["enviado", "enviado", "enviado", "bloqueado", "reservado"][i % 5],
      respondido_em: i % 4 === 0 ? iso(+agora) : null,
    })),
    webhook: Array.from({ length: 300 }, (_, i) => ({
      recebido_em: iso(ini + ((fim - ini) * i) / 300),
      resultado:
        i % 7 === 0 ? "assinatura_invalida" : i % 31 === 0 ? "pendente: ocupada" : "processado_ok",
    })),
  });
}

function DemonstracaoDashboard() {
  const [periodo, setPeriodo] = useState(periodoPadraoDashboard);
  const [agrupamento, setAgrupamento] = useState<AgrupamentoDashboard>("dia");
  const resumo = useMemo(() => {
    const r = dadosFicticios(periodo);
    return {
      ...r,
      inicio: "",
      fim: "",
      atualizadoEm: new Date().toISOString(),
      avisos: ["Prévia com dados fictícios — nada aqui vem do banco."],
    };
  }, [periodo]);
  return (
    <main data-os-zap="true" className="min-h-dvh bg-background p-4 text-foreground sm:p-6">
      <DashboardOsZapView
        resumo={resumo}
        periodo={periodo}
        agrupamento={agrupamento}
        onAgrupamento={setAgrupamento}
        consultar={setPeriodo}
        clinica="Clínica fictícia"
        atualizando={false}
      />
    </main>
  );
}
