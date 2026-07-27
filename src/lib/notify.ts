import { toast, type ExternalToast } from "sonner";
import { speak as ttsSpeak, isUserTtsEnabled } from "@/lib/tts-service";

/**
 * Wrapper de notificação: dispara um toast (sonner) e, se o TTS estiver
 * ligado (localStorage `tts:enabled` != "0"), lê a mensagem em voz alta
 * via Piper. O gate por clínica é feito pelo próprio `useTts()` no toggle
 * do header — este helper apenas checa a preferência global do usuário.
 *
 * Uso: `notify.success("Alerta atualizado")` em vez de `toast.success(...)`.
 * Toasts existentes com `toast.*` continuam funcionando; migração gradual.
 */
function speakIfOn(text: string) {
  if (!isUserTtsEnabled()) return;
  // Só fala se estivermos rodando na clínica habilitada. A checagem robusta
  // acontece em useTts(); aqui usamos localStorage já validado + fallback
  // silencioso caso não esteja habilitado (fetch retorna erro CORS/proxy).
  void ttsSpeak(text);
}

export const notify = {
  success(msg: string, opts?: ExternalToast) {
    toast.success(msg, opts);
    speakIfOn(msg);
  },
  error(msg: string, opts?: ExternalToast) {
    toast.error(msg, opts);
    speakIfOn(msg);
  },
  info(msg: string, opts?: ExternalToast) {
    toast.info(msg, opts);
    speakIfOn(msg);
  },
  warning(msg: string, opts?: ExternalToast) {
    toast.warning(msg, opts);
    speakIfOn(msg);
  },
  message(msg: string, opts?: ExternalToast) {
    toast(msg, opts);
    speakIfOn(msg);
  },
};