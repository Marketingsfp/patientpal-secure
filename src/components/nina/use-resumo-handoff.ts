/**
 * FASE 4 — estado compartilhado do resumo da Nina.
 *
 * O card fixo do topo e o bloco da timeline mostram o MESMO resumo. Para não
 * pedir o resumo duas vezes (e não gerar duas vezes no servidor), o estado
 * vive num store por conversa: a primeira montagem busca, as demais reusam.
 */
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import { obterResumoHandoff } from "@/lib/atendimento/handoff-resumo.functions";
import type { ResumoHandoff } from "@/lib/atendimento/handoff-resumo";
import { marcarTroca, medirRequest } from "@/lib/atendimento/perf-troca";

export type LinhaResumoUI = {
  status: "gerando" | "ok" | "erro";
  payload: ResumoHandoff | null;
  erro: string | null;
  versao: number;
  situacao?: string | null;
  desfecho?: string | null;
  updated_at?: string | null;
} | null;

type Estado = {
  linha: LinhaResumoUI;
  carregando: boolean;
  atualizado: boolean;
  buscado: boolean;
};

type Entrada = Estado & { subs: Set<() => void>; inflight: Promise<void> | null };

const store = new Map<string, Entrada>();

function entrada(chave: string): Entrada {
  let e = store.get(chave);
  if (!e) {
    e = { linha: null, carregando: false, atualizado: false, buscado: false, subs: new Set(), inflight: null };
    store.set(chave, e);
  }
  return e;
}

function publicar(e: Entrada) {
  for (const fn of e.subs) fn();
}

export function useResumoHandoff(
  clinicaId: string,
  conversaId: string,
  opcoes?: { assinarRealtime?: boolean },
) {
  const obter = useServerFn(obterResumoHandoff);
  const chave = `${clinicaId}|${conversaId}`;
  const [, forcarRender] = useState(0);
  const e = entrada(chave);

  useEffect(() => {
    const alvo = entrada(chave);
    const fn = () => forcarRender((n) => n + 1);
    alvo.subs.add(fn);
    return () => {
      alvo.subs.delete(fn);
    };
  }, [chave]);

  const carregar = useCallback(
    async (forcar = false) => {
      const alvo = entrada(chave);
      if (alvo.inflight && !forcar) return alvo.inflight;
      const exec = (async () => {
        alvo.carregando = true;
        publicar(alvo);
        try {
          const r = (await medirRequest(
            "obterResumoHandoff",
            obter({ data: { clinicaId, conversaId, forcar } }),
            conversaId,
          )) as LinhaResumoUI;
          marcarTroca("T7_resumo", conversaId);
          if (alvo.linha && r && alvo.linha.versao !== r.versao) alvo.atualizado = true;
          alvo.linha = r;
        } catch {
          alvo.linha = {
            status: "erro",
            payload: null,
            erro: "Não foi possível gerar o resumo.",
            versao: 0,
          };
        } finally {
          alvo.carregando = false;
          alvo.buscado = true;
          alvo.inflight = null;
          publicar(alvo);
        }
      })();
      alvo.inflight = exec;
      return exec;
    },
    [chave, clinicaId, conversaId, obter],
  );

  // Uma única busca por conversa, mesmo com dois consumidores montados.
  useEffect(() => {
    const alvo = entrada(chave);
    if (alvo.buscado || alvo.inflight) return;
    void carregar(false);
  }, [carregar, chave]);

  useRealtimeRefresh(
    ["atend_handoff_resumos"],
    () => void carregar(false),
    !!clinicaId && !!conversaId && opcoes?.assinarRealtime !== false,
    {
      filtro: clinicaId ? `clinica_id=eq.${clinicaId}` : undefined,
      interessa: (linha) => linha.conversa_id === conversaId,
    },
  );

  const limparAtualizado = useCallback(() => {
    const alvo = entrada(chave);
    alvo.atualizado = false;
    publicar(alvo);
  }, [chave]);

  return {
    linha: e.linha,
    carregando: e.carregando,
    atualizado: e.atualizado,
    carregar,
    limparAtualizado,
  };
}
