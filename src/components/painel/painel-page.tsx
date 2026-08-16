import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Loader2, Volume2, VolumeX } from "lucide-react";
import {
  speak as ttsSpeak,
  isUserTtsEnabled,
  subscribeClinicaTtsConfig,
  createUtterance,
  resolveBrowserVoice,
  usuarioPreferePiper,
  usuarioPrefereVozDoNavegador,
  temVozPtBrInstalada,
} from "@/lib/tts-service";
type Senha = {
  id: string;
  codigo: string;
  tipo: "N" | "P" | "C" | "R";
  status: string;
  guiche: string | null;
  chamada_em: string | null;
  paciente_id?: string | null;
  paciente_nome?: string | null;
};

export function PainelPage() {
  const { clinicaAtual, loading } = useClinica();
  const [atual, setAtual] = useState<Senha | null>(null);
  const [historico, setHistorico] = useState<Senha[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const jaFaladoRef = useRef<Set<string>>(new Set());
  const chamadaPendenteRef = useRef<{ key: string; senha: Senha } | null>(null);
  const filaFalaRef = useRef<Array<{ key: string; senha: Senha }>>([]);
  const falandoRef = useRef<boolean>(false);
  // Quando o servidor Piper falha, evitamos tentar de novo por alguns minutos.
  const piperBloqueadoAteRef = useRef<number>(0);
  // Estado visível do serviço de voz personalizada (Piper).
  const [ttsStatus, setTtsStatus] = useState<{
    estado: "desconhecido" | "online" | "offline";
    erro: string | null;
    em: number | null;
  }>({ estado: "desconhecido", erro: null, em: null });
  const vozFemininaRef = useRef<SpeechSynthesisVoice | null>(null);
  // O navegador só deixa tocar som depois de um toque/clique na tela. Enquanto
  // isso não acontece mostramos um convite discreto ("Clique para iniciar"),
  // nunca uma tarja de erro — a TV da recepção fica limpa para os pacientes.
  const [audioLiberado, setAudioLiberado] = useState(false);
  const destravarAudioRef = useRef<(() => void) | null>(null);
  // O indicador técnico de voz (online/offline + erro) fica escondido do
  // público. Para conferir o serviço, abra o painel com "?diagnostico=1".
  const mostrarDiagnostico = useMemo(() => {
    if (typeof window === "undefined") return false;
    const params = new URLSearchParams(window.location.search);
    return params.get("diagnostico") === "1" || params.get("debug") === "1";
  }, []);
  // Modo automático: claro das 06h às 17h; escuro das 17h às 06h.
  // Sem botão manual — a troca acontece sozinha ao longo do dia.
  const [isLight, setIsLight] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const h = new Date().getHours();
    return h >= 6 && h < 17;
  });
  useEffect(() => {
    const tick = () => {
      const h = new Date().getHours();
      setIsLight(h >= 6 && h < 17);
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  // Destrava o áudio automaticamente no primeiro gesto do usuário em
  // QUALQUER lugar da página (política de autoplay dos navegadores).
  useEffect(() => {
    if (typeof window === "undefined") return;
    // Carrega a voz feminina assim que a lista estiver disponível.
    escolherVozFeminina();
    const onVoicesChanged = () => {
      escolherVozFeminina();
    };
    if ("speechSynthesis" in window) {
      window.speechSynthesis.addEventListener?.("voiceschanged", onVoicesChanged);
    }
    const unlock = () => {
      try {
        if ("speechSynthesis" in window) {
          const u = new SpeechSynthesisUtterance(" ");
          u.volume = 0;
          window.speechSynthesis.speak(u);
        }
        const AC =
          (
            window as unknown as {
              AudioContext?: typeof AudioContext;
              webkitAudioContext?: typeof AudioContext;
            }
          ).AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AC && !audioCtxRef.current) audioCtxRef.current = new AC();
        const ctx = audioCtxRef.current;
        if (!ctx) {
          // Navegador sem AudioContext: não temos como testar o bloqueio,
          // então não deixamos o convite preso na tela.
          setAudioLiberado(true);
        } else {
          void ctx
            .resume()
            .then(() => setAudioLiberado(ctx.state === "running"))
            .catch(() => {
              /* segue bloqueado até o próximo gesto */
            });
        }
        if ("speechSynthesis" in window) window.speechSynthesis.resume();

        // Se o navegador bloqueou a voz antes de qualquer interação, qualquer
        // toque/clique na tela repete a última chamada pendente sem botão visível.
        const pendente = chamadaPendenteRef.current;
        if (pendente) {
          // Reenfileira o anúncio pendente para tocar assim que o áudio
          // for destravado por qualquer gesto do usuário.
          if (!filaFalaRef.current.some((f) => f.key === pendente.key)) {
            filaFalaRef.current.push(pendente);
          }
          processarFilaFala();
        }
      } catch {
        /* ignore */
      }
    };
    // Tenta imediatamente (funciona se a aba já teve interação)
    destravarAudioRef.current = unlock;
    unlock();
    // Mantém sempre ativo: reexecuta o unlock a cada gesto e quando a aba
    // volta a ficar visível (kiosque que fica horas aberto sem foco).
    const opts = { capture: true } as const;
    window.addEventListener("pointerdown", unlock, opts);
    window.addEventListener("keydown", unlock, opts);
    window.addEventListener("touchstart", unlock, opts);
    document.addEventListener("visibilitychange", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock, opts);
      window.removeEventListener("keydown", unlock, opts);
      window.removeEventListener("touchstart", unlock, opts);
      document.removeEventListener("visibilitychange", unlock);
      if ("speechSynthesis" in window) {
        window.speechSynthesis.removeEventListener?.("voiceschanged", onVoicesChanged);
      }
    };
  }, []);

  const t = isLight
    ? {
        root: "bg-[#f6f7fb] text-slate-900",
        accent: "text-blue-600",
        heading: "text-slate-900",
        clock: "text-slate-500",
        headerBorder: "border-slate-200",
        heroCard: "bg-white border border-slate-200 shadow-xl",
        heroGlow: "bg-blue-500/10",
        badgeActive: "bg-blue-600 text-white",
        badgeIdle: "bg-slate-100 border border-slate-200 text-slate-500",
        ticket: "text-slate-900 drop-shadow-sm",
        patient: "text-slate-700",
        guicheLabel: "text-slate-500",
        guicheValue: "text-blue-600",
        aside: "bg-white border border-slate-200",
        asideTitle: "text-slate-500",
        asideEmpty: "text-slate-400",
        itemFirst: "bg-blue-50 border border-blue-100",
        itemRest: "bg-slate-50 border border-slate-100",
        itemCodeFirst: "text-blue-600",
        itemCodeRest: "text-slate-500",
        itemNameFirst: "text-slate-700",
        itemNameRest: "text-slate-500",
        itemLabel: "text-slate-400",
        itemGuicheFirst: "text-slate-900",
        itemGuicheRest: "text-slate-500",
        footerBorder: "border-slate-200",
        footerText: "text-slate-400",
        idleText: "text-slate-400",
        toggle: "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50",
      }
    : {
        root: "bg-[#0a0b10] text-white",
        accent: "text-blue-400",
        heading: "text-white",
        clock: "text-slate-400",
        headerBorder: "border-white/10",
        heroCard:
          "bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 shadow-2xl",
        heroGlow: "bg-blue-600/10",
        badgeActive: "bg-blue-600 text-white",
        badgeIdle: "bg-white/5 border border-white/10 text-slate-400",
        ticket: "text-white drop-shadow-2xl",
        patient: "text-slate-200",
        guicheLabel: "text-slate-400",
        guicheValue: "text-blue-400",
        aside: "bg-white/[0.03] border border-white/10",
        asideTitle: "text-slate-500",
        asideEmpty: "text-slate-600",
        itemFirst: "bg-white/5 border border-white/5",
        itemRest: "bg-white/[0.02] border border-white/5",
        itemCodeFirst: "text-blue-400",
        itemCodeRest: "text-slate-400",
        itemNameFirst: "text-slate-300",
        itemNameRest: "text-slate-500",
        itemLabel: "text-slate-500",
        itemGuicheFirst: "text-white",
        itemGuicheRest: "text-slate-400",
        footerBorder: "border-white/5",
        footerText: "text-slate-600",
        idleText: "text-slate-500",
        toggle: "bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10",
      };

  useEffect(() => {
    if (!clinicaAtual) return;
    const clinicaId = clinicaAtual.clinica_id;

    const carregar = async () => {
      const { data } = await supabase.rpc("painel_senhas_publicas", { _clinica_id: clinicaId });
      const lista = (data ?? []) as Senha[];
      setAtual(lista[0] ?? null);
      setHistorico(lista.slice(1));

      const chamadaMaisRecente = lista[0];
      if (chamadaMaisRecente?.status === "chamada") {
        anunciarSenha(chamadaMaisRecente);
      }
    };

    void carregar();

    const ch = supabase
      .channel(`painel-${clinicaId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "senhas", filter: `clinica_id=eq.${clinicaId}` },
        () => {
          void carregar();
        },
      )
      .subscribe((status) => {
        console.info("[painel] realtime status:", status);
      });

    // Fallback de polling: garante atualização mesmo se o canal de realtime
    // cair silenciosamente (proxy, sleep de aba, RLS bloqueando o socket).
    const poll = window.setInterval(() => {
      void carregar();
    }, 3000);
    const onVis = () => {
      if (document.visibilityState === "visible") void carregar();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", onVis);
      void supabase.removeChannel(ch);
    };
  }, [clinicaAtual?.clinica_id]);

  function chaveSenha(s: Senha) {
    return `${s.id}:${s.chamada_em ?? ""}`;
  }

  function anunciarSenha(s: Senha) {
    const key = chaveSenha(s);
    if (jaFaladoRef.current.has(key)) return;
    jaFaladoRef.current.add(key);
    chamadaPendenteRef.current = { key, senha: s };
    filaFalaRef.current.push({ key, senha: s });
    processarFilaFala();
  }

  // Quando a velocidade/habilitação do TTS mudar (mesma aba OU outra aba
  // via storage event), interrompemos a fala nativa em curso e a próxima
  // criação de utterance pegará a nova velocidade automaticamente.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const reagir = () => {
      try {
        window.speechSynthesis.cancel();
      } catch {
        /* ignore */
      }
      // Libera a fila para o próximo processamento com a nova velocidade.
      falandoRef.current = false;
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === "tts:rate" || e.key === "tts:enabled") reagir();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("tts:changed", reagir);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("tts:changed", reagir);
    };
  }, []);

  // Escuta em tempo real (Realtime) a configuração de voz salva por qualquer
  // navegador. Quando a velocidade/habilitação mudar em outro dispositivo,
  // interrompemos a fala corrente e a próxima criação de utterance/áudio
  // já usará a nova velocidade — sem precisar recarregar o painel.
  useEffect(() => {
    const clinicaId = clinicaAtual?.clinica_id;
    if (!clinicaId) return;
    return subscribeClinicaTtsConfig(clinicaId);
  }, [clinicaAtual?.clinica_id]);

  // A fala nasce sempre em `createUtterance`, que fixa lang=pt-BR, aplica a
  // velocidade configurada e atribui a voz escolhida na tela de Voz & Áudio
  // (ou a melhor voz pt-BR disponível, quando o modo é automático).
  function criarFala(texto: string, key: string) {
    const utter = createUtterance(texto);
    utter.onstart = () => {
      if (chamadaPendenteRef.current?.key === key) chamadaPendenteRef.current = null;
    };
    return utter;
  }

  // A lista de vozes do navegador carrega de forma assíncrona: aquecemos o
  // cache assim que ela fica disponível e a cada "voiceschanged".
  function escolherVozFeminina(): SpeechSynthesisVoice | null {
    const escolhida = resolveBrowserVoice();
    vozFemininaRef.current = escolhida;
    return escolhida;
  }

  /**
   * O guichê é texto livre digitado pela recepção: pode vir "3" ou já vir
   * "Consultório 1". Só prefixamos "guichê" quando é um número solto, para
   * não anunciar "guichê Consultório 1".
   */
  function rotuloLocal(guiche: string): string {
    const g = guiche.trim();
    return /[a-zA-ZÀ-ÿ]/.test(g) ? g : `guichê ${g}`;
  }

  /**
   * Monta o texto do anúncio: "{Nome completo}. {Guichê/Consultório}."
   *
   * O separador é PONTO, não vírgula: o ponto produz uma pausa bem mais longa
   * na voz do navegador, que é o que dá tempo do paciente ouvir o nome antes
   * de vir o local.
   *
   * Procedimento e exame não entram aqui de propósito — o painel fica numa TV
   * virada para a sala de espera e isso é dado de saúde (LGPD, art. 11).
   * Se precisar aparecer, que seja escrito na tela, nunca falado.
   *
   * Sem nome de paciente (fila de balcão), cai para a senha.
   */
  function textoDaSenha(s: Senha) {
    const partes: string[] = [];

    const codigoEhNome = /[a-zA-Z]{3,}/.test(s.codigo) && /\s/.test(s.codigo.trim());
    if (s.paciente_nome) {
      partes.push(s.paciente_nome);
    } else if (codigoEhNome) {
      partes.push(s.codigo);
    } else {
      const tipoNome = { N: "Comum", P: "Preferencial", C: "Cartão consulta", R: "Retorno" }[
        s.tipo
      ];
      partes.push(`Senha ${tipoNome} ${s.codigo.replace("-", " ")}`);
    }

    if (s.guiche) partes.push(rotuloLocal(s.guiche));

    return `${partes.join(". ")}.`;
  }

  // Processa a fila de anúncios: só chama a próxima senha depois que a
  // atual terminar de falar por completo (ding + fala + repetição).
  function processarFilaFala() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    if (falandoRef.current) return;
    const prox = filaFalaRef.current.shift();
    if (!prox) return;
    falandoRef.current = true;
    const texto = textoDaSenha(prox.senha);

    // Piper TTS local (Menino Jesus): usa o backend de IA quando habilitado,
    // com fallback silencioso para SpeechSynthesis nativo se falhar.
    const nomeClinica = (clinicaAtual?.clinica?.nome ?? "").toLowerCase();
    // A escolha feita na tela de Voz & Áudio manda:
    //   voz do navegador → nunca usa o Piper;
    //   "Servidor Piper" → usa o Piper em qualquer clínica;
    //   automático       → comportamento histórico (Piper só na Menino Jesus).
    // Sem nenhuma voz pt-BR instalada, a fala nativa sairia com sotaque
    // americano: nesse caso o Piper é preferível mesmo fora da Menino Jesus.
    const semVozPtBr = !temVozPtBrInstalada();
    const piperPermitido = usuarioPrefereVozDoNavegador()
      ? false
      : usuarioPreferePiper() || nomeClinica.includes("menino jesus") || semVozPtBr;
    const usarPiper =
      piperPermitido && isUserTtsEnabled() && Date.now() > piperBloqueadoAteRef.current;
    if (usarPiper) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        /* ignore */
      }
      tocarDing();
      // A partir daqui a chamada não está mais "pendente de gesto":
      // evita que qualquer clique na tela reenfileire o mesmo anúncio.
      if (chamadaPendenteRef.current?.key === prox.key) chamadaPendenteRef.current = null;
      const liberar = () => {
        falandoRef.current = false;
        processarFilaFala();
      };
      // primeira leitura → intervalo → repetição → libera fila
      void ttsSpeak(texto, {
        onEnd: () => {
          setTtsStatus({ estado: "online", erro: null, em: Date.now() });
          window.setTimeout(() => {
            void ttsSpeak(texto, { onEnd: liberar, onError: liberar, interrupt: false });
          }, 800);
        },
        onError: (err) => {
          if (ehBloqueioDeAutoplay(err)) {
            // Não é falha do servidor de voz: o navegador só está esperando um
            // toque na tela. Mantém a chamada pendente (qualquer clique a
            // repete), não pune o Piper e mostra apenas o convite discreto.
            setAudioLiberado(false);
            chamadaPendenteRef.current = { key: prox.key, senha: prox.senha };
            liberar();
            return;
          }
          // Piper indisponível: pausa as tentativas por 5 minutos e faz UMA
          // leitura pelo SpeechSynthesis nativo (sem reenfileirar — reenfileirar
          // causava anúncio em loop infinito quando o servidor estava fora).
          piperBloqueadoAteRef.current = Date.now() + 5 * 60_000;
          setTtsStatus({ estado: "offline", erro: descreverErroTts(err), em: Date.now() });
          fallbackSpeechSynth();
        },
      });
      return;
    }
    fallbackSpeechSynth();

    function fallbackSpeechSynth() {
      falandoRef.current = true;
      const item = prox!;
      // Diagnóstico: sem voz pt-BR instalada a chamada sai com sotaque
      // americano e não há correção possível no código — o pacote de voz em
      // português precisa ser instalado NESTA máquina (ou usar o Piper).
      // Não mostramos aviso na tela porque o painel fica visível ao paciente.
      if (!temVozPtBrInstalada()) {
        console.warn(
          "[painel] Nenhuma voz pt-BR instalada neste computador: a chamada usará a voz padrão do sistema. " +
            "Instale um pacote de voz em português no Windows ou selecione 'Usar Servidor Piper' em Configurações → Voz & Áudio.",
        );
      }
      try {
        window.speechSynthesis.cancel();
      } catch {
        /* ignore */
      }
      window.speechSynthesis.resume();
      tocarDing();
      const primeira = criarFala(texto, item.key);
      // Se a primeira falhar, ainda tocamos a segunda depois do intervalo.
      window.speechSynthesis.speak(primeira);
      window.setTimeout(() => {
        window.speechSynthesis.resume();
        // Cria a segunda leitura só agora para pegar a velocidade ATUAL
        // (caso o usuário tenha alterado o slider entre a 1ª e a 2ª chamada).
        const segunda = criarFala(texto, item.key);
        segunda.onend = () => {
          falandoRef.current = false;
          processarFilaFala();
        };
        segunda.onerror = segunda.onend;
        window.speechSynthesis.speak(segunda);
      }, 3800);
    }
  }

  function tocarDing() {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.4);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.45);
    });
  }

  // Toque no botão de início: destrava o áudio e some com o convite, mesmo
  // que o navegador ainda recuse o som (aí o aviso volta na próxima chamada).
  function liberarAudio() {
    destravarAudioRef.current?.();
    setAudioLiberado(true);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground">Carregando painel…</p>
        </div>
      </div>
    );
  }

  if (!clinicaAtual)
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        Nenhuma clínica selecionada.
      </div>
    );

  return (
    <div
      className={`h-screen w-full overflow-hidden ${t.root} p-[clamp(0.75rem,2vw,2rem)] flex flex-col transition-colors`}
    >
      <header
        className={`grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4 mb-[clamp(0.5rem,1.5vh,1.5rem)] border-b ${t.headerBorder} pb-[clamp(0.5rem,1.2vh,1.25rem)]`}
      >
        <div className="min-w-0">
          <p
            className={`${t.accent} font-bold tracking-widest text-[clamp(0.7rem,1.2vw,0.95rem)] uppercase mb-1`}
          >
            Painel de Chamada
          </p>
          <h1
            className={`truncate font-black uppercase tracking-tight ${t.heading} text-[clamp(1.25rem,3vw,2.5rem)]`}
          >
            {clinicaAtual.clinica.nome}
          </h1>
        </div>
        <div className="flex items-center gap-[clamp(0.75rem,1.5vw,1.5rem)] shrink-0">
          {!audioLiberado && atual && (
            <button
              type="button"
              onClick={liberarAudio}
              className={`flex items-center gap-2 rounded-full px-[clamp(0.6rem,1vw,1rem)] py-[clamp(0.2rem,0.4vw,0.4rem)] text-[clamp(0.6rem,0.9vw,0.8rem)] font-semibold uppercase tracking-widest transition-colors ${t.toggle}`}
            >
              <VolumeX className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Ativar som</span>
            </button>
          )}
          {mostrarDiagnostico && <TtsStatusBadge status={ttsStatus} />}
          <div className={`font-medium tabular-nums ${t.clock} text-[clamp(1.25rem,2.5vw,2.5rem)]`}>
            <PainelClock />
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col lg:flex-row gap-[clamp(0.75rem,1.5vw,2rem)] min-h-0">
        <div
          className={`flex-[2] min-h-0 min-w-0 relative overflow-hidden ${t.heroCard} rounded-[clamp(1rem,2vw,2rem)] flex flex-col items-center justify-center p-[clamp(0.75rem,2vw,2.5rem)]`}
        >
          <div
            className={`absolute -top-24 -left-24 w-96 h-96 ${t.heroGlow} blur-[120px] rounded-full pointer-events-none`}
          />
          <div className="relative z-10 text-center w-full">
            {atual ? (
              (() => {
                const ehNome = /[a-zA-Z]{3,}/.test(atual.codigo) && /\s/.test(atual.codigo.trim());
                const fonte = ehNome
                  ? atual.codigo.length > 16
                    ? "text-[clamp(2rem,min(6vw,9vh),4.5rem)]"
                    : atual.codigo.length > 10
                      ? "text-[clamp(2.5rem,min(7vw,11vh),5.5rem)]"
                      : "text-[clamp(3rem,min(9vw,14vh),7rem)]"
                  : "text-[clamp(4rem,min(16vw,26vh),14rem)] tabular-nums";
                return (
                  <>
                    <span
                      className={`inline-block px-[clamp(0.75rem,1.2vw,1.25rem)] py-[clamp(0.25rem,0.5vw,0.5rem)] rounded-full ${t.badgeActive} font-bold uppercase tracking-[0.2em] mb-[clamp(0.5rem,min(2vw,2vh),1.5rem)] text-[clamp(0.7rem,1vw,1.1rem)]`}
                    >
                      Chamando Agora
                    </span>
                    <div
                      className={`${fonte} font-black leading-none ${t.ticket} tracking-tighter break-words max-w-full mb-[clamp(0.5rem,min(1.5vw,1.5vh),1rem)]`}
                    >
                      {atual.codigo}
                    </div>
                    {!ehNome && atual.paciente_nome && (
                      <h3
                        className={`font-bold ${t.patient} tracking-tight uppercase break-words max-w-full text-[clamp(1rem,min(3.5vw,5vh),3rem)]`}
                      >
                        {atual.paciente_nome}
                      </h3>
                    )}
                    <div className="flex items-center justify-center gap-[clamp(0.5rem,1.2vw,1.25rem)] mt-[clamp(0.5rem,min(2vw,2.5vh),1.5rem)]">
                      {!ehNome && (
                        <span
                          className={`${t.guicheLabel} font-medium uppercase tracking-widest text-[clamp(0.85rem,min(2vw,3vh),1.75rem)]`}
                        >
                          Guichê
                        </span>
                      )}
                      <span
                        className={`font-black ${t.guicheValue} text-[clamp(2rem,min(6vw,9vh),5rem)]`}
                      >
                        {atual.guiche ?? "—"}
                      </span>
                    </div>
                  </>
                );
              })()
            ) : (
              <>
                <span
                  className={`inline-block px-[clamp(0.75rem,1.2vw,1.25rem)] py-[clamp(0.25rem,0.5vw,0.5rem)] rounded-full ${t.badgeIdle} font-bold uppercase tracking-[0.2em] mb-[clamp(0.5rem,2vh,1.5rem)] text-[clamp(0.7rem,1vw,1.1rem)]`}
                >
                  Chamando Agora
                </span>
                <div
                  className={`${t.idleText} font-light text-[clamp(1.25rem,min(3.5vw,5vh),2.5rem)]`}
                >
                  Aguardando chamada…
                </div>
              </>
            )}
          </div>
        </div>

        <aside
          className={`flex-1 min-h-0 min-w-0 ${t.aside} rounded-[clamp(1rem,2vw,2rem)] p-[clamp(0.75rem,1.5vw,1.75rem)] flex flex-col`}
        >
          <h3
            className={`font-bold uppercase tracking-widest ${t.asideTitle} mb-[clamp(0.5rem,1.5vh,1.5rem)] pl-2 lg:pl-4 text-[clamp(0.8rem,1.2vw,1.25rem)]`}
          >
            Anteriores
          </h3>
          <div className="space-y-[clamp(0.4rem,0.8vh,0.85rem)] flex-1 overflow-y-auto min-h-0">
            {historico.length === 0 && (
              <div className={`${t.asideEmpty} pl-2 lg:pl-4 text-[clamp(0.9rem,1.4vw,1.125rem)]`}>
                Sem chamadas anteriores
              </div>
            )}
            {historico.map((s, i) => (
              <div
                key={s.id}
                className={`flex items-center justify-between p-[clamp(0.6rem,min(1.2vw,1.6vh),1.25rem)] rounded-[clamp(0.75rem,1.2vw,1.25rem)] ${i === 0 ? t.itemFirst : t.itemRest}`}
              >
                <div className="min-w-0">
                  <p
                    className={`font-black tabular-nums mb-1 truncate ${i === 0 ? t.itemCodeFirst : t.itemCodeRest} text-[clamp(1rem,min(2vw,3vh),1.85rem)]`}
                  >
                    {s.codigo}
                  </p>
                  {s.paciente_nome && (
                    <p
                      className={`font-bold uppercase truncate ${i === 0 ? t.itemNameFirst : t.itemNameRest} text-[clamp(0.7rem,1.1vw,1.1rem)]`}
                    >
                      {s.paciente_nome}
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0 pl-3">
                  <p
                    className={`${t.itemLabel} uppercase font-bold tracking-widest mb-1 text-[clamp(0.5rem,0.75vw,0.7rem)]`}
                  >
                    Guichê
                  </p>
                  <p
                    className={`font-black ${i === 0 ? t.itemGuicheFirst : t.itemGuicheRest} text-[clamp(1.25rem,min(2.2vw,3vh),1.85rem)]`}
                  >
                    {s.guiche ?? "—"}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <div
            className={`mt-auto pt-[clamp(0.5rem,1vh,1.25rem)] border-t ${t.footerBorder} text-center`}
          >
            <p className={`${t.footerText} font-medium text-[clamp(0.7rem,1vw,0.95rem)]`}>
              Por favor, dirija-se ao guichê indicado.
            </p>
          </div>
        </aside>
      </main>

      {/* Convite de abertura: aparece só enquanto não houver chamada na tela e
          o navegador ainda não liberou o som. Um toque em qualquer lugar já
          resolve, mas o botão deixa isso claro para quem liga a TV. */}
      {!audioLiberado && !atual && (
        <div
          role="button"
          tabIndex={0}
          onClick={liberarAudio}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") liberarAudio();
          }}
          className={`fixed inset-0 z-50 flex cursor-pointer flex-col items-center justify-center gap-[clamp(0.75rem,2vh,1.5rem)] backdrop-blur-sm ${
            isLight ? "bg-white/85" : "bg-[#0a0b10]/90"
          }`}
        >
          <span
            className={`rounded-full ${t.badgeActive} px-[clamp(1.5rem,4vw,3rem)] py-[clamp(0.75rem,1.6vw,1.25rem)] font-bold uppercase tracking-widest text-[clamp(0.9rem,1.8vw,1.5rem)] shadow-lg`}
          >
            Clique para iniciar o painel
          </span>
          <span className={`${t.idleText} text-[clamp(0.8rem,1.2vw,1.1rem)]`}>
            O som das chamadas é liberado no primeiro toque da tela.
          </span>
        </div>
      )}
    </div>
  );
}

function PainelClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return <span>{now.toLocaleTimeString("pt-BR")}</span>;
}

// Indicador do serviço de voz personalizada: online / offline + último erro.
function TtsStatusBadge({
  status,
}: {
  status: { estado: "desconhecido" | "online" | "offline"; erro: string | null; em: number | null };
}) {
  const offline = status.estado === "offline";
  const online = status.estado === "online";
  const hora = status.em ? new Date(status.em).toLocaleTimeString("pt-BR") : null;
  return (
    <div
      title={
        offline
          ? `${status.erro ?? "Serviço de voz indisponível"}${hora ? ` — ${hora}` : ""}`
          : online
            ? `Voz personalizada funcionando${hora ? ` — ${hora}` : ""}`
            : "Aguardando a primeira chamada para verificar a voz"
      }
      className={`flex items-center gap-2 rounded-full border px-[clamp(0.5rem,0.9vw,0.9rem)] py-[clamp(0.2rem,0.4vw,0.4rem)] text-[clamp(0.6rem,0.9vw,0.8rem)] font-semibold uppercase tracking-widest ${
        offline
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : online
            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
            : "border-muted-foreground/30 bg-muted/20 text-muted-foreground"
      }`}
    >
      {offline ? (
        <VolumeX className="h-4 w-4 shrink-0" />
      ) : (
        <Volume2 className="h-4 w-4 shrink-0" />
      )}
      <span className="hidden sm:inline">Voz {offline ? "offline" : online ? "online" : "—"}</span>
      {offline && status.erro && (
        <span className="hidden md:inline normal-case tracking-normal font-medium opacity-90">
          · {status.erro}
        </span>
      )}
    </div>
  );
}

// True quando o navegador recusou tocar o áudio por falta de interação do
// usuário (política de autoplay). Não é falha do servidor de voz.
function ehBloqueioDeAutoplay(err: unknown): boolean {
  if (typeof DOMException !== "undefined" && err instanceof DOMException) {
    if (err.name === "NotAllowedError") return true;
  }
  const msg = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  return /notallowed|interact with the document|user gesture|play\(\) failed/i.test(msg);
}

// Transforma o erro do serviço de voz em um texto curto e legível
// (ex.: "Erro 502 no servidor de voz").
function descreverErroTts(err: unknown): string {
  if (ehBloqueioDeAutoplay(err)) return "Som bloqueado até tocar na tela";
  const msg = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  const status = msg.match(/\b(4\d{2}|5\d{2})\b/)?.[1];
  if (status) return `Erro ${status} no servidor de voz`;
  if (!msg) return "Servidor de voz não respondeu";
  return msg.slice(0, 80);
}
