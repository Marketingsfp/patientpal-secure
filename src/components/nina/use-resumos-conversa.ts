/**
 * Resumos da Nina da conversa aberta (um por conclusão da Nina), para aparecerem DENTRO do chat.
 * Atualiza sozinho quando um resumo novo é gravado e some ao vencer a retenção de sete dias.
 */
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import { listarResumosNaConversa } from "@/lib/atendimento/handoff-resumo.functions";
import type { ResumoNaConversa } from "@/lib/atendimento/resumo-retencao";

export function useResumosDaConversa(
  clinicaId: string | null | undefined,
  conversaId: string | null | undefined,
) {
  const listar = useServerFn(listarResumosNaConversa);
  const [resumos, setResumos] = useState<ResumoNaConversa[]>([]);

  const carregar = useCallback(async () => {
    if (!clinicaId || !conversaId) return;
    try {
      const r = (await listar({ data: { clinicaId, conversaId } })) as ResumoNaConversa[];
      setResumos(Array.isArray(r) ? r : []);
    } catch {
      /* o resumo é complemento: falha de leitura não atrapalha o atendimento */
    }
  }, [clinicaId, conversaId, listar]);

  useEffect(() => {
    setResumos([]);
    void carregar();
  }, [carregar]);

  useRealtimeRefresh(
    ["atend_handoff_resumos"],
    () => void carregar(),
    !!clinicaId && !!conversaId,
    {
      filtro: clinicaId ? `clinica_id=eq.${clinicaId}` : undefined,
      interessa: (linha) => linha.conversa_id === conversaId,
    },
  );

  // Remove da tela o que vence, sem esperar um novo evento.
  useEffect(() => {
    if (!resumos.length) return;
    const proximo = Math.min(...resumos.map((r) => Date.parse(r.expira_em)));
    const espera = Math.max(0, proximo - Date.now()) + 1;
    // setTimeout não aceita atrasos acima de ~24,8 dias; a retenção é de 7.
    const timer = window.setTimeout(
      () => setResumos((atual) => atual.filter((r) => Date.parse(r.expira_em) > Date.now())),
      espera,
    );
    return () => window.clearTimeout(timer);
  }, [resumos]);

  return resumos;
}
