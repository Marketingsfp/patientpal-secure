import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  Send,
  Loader2,
  GraduationCap,
  Sparkles,
  ThumbsUp,
  ThumbsDown,
  Lightbulb,
  Flag,
  User,
  Bot,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Keyboard,
  PhoneCall,
  PhoneOff,
  Settings2,
  CheckCheck,
} from "lucide-react";
import { loadEstadoRoleplay, saveEstadoRoleplay } from "@/lib/coach/roleplay-persist";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  loadLocalTts,
  pingLocalTts,
  saveLocalTts,
  fetchLocalTtsAudio,
  buildLocalTtsUrl,
  vozPorNome,
  VOZ_MASCULINA,
  TTS_PLAYBACK_RATE,
  type LocalTtsConfig,
} from "@/lib/coach/local-tts";
import {
  startRoleplay,
  roleplayReply,
  type RoleplayScenario,
  type RoleplayFeedback,
  type TurnoAvaliacao,
} from "@/lib/coach/roleplay.functions";
import { embaralhar, itensEvitar, registrarUsados } from "@/lib/coach/variedade";
import { supabase } from "@/integrations/supabase/client";
import { useStudyTimer } from "@/lib/coach/study-time";
import { AtendenteGuard } from "@/components/coach/AtendenteGuard";
import { ProtecaoTela } from "@/components/coach/ProtecaoTela";
import { formatScripts } from "@/lib/coach/scripts";
import { escolhaDaVoz, type VozProvedor } from "@/lib/coach/voz-config";
import { useCoachConfig } from "@/lib/coach/config-clinica";
import type { CoachContexto } from "@/lib/coach/contexto";
import { CATALOGO_RESUMO, CATALOGO_SERVICOS } from "@/lib/coach/servicos-catalogo";
import {
  COTA_ATIVIDADE_MS,
  LIMITE_TOTAL_MS,
  TRAVA_TEMPO_ATIVA,
  META_LIGACOES,
  META_WHATSAPP,
  NOTA_MINIMA,
  DIFICULDADES,
  contaParaMeta,
  type Dificuldade,
  cotaSessaoMs,
  proximaAtividade,
} from "@/lib/coach/treinamento-plano";
import { inicioDoDiaRio } from "@/lib/coach/data-atual";

/** Orçamento GERAL de treinamento por atendente: 20 minutos somando todas as sessões. */
const LIMITE_MS = LIMITE_TOTAL_MS;
/** Segundos de pausa antes de emendar automaticamente a próxima atividade. */
const AUTO_AVANCO_SEG = 6;

type Msg = {
  role: "cliente" | "atendente";
  content: string;
  avaliacao?: TurnoAvaliacao;
};
type Mode = "texto" | "voz";

export const Route = createFileRoute("/_authenticated/app/coach/roleplay/$nome")({
  head: ({ params }) => ({
    meta: [
      { title: `Roleplay · ${decodeURIComponent(params.nome)} · Coach WhatsApp` },
      {
        name: "description",
        content:
          "Treinamento por simulação: pratique atendimentos focados nos seus pontos fracos com um cliente gerado por IA.",
      },
    ],
  }),
  component: RoleplayRoute,
});

/** Contextos distintos: 0-4 conversas de WhatsApp, 5-9 ligações. */
const CONTEXTOS_TREINO = [
  "Paciente pergunta o preço de um exame e acha caro; precisa de contorno de objeção e fechamento de horário.",
  "Paciente quer remarcar uma consulta que perdeu e está com receio de ser cobrado; precisa sair com data nova confirmada.",
  "Paciente pergunta se atende convênio e fica hesitante ao saber que é particular; precisa entender o valor e agendar.",
  "Primeira vez na clínica, com sintoma incomodando há dias e certa urgência; pede o horário mais próximo possível.",
  "Veio por indicação de uma amiga, tem pouca disponibilidade e só consegue vir em horário alternativo (sábado ou fim do dia).",
  "Ligação: paciente pedindo orçamento de um pacote mais caro e perguntando sobre parcelamento e formas de pagamento.",
  "Ligação: paciente já agendado quer confirmar horário e tirar dúvidas sobre o preparo do exame e documentos.",
  "Ligação: paciente idoso, fala devagar, pergunta sobre localização, estacionamento e se pode levar acompanhante.",
  "Ligação: paciente comparando com outra clínica mais barata, desconfiado da qualidade e quase desistindo.",
  "Ligação: retorno pós-consulta, quer resultado de exame e precisa ser conduzido a agendar a reavaliação.",
];

/**
 * Serviços variados da clínica: evita que a IA escolha sempre o mesmo tema
 * (ex.: pacote de acupuntura) em todas as ligações.
 */
const TEMAS_SERVICO = [
  "consulta de cardiologia (adulto)",
  "consulta de cardiologia infantil",
  "consulta de ginecologia com preventivo",
  "consulta de pediatria",
  "consulta de ortopedia",
  "consulta de dermatologia",
  "consulta de otorrinolaringologia com lavagem otológica",
  "consulta de endocrinologia",
  "consulta oftalmológica",
  "consulta de neurologia",
  "consulta de urologia",
  "consulta de nutrição",
  "consulta de psicologia",
  "ultrassonografia obstétrica",
  "ultrassonografia de tireoide",
  "ultrassonografia transvaginal",
  "ultrassonografia de abdome superior",
  "exame de endoscopia",
  "ecocardiograma",
  "teste ergométrico",
  "audiometria / teste da orelhinha",
  "sessões de fisioterapia",
  "sessões de acupuntura",
  "aplicação de vitamina B12 ou vitamina D",
  "consulta de mastologia",
  "consulta de angiologia (aplicação de varizes)",
  "avaliação odontológica",
  "consulta de obstetrícia",
];

/** Rotação aleatória, porém sem repetir, dos temas de serviço nesta sessão. */
let filaTemas: string[] = [];
function proximoTema(): string {
  if (filaTemas.length === 0) filaTemas = embaralhar(TEMAS_SERVICO);
  return filaTemas.shift() as string;
}

/** Situações sorteadas sem repetição: texto (0-4) e voz (5-9) em ordem variável. */
let filaTexto: string[] = [];
let filaVoz: string[] = [];
function proximaSituacao(i: number): string {
  if (i < 5) {
    if (filaTexto.length === 0) filaTexto = embaralhar(CONTEXTOS_TREINO.slice(0, 5));
    return filaTexto.shift() as string;
  }
  if (filaVoz.length === 0) filaVoz = embaralhar(CONTEXTOS_TREINO.slice(5));
  return filaVoz.shift() as string;
}

/** Ângulos extras para nunca cair na mesma pergunta de abertura. */
const ANGULOS = [
  "abre a conversa só com uma saudação, sem dizer o que quer",
  "manda direto uma foto/pedido médico e pergunta se a clínica faz",
  "pergunta primeiro o endereço e se tem estacionamento",
  "pergunta o valor antes de qualquer coisa",
  "pergunta se tem horário hoje ou amanhã",
  "chega irritado porque não conseguiu falar antes",
  "está pesquisando para um familiar (mãe, filho, esposo)",
  "quer saber se precisa de encaminhamento ou preparo",
  "pergunta se aceita cartão/parcelamento",
  "diz que já foi na clínica há tempos e quer voltar",
];
let filaAngulos: string[] = [];
function proximoAngulo(): string {
  if (filaAngulos.length === 0) filaAngulos = embaralhar(ANGULOS);
  return filaAngulos.shift() as string;
}

/** Contexto completo do cenário: situação + serviço + ângulo de abertura sorteados. */
function contextoTreino(i: number): string {
  return `${proximaSituacao(i)} O serviço procurado nesta simulação DEVE ser: ${proximoTema()}. Use os dados reais da clínica para esse serviço (valor, dia, horário, idade mínima e preparo) e não troque por outro serviço. Forma de abertura obrigatória: o paciente ${proximoAngulo()}.`;
}

function RoleplayRoute() {
  const { nome } = Route.useParams();
  const atendente = decodeURIComponent(nome);
  return (
    <AtendenteGuard nome={atendente}>
      {(ctx) => (
        <ProtecaoTela atendente={atendente} clinicaId={ctx.clinicaId} tela="roleplay">
          <RoleplayPage ctx={ctx} />
        </ProtecaoTela>
      )}
    </AtendenteGuard>
  );
}

