import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Escuta contínua do microfone para conversar por voz sem apertar botões.
 *
 * Usa o reconhecimento de fala do próprio navegador (Web Speech API), que é
 * contínuo e não precisa subir áudio para o servidor — por isso é muito mais
 * rápido do que gravar, enviar e transcrever a cada frase.
 *
 * Quando o usuário para de falar por ~1,1s, a frase é entregue via `onFrase`.
 * Enquanto a Nina responde/fala, chame `pausar()` para o microfone não captar
 * a própria voz dela, e `retomar()` depois.
 */
type Opcoes = {
  onFrase: (texto: string) => void;
  idioma?: string;
};

type Reconhecimento = {
  start: () => void;
  stop: () => void;
  abort: () => void;
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
};

function criarReconhecimento(): Reconhecimento | null {
  if (typeof window === "undefined") return null;
  const w = window as any;
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!Ctor) return null;
  return new Ctor() as Reconhecimento;
}

export function suportaConversaVoz(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as any;
  return Boolean(w.SpeechRecognition ?? w.webkitSpeechRecognition);
}

export function useConversaVoz({ onFrase, idioma = "pt-BR" }: Opcoes) {
  const [ativo, setAtivo] = useState(false);
  const [ouvindo, setOuvindo] = useState(false);
  const [parcial, setParcial] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const recRef = useRef<Reconhecimento | null>(null);
  const ativoRef = useRef(false);
  const pausadoRef = useRef(false);
  const bufferRef = useRef("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onFraseRef = useRef(onFrase);
  onFraseRef.current = onFrase;

  const limparTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  const entregar = useCallback(() => {
    limparTimer();
    const t = bufferRef.current.trim();
    bufferRef.current = "";
    setParcial("");
    if (t.length > 1) onFraseRef.current(t);
  }, []);

  const iniciarMotor = useCallback(() => {
    if (recRef.current) return;
    const rec = criarReconhecimento();
    if (!rec) {
      setErro("Seu navegador não suporta conversa por voz. Use o Chrome ou Edge.");
      return;
    }
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = idioma;

    rec.onresult = (e: any) => {
      if (pausadoRef.current) return;
      let finalTxt = "";
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        const r = e.results[i];
        if (r.isFinal) finalTxt += r[0].transcript;
        else interim += r[0].transcript;
      }
      if (finalTxt) bufferRef.current = `${bufferRef.current} ${finalTxt}`.trim();
      setParcial(`${bufferRef.current} ${interim}`.trim());
      limparTimer();
      // pequena pausa do usuário = fim da frase
      timerRef.current = setTimeout(entregar, finalTxt ? 700 : 1400);
    };

    rec.onerror = (e: any) => {
      const code = e?.error;
      if (code === "not-allowed" || code === "service-not-allowed") {
        setErro("Permita o acesso ao microfone para conversar com a Nina.");
        ativoRef.current = false;
        setAtivo(false);
      }
    };

    rec.onend = () => {
      setOuvindo(false);
      // o navegador encerra sozinho de tempo em tempo — reinicia se ainda ativo
      if (ativoRef.current) {
        try {
          rec.start();
          setOuvindo(true);
        } catch {
          /* já iniciando */
        }
      }
    };

    recRef.current = rec;
    try {
      rec.start();
      setOuvindo(true);
    } catch {
      /* noop */
    }
  }, [entregar, idioma]);

  const iniciar = useCallback(() => {
    setErro(null);
    ativoRef.current = true;
    pausadoRef.current = false;
    setAtivo(true);
    iniciarMotor();
  }, [iniciarMotor]);

  const parar = useCallback(() => {
    ativoRef.current = false;
    pausadoRef.current = false;
    setAtivo(false);
    setOuvindo(false);
    setParcial("");
    bufferRef.current = "";
    limparTimer();
    const rec = recRef.current;
    recRef.current = null;
    try {
      rec?.abort();
    } catch {
      /* noop */
    }
  }, []);

  /** Silencia a captura enquanto a Nina fala (evita eco). */
  const pausar = useCallback(() => {
    pausadoRef.current = true;
    limparTimer();
    bufferRef.current = "";
    setParcial("");
  }, []);

  const retomar = useCallback(() => {
    if (!ativoRef.current) return;
    pausadoRef.current = false;
    bufferRef.current = "";
    setParcial("");
    iniciarMotor();
  }, [iniciarMotor]);

  useEffect(() => () => parar(), [parar]);

  return { ativo, ouvindo, parcial, erro, iniciar, parar, pausar, retomar };
}
