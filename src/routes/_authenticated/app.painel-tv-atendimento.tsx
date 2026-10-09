/**
 * Painel de TV do atendimento (OS ZAP) — tela cheia 1920 x 1080, sem rolagem.
 * Só leitura e só contagens; nenhum dado de paciente aparece na TV.
 *
 * Hierarquia: (1) quem espera resposta agora e há quanto tempo, (2) a equipe
 * e a carga de cada pessoa, (3) o ritmo do dia. Cor indica estado: verde
 * flui, âmbar pede atenção, vermelho passou do tempo. Mostra só o que o OS
 * Zap registra (ver docs/os-zap/painel-tv-levantamento.md).
 */
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { consultarPainelTv } from "@/lib/atendimento.functions";
import {
  PainelTvAtendimentoVisual,
  PainelTvDemonstracao,
} from "@/components/atendimento/PainelTvAtendimento";
import type { DadosPainelTv } from "@/lib/atendimento/painel-tv-demonstracao";

export const Route = createFileRoute("/_authenticated/app/painel-tv-atendimento")({
  component: PainelTvAtendimento,
  validateSearch: (search: Record<string, unknown>): { demonstracao?: boolean } => ({
    demonstracao: search.demonstracao === true || search.demonstracao === "true" || undefined,
  }),
  head: () => ({
    meta: [
      { title: "Painel da equipe de atendimento — OS ZAP" },
      { name: "description", content: "Painel em tempo real para a TV da equipe de atendimento." },
      { property: "og:title", content: "Painel da equipe de atendimento — OS ZAP" },
      { property: "og:description", content: "Fila, equipe e ritmo do WhatsApp em tempo real." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function PainelTvAtendimento() {
  const { demonstracao } = Route.useSearch();
  const navigate = Route.useNavigate();
  const alternar = () =>
    void navigate({ search: { demonstracao: demonstracao ? undefined : true } });
  return demonstracao ? (
    <PainelTvDemonstracao onAlternarDemonstracao={alternar} />
  ) : (
    <PainelTvAoVivo onAlternarDemonstracao={alternar} />
  );
}

function PainelTvAoVivo({ onAlternarDemonstracao }: { onAlternarDemonstracao: () => void }) {
  const { clinicaAtual } = useClinica();
  const clinicaId = clinicaAtual?.clinica_id ?? null;
  const consultar = useServerFn(consultarPainelTv);
  const [dados, setDados] = useState<DadosPainelTv | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [conectado, setConectado] = useState(false);
  const pedido = useRef(0);

  const carregar = useCallback(async () => {
    if (!clinicaId) return;
    const n = ++pedido.current;
    try {
      const r = await consultar({ data: { clinicaId } });
      if (n !== pedido.current) return;
      setDados(r);
      setErro(null);
    } catch (e) {
      if (n === pedido.current)
        setErro(e instanceof Error ? e.message : "Falha ao carregar o painel.");
    }
  }, [clinicaId, consultar]);

  // Tempo real: qualquer mudança em conversas, presença ou mensagens relê (agrupado).
  useEffect(() => {
    if (!clinicaId) return;
    void carregar();
    let t: ReturnType<typeof setTimeout> | null = null;
    const agendar = () => {
      if (t) return;
      t = setTimeout(() => {
        t = null;
        void carregar();
      }, 1500);
    };
    const ch = supabase.channel(`painel-tv-${clinicaId}-${Math.random().toString(36).slice(2)}`);
    for (const table of ["atend_conversas", "atend_agente_presenca", "whatsapp_mensagens"]) {
      ch.on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table, filter: `clinica_id=eq.${clinicaId}` },
        agendar,
      );
    }
    ch.subscribe((status: string) => {
      setConectado(status === "SUBSCRIBED");
      if (status === "SUBSCRIBED") agendar();
    });
    const intervalo = setInterval(() => void carregar(), 30_000);
    const aoVoltar = () => document.visibilityState === "visible" && void carregar();
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("online", aoVoltar);
    return () => {
      if (t) clearTimeout(t);
      clearInterval(intervalo);
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("online", aoVoltar);
      supabase.removeChannel(ch);
    };
  }, [clinicaId, carregar]);

  return (
    <PainelTvAtendimentoVisual
      dados={dados}
      erro={erro}
      conectado={conectado}
      clinicaNome={clinicaAtual?.clinica.nome ?? ""}
      onAlternarDemonstracao={onAlternarDemonstracao}
    />
  );
}
