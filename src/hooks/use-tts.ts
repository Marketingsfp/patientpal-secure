import { useCallback, useEffect, useState } from "react";
import { useClinica } from "@/hooks/use-clinica";
import {
  isUserTtsEnabled,
  setUserTtsEnabled,
  speak as speakRaw,
  stopSpeaking,
  type SpeakOptions,
} from "@/lib/tts-service";

/**
 * TTS habilitado apenas para a Policlínica Menino Jesus (rollout inicial —
 * Regra 1.10 do AGENTS.md). O backend Piper roda no servidor local dela.
 */
function ehClinicaHabilitada(nome: string | null | undefined): boolean {
  return (nome ?? "").toLowerCase().includes("menino jesus");
}

export function useTts() {
  const { clinicaAtual } = useClinica();
  const clinicHabilitada = ehClinicaHabilitada(clinicaAtual?.clinica?.nome);
  const [userOn, setUserOn] = useState<boolean>(() => isUserTtsEnabled());

  useEffect(() => {
    // sincroniza mudanças em outras abas
    const onStorage = (e: StorageEvent) => {
      if (e.key === "tts:enabled") setUserOn(isUserTtsEnabled());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const enabled = clinicHabilitada && userOn;

  const speak = useCallback(
    (text: string, opts?: SpeakOptions) => {
      if (!enabled) return Promise.resolve();
      return speakRaw(text, opts);
    },
    [enabled],
  );

  const toggle = useCallback(() => {
    const next = !userOn;
    setUserTtsEnabled(next);
    setUserOn(next);
    if (!next) stopSpeaking();
  }, [userOn]);

  return { enabled, clinicHabilitada, userOn, speak, stop: stopSpeaking, toggle };
}