function RoleplayPage({ ctx }: { ctx: CoachContexto }) {
  const { nome } = Route.useParams();
  const atendente = decodeURIComponent(nome);
  const clinicaId = ctx.clinicaId;
  useStudyTimer(atendente, "roleplay", clinicaId);
  const navigate = useNavigate();
  const start = useServerFn(startRoleplay);
  const reply = useServerFn(roleplayReply);
  const scriptsRef = useRef<string>("");
  const tabelaRef = useRef<string>(CATALOGO_SERVICOS);
  const { config, loading: clinicaLoading, tabelaParaIA } = useCoachConfig(
    clinicaId,
    ctx.clinicaNome,
  );
  const vozConfigRef = useRef(config.vozConfig);
  useEffect(() => {
    vozConfigRef.current = config.vozConfig;
    scriptsRef.current = formatScripts(config.scripts);
    tabelaRef.current = tabelaParaIA;
  }, [config, tabelaParaIA]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scenario, setScenario] = useState<RoleplayScenario | null>(null);
  const [pontosFracos, setPontosFracos] = useState<string[]>([]);
  const pontosFracosRef = useRef<string[]>([]);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [feedback, setFeedback] = useState<RoleplayFeedback | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [mode, setMode] = useState<Mode>("texto");
  const [listening, setListening] = useState(false);
  const [speakEnabled, setSpeakEnabled] = useState(true);
  const [voiceSupported, setVoiceSupported] = useState(true);
  const recognitionRef = useRef<any>(null);
  const lastSpokenRef = useRef<string>("");
  const modeRef = useRef<Mode>("texto");
  const speakEnabledRef = useRef<boolean>(true);
  const thinkingRef = useRef<boolean>(false);
  const feedbackRef = useRef<RoleplayFeedback | null>(null);
  const listeningRef = useRef<boolean>(false);
  const callActiveRef = useRef<boolean>(false);
  const shouldListenRef = useRef<boolean>(false);
  const recognitionStartingRef = useRef<boolean>(false);
  // Verdadeiro enquanto a voz do paciente está tocando (evita eco e atropelo de falas)
  const speakingRef = useRef<boolean>(false);
  const [falando, setFalando] = useState(false);
  const silenceTimerRef = useRef<number | null>(null);
  const [callStart, setCallStart] = useState<number | null>(null);
  const [callElapsed, setCallElapsed] = useState(0);
  // Tempo já consumido em sessões anteriores (orçamento geral de 20 min)
  const [usadoMs, setUsadoMs] = useState(0);
  const usadoMsRef = useRef(0);
  // Quantas sessões de cada tipo já foram concluídas (metas: 5 voz + 5 texto)
  const [feitasVoz, setFeitasVoz] = useState(0);
  const [feitasTexto, setFeitasTexto] = useState(0);
  const feitasVozRef = useRef(0);
  const feitasTextoRef = useRef(0);
  const [proximoEm, setProximoEm] = useState<number | null>(null);
  const [avisoPlano, setAvisoPlano] = useState<string | null>(null);
  // Conversa (contato) ativa na lista lateral + histórico de cada conversa
  const [convAtiva, setConvAtiva] = useState(0);
  const convStoreRef = useRef<Record<number, Msg[]>>({});
  const convAtivaRef = useRef(0);
  // Cenário próprio de cada conversa/ligação + argumentos para gerar novos
  const cenariosRef = useRef<Record<number, RoleplayScenario>>({});
  const bootArgsRef = useRef<{ fracos: string[]; exemplos: unknown[] } | null>(null);
  const [gerandoCenario, setGerandoCenario] = useState(false);

  /** Cria/recupera o cenário exclusivo de cada conversa (0-4 texto, 5-9 voz). */
  async function garantirCenario(i: number): Promise<RoleplayScenario | null> {
    const cache = cenariosRef.current[i];
    if (cache) {
      setScenario(cache);
      return cache;
    }
    const args = bootArgsRef.current;
    if (!args) return null;
    setGerandoCenario(true);
    try {
      const sc = await start({
        data: {
          atendente,
          pontos_fracos: args.fracos,
          exemplos: args.exemplos as never,
          scripts: scriptsRef.current || undefined,
          tabela: tabelaRef.current,
          contexto: contextoTreino(i),
          evitar: itensEvitar(atendente),
          seed: `${Date.now().toString(36)}-${i}-${Math.random().toString(36).slice(2, 8)}`,
          dificuldade: dificuldadeRef.current,
        },
      });
      cenariosRef.current[i] = sc;
      registrarUsados(atendente, [
        sc.nome_paciente,
        sc.primeira_mensagem?.slice(0, 90),
        sc.cenario?.slice(0, 90),
      ]);
      setScenario(sc);
      return sc;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao gerar o cenário.");
      return null;
    } finally {
      setGerandoCenario(false);
    }
  }
  const [dificuldade, setDificuldade] = useState<Dificuldade>(() => {
    const v = typeof window !== "undefined" ? localStorage.getItem("roleplay:dificuldade") : null;
    return v === "facil" || v === "dificil" ? v : "medio";
  });
  const dificuldadeRef = useRef<Dificuldade>(dificuldade);
  useEffect(() => {
    dificuldadeRef.current = dificuldade;
    localStorage.setItem("roleplay:dificuldade", dificuldade);
  }, [dificuldade]);
  const [ttsStatus, setTtsStatus] = useState<"checando" | "online" | "offline">("checando");
  const [localTts, setLocalTts] = useState<LocalTtsConfig>(() => loadLocalTts());
  // Mede a saúde do servidor de voz local para mostrar o status antes da ligação.
  useEffect(() => {
    if (!localTts.enabled || !localTts.url.trim()) {
      setTtsStatus("offline");
      return;
    }
    let cancelado = false;
    setTtsStatus("checando");
    pingLocalTts(localTts).then((ok) => {
      if (!cancelado) setTtsStatus(ok ? "online" : "offline");
    });
    return () => {
      cancelado = true;
    };
  }, [localTts.enabled, localTts.url, localTts.voice]);
  const [showTtsCfg, setShowTtsCfg] = useState(false);
  const [ttsWarn, setTtsWarn] = useState<string | null>(null);
  const localTtsRef = useRef<LocalTtsConfig>(localTts);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const ttsAbortRef = useRef<AbortController | null>(null);
  const speechEpochRef = useRef(0);
  const speechCleanupRef = useRef<(() => void) | null>(null);
  const pendingTimersRef = useRef<Set<number>>(new Set());
  const savedFeedbackRef = useRef<RoleplayFeedback | null>(null);
  const callStartRef = useRef<number | null>(null);
  const finalDuracaoRef = useRef<number | null>(null);
  const messagesRef = useRef<Msg[]>([]);
  useEffect(() => {
    if (callStart) callStartRef.current = callStart;
  }, [callStart]);
  useEffect(() => { pontosFracosRef.current = pontosFracos; }, [pontosFracos]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { convAtivaRef.current = convAtiva; }, [convAtiva]);

  /** Guarda o andamento local para sobreviver a troca de aba, queda de conexão ou recarregamento. */
  function persistirEstado() {
    if (!atendente.trim()) return;
    const convs: Record<number, unknown[]> = { ...convStoreRef.current };
    convs[convAtivaRef.current] = messagesRef.current;
    saveEstadoRoleplay(atendente, {
      convAtiva: convAtivaRef.current,
      cenarios: cenariosRef.current as unknown as Record<number, unknown>,
      convs,
      pontosFracos: pontosFracosRef.current,
    });
  }

  // Salva a cada mudança de mensagem/conversa e também ao esconder a aba ou sair.
  useEffect(() => {
    if (loading) return;
    persistirEstado();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, convAtiva, loading]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const salvar = () => persistirEstado();
    // Ao voltar para a aba, religa o microfone da ligação em andamento (o navegador o desliga).
    const aoVoltar = () => {
      salvar();
      if (document.visibilityState !== "visible") return;
      if (canAutoListen() && !listeningRef.current) {
        window.setTimeout(() => {
          if (canAutoListen() && !listeningRef.current) startListening();
        }, 400);
      }
    };
    window.addEventListener("pagehide", salvar);
    window.addEventListener("beforeunload", salvar);
    document.addEventListener("visibilitychange", aoVoltar);

    return () => {
      window.removeEventListener("pagehide", salvar);
      window.removeEventListener("beforeunload", salvar);
      document.removeEventListener("visibilitychange", aoVoltar);
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  /** Troca de conversa na lista lateral, preservando o histórico de cada uma. */
  async function trocarConversa(i: number) {
    if (i === convAtiva || thinking) return;
    convStoreRef.current[convAtivaRef.current] = messagesRef.current;
    stopAudio();
    stopListening();
    callActiveRef.current = false;
    shouldListenRef.current = false;
    modeRef.current = "texto";
    setMode("texto");
    callStartRef.current = null;
    setCallStart(null);
    setCallElapsed(0);
    feedbackRef.current = null;
    savedFeedbackRef.current = null;
    setFeedback(null);
    setInput("");
    lastSpokenRef.current = "";
    setConvAtiva(i);
    convAtivaRef.current = i;
    const salvas = convStoreRef.current[i];
    if (salvas && salvas.length) {
      const sc = cenariosRef.current[i];
      if (sc) setScenario(sc);
      setMessages(salvas);
      return;
    }
    setMessages([]);
    const sc = await garantirCenario(i);
    if (convAtivaRef.current !== i) return;
    if (sc) setMessages([{ role: "cliente", content: sc.primeira_mensagem }]);
  }
  useEffect(() => { usadoMsRef.current = usadoMs; }, [usadoMs]);
  useEffect(() => { feitasVozRef.current = feitasVoz; }, [feitasVoz]);
  useEffect(() => { feitasTextoRef.current = feitasTexto; }, [feitasTexto]);

  /** Tempo restante do orçamento geral, considerando a sessão atual em andamento. */
  const restanteMs = Math.max(0, LIMITE_MS - usadoMs - callElapsed);
  const semTempo = TRAVA_TEMPO_ATIVA && LIMITE_MS - usadoMs <= 0;
  /** Cota automática desta sessão (20 min ÷ 11 atividades). */
  const cotaMs = cotaSessaoMs(usadoMs);
  const sessaoRestanteMs = Math.max(0, cotaMs - callElapsed);

  // Persiste a sessão de treinamento quando o feedback é gerado
  useEffect(() => {
    if (!feedback || !scenario) return;
    if (savedFeedbackRef.current === feedback) return;
    savedFeedbackRef.current = feedback;
    const startedAt = callStartRef.current;
    const duracao =
      finalDuracaoRef.current ??
      (startedAt ? Math.max(1, Math.round((Date.now() - startedAt) / 1000)) : null);
    if (duracao) setUsadoMs((u) => u + duracao * 1000);
    // Só conta para a meta quando o atendimento alcança a nota mínima.
    if (contaParaMeta(feedback.nota)) {
      if (modeRef.current === "voz") setFeitasVoz((n) => n + 1);
      else setFeitasTexto((n) => n + 1);
    }
    supabase
      .from("coach_roleplay_sessions")
      .insert({
        clinica_id: clinicaId ?? "",
        user_id: ctx.userId,
        atendente,
        nota: Number(feedback.nota) || 0,
        resumo: feedback.resumo,
        acertos: (feedback.acertos ?? []) as never,
        melhorias: (feedback.melhorias ?? []) as never,
        dica_pratica: feedback.dica_pratica,
        cenario: scenario.cenario,
        perfil_cliente: scenario.perfil_cliente,
        pontos_fracos: pontosFracos as never,
        mensagens: messagesRef.current as never,
        duracao_seg: duracao,
        modo: modeRef.current,
      })
      .then(({ error: insErr }) => {
        if (insErr) console.error("Falha ao salvar sessão de roleplay:", insErr);
      });
  }, [feedback, scenario, atendente, clinicaId, ctx.userId, pontosFracos]);

  useEffect(() => {
    localTtsRef.current = localTts;
    saveLocalTts(localTts);
  }, [localTts]);

  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { speakEnabledRef.current = speakEnabled; }, [speakEnabled]);
  useEffect(() => { thinkingRef.current = thinking; }, [thinking]);
  useEffect(() => { feedbackRef.current = feedback; }, [feedback]);
  useEffect(() => { listeningRef.current = listening; }, [listening]);

  useEffect(() => {
    if (!callStart || feedback) return;
    const id = setInterval(() => setCallElapsed(Date.now() - callStart), 500);
    return () => clearInterval(id);
  }, [callStart, feedback]);

  // Trava automática: encerra a sessão ao esgotar a cota dela (ou o total de 20 min)
  // e já gera o feedback, sem a atendente precisar clicar em encerrar.
  useEffect(() => {
    if (!TRAVA_TEMPO_ATIVA) return;
    if (!callStart || feedback || thinking) return;
    const acabouTotal = usadoMs + callElapsed >= LIMITE_MS;
    if (!acabouTotal && callElapsed < cotaMs) return;
    setAvisoPlano(
      acabouTotal
        ? "Seus 20 minutos totais de treinamento acabaram — gerando o feedback final."
        : "Tempo desta atividade concluído — gerando o feedback e emendando a próxima.",
    );
    endCall();
    void send(true);
  }, [callElapsed, callStart, cotaMs, feedback, thinking, usadoMs]);

  /** Reinicia uma sessão limpa no modo indicado, com um cenário novo/diferente. */
  async function novaSessao(m: Mode) {
    feedbackRef.current = null;
    savedFeedbackRef.current = null;
    setFeedback(null);
    setInput("");
    finalDuracaoRef.current = null;
    lastSpokenRef.current = "";
    if (m === "voz") {
      const idxVoz = META_WHATSAPP + Math.min(feitasVozRef.current, META_LIGACOES - 1);
      convAtivaRef.current = idxVoz;
      setConvAtiva(idxVoz);
      delete convStoreRef.current[idxVoz];
      const sc = await garantirCenario(idxVoz);
      if (sc) setMessages([{ role: "cliente", content: sc.primeira_mensagem }]);
      startCall();
      return;
    }
    stopAudio();
    stopListening();
    callActiveRef.current = false;
    shouldListenRef.current = false;
    modeRef.current = "texto";
    setMode("texto");
    callStartRef.current = null;
    setCallStart(null);
    setCallElapsed(0);
    // Avança para a próxima conversa livre da fila
    const prox = Math.min(feitasTextoRef.current, META_WHATSAPP - 1);
    delete convStoreRef.current[prox];
    setConvAtiva(prox);
    convAtivaRef.current = prox;
    setMessages([]);
    const sc = await garantirCenario(prox);
    if (convAtivaRef.current !== prox) return;
    if (sc) setMessages([{ role: "cliente", content: sc.primeira_mensagem }]);
  }

  // Contagem regressiva para emendar a próxima atividade do plano
  useEffect(() => {
    if (!feedback) {
      setProximoEm(null);
      return;
    }
    if (TRAVA_TEMPO_ATIVA && LIMITE_MS - usadoMsRef.current <= 0) {
      setProximoEm(null);
      return;
    }
    setProximoEm(AUTO_AVANCO_SEG);
    const id = setInterval(() => setProximoEm((v) => (v === null ? null : v - 1)), 1000);
    return () => clearInterval(id);
  }, [feedback]);

  useEffect(() => {
    if (proximoEm === null || proximoEm > 0) return;
    setProximoEm(null);
    const prox = proximaAtividade(feitasVozRef.current, feitasTextoRef.current);
    if (prox === "prova" || (TRAVA_TEMPO_ATIVA && LIMITE_MS - usadoMsRef.current <= 0)) {
      // Trilha concluída: não abre a prova sozinha, a atendente decide pelo botão.
      return;
    }
    void novaSessao(prox);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proximoEm]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const SR =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setVoiceSupported(false);
    }
  }, []);

  function stopAudio() {
    // Invalida callbacks de falas anteriores e limpa timers pendentes
    speechEpochRef.current += 1;
    speakingRef.current = false;
    setFalando(false);
    try {
      speechCleanupRef.current?.();
    } catch {
      // ignore
    }
    speechCleanupRef.current = null;
    pendingTimersRef.current.forEach((id) => window.clearTimeout(id));
    pendingTimersRef.current.clear();
    try {
      ttsAbortRef.current?.abort();
    } catch {
      // ignore
    }
    ttsAbortRef.current = null;
    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.src = "";
      } catch {
        // ignore
      }
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    if (typeof window !== "undefined" && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore
      }
    }
  }

  function later(fn: () => void, ms: number) {
    const id = window.setTimeout(() => {
      pendingTimersRef.current.delete(id);
      fn();
    }, ms);
    pendingTimersRef.current.add(id);
    return id;
  }

  function speak(text: string, onDone?: () => void) {
    if (!speakEnabled || typeof window === "undefined") {
      onDone?.();
      return;
    }
    stopAudio();
    speakingRef.current = true;
    setFalando(true);
    const epoch = speechEpochRef.current;
    const guarded = () => {
      if (epoch !== speechEpochRef.current) return;
      speakingRef.current = false;
      setFalando(false);
      onDone?.();
    };
    const cfg = localTtsRef.current;
    const nome = NOMES_PACIENTES[convAtivaRef.current % NOMES_PACIENTES.length] ?? "";
    const voz = vozPorNome(nome);
    // Voz definida pela gestora no painel admin (por atividade e personagem).
    const escolha = escolhaDaVoz(
      vozConfigRef.current,
      modeRef.current === "texto" ? "whatsapp" : "ligacao",
      voz === VOZ_MASCULINA ? "masculino" : "feminino",
    );
    const provedor = escolha.provedor;
    const temPiper = cfg.enabled && Boolean(cfg.url.trim());
    if (provedor === "piper" && !temPiper) {
      speakBrowser(text, guarded);
      return;
    }
    if (provedor !== "auto" || temPiper) {
      speakLocal(text, { ...cfg, voice: escolha.piper || voz }, guarded, provedor, escolha.gemini);
      return;
    }
    speakBrowser(text, guarded);
  }

  // TTS local (Piper / Coqui): o áudio vem pelo backend (evita CORS no navegador).
  // Se o proxy falhar, tenta direto do navegador e por último a voz nativa.
  function speakLocal(
    text: string,
    cfg: LocalTtsConfig,
    onDone?: () => void,
    provedor: VozProvedor = "auto",
    vozGemini?: string,
  ) {
    const controller = new AbortController();
    ttsAbortRef.current = controller;

    const playBlob = (blob: Blob) => {
      if (controller.signal.aborted) return;
      setTtsWarn(null);
      const url = URL.createObjectURL(blob);
      audioUrlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.playbackRate = TTS_PLAYBACK_RATE;
      audio.preservesPitch = true;
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        onDone?.();
      };
      audio.onended = finish;
      audio.onerror = () => {
        setTtsWarn("Não foi possível tocar o áudio do TTS local.");
        finish();
      };
      audio.play().catch(() => {
        setTtsWarn("O navegador bloqueou o áudio. Interaja com a página e tente de novo.");
        finish();
      });
    };

    // Rota de streaming própria: o backend busca o WAV no seu servidor e
    // entrega aqui, então o <audio> toca sem CORS e sem base64.
    const viaProxy = async () => {
      const usaPiper = provedor === "auto" || provedor === "piper";
      const qs = new URLSearchParams({ text, provedor });
      if (usaPiper && cfg.url.trim()) qs.set("url", cfg.url);
      if (cfg.voice.trim()) qs.set("voice", cfg.voice.trim());
      if (vozGemini) qs.set("vozgemini", vozGemini);
      const { data: sess } = await supabase.auth.getSession();
      const res = await fetch(`/api/coach/tts?${qs.toString()}`, {
        signal: controller.signal,
        headers: { Authorization: `Bearer ${sess.session?.access_token}` },
      });
      if (res.status === 204) {
        throw new Error(res.headers.get("X-Tts-Error") || "servidor local inacessível");
      }
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      const blob = await res.blob();
      if (blob.size < 256) throw new Error("áudio vazio");
      return blob.type.startsWith("audio") ? blob : new Blob([blob], { type: "audio/wav" });
    };

    viaProxy()
      .catch(async (proxyErr) => {
        if (controller.signal.aborted) throw proxyErr;
        console.warn("TTS proxy falhou, tentando direto", proxyErr);
        if (provedor === "gemini" || provedor === "openai") throw proxyErr;
        return fetchLocalTtsAudio(text, cfg, controller.signal);
      })
      .then((blob) => playBlob(blob))
      .catch((e) => {
        if (controller.signal.aborted) return;
        console.error("TTS local", e);
        if (provedor === "gemini" || provedor === "openai") {
          setTtsWarn("A voz da plataforma não respondeu — usando a voz do navegador.");
          speakBrowser(text, onDone);
          return;
        }
        // Último recurso antes da voz nativa: tocar a URL direta no <audio>.
        // O elemento de mídia não exige CORS, então funciona quando o fetch é bloqueado.
        playDirectUrl(
          text,
          cfg,
          controller,
          onDone,
          e instanceof Error ? e.message : "Falha no TTS local",
        );
      });
  }

  function playDirectUrl(
    text: string,
    cfg: LocalTtsConfig,
    controller: AbortController,
    onDone: (() => void) | undefined,
    prevError: string,
  ) {
    if (controller.signal.aborted) return;
    try {
      const audio = new Audio(buildLocalTtsUrl(text, cfg));
      audioRef.current = audio;
      audio.playbackRate = TTS_PLAYBACK_RATE;
      audio.preservesPitch = true;
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        onDone?.();
      };
      audio.oncanplay = () => setTtsWarn(null);
      audio.onended = finish;
      audio.onerror = () => {
        if (done || controller.signal.aborted) return;
        done = true;
        setTtsWarn(`${prevError} — usando a voz do navegador.`);
        speakBrowser(text, onDone);
      };
      audio.play().catch(() => {
        if (done || controller.signal.aborted) return;
        done = true;
        setTtsWarn(`${prevError} — usando a voz do navegador.`);
        speakBrowser(text, onDone);
      });
    } catch {
      setTtsWarn(`${prevError} — usando a voz do navegador.`);
      speakBrowser(text, onDone);
    }
  }

  function speakBrowser(text: string, onDone?: () => void) {
    if (!speakEnabled || typeof window === "undefined") {
      onDone?.();
      return;
    }
    const synth = window.speechSynthesis;
    if (!synth) {
      onDone?.();
      return;
    }
    try {
      synth.cancel();
    } catch {
      // ignore
    }
    // Chunk longer text — Chrome silently drops utterances > ~200 chars
    // and often never fires onend.
    const chunks = chunkForSpeech(text);
    let done = false;
    let watchdog: ReturnType<typeof setTimeout> | null = null;
    let keepAlive: ReturnType<typeof setInterval> | null = null;
    const finish = () => {
      if (done) return;
      done = true;
      if (watchdog) clearTimeout(watchdog);
      if (keepAlive) clearInterval(keepAlive);
      onDone?.();
    };
    speechCleanupRef.current = () => {
      done = true;
      if (watchdog) clearTimeout(watchdog);
      if (keepAlive) clearInterval(keepAlive);
    };
    // Chrome bug: synth pauses after ~15s. resume() periodically keeps it alive.
    keepAlive = setInterval(() => {
      try {
        if (synth.speaking && !synth.paused) {
          synth.pause();
          synth.resume();
        }
      } catch {
        // ignore
      }
    }, 10000);
    // Hard fallback: 0.09s por caractere + 2s de folga
    const estimatedMs = Math.max(3000, text.length * 90 + 2000);
    watchdog = setTimeout(() => {
      try {
        synth.cancel();
      } catch {
        // ignore
      }
      finish();
    }, estimatedMs);
    try {
      const pickVoice = () => {
        const voices = synth.getVoices();
        return (
          voices.find((v) => /pt[-_]BR/i.test(v.lang)) ||
          voices.find((v) => /^pt/i.test(v.lang)) ||
          null
        );
      };
      let idx = 0;
      const speakNext = () => {
        if (done) return;
        if (idx >= chunks.length) {
          finish();
          return;
        }
        const u = new SpeechSynthesisUtterance(chunks[idx++]);
        u.lang = "pt-BR";
        u.rate = 1.1;
        u.pitch = 1.0;
        const v = pickVoice();
        if (v) u.voice = v;
        u.onend = () => speakNext();
        u.onerror = () => speakNext();
        synth.speak(u);
      };
      // Se as vozes ainda não carregaram, aguarda uma vez
      if (synth.getVoices().length === 0 && "onvoiceschanged" in synth) {
        let voiceKickStarted = false;
        const kick = () => {
          if (voiceKickStarted) return;
          voiceKickStarted = true;
          synth.onvoiceschanged = null;
          speakNext();
        };
        synth.onvoiceschanged = kick;
        setTimeout(kick, 500);
      } else {
        speakNext();
      }
    } catch (e) {
      console.error("TTS (Web Speech) error", e);
      finish();
    }
  }

  // Fala a última mensagem do paciente e só então devolve o microfone à atendente,
  // evitando que as duas vozes se atropelem ou que o mic capture o próprio áudio.
  useEffect(() => {
    if (mode !== "voz") return;
    const last = [...messages].reverse().find((m) => m.role === "cliente");
    if (last && last.content !== lastSpokenRef.current) {
      lastSpokenRef.current = last.content;
      // Desliga a escuta antes de o paciente falar (sem perder a intenção de ouvir depois)
      stopListening({ keepIntent: true });
      speak(last.content, () => {
        if (
          modeRef.current === "voz" &&
          callActiveRef.current &&
          shouldListenRef.current &&
          !thinkingRef.current &&
          !feedbackRef.current &&
          !listeningRef.current
        ) {
          // Pequena folga para o áudio terminar de esvaziar antes de abrir o mic
          later(() => {
            if (canAutoListen() && !listeningRef.current) startListening();
          }, 150);
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, mode, speakEnabled]);

  useEffect(() => {
    return () => {
      stopAudio();
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  function setListeningState(value: boolean) {
    listeningRef.current = value;
    setListening(value);
  }

  function canAutoListen() {
    return (
      modeRef.current === "voz" &&
      callActiveRef.current &&
      shouldListenRef.current &&
      !thinkingRef.current &&
      !feedbackRef.current &&
      // Nunca escuta enquanto o paciente está falando (evita eco e falas atropeladas)
      !speakingRef.current
    );
  }

  function limparSilencio() {
    if (silenceTimerRef.current !== null) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }

  function startListening() {
    if (listeningRef.current || recognitionStartingRef.current || !canAutoListen()) return;
    const SR =
      typeof window !== "undefined"
        ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        : null;
    if (!SR) {
      setError("Reconhecimento de voz não suportado neste navegador. Use Chrome/Edge no desktop.");
      return;
    }
    const rec = recognitionRef.current ?? new SR();
    if (!recognitionRef.current) {
      rec.lang = "pt-BR";
      rec.interimResults = true;
      // Contínuo: a atendente pode fazer pausas naturais dentro da mesma fala
      rec.continuous = true;
      recognitionRef.current = rec;
    }
    let finalText = "";
    let interimText = "";
    let shouldRestartAfterEnd = true;
    limparSilencio();

    // Fecha a fala da atendente ~900ms após ela parar de falar, em vez de
    // esperar o navegador encerrar sozinho — é o que deixava o paciente lento.
    const agendarFechamento = () => {
      limparSilencio();
      silenceTimerRef.current = window.setTimeout(() => {
        silenceTimerRef.current = null;
        if (!(finalText || interimText).trim()) return;
        try {
          rec.stop?.();
        } catch {
          // ignore
        }
      }, 900);
    };

    rec.onresult = (ev: any) => {
      let interim = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) finalText += `${r[0].transcript} `;
        else interim += r[0].transcript;
      }
      interimText = interim;
      setInput((finalText + interim).trim());
      agendarFechamento();
    };
    rec.onspeechend = () => agendarFechamento();
    rec.onerror = (ev: any) => {
      recognitionStartingRef.current = false;
      limparSilencio();
      if (ev.error && ev.error !== "no-speech") {
        shouldRestartAfterEnd = false;
      }
      if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
        shouldListenRef.current = false;
        setError("O navegador bloqueou o microfone. Toque em Retomar mic para continuar.");
      } else if (ev.error && ev.error !== "no-speech" && ev.error !== "aborted") {
        setError(`Erro do microfone: ${ev.error}`);
      }
      setListeningState(false);
    };
    rec.onend = () => {
      recognitionStartingRef.current = false;
      limparSilencio();
      setListeningState(false);
      const text = (finalText || interimText || "").trim();
      if (text) {
        setInput(text);
        sendWithText(text);
      } else if (shouldRestartAfterEnd && canAutoListen()) {
        // Nada capturado: reinicia escuta para manter a ligação contínua
        later(() => {
          if (canAutoListen()) startListening();
        }, 250);
      }
    };
    try {
      recognitionStartingRef.current = true;
      rec.start();
      setListeningState(true);
      setError(null);
    } catch (e) {
      recognitionStartingRef.current = false;
      if (recognitionRef.current === rec) recognitionRef.current = null;
      setListeningState(false);
      setError(e instanceof Error ? e.message : "Não foi possível iniciar o microfone.");
    }
  }

  function stopListening(options: { keepIntent?: boolean } = {}) {
    if (!options.keepIntent) shouldListenRef.current = false;
    limparSilencio();
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    try {
      if (rec) {
        rec.onresult = null;
        rec.onend = null;
        rec.onerror = null;
        rec.onspeechend = null;
        rec.abort?.();
        rec.stop?.();
      }
    } catch {
      // ignore
    }
    pendingTimersRef.current.forEach((id) => window.clearTimeout(id));
    pendingTimersRef.current.clear();
    recognitionStartingRef.current = false;
    setListeningState(false);
  }

  function toggleMic() {
    if (listening || recognitionStartingRef.current) {
      stopListening();
    } else {
      callActiveRef.current = true;
      shouldListenRef.current = true;
      // Se o paciente estiver falando, a atendente interrompe e assume a fala
      stopAudio();
      setFalando(false);
      startListening();
    }
  }

  function startCall() {
    if (TRAVA_TEMPO_ATIVA && LIMITE_MS - usadoMsRef.current <= 0) {
      setError("Seus 20 minutos totais de treinamento já foram usados.");
      return;
    }
    // Zera a conversa: em ligação, quem se apresenta primeiro é a atendente
    stopAudio();
    stopListening({ keepIntent: true });
    callActiveRef.current = true;
    shouldListenRef.current = true;
    modeRef.current = "voz";
    lastSpokenRef.current = "";
    setMessages([]);
    setInput("");
    setFeedback(null);
    finalDuracaoRef.current = null;
    callStartRef.current = Date.now();
    setCallStart(Date.now());
    setCallElapsed(0);
    setMode("voz");
    later(() => startListening(), 200);
  }

  // Volta para o modo voz mantendo a conversa que já existe
  function resumeCall() {
    stopAudio();
    stopListening({ keepIntent: true });
    callActiveRef.current = true;
    shouldListenRef.current = true;
    modeRef.current = "voz";
    setInput("");
    setMode("voz");
    if (!callStartRef.current) {
      setCallStart(Date.now());
      setCallElapsed(0);
    }
    later(() => startListening(), 200);
  }

  function endCall() {
    /* encerra a ligação */
    callActiveRef.current = false;
    shouldListenRef.current = false;
    if (callStartRef.current) {
      const decorrido = Math.max(1, Math.round((Date.now() - callStartRef.current) / 1000));
      finalDuracaoRef.current = TRAVA_TEMPO_ATIVA
        ? Math.min(Math.max(1, Math.round(cotaSessaoMs(usadoMsRef.current) / 1000)), decorrido)
        : decorrido;
    }
    stopAudio();
    stopListening();
    setCallStart(null);
  }

  /** Anexa o micro-feedback do treinador à última mensagem da atendente. */
  function aplicarAvaliacaoTurno(av: TurnoAvaliacao) {
    setMessages((m) => {
      const idx = [...m].reverse().findIndex((x) => x.role === "atendente");
      if (idx < 0) return m;
      const real = m.length - 1 - idx;
      const copia = [...m];
      copia[real] = { ...copia[real], avaliacao: av };
      return copia;
    });
  }

  async function sendWithText(text: string) {
    if (!scenario || thinkingRef.current || feedbackRef.current) return;
    if (TRAVA_TEMPO_ATIVA && LIMITE_MS - usadoMsRef.current <= 0) return;
    const t = text.trim();
    if (!t) return;
    setError(null);
    if (!callStartRef.current) {
      callStartRef.current = Date.now();
      setCallStart(callStartRef.current);
      setCallElapsed(0);
    }
    const nextHistory: Msg[] = [...messages, { role: "atendente", content: t }];
    setMessages(nextHistory);
    setInput("");
    thinkingRef.current = true;
    setThinking(true);
    try {
      const r = await reply({
        data: {
          atendente,
          pontos_fracos: pontosFracos,
          scripts: scriptsRef.current || undefined,
          tabela: CATALOGO_RESUMO,
          cenario: scenario.cenario,
          perfil_cliente: scenario.perfil_cliente,
          history: nextHistory.slice(-60),
          dificuldade: dificuldadeRef.current,
          encerrar: false,
        },
      });
      if (r.avaliacao_turno) aplicarAvaliacaoTurno(r.avaliacao_turno);
      if (r.finalizar && r.feedback) {
        feedbackRef.current = r.feedback;
        setFeedback(r.feedback);
        callActiveRef.current = false;
        shouldListenRef.current = false;
      } else if (r.resposta_cliente) {
        setMessages((m) => [...m, { role: "cliente", content: r.resposta_cliente! }]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao enviar mensagem.");
      // Em modo voz, mantém a ligação: tenta ouvir de novo após 500ms
      if (canAutoListen()) {
        later(() => {
          if (canAutoListen()) startListening();
        }, 500);
      }
    } finally {
      thinkingRef.current = false;
      setThinking(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      try {
        // Restaura primeiro o que já está no aparelho. Não bloqueia a retomada em
        // nenhuma consulta online, inclusive a configuração da clínica.
        const salvo = loadEstadoRoleplay(atendente);
        let salvoRestaurado = false;
        if (salvo && salvo.cenarios && Object.keys(salvo.cenarios).length) {
          cenariosRef.current = salvo.cenarios as Record<number, RoleplayScenario>;
          convStoreRef.current = (salvo.convs ?? {}) as Record<number, Msg[]>;
          const idx = salvo.convAtiva ?? 0;
          const scSalvo = cenariosRef.current[idx];
          if (scSalvo) {
            salvoRestaurado = true;
            setConvAtiva(idx);
            convAtivaRef.current = idx;
            setScenario(scSalvo);
            const msgs = convStoreRef.current[idx] ?? [];
            setMessages(
              msgs.length ? msgs : [{ role: "cliente", content: scSalvo.primeira_mensagem }],
            );
            if (salvo.pontosFracos?.length) {
              pontosFracosRef.current = salvo.pontosFracos;
              setPontosFracos(salvo.pontosFracos);
            }
            setLoading(false);
          }
        }

        // Só um treinamento novo precisa aguardar scripts e serviços da clínica.
        // Um treinamento restaurado já pode ser usado enquanto isso carrega.
        if (clinicaLoading) return;

        // Soma o tempo já consumido em treinamentos anteriores (orçamento geral de 20 min)
        const { data: sess } = await supabase
          .from("coach_roleplay_sessions")
          .select("duracao_seg,modo,nota")
          .eq("clinica_id", clinicaId ?? "")
          .eq("atendente", atendente)
          // Orçamento de tempo e metas reiniciam a cada dia.
          .gte("created_at", inicioDoDiaRio())
          .limit(1000);
        if (!cancelled) {
          const total = (sess ?? []).reduce(
            (acc, s) => acc + (s.duracao_seg ?? 0) * 1000,
            0,
          );
          usadoMsRef.current = total;
          setUsadoMs(total);
          const validas = (sess ?? []).filter((s) => contaParaMeta(s.nota as number));
          const nVoz = validas.filter((s) => (s.modo ?? "voz") === "voz").length;
          const nTexto = validas.filter((s) => s.modo === "texto").length;
          feitasVozRef.current = nVoz;
          feitasTextoRef.current = nTexto;
          setFeitasVoz(nVoz);
          setFeitasTexto(nTexto);
        }
        const { data, error: qErr } = await supabase
          .from("coach_analises")
          .select("resultado,pontuacao")
          .eq("clinica_id", clinicaId ?? "")
          .eq("atendente", atendente)
          .order("created_at", { ascending: false })
          .limit(20);
        if (qErr) throw qErr;
        const linhas = data ?? [];

        // Pontos fracos padrão de conversão, usados quando ainda não há análises
        const FRACOS_PADRAO = [
          "Não oferece horário específico para fechar o agendamento",
          "Não confirma nome e telefone do paciente",
          "Não informa valor e forma de pagamento com segurança",
          "Não contorna objeção de preço",
          "Não explica preparo do exame",
          "Encerra a conversa sem agendar",
        ];

        const negs = linhas.flatMap(
          (d) => (d.resultado as { pontos_negativos?: string[] })?.pontos_negativos ?? [],
        );
        const recorrentes = topRecurring(negs).slice(0, 6);
        const fracos = recorrentes.length > 0 ? recorrentes : FRACOS_PADRAO;

        // Usa até 5 atendimentos reais como base do cenário
        const exemplos = linhas.slice(0, 5).map((d) => {
          const r = (d.resultado ?? {}) as {
            resumo?: string;
            transcricao?: string;
            pontos_negativos?: string[];
            frases_destaque?: { tipo: string; trecho: string }[];
          };
          return {
            resumo: r.resumo?.slice(0, 2000),
            transcricao: r.transcricao?.slice(0, 8000),
            pontos_negativos: (r.pontos_negativos ?? []).slice(0, 10),
            frases_negativas: (r.frases_destaque ?? [])
              .filter((f) => f.tipo === "negativa")
              .map((f) => f.trecho.slice(0, 800))
              .slice(0, 10),
          };
        });

        bootArgsRef.current = { fracos, exemplos };
        setPontosFracos(fracos);

        // A conversa já foi exibida antes das consultas; os dados acima apenas
        // atualizaram metas e argumentos usados ao abrir um novo paciente.
        if (salvoRestaurado) return;

        const proxAtiv = proximaAtividade(feitasVozRef.current, feitasTextoRef.current);
        const idxInicial =
          proxAtiv === "voz"
            ? META_WHATSAPP + Math.min(feitasVozRef.current, META_LIGACOES - 1)
            : Math.min(feitasTextoRef.current, META_WHATSAPP - 1);

        const sc = await start({
          data: {
            atendente,
            pontos_fracos: fracos,
            exemplos,
            scripts: scriptsRef.current || undefined,
            tabela: tabelaRef.current,
            contexto: contextoTreino(idxInicial),
            evitar: itensEvitar(atendente),
            seed: `${Date.now().toString(36)}-${idxInicial}-${Math.random().toString(36).slice(2, 8)}`,
            dificuldade: dificuldadeRef.current,
          },
        });
        if (cancelled) return;
        cenariosRef.current[idxInicial] = sc;
        registrarUsados(atendente, [
          sc.nome_paciente,
          sc.primeira_mensagem?.slice(0, 90),
          sc.cenario?.slice(0, 90),
        ]);
        setConvAtiva(idxInicial);
        convAtivaRef.current = idxInicial;
        setPontosFracos(fracos);
        setScenario(sc);
        setMessages([{ role: "cliente", content: sc.primeira_mensagem }]);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Erro ao iniciar treinamento.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    boot();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atendente, start, clinicaLoading, clinicaId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, thinking, feedback]);

  // Ao entrar, já começa a atividade da vez (ligação, conversa ou prova)
  const autoIniciadoRef = useRef(false);
  useEffect(() => {
    if (loading || !scenario || autoIniciadoRef.current) return;
    autoIniciadoRef.current = true;
    if (TRAVA_TEMPO_ATIVA && LIMITE_MS - usadoMsRef.current <= 0) return;
    const prox = proximaAtividade(feitasVozRef.current, feitasTextoRef.current);
    // WhatsApp (texto) primeiro; ligações começam só quando as conversas terminarem.
    // Só inicia ligação se a conversa ativa for de voz (evita atropelar um chat retomado).
    if (prox === "voz" && voiceSupported && convAtivaRef.current >= META_WHATSAPP)
      later(() => startCall(), 400);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, scenario, voiceSupported]);

  async function send(encerrar = false) {
    if (!scenario || thinkingRef.current || feedbackRef.current) return;
    const text = input.trim();
    if (!encerrar && !text) return;
    setError(null);
    if (!encerrar && !callStartRef.current) {
      callStartRef.current = Date.now();
      setCallStart(callStartRef.current);
      setCallElapsed(0);
    }

    const nextHistory: Msg[] = encerrar && !text
      ? messages
      : [...messages, { role: "atendente", content: text }];
    if (!encerrar || text) {
      setMessages(nextHistory);
      setInput("");
    }
    thinkingRef.current = true;
    setThinking(true);
    try {
      const r = await reply({
        data: {
          atendente,
          pontos_fracos: pontosFracos,
          scripts: scriptsRef.current || undefined,
          tabela: CATALOGO_RESUMO,
          cenario: scenario.cenario,
          perfil_cliente: scenario.perfil_cliente,
          history: nextHistory.slice(-60),
          encerrar,
        },
      });
      if (r.avaliacao_turno) aplicarAvaliacaoTurno(r.avaliacao_turno);
      if (r.finalizar && r.feedback) {
        feedbackRef.current = r.feedback;
        setFeedback(r.feedback);
        callActiveRef.current = false;
        shouldListenRef.current = false;
      } else if (r.resposta_cliente) {
        setMessages((m) => [...m, { role: "cliente", content: r.resposta_cliente! }]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao enviar mensagem.");
    } finally {
      thinkingRef.current = false;
      setThinking(false);
    }
  }

  return (
    <div className="bg-gradient-to-b from-secondary/40 to-background">
      {/* Modo foco: barra fina no lugar do banner, como um softphone */}
      <header
        className="sticky top-0 z-30 px-3 py-2 text-white shadow-[var(--shadow-soft)]"
        style={{ backgroundImage: "var(--gradient-hero)" }}
      >
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <Link
            to="/app/coach"
            aria-label="Sair do treinamento"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white/90 hover:bg-white/20"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <GraduationCap className="h-4 w-4 shrink-0 text-white/80" />
          <h1 className="font-display truncate text-sm font-semibold">
            Treinamento de {atendente}
          </h1>
          <span className="ml-auto hidden md:inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider backdrop-blur">
            <Sparkles className="h-3 w-3" /> Simulação
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-3 md:px-4 pt-3 pb-24 relative z-10 space-y-4">
        {loading ? (
          <div className="rounded-3xl border bg-card p-10 text-center shadow-[var(--shadow-card)]">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
            <p className="mt-3 text-sm text-muted-foreground">
              Montando um cenário focado nos pontos fracos…
            </p>
          </div>
        ) : error && !scenario ? (
          <div className="rounded-3xl border bg-card p-8 shadow-[var(--shadow-card)]">
            <h2 className="font-semibold text-lg">Não foi possível iniciar</h2>
            <p className="text-sm text-muted-foreground mt-1">{error}</p>
            <Link to="/app/coach" className="mt-4 inline-block text-primary text-sm">
              ← Voltar para análises
            </Link>
          </div>
        ) : scenario ? (
          <>
            {/* Cronômetro sempre visível: tempo desta sessão + restante do total de 20 min */}
            <div className="sticky top-2 z-20 rounded-2xl border bg-card/95 backdrop-blur px-4 py-3 shadow-[var(--shadow-card)]">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {TRAVA_TEMPO_ATIVA ? "Tempo desta atividade" : "Tempo desta sessão"}
                  </div>
                  <div className="text-2xl font-bold tabular-nums text-foreground flex items-center gap-2">
                    {callStart && !feedback && (
                      <span className="h-2 w-2 rounded-full bg-[color:var(--success)] animate-pulse" />
                    )}
                    {formatDuration(TRAVA_TEMPO_ATIVA ? sessaoRestanteMs : callElapsed)}
                  </div>
                  {TRAVA_TEMPO_ATIVA && (
                    <div className="text-[11px] text-muted-foreground">
                      de {formatDuration(cotaMs)} · {formatDuration(callElapsed)} usados
                    </div>
                  )}
                </div>
                {TRAVA_TEMPO_ATIVA && (
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Restante do total (20 min)
                  </div>
                  <div
                    className={`text-2xl font-bold tabular-nums ${
                      restanteMs <= 2 * 60 * 1000 ? "text-destructive" : "text-primary"
                    }`}
                  >
                    {formatDuration(restanteMs)}
                  </div>
                </div>
                )}
              </div>
              {TRAVA_TEMPO_ATIVA && (
              <div className="mt-2 h-2 w-full rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{
                    width: `${Math.min(100, ((usadoMs + callElapsed) / LIMITE_MS) * 100)}%`,
                  }}
                />
              </div>
              )}
              {TRAVA_TEMPO_ATIVA ? (
              <div className="mt-1 text-[11px] text-muted-foreground">
                {formatDuration(Math.min(LIMITE_MS, usadoMs + callElapsed))} de 20 min usados ·
                WhatsApp {Math.min(feitasTexto, META_WHATSAPP)}/{META_WHATSAPP} · ligações{" "}
                {Math.min(feitasVoz, META_LIGACOES)}/{META_LIGACOES} · os 20 min são divididos
                automaticamente entre as {META_LIGACOES + META_WHATSAPP} conversas e a prova (
                {formatDuration(COTA_ATIVIDADE_MS)} cada)
              </div>
              ) : (
              <div className="mt-1 text-[11px] text-muted-foreground">
                Sem limite de tempo · WhatsApp {Math.min(feitasTexto, META_WHATSAPP)}/
                {META_WHATSAPP} · ligações {Math.min(feitasVoz, META_LIGACOES)}/
                {META_LIGACOES} · só conta com nota {NOTA_MINIMA} ou mais
              </div>
              )}
              {avisoPlano && (
                <div className="mt-2 text-[11px] text-primary">{avisoPlano}</div>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground mr-1">Dificuldade:</span>
                {DIFICULDADES.map((d) => (
                  <button
                    key={d.valor}
                    type="button"
                    title={d.descricao}
                    onClick={() => setDificuldade(d.valor)}
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      dificuldade === d.valor
                        ? "bg-primary text-primary-foreground border-transparent"
                        : "text-muted-foreground hover:bg-secondary"
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
                <span className="text-[11px] text-muted-foreground">
                  vale para a próxima conversa
                </span>
              </div>
              {feitasTexto >= META_WHATSAPP && (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
                  {feitasVoz < META_LIGACOES ? (
                    <>
                      <p className="text-xs text-muted-foreground mr-auto">
                        Conversas de WhatsApp concluídas. Próxima etapa: as {META_LIGACOES}{" "}
                        ligações ({Math.min(feitasVoz, META_LIGACOES)}/{META_LIGACOES} feitas).
                      </p>
                      <Button
                        size="sm"
                        className="rounded-full bg-primary hover:bg-primary-deep text-primary-foreground"
                        disabled={thinking || gerandoCenario}
                        onClick={() => {
                          setProximoEm(null);
                          novaSessao("voz");
                        }}
                      >
                        <PhoneCall className="h-4 w-4 mr-2" />
                        {feitasVoz === 0 ? "Iniciar as ligações" : "Próxima ligação"}
                      </Button>
                    </>
                  ) : (
                    <>
                      <p className="text-xs text-muted-foreground mr-auto">
                        Trilha concluída: {META_WHATSAPP} conversas e {META_LIGACOES} ligações.
                      </p>
                      <Button
                        size="sm"
                        className="rounded-full bg-primary hover:bg-primary-deep text-primary-foreground"
                        onClick={() => {
                          setProximoEm(null);
                          navigate({ to: "/app/coach/prova/$nome", params: { nome } });
                        }}
                      >
                        <Sparkles className="h-4 w-4 mr-2" /> Ir para a prova
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>
            <div className="rounded-3xl border bg-card p-5 md:p-6 shadow-[var(--shadow-card)]">
              <div className="grid md:grid-cols-3 gap-4 text-sm">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                    Cenário
                  </div>
                  <p className="text-foreground/90">{scenario.cenario}</p>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                    Cliente
                  </div>
                  <p className="text-foreground/90">{scenario.perfil_cliente}</p>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                    Objetivo
                  </div>
                  <p className="text-foreground/90">{scenario.objetivo}</p>
                </div>
              </div>
              {pontosFracos.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {pontosFracos.map((p) => (
                    <Badge
                      key={p}
                      variant="outline"
                      className="text-[11px] border-destructive/20 bg-destructive/5 text-destructive"
                    >
                      foco: {p.slice(0, 60)}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div className="grid gap-4 lg:grid-cols-[290px_1fr] items-start">
              <ChatList
                feitas={Math.min(feitasTexto, META_WHATSAPP)}
                total={META_WHATSAPP}
                digitando={thinking}
                ativo={mode === "texto" && !feedback}
                atualIndex={convAtiva}
                onSelect={trocarConversa}
                bloqueado={thinking}
                ultima={
                  [...messages].reverse().find((m) => m.role === "cliente")?.content ??
                  "Aguardando você iniciar…"
                }
              />
            <div className="rounded-3xl border bg-card shadow-[var(--shadow-card)] overflow-hidden flex flex-col">
              {/* Barra de contato estilo WhatsApp */}
              <div
                className="flex items-center gap-3 px-4 py-2.5 text-white"
                style={{ backgroundColor: "var(--wa-header)" }}
              >
                <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                  <User className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold leading-tight">
                    {NOMES_PACIENTES[convAtiva % NOMES_PACIENTES.length]} (simulação)
                  </div>
                  <div className="truncate text-[11px] text-white/75 leading-tight">
                    {gerandoCenario
                      ? "abrindo conversa…"
                      : thinking
                      ? "digitando…"
                      : mode === "voz"
                        ? callStart
                          ? `em ligação · ${formatDuration(callElapsed)}`
                          : "online"
                        : "online"}
                  </div>
                </div>
                <PhoneCall
                  className={`h-4 w-4 shrink-0 ${mode === "voz" && callStart ? "text-[color:var(--accent-bright)]" : "text-white/70"}`}
                />
              </div>
              <div className="flex items-center justify-between gap-2 border-b bg-secondary/30 px-4 py-2">
                <div className="inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
                  {mode === "texto" ? (
                    <>
                      <Keyboard className="h-3.5 w-3.5 text-primary" /> Conversa de WhatsApp
                    </>
                  ) : (
                    <>
                      <Mic className="h-3.5 w-3.5 text-primary" /> Ligação por voz
                    </>
                  )}
                </div>
                {mode === "texto" && TRAVA_TEMPO_ATIVA && (
                  <div
                    className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 text-primary px-2.5 py-1 text-xs font-semibold tabular-nums"
                    title="Tempo restante do total de 20 minutos de treinamento"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                    {formatDuration(restanteMs)} restantes de 20 min
                  </div>
                )}
                {mode === "voz" && (
                  <div className="flex items-center gap-3">
                    {callStart && (
                      <div
                        className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--success)]/10 text-[color:var(--success)] px-2.5 py-1 text-xs font-semibold tabular-nums"
                        title="Duração desta ligação"
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--success)] animate-pulse" />
                        {formatDuration(callElapsed)}
                      </div>
                    )}
                    {TRAVA_TEMPO_ATIVA && (
                    <div
                      className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 text-primary px-2.5 py-1 text-xs font-semibold tabular-nums"
                      title="Tempo restante do total de 20 minutos de treinamento"
                    >
                      {formatDuration(restanteMs)} restantes de 20 min
                    </div>
                    )}
                  <button
                    type="button"
                    onClick={() => {
                      const next = !speakEnabled;
                      setSpeakEnabled(next);
                      if (!next) stopAudio();
                    }}
                    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                    title={speakEnabled ? "Silenciar cliente" : "Ativar voz do cliente"}
                  >
                    {speakEnabled ? (
                      <>
                        <Volume2 className="h-3.5 w-3.5" /> Voz do cliente
                      </>
                    ) : (
                      <>
                        <VolumeX className="h-3.5 w-3.5" /> Mudo
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowTtsCfg((v) => !v)}
                    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                    title="Configurar TTS local"
                  >
                    <Settings2 className="h-3.5 w-3.5" />
                    {localTts.enabled ? "TTS local" : "Voz navegador"}
                  </button>
                  {localTts.enabled && (
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        ttsStatus === "online"
                          ? "bg-[color:var(--success)]/15 text-[color:var(--success)]"
                          : ttsStatus === "offline"
                            ? "bg-destructive/10 text-destructive"
                            : "bg-secondary text-muted-foreground"
                      }`}
                      title={
                        ttsStatus === "offline"
                          ? "Seu servidor de voz não respondeu — a voz do navegador assume automaticamente."
                          : "Servidor de voz local"
                      }
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      {ttsStatus === "online"
                        ? "voz local ok"
                        : ttsStatus === "offline"
                          ? "voz local off"
                          : "verificando"}
                    </span>
                  )}
                  </div>
                )}
              </div>
              {mode === "voz" && showTtsCfg && (
                <div className="border-b bg-secondary/20 px-4 py-3 space-y-2">
                  <label className="flex items-center gap-2 text-xs font-medium">
                    <input
                      type="checkbox"
                      checked={localTts.enabled}
                      onChange={(e) =>
                        setLocalTts((c) => ({ ...c, enabled: e.target.checked }))
                      }
                    />
                    Usar meu TTS local (Piper / Coqui)
                  </label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input
                      value={localTts.url}
                      onChange={(e) => setLocalTts((c) => ({ ...c, url: e.target.value }))}
                      placeholder="https://meu-servidor/api/tts"
                      className="text-xs"
                    />
                    <Input
                      value={localTts.voice}
                      onChange={(e) => setLocalTts((c) => ({ ...c, voice: e.target.value }))}
                      placeholder="Voz (ex.: Miro)"
                      className="text-xs"
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    O áudio é gerado pelo seu servidor, entregue pelo nosso backend (sem precisar de
                    CORS) e tocado aqui. Se falhar, caímos na voz do navegador.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => speak("Alô, bom dia. Estou testando a minha voz.")}
                  >
                    Testar voz
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="ml-2"
                    onClick={async () => {
                      setTtsWarn("Testando conexão com o seu servidor...");
                      try {
                        const qs = new URLSearchParams({
                          probe: "1",
                          url: localTts.url,
                          voice: localTts.voice,
                        });
                        const { data: sess } = await supabase.auth.getSession();
                        const r = await fetch(`/api/coach/tts?${qs.toString()}`, {
                          headers: {
                            Authorization: `Bearer ${sess.session?.access_token}`,
                          },
                        });
                        const j = (await r.json()) as { ok: boolean; motivo?: string };
                        setTtsWarn(
                          j.ok
                            ? "Servidor de voz local acessível."
                            : `Servidor de voz local indisponível: ${j.motivo ?? "sem resposta"}`,
                        );
                      } catch {
                        setTtsWarn("Não foi possível testar a conexão.");
                      }
                    }}
                  >
                    Diagnosticar servidor
                  </Button>
                  {ttsWarn && <p className="text-[11px] text-destructive">{ttsWarn}</p>}
                </div>
              )}
              <div
                ref={scrollRef}
                className="wa-chat-bg px-3 py-5 space-y-1.5 min-h-[420px] max-h-[60vh] overflow-y-auto"
              >
                <div className="mx-auto mb-3 w-fit rounded-lg bg-white/70 px-2.5 py-1 text-[10px] text-muted-foreground shadow-sm">
                  Hoje
                </div>
                {messages.map((m, i) => (
                  <Bubble key={i} msg={m} />
                ))}
                {thinking && (
                  <div className="flex justify-start">
                    <div className="wa-bubble-in rounded-lg px-3 py-2 shadow-sm">
                      <span className="wa-bubble-in-tail" />
                      <span className="flex gap-1">
                        {[0, 150, 300].map((d) => (
                          <span
                            key={d}
                            className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce"
                            style={{ animationDelay: `${d}ms` }}
                          />
                        ))}
                      </span>
                    </div>
                  </div>
                )}
                {feedback && <FeedbackCard fb={feedback} />}
              </div>

              {!feedback && (
                <div
                  className="border-t p-3 md:p-4"
                  style={{ backgroundColor: "var(--wa-composer)" }}
                >
                  {error && (
                    <div className="mb-2 text-xs text-destructive">{error}</div>
                  )}
                  {mode === "texto" ? (
                  <div className="flex items-end gap-2">
                    <Textarea
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          send();
                        }
                      }}
                      placeholder="Digite uma mensagem"
                      className="min-h-[48px] max-h-40 resize-none rounded-3xl border-transparent bg-card px-4 py-3 shadow-sm focus-visible:ring-1"
                    />
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        onClick={() => send(false)}
                        disabled={thinking || !input.trim() || semTempo}
                        size="icon"
                        className="h-11 w-11 rounded-full bg-[color:var(--accent-bright)] hover:bg-primary text-white shadow-md"
                      >
                        <Send className="h-5 w-5" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-11 w-11 rounded-full bg-card"
                        onClick={() => send(true)}
                        disabled={thinking || messages.filter((m) => m.role === "atendente").length === 0}
                        title="Encerrar e receber feedback"
                      >
                        <Flag className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3 py-3">
                      {!callStart ? (
                        <>
                          <button
                            type="button"
                            onClick={startCall}
                            className="relative h-20 w-20 rounded-full flex items-center justify-center text-white bg-[color:var(--success)] hover:opacity-90 transition shadow-lg"
                            title="Iniciar ligação"
                          >
                            <PhoneCall className="h-8 w-8" />
                          </button>
                          <div className="text-xs text-muted-foreground text-center">
                            Toque para atender. Você se apresenta primeiro.
                          </div>
                        </>
                      ) : (
                        <>
                          <div
                            className={`relative h-20 w-20 rounded-full flex items-center justify-center text-white transition shadow-lg ${
                              listening
                                ? "bg-destructive animate-pulse"
                                : thinking
                                  ? "bg-muted-foreground"
                                  : "bg-primary"
                            }`}
                          >
                            {listening ? (
                              <Mic className="h-8 w-8" />
                            ) : thinking ? (
                              <Loader2 className="h-8 w-8 animate-spin" />
                            ) : (
                              <Volume2 className="h-8 w-8" />
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground text-center min-h-[1.25rem]">
                            {thinking
                              ? "Cliente pensando…"
                              : listening
                                ? input
                                  ? `"${input}"`
                                  : "Ouvindo… pode falar"
                                : falando
                                  ? "Cliente falando…"
                                  : "Aguardando…"}
                          </div>
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={toggleMic}
                              disabled={thinking}
                            >
                              {listening ? (
                                <><MicOff className="h-4 w-4 mr-1.5" /> Pausar mic</>
                              ) : (
                                <><Mic className="h-4 w-4 mr-1.5" /> Retomar mic</>
                              )}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                endCall();
                                send(true);
                              }}
                              disabled={thinking || messages.filter((m) => m.role === "atendente").length === 0}
                            >
                              <PhoneOff className="h-4 w-4 mr-1.5" /> Encerrar ligação
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                  <p className="mt-2 text-[11px] text-muted-foreground text-center">
                    {semTempo
                      ? "Seus 20 minutos totais de treinamento já foram usados."
                      : mode === "texto"
                        ? "Enter envia · Shift+Enter quebra linha · sem limite de tempo"
                        : "Ligação contínua · você se apresenta primeiro · sem limite de tempo"}
                  </p>
                </div>
              )}

              {feedback && (
                <div className="border-t bg-card p-4 flex flex-wrap gap-2 justify-end">
                  {proximoEm !== null && (
                    <p className="mr-auto text-xs text-muted-foreground self-center">
                      {proximaAtividade(feitasVoz, feitasTexto) === "prova"
                        ? `Abrindo a prova em ${proximoEm}s…`
                        : proximaAtividade(feitasVoz, feitasTexto) === "voz"
                          ? `Próxima ligação começa em ${proximoEm}s…`
                          : `Próxima conversa de WhatsApp começa em ${proximoEm}s…`}
                    </p>
                  )}
                  {proximoEm !== null && (
                    <Button variant="ghost" onClick={() => setProximoEm(null)}>
                      Pausar
                    </Button>
                  )}
                  <Link to="/app/coach">
                    <Button variant="outline">Voltar</Button>
                  </Link>
                  <Button
                    onClick={() => {
                      setProximoEm(null);
                      const prox = proximaAtividade(feitasVozRef.current, feitasTextoRef.current);
                      if (prox === "prova") {
                        navigate({ to: "/app/coach/prova/$nome", params: { nome } });
                        return;
                      }
                      novaSessao(prox);
                    }}
                    className="bg-primary hover:bg-primary-deep text-primary-foreground"
                  >
                    <Sparkles className="h-4 w-4 mr-2" /> Continuar agora
                  </Button>
                </div>
              )}
             </div>
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}

const NOMES_PACIENTES = [
  "Paciente · Maria Souza",
  "Paciente · João Batista",
  "Paciente · Cláudia Lima",
  "Paciente · Rafael Nunes",
  "Paciente · Sônia Alves",
];

/** Lista de conversas estilo WhatsApp: mostra as 5 conversas aguardando resposta. */
function ChatList({
  feitas,
  total,
  ativo,
  digitando,
  ultima,
  atualIndex,
  onSelect,
  bloqueado,
}: {
  feitas: number;
  total: number;
  ativo: boolean;
  digitando: boolean;
  ultima: string;
  atualIndex: number;
  onSelect: (i: number) => void;
  bloqueado: boolean;
}) {
  const hora = new Date().toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
  const atual = Math.min(Math.max(atualIndex, 0), total - 1);
  const pendentes = Math.max(0, total - feitas - (ativo ? 1 : 0));
  return (
    <aside className="rounded-3xl border bg-card shadow-[var(--shadow-card)] overflow-hidden">
      <div
        className="flex items-center justify-between px-4 py-2.5 text-white"
        style={{ backgroundColor: "var(--wa-header)" }}
      >
        <span className="text-sm font-semibold">Conversas</span>
        <span className="rounded-full bg-[color:var(--accent-bright)] px-2 py-0.5 text-[11px] font-bold text-white">
          {pendentes + (ativo ? 1 : 0)} na fila
        </span>
      </div>
      <ul className="divide-y max-h-[60vh] overflow-y-auto">
        {Array.from({ length: total }).map((_, i) => {
          const concluida = i < feitas;
          const atendendo = i === atual;
          const emAtendimento = atendendo && ativo;
          return (
            <li key={i}>
             <button
              type="button"
              onClick={() => onSelect(i)}
              disabled={bloqueado}
              className={`flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-secondary/40 disabled:cursor-not-allowed disabled:opacity-70 ${
                atendendo ? "bg-secondary/50" : "bg-card"
              }`}
             >
              <div className="relative h-11 w-11 shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="h-5 w-5 text-primary" />
                {!concluida && !atendendo && (
                  <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-[color:var(--accent-bright)] ring-2 ring-card" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold">
                    {NOMES_PACIENTES[i % NOMES_PACIENTES.length]}
                  </span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">{hora}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`truncate text-xs ${
                      concluida ? "text-muted-foreground" : "text-foreground/80"
                    }`}
                  >
                    {concluida
                      ? "✓✓ Atendimento finalizado"
                        : emAtendimento
                        ? digitando
                          ? "digitando…"
                          : ultima
                        : atendendo
                          ? ultima
                          : "Aguardando sua resposta"}
                  </span>
                  {!concluida && !atendendo && (
                    <span className="shrink-0 rounded-full bg-[color:var(--accent-bright)] px-1.5 text-[10px] font-bold text-white">
                      1
                    </span>
                  )}
                </div>
              </div>
             </button>
            </li>
          );
        })}
      </ul>
      <div className="border-t bg-secondary/30 px-3 py-2 text-[11px] text-muted-foreground">
        {feitas}/{total} conversas concluídas · toque em qualquer conversa para alternar
      </div>
    </aside>
  );
}

function Bubble({ msg }: { msg: Msg }) {
  const isCliente = msg.role === "cliente";
  const [hora] = useState(() =>
    new Date().toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    }),
  );
  const partes = splitEmMensagens(msg.content);
  return (
    <div className="space-y-0.5">
      {partes.map((parte, i) => {
        const ultima = i === partes.length - 1;
        return (
          <div
            key={i}
            className={`flex px-1 ${isCliente ? "justify-start" : "justify-end"}`}
          >
            <div
              className={`relative max-w-[80%] rounded-lg px-2.5 pt-1.5 pb-1 text-[14px] leading-[1.35] text-foreground shadow-sm ${
                isCliente ? "wa-bubble-in ml-2" : "wa-bubble-out mr-2"
              }`}
            >
              {ultima && (
                <span
                  className={isCliente ? "wa-bubble-in-tail" : "wa-bubble-out-tail"}
                />
              )}
              <span className="whitespace-pre-wrap break-words">{parte}</span>
              <span className="float-right ml-2 mt-1 flex items-center gap-0.5 text-[10px] text-muted-foreground/80">
                {hora}
                {!isCliente && (
                  <CheckCheck className="h-3 w-3 text-[color:var(--wa-tick)]" />
                )}
              </span>
            </div>
          </div>
        );
      })}
      {!isCliente && msg.avaliacao && (
        <AvaliacaoTurnoCard av={msg.avaliacao} />
      )}
    </div>
  );
}

const NIVEL_ESTILO: Record<
  TurnoAvaliacao["nivel"],
  { bg: string; label: string; icon: string }
> = {
  bom: { bg: "border-emerald-300 bg-emerald-50 text-emerald-900", label: "Boa resposta", icon: "✓" },
  atencao: { bg: "border-amber-300 bg-amber-50 text-amber-900", label: "Dá para melhorar", icon: "!" },
  ruim: { bg: "border-rose-300 bg-rose-50 text-rose-900", label: "Corrigir", icon: "×" },
};

/** Micro-feedback do treinador exibido logo abaixo da resposta da atendente. */
function AvaliacaoTurnoCard({ av }: { av: TurnoAvaliacao }) {
  const est = NIVEL_ESTILO[av.nivel] ?? NIVEL_ESTILO.atencao;
  return (
    <div className="flex justify-end px-1 pb-1 pt-0.5">
      <div
        className={`max-w-[80%] rounded-lg border px-2.5 py-1.5 text-[11.5px] leading-snug shadow-sm ${est.bg}`}
      >
        <p className="font-semibold">
          <span className="mr-1">{est.icon}</span>
          {est.label}
        </p>
        <p className="mt-0.5">{av.comentario}</p>
        {av.sugestao && (
          <p className="mt-1 italic opacity-90">Melhor assim: “{av.sugestao}”</p>
        )}
      </div>
    </div>
  );
}

/**
 * Quebra um texto em várias mensagens curtas, como uma pessoa escreve no
 * WhatsApp: primeiro por linhas, depois por frases (juntando frases curtas).
 */
function splitEmMensagens(texto: string, maxChars = 160): string[] {
  const linhas = texto
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const partes: string[] = [];
  for (const linha of linhas) {
    if (linha.length <= maxChars) {
      partes.push(linha);
      continue;
    }
    const frases = linha.match(/[^.!?…]+[.!?…]*\s*/g) ?? [linha];
    let atual = "";
    for (const frase of frases) {
      const f = frase.trim();
      if (!f) continue;
      if (atual && (atual + " " + f).length > maxChars) {
        partes.push(atual);
        atual = f;
      } else {
        atual = atual ? `${atual} ${f}` : f;
      }
    }
    if (atual) partes.push(atual);
  }
  return partes.length ? partes : [texto];
}

function FeedbackCard({ fb }: { fb: RoleplayFeedback }) {
  const nota = Math.max(0, Math.min(10, Number(fb.nota) || 0));
  const cor =
    nota >= 8 ? "var(--success)" : nota >= 5 ? "oklch(0.78 0.16 85)" : "var(--destructive)";
  return (
    <div className="mt-4 rounded-2xl border bg-card p-5 shadow-[var(--shadow-soft)]">
      <div className="flex items-center gap-3 mb-3">
        <div
          className="h-12 w-12 rounded-xl flex items-center justify-center font-bold text-lg text-white"
          style={{ background: cor }}
        >
          {nota.toFixed(1)}
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Feedback do treinamento
          </div>
          <p className="font-medium leading-snug">{fb.resumo}</p>
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        <div className="rounded-xl border bg-success/5 border-success/20 p-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[color:var(--success)] mb-1.5">
            <ThumbsUp className="h-3.5 w-3.5" /> Acertos
          </div>
          <ul className="text-sm space-y-1.5">
            {fb.acertos.map((a, i) => (
              <li key={i} className="flex gap-2">
                <span className="h-1.5 w-1.5 mt-1.5 rounded-full bg-[color:var(--success)] shrink-0" />
                <span>{a}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border bg-destructive/5 border-destructive/20 p-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-destructive mb-1.5">
            <ThumbsDown className="h-3.5 w-3.5" /> A melhorar
          </div>
          <ul className="text-sm space-y-1.5">
            {fb.melhorias.map((a, i) => (
              <li key={i} className="flex gap-2">
                <span className="h-1.5 w-1.5 mt-1.5 rounded-full bg-destructive shrink-0" />
                <span>{a}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="mt-3 rounded-xl border bg-secondary/40 p-3 flex gap-2">
        <Lightbulb className="h-4 w-4 text-primary-deep shrink-0 mt-0.5" />
        <p className="text-sm">
          <span className="font-semibold">Dica prática: </span>
          {fb.dica_pratica}
        </p>
      </div>
    </div>
  );
}

function topRecurring(items: string[]): string[] {
  const map = new Map<string, number>();
  const repr = new Map<string, string>();
  for (const it of items) {
    const key = it.toLowerCase().slice(0, 60);
    map.set(key, (map.get(key) ?? 0) + 1);
    if (!repr.has(key)) repr.set(key, it);
  }
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => repr.get(k)!)
    .filter(Boolean);
}

function formatDuration(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

// Quebra o texto em pedaços curtos (~180 chars) em fronteiras de sentença/vírgula
// para evitar o bug do Chrome que trava utterances longas.
function chunkForSpeech(text: string, max = 180): string[] {
  const clean = text.trim();
  if (clean.length <= max) return [clean];
  const parts = clean.split(/(?<=[.!?…])\s+|(?<=[,;:])\s+/);
  const out: string[] = [];
  let buf = "";
  for (const p of parts) {
    if ((buf + " " + p).trim().length > max && buf) {
      out.push(buf.trim());
      buf = p;
    } else {
      buf = buf ? buf + " " + p : p;
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out.length ? out : [clean];
}