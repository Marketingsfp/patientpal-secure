import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Atividade = "plataforma" | "analise" | "roleplay" | "prova";

export type TempoRow = {
  atendente: string;
  atividade: Atividade | string;
  dia: string;
  segundos: number;
  clinica_id?: string | null;
};

export function formatDuracao(segundos: number) {
  const s = Math.max(0, Math.round(segundos));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}min`;
  if (m > 0) return `${m}min`;
  return `${s}s`;
}

async function flush(
  atendente: string,
  atividade: Atividade,
  segundos: number,
  clinicaId: string | null,
) {
  if (!atendente.trim() || segundos <= 0 || !clinicaId) return false;
  const { error } = await supabase.rpc("coach_registrar_tempo_estudo", {
    _clinica_id: clinicaId,
    _atendente: atendente.trim(),
    _atividade: atividade,
    _segundos: Math.min(3600, Math.round(segundos)),
  });
  if (error) {
    console.error("[tempo_estudo] falha ao registrar:", error.message);
    return false;
  }
  return true;
}


/**
 * Conta o tempo ativo (aba visível) que a pessoa passa em uma atividade
 * e envia o acumulado para o banco a cada 30s.
 */
export function useStudyTimer(atendente: string, atividade: Atividade, clinicaId: string | null) {
  const [segundos, setSegundos] = useState(0);
  const pendente = useRef(0);
  const nome = useRef(atendente);
  nome.current = atendente;

  useEffect(() => {
    if (!atendente.trim() || !clinicaId) return;
    let alive = true;

    const tick = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      pendente.current += 5;
      setSegundos((s) => s + 5);
    }, 5000);

    const send = () => {
      const acc = pendente.current;
      if (acc <= 0) return;
      pendente.current = 0;
      void flush(nome.current, atividade, acc, clinicaId).then((ok) => {
        // Falhou o envio: devolve os segundos para a próxima tentativa.
        if (!ok) pendente.current += acc;
      });
    };


    const sync = setInterval(send, 30000);
    const onHide = () => {
      if (document.visibilityState === "hidden") send();
    };
    document.addEventListener("visibilitychange", onHide);

    return () => {
      alive = false;
      void alive;
      clearInterval(tick);
      clearInterval(sync);
      document.removeEventListener("visibilitychange", onHide);
      send();
    };
  }, [atendente, atividade, clinicaId]);

  return segundos;
}

export async function fetchTempoEstudo(clinicaId: string | null): Promise<TempoRow[]> {
  if (!clinicaId) return [];
  const { data } = await supabase
    .from("coach_tempo_estudo")
    .select("atendente,atividade,dia,segundos,clinica_id")
    .eq("clinica_id", clinicaId)
    .order("dia", { ascending: false })
    .limit(2000);
  return (data ?? []) as unknown as TempoRow[];
}