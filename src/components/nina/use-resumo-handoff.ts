/**
 * FASE 4 — estado compartilhado do resumo da Nina.
 *
 * O card fixo do topo e o bloco da timeline mostram o MESMO resumo. Para não
 * pedir o resumo duas vezes (e não gerar duas vezes no servidor), o estado
 * vive num store por conversa: a primeira montagem busca, as demais reusam.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import { obterResumoHandoff } from "@/lib/atendimento/handoff-resumo.functions";
import {
  filtrarPainelNoPrazo,
  RETENCAO_RESUMO_MS,
  type PainelResumo,
} from "@/lib/atendimento/resumo-retencao";
import { marcarTroca, medirRequest } from "@/lib/atendimento/perf-troca";

type Estado = {
  painel: PainelResumo | null;
  erro: boolean;
  carregando: boolean;
  atualizado: boolean;
  buscado: boolean;
};

type Entrada = Estado & {
  subs: Set<() => void>;
  inflight: Promise<void> | null;
  rebuscar: boolean;
};

const store = new Map<string, Entrada>();

function entrada(chave: string): Entrada {
  let e = store.get(chave);
  if (!e) {
    e = {
      painel: null,
      erro: false,
      rebuscar: false,
      carregando: false,
      atualizado: false,
      buscado: false,
      subs: new Set(),
      inflight: null,
    };
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
  const estadoConversa = useRef("");

  useEffect(() => {
    estadoConversa.current = "";
    const alvo = entrada(chave);
    const fn = () => forcarRender((n) => n + 1);
    alvo.subs.add(fn);
    return () => {
      alvo.subs.delete(fn);
      // Sem nenhum consumidor montado o realtime desta conversa deixa de
      // valer: o resumo em cache pode envelhecer enquanto o atendente está em
      // outra conversa. O conteúdo continua guardado (evita piscar ao voltar),
      // mas a próxima montagem busca de novo.
      if (alvo.subs.size === 0) alvo.buscado = false;
    };
  }, [chave]);

  const carregar = useCallback(
    async (forcar = false) => {
      const alvo = entrada(chave);
      if (alvo.inflight) {
        alvo.rebuscar = true;
        return alvo.inflight;
      }
      const exec = (async () => {
        alvo.carregando = true;
        publicar(alvo);
        try {
          const r = (await medirRequest(
            "obterResumoHandoff",
            obter({ data: { clinicaId, conversaId, forcar } }),
            conversaId,
          )) as PainelResumo | null;
          marcarTroca("T7_resumo", conversaId);
          if (alvo.painel?.atual && r?.atual && alvo.painel.atual.id !== r.atual.id)
            alvo.atualizado = true;
          alvo.painel = filtrarPainelNoPrazo(r);
          alvo.erro = false;
        } catch {
          alvo.erro = true;
        } finally {
          alvo.carregando = false;
          alvo.buscado = true;
          alvo.inflight = null;
          publicar(alvo);
          if (alvo.rebuscar) {
            alvo.rebuscar = false;
            queueMicrotask(() => void carregar(false));
          }
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
    ["atend_handoff_resumos", "atend_conversas"],
    () => void carregar(false),
    !!clinicaId && !!conversaId && opcoes?.assinarRealtime !== false,
    {
      filtro: clinicaId ? `clinica_id=eq.${clinicaId}` : undefined,
      interessa: (linha, tabela) => {
        if (tabela !== "atend_conversas") return linha.conversa_id === conversaId;
        if (linha.id !== conversaId) return false;
        const marca = JSON.stringify([
          linha.status,
          linha.handoff_em,
          linha.nina_fluxo_estado?.session_started_at,
        ]);
        if (marca === estadoConversa.current) return false;
        estadoConversa.current = marca;
        return true;
      },
    },
  );

  // Remoção local pontual: não espera pelo cron, nem por mensagem/Realtime.
  const painel = filtrarPainelNoPrazo(e.painel);
  useEffect(() => {
    const expirar = () => {
      const alvo = entrada(chave);
      alvo.painel = filtrarPainelNoPrazo(alvo.painel);
      publicar(alvo);
    };
    const prazos = [
      ...(e.painel?.atual ? [Date.parse(e.painel.atual.handoff_em) + RETENCAO_RESUMO_MS] : []),
      ...(e.painel?.anteriores.map((r) => Date.parse(r.expira_em)) ?? []),
    ];
    const timer = prazos.length
      ? window.setTimeout(expirar, Math.max(0, Math.min(...prazos) - Date.now()) + 1)
      : undefined;
    window.addEventListener("focus", expirar);
    document.addEventListener("visibilitychange", expirar);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", expirar);
      document.removeEventListener("visibilitychange", expirar);
    };
  }, [chave, e.painel]);

  const limparAtualizado = useCallback(() => {
    const alvo = entrada(chave);
    alvo.atualizado = false;
    publicar(alvo);
  }, [chave]);

  return {
    linha: painel?.atual ?? null,
    anteriores: painel?.anteriores ?? [],
    erro: e.erro,
    carregando: e.carregando,
    atualizado: e.atualizado,
    carregar,
    limparAtualizado,
  };
}
