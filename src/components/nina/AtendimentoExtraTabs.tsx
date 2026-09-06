import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useHoverTolerante } from "@/hooks/use-hover-tolerante";
import {
  ListaRespostasRapidas,
  useRespostasFiltradas,
  useRespostasRapidas,
} from "@/components/nina/RespostasRapidas";
import { registrarUsoResposta } from "@/lib/atendimento/respostas-rapidas.functions";
import {
  aplicarVariaveis,
  detectarComandoNoTexto,
  primeiroNome,
  substituirTrecho,
  type ComandoDigitado,
  type ContextoVariaveis,
  type RespostaRapida,
} from "@/lib/atendimento/respostas-rapidas";
import { confirmDialog } from "@/lib/confirm";
import { normalizarNomeBusca } from "@/lib/busca-texto";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  EVENTO_FILTRAR_NAO_ATRIBUIDAS,
  FILTRO_NAO_ATRIBUIDAS_KEY,
} from "@/components/nina/BannerNaoAtribuidas";
import {
  ABRIR_CONVERSA_KEY,
  EVENTO_ABRIR_CONVERSA,
  EVENTO_FILTRAR_ESPERA_CRITICA,
  FILTRO_ESPERA_CRITICA_KEY,
} from "@/lib/atendimento/central-atencao";
import { faixaEsperaAtd, minutosDesde } from "@/lib/atendimento/espera";


import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Send,
  Search,
  Loader2,
  UserCheck,
  Eye,
  ArrowRightLeft,
  CheckCircle2,
  Plus,
  Pencil,
  Trash2,
  Clock,
  AlertTriangle,
  Users,
  FileText,
  Phone,
  MessageSquare,
  Circle,
  Coffee,
  PowerOff,
  Lock,
  Unlock,
  CalendarPlus,
  Pin,
  PinOff,
  Zap,
} from "lucide-react";
import { useClinica } from "@/hooks/use-clinica";
import { useAuth } from "@/hooks/use-auth";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import {
  cursorMaisRecente,
  mesclarNovas,
  mesclarEventos,
  podeAtualizarIncremental,
} from "@/lib/atendimento/atualizacao-incremental";
import { useChatScroll } from "@/hooks/use-chat-scroll";
import { rotuloNovasMensagens } from "@/lib/atendimento/scroll-chat";

import {
  mesclarEspera,
  mesclarListaConversas,
  ordenarPorRecentes,
} from "@/lib/atendimento/inbox-merge";
import {
  ConversationSystemEvent,
  type ConversaEvento,
} from "@/components/nina/ConversationSystemEvent";
import { DateInputBR } from "@/components/ui/date-input-br";
import {
  listarConversas,
  obterConversa,
  souGestorAtendimento,
  contarConversasInbox,
  listarMensagensConversa,
  enviarMensagemConversa,
  obterDadosContato,
  listarEventosConversa,
  transferirConversa,
  fecharConversa,
  listarNotas,
  criarNota,
  listarDepartamentos,
  listarUsuariosClinica,
  supervisaoLive,
  relatorioAtendimento,
  listarRoutingRules,
  salvarRoutingRule,
  excluirRoutingRule,
  travarMinhaFila,
  iniciarPausa,
  finalizarPausa,
  pausaAtual,
  listarPauseReasons,
  meuStatusAgente,
  devolverParaNina,
  definirPresenca,
  esperaConversas,
  assumirConversa,
} from "@/lib/atendimento.functions";
import { FilaHumana } from "@/components/nina/FilaHumana";
import { destinoConversa } from "@/lib/atendimento/abrir-conversa";
import { AgendaConversaDrawer } from "@/components/nina/AgendaConversaDrawer";
import { ConversaSkeleton, ContatoSkeleton } from "@/components/nina/ConversaSkeleton";
import {
  conversasDesatualizadas,
  criarCacheConversas,
  respostaAindaVale,
} from "@/lib/atendimento/conversa-cache";
import { criarPrefetchStore, chavePrefetch } from "@/lib/atendimento/prefetch-cache";

import { CacheContatos, planoAberturaContato } from "@/lib/atendimento/contato-cache";
import {
  JANELA_INICIAL,
  JANELA_ANTERIOR,
  mesclarAnteriores,
  podeCarregarMais,
  cursorMaisAntigo,
} from "@/lib/atendimento/mensagens-janela";
import { criarMedidorConversa, type MedidorConversa } from "@/lib/atendimento/perf-conversa";
import { iniciarTroca, marcarTroca, medirRequest } from "@/lib/atendimento/perf-troca";
import { useNavigate, useParams } from "@tanstack/react-router";
import {
  acaoPermitida,
  gravarRascunho,
  lerRascunho,
  limparRascunho,
  type Rascunhos,
} from "@/lib/atendimento/rascunhos-conversa";
import { ResumoHandoffCard } from "@/components/nina/ResumoHandoffCard";
import { ReportarErroNinaBotao } from "@/components/nina/ReportarErroNinaDialog";
import { BadgeEspera, RelogioEsperaProvider } from "@/components/nina/BadgeEspera";
import { formatarDataHoraMensagem } from "@/lib/atendimento/data-hora";
import { ESCOPO_INBOX_PADRAO, type EscopoInbox } from "@/lib/atendimento/escopo-inbox";
import { devoAutoSelecionarComUrl, escopoParaConversa } from "@/lib/atendimento/deep-link";
import {
  avisoSaidaEscopo,
  devoAutoSelecionar,
  type LinhaInbox,
} from "@/lib/atendimento/inbox-realtime";
import {
  ajustarContadorAtual,
  chaveInbox,
  filtrarPorEscopo,
  idsQueSairam,
  selecaoDeveSair,
  type ContadoresInbox,
} from "@/lib/atendimento/inbox-cache";


function fmtHora(s?: string | null) {
  if (!s) return "";
  return formatarDataHoraMensagem(s);
}
function fmtData(s?: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleString("pt-BR");
}
function fmtSeg(s?: number | null) {
  if (s == null) return "—";
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}min`;
  return `${(s / 3600).toFixed(1)}h`;
}

/* ============================================================
 *  INBOX UNIFICADO — 3 colunas
 * ========================================================== */
export function AtendInbox() {
  const { clinicaAtual } = useClinica();
  const clinicaId = clinicaAtual?.clinica_id;

  const listarConvs = useServerFn(listarConversas);
  const souGestorFn = useServerFn(souGestorAtendimento);
  const contarInboxFn = useServerFn(contarConversasInbox);
  const listarMsgs = useServerFn(listarMensagensConversa);
  const enviarMsg = useServerFn(enviarMensagemConversa);
  const obterContato = useServerFn(obterDadosContato);
  const transferirFn = useServerFn(transferirConversa);
  const fecharFn = useServerFn(fecharConversa);
  const listarNotasFn = useServerFn(listarNotas);
  const listarEventosFn = useServerFn(listarEventosConversa);
  const criarNotaFn = useServerFn(criarNota);
  const listarDeptosFn = useServerFn(listarDepartamentos);
  const listarUsuariosFn = useServerFn(listarUsuariosClinica);
  const travarFilaFn = useServerFn(travarMinhaFila);
  const devolverFn = useServerFn(devolverParaNina);
  const iniciarPausaFn = useServerFn(iniciarPausa);
  const finalizarPausaFn = useServerFn(finalizarPausa);
  const pausaAtualFn = useServerFn(pausaAtual);
  const listarReasonsFn = useServerFn(listarPauseReasons);
  const meuStatusFn = useServerFn(meuStatusAgente);
  const presencaFn = useServerFn(definirPresenca);
  const esperaFn = useServerFn(esperaConversas);
  const assumirFn = useServerFn(assumirConversa);
  const obterConversaFn = useServerFn(obterConversa);
  const { user } = useAuth();
  const meuId = user?.id ?? null;
  const podeAtender = usePodeEscrever("nina");

  const [convs, setConvs] = useState<any[]>([]);
  const [sel, setSel] = useState<any>(null);
  const [msgs, setMsgs] = useState<any[]>([]);
  const [eventos, setEventos] = useState<ConversaEvento[]>([]);
  const [contato, setContato] = useState<any>(null);
  const [notas, setNotas] = useState<any[]>([]);
  // Id da conversa a que o conteúdo carregado pertence. A tela central só
  // renderiza mensagens/contato/notas/eventos quando este id é exatamente o
  // da conversa selecionada.
  const [conversaCarregadaId, setConversaCarregadaId] = useState<string | null>(null);
  // FASE 3 — acesso direto por URL negado pelo backend (sem permissão ou id
  // inexistente). Mostra aviso no lugar do chat, nunca um loading infinito.
  const [erroAcesso, setErroAcesso] = useState<string | null>(null);
  // FASE 2 — caminho crítico: o chat abre assim que as MENSAGENS da conversa
  // selecionada chegam. Contato, notas e eventos entram depois, cada um com
  // seu próprio indicador, sem segurar a conversa.
  const [secundariosCarregadosId, setSecundariosCarregadosId] = useState<string | null>(null);
  const selIdRef = useRef<string | null>(null);
  selIdRef.current = sel?.id ?? null;
  // A conversa aberta é lida por referência dentro da recarga da lista: assim
  // abrir uma conversa não recria a função e não dispara recargas em cadeia.
  const selRef = useRef<any>(null);
  selRef.current = sel;
  const conteudoDaConversa = !!sel?.id && conversaCarregadaId === sel.id;
  const dadosSecundariosProntos = !!sel?.id && secundariosCarregadosId === sel.id;
  // Contato exibido: só o da conversa aberta agora. Ter `contato` preenchido
  // não basta — ele pode ser o do paciente anterior enquanto o novo carrega.
  const contatoAtual = dadosSecundariosProntos ? contato : null;
  // Enquanto a conversa selecionada não terminou de carregar, todas as ações
  // dependentes do conversation_id ficam bloqueadas.
  const carregandoConversa = !!sel?.id && !conteudoDaConversa;
  const [deptos, setDeptos] = useState<any[]>([]);
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<
    "all" | "active" | "waiting" | "closed" | "bot_attending"
  >("all");
  // Escopo da Inbox: por padrão "Minhas conversas" (somente as atribuídas ao
  // atendente logado). O filtro é aplicado no backend.
  const [escopo, setEscopo] = useState<EscopoInbox>(ESCOPO_INBOX_PADRAO);
  const [souGestor, setSouGestor] = useState(false);
  // Contagem própria de cada filtro (nunca reaproveita o número de outro).
  const [contadores, setContadores] = useState<Record<string, number>>({
    minhas: 0,
    nina: 0,
    nao_atribuidas: 0,
    fechadas: 0,
    equipe: 0,
  });
  const soNaoAtribuidas = escopo === "nao_atribuidas";
  const setSoNaoAtribuidas = (v: boolean) => setEscopo(v ? "nao_atribuidas" : ESCOPO_INBOX_PADRAO);
  // FASE 1 — a URL manda: /app/nina/<conversation_id> define qual conversa
  // está aberta. O clique só navega; a seleção vem sempre do endereço.
  const navigate = useNavigate();
  const rotaParams = useParams({ strict: false }) as { conversationId?: string };
  const conversaIdUrl = rotaParams?.conversationId ?? null;
  const abrirPelaUrl = useCallback(
    (id: string | null, replace = false) => {
      // Função central (Fase 5): todo módulo abre conversa por este caminho.
      void navigate(destinoConversa(id, { replace }) as any);
    },
    [navigate],
  );

  // Leitura do endereço dentro de callbacks, sem recriá-los a cada navegação.
  const conversaIdUrlRef = useRef<string | null>(conversaIdUrl);
  useEffect(() => {
    conversaIdUrlRef.current = conversaIdUrl;
  }, [conversaIdUrl]);
  // Conversas já buscadas por link direto (evita repetir a busca em loop).
  const deepLinkTentado = useRef<Set<string>>(new Set());
  // Conversa aberta por link enquanto o filtro correspondente ainda carrega:
  // ela não pode ser removida da tela por uma resposta do filtro antigo.
  const deepLinkPendente = useRef<string | null>(null);

  // Filtro "somente espera crítica" — acionado pela Central de Atenção.
  const [soCriticas, setSoCriticas] = useState(false);
  // Ordenação da lista: recentes (padrão) ou quem espera há mais tempo.
  const [ordem, setOrdem] = useState<"recentes" | "espera">("recentes");
  // conversaId -> instante da 1ª mensagem do paciente ainda sem resposta.
  const [espera, setEspera] = useState<Record<string, string>>({});
  // Sequenciais das recargas: descartam respostas fora de ordem (uma mensagem
  // nova dispara vários eventos de Realtime quase ao mesmo tempo).
  const seqConvs = useRef(0);
  // Um pedido por conversa: respostas superadas ou de conversa anterior são
  // descartadas. Cache por conversation_id evita tela vazia ao reabrir.
  const seqConversa = useRef(0);
  const cacheConversas = useRef(criarCacheConversas(10));
  // FASE 4 — cache por ["contact", contactId]: o mesmo paciente aparece na
  // hora em qualquer conversa vinculada, sem lookup por telefone.
  const cacheContatos = useRef(new CacheContatos<any>());
  // Janela de mensagens carregadas da conversa aberta (cresce ao pedir o
  // histórico antigo) + prefetch em andamento + medição de desempenho.
  const janelaRef = useRef(JANELA_INICIAL);
  // FASE 2 — buscas de pré-carregamento em andamento. Elas são reaproveitadas
  // quando o lead é clicado antes de o pré-carregamento terminar e param de
  // valer quando a conversa muda ou a clínica/usuário troca.
  const prefetchMsgs = useRef(criarPrefetchStore<any[]>());
  const prefetchTimers = useRef<Map<string, number>>(new Map());

  // Espelho do que está na tela, usado pela atualização incremental.
  const msgsRef = useRef<any[]>([]);
  const conversaCarregadaRef = useRef<string | null>(null);
  const medidor = useRef<MedidorConversa | null>(null);
  // Falha ao carregar as mensagens: a tela mostra o aviso em vez de fingir
  // que a conversa está vazia (e o cache não guarda lista vazia).
  const [erroMsgs, setErroMsgs] = useState(false);
  const [temMaisAntigas, setTemMaisAntigas] = useState(false);

  const [carregandoAntigas, setCarregandoAntigas] = useState(false);
  const seqEspera = useRef(0);
  const convsVisiveis: any[] = (() => {
    let base = convs;
    if (soCriticas) {
      base = base.filter(
        (c: any) => faixaEsperaAtd(minutosDesde(espera[c.id])) === "critico",
      );
    }
    if (ordem !== "espera") return base;
    return [...base].sort((a: any, b: any) => {
      const ta = espera[a.id] ? new Date(espera[a.id]).getTime() : Infinity;
      const tb = espera[b.id] ? new Date(espera[b.id]).getTime() : Infinity;
      return ta - tb;
    });
  })();
  useEffect(() => {
    const ativar = () => setSoNaoAtribuidas(true);
    const ativarCriticas = () => {
      setSoCriticas(true);
      setOrdem("espera");
    };
    try {
      if (window.sessionStorage.getItem(FILTRO_NAO_ATRIBUIDAS_KEY) === "1") {
        window.sessionStorage.removeItem(FILTRO_NAO_ATRIBUIDAS_KEY);
        setSoNaoAtribuidas(true);
      }
      if (window.sessionStorage.getItem(FILTRO_ESPERA_CRITICA_KEY) === "1") {
        window.sessionStorage.removeItem(FILTRO_ESPERA_CRITICA_KEY);
        ativarCriticas();
      }
    } catch {
      /* sem armazenamento: só o evento abaixo aciona o filtro */
    }
    window.addEventListener(EVENTO_FILTRAR_NAO_ATRIBUIDAS, ativar);
    window.addEventListener(EVENTO_FILTRAR_ESPERA_CRITICA, ativarCriticas);
    return () => {
      window.removeEventListener(EVENTO_FILTRAR_NAO_ATRIBUIDAS, ativar);
      window.removeEventListener(EVENTO_FILTRAR_ESPERA_CRITICA, ativarCriticas);
    };
  }, []);


  // Rascunho por conversa: o texto digitado para um paciente nunca aparece
  // no campo de outro.
  const [rascunhos, setRascunhos] = useState<Rascunhos>({});
  const draft = lerRascunho(rascunhos, sel?.id ?? null);
  const setDraft = useCallback(
    (valor: string | ((anterior: string) => string)) => {
      const id = selIdRef.current;
      setRascunhos((prev) => {
        const atual = lerRascunho(prev, id);
        const texto = typeof valor === "function" ? valor(atual) : valor;
        return texto ? gravarRascunho(prev, id, texto) : limparRascunho(prev, id);
      });
    },
    [],
  );
  /**
   * Limpa o rascunho de UMA conversa específica (a de origem da ação), mesmo
   * que a atendente já tenha aberto outra enquanto o envio terminava.
   */
  const limparRascunhoDe = useCallback((id: string) => {
    setRascunhos((prev) => limparRascunho(prev, id));
  }, []);
  const [enviando, setEnviando] = useState(false);
  const [novaNota, setNovaNota] = useState("");
  const [transferOpen, setTransferOpen] = useState(false);
  const [agendaOpen, setAgendaOpen] = useState(false);
  const [buscaAgente, setBuscaAgente] = useState("");
  const [fecharOpen, setFecharOpen] = useState(false);
  // Começa fechada: só entra em "online" depois de ler o status real gravado,
  // senão a tela avisaria "ONLINE" ao abrir e receberia conversas sem querer.
  const [filaAberta, setFilaAberta] = useState<boolean>(false);
  const [statusCarregado, setStatusCarregado] = useState(false);
  const [pausaAtiva, setPausaAtiva] = useState<any>(null);
  const [pauseReasons, setPauseReasons] = useState<any[]>([]);
  const [pausaDialogOpen, setPausaDialogOpen] = useState(false);
  const [pausaReasonSel, setPausaReasonSel] = useState<string>("");
  // Painel esquerdo: encolhe ao tirar o mouse, expande ao passar; pode ser fixado.
  // O hover usa zona de tolerância + atraso e não recolhe durante arrasto da
  // barra de rolagem (ver use-hover-tolerante).
  const [painelFixado, setPainelFixado] = useState(false);
  // Enquanto um menu suspenso da coluna estiver aberto o painel não pode
  // encolher: o menu é renderizado fora do painel, o mouse "sai" da coluna e
  // a lista sumia embaixo do menu.
  const [painelMenuAberto, setPainelMenuAberto] = useState(false);
  const { ref: painelRef, dentro: painelHover } = useHoverTolerante<HTMLDivElement>({
    ativo: !painelFixado,
  });
  const painelAberto = painelFixado || painelHover || painelMenuAberto;


  useEffect(() => {
    try {
      setPainelFixado(localStorage.getItem("nina.inbox.fixado") === "1");
    } catch {}
  }, []);
  const alternarFixado = () => {
    setPainelFixado((v) => {
      const nv = !v;
      try {
        localStorage.setItem("nina.inbox.fixado", nv ? "1" : "0");
      } catch {}
      return nv;
    });
  };
  // Painel direito (Contato): mesmo comportamento de encolher/expandir/fixar.
  const [contatoFixado, setContatoFixado] = useState(false);
  const { ref: contatoRef, dentro: contatoHover } = useHoverTolerante<HTMLDivElement>({
    ativo: !contatoFixado,
  });
  const contatoAberto = contatoFixado || contatoHover;
  useEffect(() => {
    try {
      setContatoFixado(localStorage.getItem("nina.contato.fixado") === "1");
    } catch {}
  }, []);
  const alternarContatoFixado = () => {
    setContatoFixado((v) => {
      const nv = !v;
      try {
        localStorage.setItem("nina.contato.fixado", nv ? "1" : "0");
      } catch {}
      return nv;
    });
  };


  const carregarStatusAgente = useCallback(async () => {
    if (!clinicaId) return;
    try {
      const [s, p, rs] = await Promise.all([
        meuStatusFn({ data: { clinicaId } }),
        pausaAtualFn({ data: { clinicaId } }),
        listarReasonsFn({ data: { clinicaId } }),
      ]);
      setFilaAberta(s.filaAberta);
      setPausaAtiva(p);
      setPauseReasons(rs);
      setStatusCarregado(true);
    } catch {
      // Estado auxiliar da fila: se falhar, a aba segue com os valores atuais.
    }
  }, [clinicaId, meuStatusFn, pausaAtualFn, listarReasonsFn]);

  useEffect(() => {
    carregarStatusAgente();
  }, [carregarStatusAgente]);

  // Presença real + automática:
  //  - sem mexer no mouse/teclado por 5 min, ou com o sistema em segundo plano
  //    (outra aba/janela minimizada), o atendente entra em pausa automática e
  //    para de receber conversas novas;
  //  - qualquer interação traz de volta para online;
  //  - ao fechar a página, avisa offline na hora (e, se o aviso não chegar, o
  //    servidor derruba a presença sozinho depois de 5 minutos sem sinal).
  // A pausa manual e o offline manual continuam mandando: a automação nunca
  // "reabre" quem escolheu ficar offline.
  const OCIOSO_MS = 5 * 60 * 1000;
  const [ausenteAuto, setAusenteAuto] = useState(false);
  const manualOffline = !pausaAtiva && !filaAberta;
  const online = !pausaAtiva && filaAberta && !ausenteAuto;

  useEffect(() => {
    if (manualOffline || pausaAtiva) {
      setAusenteAuto(false);
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    const armar = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setAusenteAuto(true), OCIOSO_MS);
    };
    const acordar = () => {
      if (document.visibilityState === "hidden") return;
      setAusenteAuto(false);
      armar();
    };
    const aoTrocarVisibilidade = () => {
      if (document.visibilityState === "hidden") {
        clearTimeout(timer);
        setAusenteAuto(true);
      } else {
        acordar();
      }
    };
    const eventos = ["mousemove", "mousedown", "keydown", "wheel", "touchstart", "focus"] as const;
    eventos.forEach((e) => window.addEventListener(e, acordar, { passive: true }));
    document.addEventListener("visibilitychange", aoTrocarVisibilidade);
    if (document.visibilityState === "hidden") setAusenteAuto(true);
    else armar();
    return () => {
      clearTimeout(timer);
      eventos.forEach((e) => window.removeEventListener(e, acordar));
      document.removeEventListener("visibilitychange", aoTrocarVisibilidade);
    };
  }, [manualOffline, pausaAtiva, OCIOSO_MS]);

  useEffect(() => {
    if (!clinicaId || !statusCarregado) return;
    const bater = () => {
      presencaFn({
        data: {
          clinicaId,
          status: online
            ? ("ONLINE" as const)
            : manualOffline
              ? ("OFFLINE" as const)
              : ("AWAY" as const),
          aceitaNovas: online,
        },
      }).catch(() => {
        /* heartbeat: falha isolada não atrapalha o atendimento */
      });
    };
    bater();
    const sair = () => {
      presencaFn({
        data: { clinicaId, status: "OFFLINE" as const, aceitaNovas: false },
      }).catch(() => {});
    };
    window.addEventListener("pagehide", sair);
    if (!online) {
      return () => window.removeEventListener("pagehide", sair);
    }
    const t = setInterval(bater, 60_000);
    return () => {
      clearInterval(t);
      window.removeEventListener("pagehide", sair);
    };
  }, [clinicaId, statusCarregado, online, manualOffline, presencaFn]);


  const alternarFila = async (abrir: boolean) => {
    if (!clinicaId) return;
    try {
      await travarFilaFn({ data: { clinicaId, travada: !abrir } });
      setFilaAberta(abrir);
      toast.success(abrir ? "Fila aberta" : "Fila fechada");
    } catch (e: any) {
      mostrarErro(e);
    }
  };

  const definirStatus = async (status: "online" | "pausa" | "offline") => {
    if (!clinicaId) return;
    try {
      if (status === "online") {
        if (pausaAtiva) await finalizarPausaFn({ data: { clinicaId } });
        await travarFilaFn({ data: { clinicaId, travada: false } });
        setPausaAtiva(null);
        setAusenteAuto(false);
        setFilaAberta(true);

        const r = await presencaFn({
          data: { clinicaId, status: "ONLINE" as const, aceitaNovas: true },
        });
        const n = (r as { distribuidas?: number } | null)?.distribuidas ?? 0;
        toast.success(
          n > 0
            ? `Você está online — ${n} conversa(s) da fila vieram para os atendentes`
            : "Você está online",
        );
        await carregarConvs();
      } else if (status === "offline") {
        if (pausaAtiva) await finalizarPausaFn({ data: { clinicaId } });
        await travarFilaFn({ data: { clinicaId, travada: true } });
        setPausaAtiva(null);
        setFilaAberta(false);
        await presencaFn({
          data: { clinicaId, status: "OFFLINE" as const, aceitaNovas: false },
        });
        toast.success("Você está offline");
      } else {
        if (!pauseReasons.length) {
          toast.error("Nenhum motivo de pausa configurado");
          return;
        }
        setPausaReasonSel(pauseReasons[0].id);
        setPausaDialogOpen(true);
      }
    } catch (e: any) {
      mostrarErro(e);
    }
  };


  const confirmarPausa = async () => {
    if (!clinicaId || !pausaReasonSel) return;
    try {
      await iniciarPausaFn({ data: { clinicaId, reasonId: pausaReasonSel } });
      setPausaDialogOpen(false);
      await carregarStatusAgente();
      toast.success("Em pausa");
    } catch (e: any) {
      mostrarErro(e);
    }
  };

  // Perfil de gestor: só ele enxerga a opção "Todas da clínica".
  useEffect(() => {
    let vivo = true;
    if (!clinicaId) return;
    souGestorFn({ data: { clinicaId } })
      .then((r: any) => {
        if (vivo) setSouGestor(!!r?.gestor);
      })
      .catch(() => {
        if (vivo) setSouGestor(false);
      });
    return () => {
      vivo = false;
    };
  }, [clinicaId, souGestorFn]);

  const carregarContadores = useCallback(async () => {
    if (!clinicaId) return;
    try {
      const r: any = await contarInboxFn({ data: { clinicaId } });
      setContadores({
        minhas: r?.minhas ?? 0,
        nina: r?.nina ?? 0,
        nao_atribuidas: r?.nao_atribuidas ?? 0,
        fechadas: r?.fechadas ?? 0,
        equipe: r?.equipe ?? 0,
      });
    } catch {
      /* contadores são informativos; falha não bloqueia a lista */
    }
  }, [clinicaId, contarInboxFn]);

  useEffect(() => {
    void carregarContadores();
  }, [carregarContadores, convs.length, escopo]);

  // Trocar de escopo (ou de usuário/clínica) recomeça a lista: cada filtro tem
  // a sua própria caixa de dados, nada de sobras de outro filtro na tela.
  const chaveAtual = chaveInbox({ clinicaId: clinicaId ?? null, userId: meuId, escopo });
  useEffect(() => {
    seqConvs.current++;
    setConvs([]);
  }, [chaveAtual]);

  const carregarConvs = useCallback(async () => {
    if (!clinicaId) return;
    const pedido = ++seqConvs.current;
    const chavePedido = chaveInbox({ clinicaId, userId: meuId, escopo });
    try {
      const brutas = await medirRequest("listarConversas", listarConvs({
        data: {
          clinicaId,
          status: filtroStatus,
          busca: busca || undefined,
          canal: "todos",
          escopo,
          limit: 200,
        },
      }));
      // Resposta atrasada de uma recarga anterior não pode sobrescrever a
      // atual — era isso que fazia o cartão mudar e "voltar" sozinho.
      if (pedido !== seqConvs.current) return;
      // Se o filtro/usuário mudou enquanto a resposta vinha, ela é descartada.
      if (chavePedido !== chaveInbox({ clinicaId, userId: meuId, escopo })) return;
      // FASE 4 — segunda conferência no navegador: só entra na lista o que
      // realmente pertence a este filtro, mesmo que um evento em tempo real
      // traga uma conversa que acabou de mudar de responsável.
      const ctxEscopo = { escopo, userId: meuId, gestor: souGestor };
      const rows = filtrarPorEscopo(brutas as any[], ctxEscopo);
      // A conversa aberta deixou de pertencer a este filtro (transferida,
      // devolvida à fila, resolvida ou reaberta com a Nina)? Sai da tela na
      // hora — inclusive durante uma busca, onde a lista vem reduzida.
      if (deepLinkPendente.current && selIdRef.current !== deepLinkPendente.current)
        deepLinkPendente.current = null;
      const removeu = selecaoDeveSair({
        selecionada: (selRef.current as any) ?? null,
        linhas: rows as any,
        buscando: !!busca,
        ctx: ctxEscopo,
      });
      if (deepLinkPendente.current && rows.some((r: any) => r.id === deepLinkPendente.current))
        deepLinkPendente.current = null;
      if (removeu && selIdRef.current === deepLinkPendente.current) {
        // Link direto: aguarda a lista do filtro certo antes de decidir.
      } else if (removeu) {
        const idFora = selIdRef.current!;
        cacheConversas.current.invalidar(idFora);
        setSel(null);
        setConversaCarregadaId(null);
        setSecundariosCarregadosId(null);
        setMsgs([]);
        setContato(null);
        setNotas([]);
        setEventos([]);
        toast.info(avisoSaidaEscopo(escopo));
        // O endereço acompanha: sem conversa aberta, volta para /app/nina.
        abrirPelaUrl(null, true);
      }
      setConvs((prev: any[]) => {
        // Chegou mensagem nova numa conversa guardada em cache (mesmo sem estar
        // aberta)? O conteúdo dela sai do cache para não voltar desatualizado.
        // Cada conversa é tratada pelo próprio id: uma nunca invalida a outra.
        const vencidas = conversasDesatualizadas({
          anteriores: prev as any,
          atuais: rows as any,
          emCache: cacheConversas.current.chaves(),
        });
        for (const id of vencidas) {
          if (id === selIdRef.current) continue;
          cacheConversas.current.invalidar(id);
        }
        // Quem saiu deste filtro não pode continuar guardado em cache.
        for (const id of idsQueSairam(prev as any, rows as any)) {
          cacheConversas.current.invalidar(id);
        }
        return ordenarPorRecentes(mesclarListaConversas(prev as any, rows as any)) as any[];
      });
      // O número do filtro atual muda na hora; o servidor confirma em seguida.
      setContadores((c) => ajustarContadorAtual(c as ContadoresInbox, escopo, rows.length));
      // Com uma conversa no endereço (F5, link colado, Voltar/Avançar), a
      // tela nunca escolhe outra sozinha.
      if (
        devoAutoSelecionarComUrl({
          conversaIdUrl: conversaIdUrlRef.current,
          temSelecao: !!selRef.current,
          removeuAgora: removeu,
          temPrimeiraLinha: devoAutoSelecionar({
            temSelecao: !!selRef.current,
            removeuAgora: removeu,
            primeiraLinha: rows[0] as LinhaInbox,
          }),
        })
      )
        // A seleção automática também passa pela URL, para não existirem dois
        // estados divergentes (endereço x conversa aberta).
        abrirPelaUrl((rows[0] as any)?.id ?? null, true);
      // Os números de cada filtro acompanham a movimentação em tempo real.
      void carregarContadores();
    } catch (e: any) {
      mostrarErro(e);
    }
  }, [clinicaId, filtroStatus, busca, escopo, listarConvs, carregarContadores, meuId, souGestor, abrirPelaUrl]);

  // FASE 1 — a conversa aberta é sempre a do endereço. Quando o
  // conversationId da URL muda (clique, voltar/avançar do navegador, link
  // colado), a seleção acompanha; sem id na URL, nada fica aberto.
  useEffect(() => {
    if (!conversaIdUrl) {
      if (selIdRef.current) {
        setSel(null);
        setConversaCarregadaId(null);
        setSecundariosCarregadosId(null);
        setMsgs([]);
        setContato(null);
        setNotas([]);
        setEventos([]);
      }
      return;
    }
    if (selIdRef.current === conversaIdUrl) return;
    setErroAcesso(null);
    const c = convs.find((x: any) => x.id === conversaIdUrl);
    if (c) {
      setSel(c);
      return;
    }
    // FASE 2 — F5 / link colado / Voltar-Avançar: a conversa do endereço pode
    // não estar na lista do filtro atual. Buscamos ela pelo id e, se o usuário
    // puder vê-la, o filtro acompanha. Sem permissão, volta para /app/nina.
    if (!clinicaId || !meuId) return;
    if (deepLinkTentado.current.has(conversaIdUrl)) return;
    deepLinkTentado.current.add(conversaIdUrl);
    const idPedido = conversaIdUrl;
    void (async () => {
      try {
        const row: any = await obterConversaFn({ data: { clinicaId, conversaId: idPedido } });
        if (conversaIdUrlRef.current !== idPedido) return;
        if (!row) {
          setErroAcesso("Conversa não encontrada.");
          abrirPelaUrl(null, true);
          return;
        }
        const destino = escopoParaConversa(row, { escopoAtual: escopo, userId: meuId, gestor: souGestor });
        if (!destino) {
          setErroAcesso("Você não possui permissão para visualizar esta conversa.");
          abrirPelaUrl(null, true);
          return;
        }
        deepLinkTentado.current.delete(idPedido);
        deepLinkPendente.current = destino !== escopo ? idPedido : null;
        setSel(row);
        setConvs((prev: any[]) =>
          prev.some((x: any) => x.id === row.id) ? prev : [row, ...prev],
        );
        if (destino !== escopo) setEscopo(destino);
      } catch (e: any) {
        if (conversaIdUrlRef.current !== idPedido) return;
        const msg = String(e?.message ?? "");
        setErroAcesso(
          msg.includes("não encontrada")
            ? "Conversa não encontrada."
            : msg.includes("permissão")
              ? "Você não possui permissão para visualizar esta conversa."
              : msg || "Não foi possível abrir esta conversa.",
        );
        abrirPelaUrl(null, true);
      }
    })();
  }, [conversaIdUrl, convs, clinicaId, meuId, escopo, souGestor, obterConversaFn, abrirPelaUrl]);

  // Abrir uma conversa a partir da Central de Atenção, sem trocar de página
  // e sem mexer em filtros/rascunho de quem já estava atendendo.
  useEffect(() => {
    const abrir = (id: string | null) => {
      if (!id) return;
      abrirPelaUrl(id);
    };

    const handler = (e: Event) => abrir((e as CustomEvent).detail?.id ?? null);
    try {
      const pendente = window.sessionStorage.getItem(ABRIR_CONVERSA_KEY);
      if (pendente) {
        window.sessionStorage.removeItem(ABRIR_CONVERSA_KEY);
        abrir(pendente);
      }
    } catch {
      /* sem armazenamento: só o evento abaixo abre a conversa */
    }
    window.addEventListener(EVENTO_ABRIR_CONVERSA, handler);
    return () => window.removeEventListener(EVENTO_ABRIR_CONVERSA, handler);
  }, [abrirPelaUrl]);



  // Prefetch controlado: ao passar o mouse (ou focar pelo teclado) num lead,
  // o conteúdo dele já vai para o cache. Nunca baixa a lista inteira: só a
  // conversa apontada e apenas uma vez enquanto estiver em cache.
  const prefetchConversa = useCallback(
    (id: string) => {
      if (!clinicaId || !id) return;
      if (id === selIdRef.current) return;
      const chave = chavePrefetch(clinicaId, meuId);
      if (cacheConversas.current.obter(id) || prefetchMsgs.current.obter(id, chave)) return;
      // Só as mensagens recentes: o suficiente para o chat abrir na hora.
      // Nada de histórico completo nem dados de apoio no prefetch.
      const p = listarMsgs({
        data: { clinicaId, conversaId: id, limit: JANELA_INICIAL },
      }) as Promise<any[]>;
      const entrada = prefetchMsgs.current.registrar(id, chave, p);
      void (async () => {
        try {
          const m = await p;
          // Se a conversa foi invalidada (mensagem nova, transferência) ou a
          // clínica/usuário mudou enquanto a busca vinha, o resultado é
          // descartado — nunca repovoa o cache com conteúdo velho.
          if (!prefetchMsgs.current.resultadoValido(id, entrada, chavePrefetch(clinicaId, meuId)))
            return;
          if (!cacheConversas.current.obter(id)) {
            cacheConversas.current.guardar(id, {
              msgs: m,
              contato: null,
              notas: [],
              eventos: [],
              parcial: true,
            });
          }
        } catch {
          /* prefetch é oportunista: falha não afeta o atendimento e a busca
             sai do controle no finally, permitindo nova tentativa */
        } finally {
          prefetchMsgs.current.concluir(id, entrada);
        }
      })();
    },
    [clinicaId, meuId, listarMsgs],
  );


  // Intenção de abrir: o prefetch só dispara depois de ~150ms com o mouse (ou
  // o foco) parado no lead — evita disparar dezenas de buscas ao passar o
  // mouse pela lista inteira.
  const agendarPrefetch = useCallback(
    (id: string) => {
      if (prefetchTimers.current.has(id)) return;
      const t = window.setTimeout(() => {
        prefetchTimers.current.delete(id);
        prefetchConversa(id);
      }, 150);
      prefetchTimers.current.set(id, t);
    },
    [prefetchConversa],
  );
  const cancelarPrefetch = useCallback((id: string) => {
    const t = prefetchTimers.current.get(id);
    if (t !== undefined) {
      window.clearTimeout(t);
      prefetchTimers.current.delete(id);
    }
  }, []);
  useEffect(
    () => () => {
      for (const t of prefetchTimers.current.values()) window.clearTimeout(t);
      prefetchTimers.current.clear();
    },
    [],
  );

  const carregarConversa = useCallback(async () => {
    if (!clinicaId || !sel?.id) return;
    // Alvo desta carga. Se a atendente trocar de conversa no meio do caminho,
    // ou um pedido mais novo for disparado, a resposta atrasada é descartada.
    const alvo: string = sel.id;
    const pedido = ++seqConversa.current;
    const janela = janelaRef.current;
    medidor.current?.marcar("request");
    marcarTroca("T2_requests");
    // Todas as buscas saem juntas (sem fila). A diferença é o que cada uma
    // libera na tela: só as mensagens abrem o chat.
    const aindaVale = () =>
      respostaAindaVale({
        alvo,
        selecionadaAgora: selIdRef.current,
        pedido,
        pedidoAtual: seqConversa.current,
        conversaIdUrl: conversaIdUrlRef.current,
      });

    // Se o pré-carregamento desta conversa já está em andamento (mouse parado
    // no lead → clique), reaproveitamos a mesma busca em vez de pedir as
    // mensagens duas vezes. A busca só é reaproveitada se ainda valer para
    // esta clínica/usuário e para a versão atual da conversa.
    const chavePf = chavePrefetch(clinicaId, meuId);
    const emVoo =
      janela === JANELA_INICIAL ? prefetchMsgs.current.obter(alvo, chavePf)?.promise : undefined;
    const pMensagens = emVoo
      ? emVoo
      : medirRequest(
          "listarMensagensConversa",
          listarMsgs({ data: { clinicaId, conversaId: alvo, limit: janela } }),
        );
    const pContato = medirRequest(
      "obterDadosContato",
      obterContato({ data: { clinicaId, conversaId: alvo } }),
    );
    const pNotas = medirRequest(
      "listarNotas",
      listarNotasFn({ data: { clinicaId, conversaId: alvo } }),
    ).catch(() => [] as any[]);
    const pEventos = medirRequest(
      "listarEventosConversa",
      listarEventosFn({ data: { clinicaId, conversaId: alvo } }),
    ).catch(() => [] as ConversaEvento[]);

    // Guarda o que as mensagens devolveram: `null` significa que a busca
    // falhou. Falha nunca é gravada no cache como conversa vazia.
    let msgsCarregadas: any[] | null = null;

    // 1) Caminho crítico — mensagens recentes abrem o chat e o campo de envio.
    const critico = (async () => {
      try {
        const m = (await pMensagens) as any[];
        msgsCarregadas = m;
        marcarTroca("T4_mensagens");
        if (!aindaVale()) return;
        medidor.current?.marcar("dados");
        setErroMsgs(false);
        setMsgs(m);
        setTemMaisAntigas(podeCarregarMais(m.length, janela));
        setConversaCarregadaId(alvo);
        // O chat já pode ser reaberto na hora: guarda parcial agora, sem
        // esperar contato/notas/eventos. Se o conteúdo completo já estiver
        // guardado, ele é preservado.
        if (janela === JANELA_INICIAL && !cacheConversas.current.obter(alvo)) {
          cacheConversas.current.guardar(alvo, {
            msgs: m,
            contato: null,
            notas: [],
            eventos: [],
            parcial: true,
          });
        }
      } catch (e: any) {
        if (aindaVale()) setErroMsgs(true);
        mostrarErro(e);
      }
    })();


    // 2) Segundo plano — contato, notas e eventos entram quando chegarem.
    const secundarios = (async () => {
      try {
        const [c, n, ev] = await Promise.all([pContato, pNotas, pEventos]);
        marcarTroca("T3_conversa");
        marcarTroca("T8_contato");
        if (!aindaVale()) return;
        if (!c) {
          // Conversa não existe mais nesta clínica: limpa a seleção sem quebrar.
          cacheConversas.current.invalidar(alvo);
          setSel(null);
          setConversaCarregadaId(null);
          setSecundariosCarregadosId(null);
          setMsgs([]);
          setContato(null);
          setNotas([]);
          setEventos([]);
          return;
        }
        const eventosLista = (ev ?? []) as ConversaEvento[];
        await critico;
        // Nova espera → nova checagem. Entre o `await` acima e a publicação a
        // atendente pode ter trocado de conversa; nesse caso nada é gravado
        // no cache nem na tela.
        if (!aindaVale()) return;
        // Mensagens que falharam não viram conversa vazia no cache: guardamos
        // apenas os dados de apoio e o conteúdo continua marcado como parcial.
        const msgsCache = msgsCarregadas as any[] | null;
        if (msgsCache) {
          cacheConversas.current.guardar(alvo, {
            msgs: msgsCache,
            contato: c,
            notas: n,
            eventos: eventosLista,
          });
        }

        // FASE 4 — guarda o contato pelo vínculo direto, para reaproveitar em
        // outras conversas do mesmo paciente.
        cacheContatos.current.guardar((c as any)?.paciente?.id, c);
        setContato(c);
        setNotas(n);
        setEventos(eventosLista);
        setSecundariosCarregadosId(alvo);
      } catch (e: any) {
        // Dados de apoio não podem derrubar o atendimento em andamento.
        console.warn("[atendimento] dados secundários:", e?.message ?? e);
      }
    })();

    await Promise.all([critico, secundarios]);
  }, [clinicaId, sel?.id, listarMsgs, obterContato, listarNotasFn, listarEventosFn]);



  // Atualização incremental (Fase 4): mensagem nova no Realtime traz apenas o
  // que é novo desta conversa — nada de recarregar contato, notas ou resumo.
  const sincronizarConversa = useCallback(async () => {
    const alvo = selIdRef.current;
    if (!clinicaId || !alvo) return;
    const cursor = cursorMaisRecente(msgsRef.current);
    if (
      !podeAtualizarIncremental({
        conversaAberta: alvo,
        conversaCarregada: conversaCarregadaRef.current,
        cursor,
      })
    ) {
      await carregarConversa();
      return;
    }
    try {
      const [novas, ev] = await Promise.all([
        listarMsgs({
          data: { clinicaId, conversaId: alvo, limit: JANELA_INICIAL, depoisDe: cursor! },
        }),
        listarEventosFn({ data: { clinicaId, conversaId: alvo } }).catch(
          () => null as ConversaEvento[] | null,
        ),
      ]);
      if (selIdRef.current !== alvo) return;
      if (conversaIdUrlRef.current && conversaIdUrlRef.current !== alvo) return;
      if ((novas as any[])?.length) {
        setMsgs((prev) => {
          const juntas = mesclarNovas(prev, novas as any[]);
          const atual = cacheConversas.current.obter(alvo);
          if (atual) cacheConversas.current.guardar(alvo, { ...atual, msgs: juntas });
          return juntas;
        });
      }
      if (ev) {
        setEventos((prev) => mesclarEventos(prev, ev as ConversaEvento[]));
      }
    } catch {
      // Falha na sincronização não derruba o atendimento: a próxima tentativa
      // (Realtime ou rede de segurança) resolve.
    }
  }, [clinicaId, listarMsgs, listarEventosFn, carregarConversa]);

  useEffect(() => {
    msgsRef.current = msgs;
  }, [msgs]);
  useEffect(() => {
    conversaCarregadaRef.current = conversaCarregadaId;
  }, [conversaCarregadaId]);

  // A lista só é recarregada quando algo dela muda de verdade (clínica,
  // filtro, busca, usuário). Abrir uma conversa não recarrega a lista.
  const carregarConvsRef = useRef(carregarConvs);
  carregarConvsRef.current = carregarConvs;
  useEffect(() => {
    void carregarConvsRef.current();
  }, [clinicaId, filtroStatus, busca, escopo, meuId, souGestor]);
  // O responsável pode mudar a qualquer momento (transferência, distribuição
  // automática, tomada por outra pessoa). A lista chega por Realtime, então a
  // conversa aberta sempre acompanha o que está gravado no banco.
  useEffect(() => {
    if (!sel?.id) return;
    const atual = convs.find((c: any) => c.id === sel.id);
    if (!atual) return;
    if (
      atual.atribuida_user_id !== sel.atribuida_user_id ||
      atual.status !== sel.status ||
      atual.owner_type !== sel.owner_type
    ) {
      setSel((s: any) => ({ ...s, ...atual }));
    }
  }, [convs, sel?.id, sel?.atribuida_user_id, sel?.status, sel?.owner_type]);
  // Troca de conversa: o conteúdo do lead anterior sai da tela na mesma hora.
  // Se a nova conversa já estiver em cache, o conteúdo dela aparece na hora e
  // é revalidado em segundo plano — nunca o conteúdo da conversa anterior.
  useEffect(() => {
    const id = sel?.id;
    marcarTroca("T1_selecao");
    janelaRef.current = JANELA_INICIAL;
    setTemMaisAntigas(false);
    // FASE 4 — conversa já vinculada a um paciente conhecido: o painel de
    // contato usa o cache por ID enquanto o servidor revalida em segundo plano.
    const plano = planoAberturaContato({
      contactId: (sel as any)?.contato_paciente_id ?? null,
      telefone: (sel as any)?.contato_telefone ?? null,
    });
    const contatoEmCache =
      plano.via === "id" ? cacheContatos.current.obter(plano.contactId) : undefined;
    const emCache = id ? cacheConversas.current.obter(id) : undefined;
    if (id && emCache) {
      setMsgs(emCache.msgs);
      setConversaCarregadaId(id);
      if (emCache.parcial) {
        // Veio do prefetch: o chat já abre, os dados de apoio carregam agora.
        setContato(contatoEmCache ? { ...contatoEmCache, conversa: sel } : null);
        setNotas([]);
        setEventos([]);
        setSecundariosCarregadosId(null);
      } else {
        setContato(emCache.contato);
        setNotas(emCache.notas);
        setEventos(emCache.eventos);
        setSecundariosCarregadosId(id);
      }
      return;
    }
    setConversaCarregadaId(null);
    setSecundariosCarregadosId(null);
    setMsgs([]);
    setEventos([]);
    setContato(contatoEmCache ? { ...contatoEmCache, conversa: sel } : null);
    setNotas([]);
  }, [sel?.id]);


  // FASE 5 — o vínculo da conversa com o paciente pode nascer depois (cadastro
  // rápido, vínculo manual, identificação pela Nina). Quando o Realtime traz
  // esse vínculo novo, o painel de contato se atualiza sozinho, sem recarregar.
  const vinculoRef = useRef<string | null>(null);
  useEffect(() => {
    const id = sel?.id;
    const pid = ((sel as any)?.contato_paciente_id ?? null) as string | null;
    if (!id) {
      vinculoRef.current = null;
      return;
    }
    const anterior = vinculoRef.current;
    vinculoRef.current = pid;
    if (!pid || anterior === pid || conversaCarregadaId !== id) return;
    // Vínculo mudou com a conversa já aberta: o cache antigo não vale mais.
    cacheConversas.current.invalidar(id);
    cacheContatos.current.invalidar(anterior);
    (async () => {
      try {
        const c = await obterContato({ data: { clinicaId, conversaId: id } });
        if (selIdRef.current !== id) return;
        cacheContatos.current.guardar((c as any)?.paciente?.id, c);
        setContato(c as any);
        setSecundariosCarregadosId(id);
      } catch (e: any) {
        console.warn("[atendimento] revalidar contato:", e?.message ?? e);
      }
    })();
  }, [clinicaId, sel?.id, (sel as any)?.contato_paciente_id, conversaCarregadaId, obterContato]);

  // Trocou de conversa: formulários abertos sobre a conversa anterior fecham.
  // Um formulário iniciado em A jamais é reaproveitado em B.
  useEffect(() => {
    setTransferOpen(false);
    setFecharOpen(false);
    setAgendaOpen(false);
    setNovaNota("");
  }, [sel?.id]);

  useEffect(() => {
    carregarConversa();
  }, [carregarConversa]);
  // Mantém mensagens/contato sincronizados enquanto a conversa está aberta.
  useEffect(() => {
    if (!sel?.id) return;
    const t = setInterval(() => {
      void sincronizarConversa();
    }, 8000);
    return () => clearInterval(t);
  }, [sel?.id, sincronizarConversa]);

  useEffect(() => {
    if (!clinicaId) return;
    (async () => {
      try {
        const [d, u] = await Promise.all([
          listarDeptosFn({ data: { clinicaId } }),
          listarUsuariosFn({ data: { clinicaId } }),
        ]);
        setDeptos(d);
        setUsuarios(u);
      } catch {
        // Listas de apoio (departamentos/usuários): falha deixa os selects vazios.
      }
    })();
  }, [clinicaId, listarDeptosFn, listarUsuariosFn]);

  // Tempo de espera: uma única consulta para toda a lista. O relógio da tela
  // atualiza o texto sozinho; o banco só é consultado quando algo muda
  // (realtime) ou a cada 60s como rede de segurança.
  const carregarEspera = useCallback(async () => {
    if (!clinicaId) return;
    const pedido = ++seqEspera.current;
    try {
      const m = (await esperaFn({ data: { clinicaId, isTeste: false } })) as unknown as Record<
        string,
        string
      >;
      if (pedido !== seqEspera.current) return;
      setEspera((prev) => mesclarEspera(prev, m ?? {}));
    } catch {
      /* indicador auxiliar: falha não pode atrapalhar o atendimento */
    }
  }, [clinicaId, esperaFn]);

  useEffect(() => {
    void carregarEspera();
    const t = setInterval(() => void carregarEspera(), 60_000);
    return () => clearInterval(t);
  }, [carregarEspera]);

  // Uma rajada de mensagens novas gerava várias recargas seguidas da lista,
  // que disputavam espaço com a abertura da conversa. Agora as atualizações
  // próximas são agrupadas em uma única recarga.
  const recargaListaRef = useRef<number | null>(null);
  const recarregarListaAgrupado = useCallback(() => {
    if (recargaListaRef.current !== null) window.clearTimeout(recargaListaRef.current);
    recargaListaRef.current = window.setTimeout(() => {
      recargaListaRef.current = null;
      void carregarConvs();
    }, 500);
  }, [carregarConvs]);
  useEffect(
    () => () => {
      if (recargaListaRef.current !== null) window.clearTimeout(recargaListaRef.current);
    },
    [],
  );

  useRealtimeRefresh(
    ["atend_conversas", "whatsapp_mensagens"],
    recarregarListaAgrupado,
    !!clinicaId,
  );
  useRealtimeRefresh(["whatsapp_mensagens"], carregarEspera, !!clinicaId);
  useRealtimeRefresh(
    ["whatsapp_mensagens", "atend_conversa_eventos"],
    () => void sincronizarConversa(),
    !!clinicaId && !!sel?.id,
  );
  // Notas internas são raras: aí sim vale recarregar o painel de apoio.
  useRealtimeRefresh(["atend_notas_internas"], carregarConversa, !!clinicaId && !!sel?.id);

  // Mensagens e eventos de estado na mesma linha do tempo, em ordem cronológica.
  const timeline = useMemo(() => {
    const itens: (
      | { kind: "msg"; at: number; msg: any }
      | { kind: "evento"; at: number; ev: ConversaEvento }
    )[] = [
      ...msgs.map((m) => ({
        kind: "msg" as const,
        at: new Date(m.recebida_em ?? m.created_at ?? 0).getTime(),
        msg: m,
      })),
      ...eventos.map((ev) => ({
        kind: "evento" as const,
        at: new Date(ev.created_at).getTime(),
        ev,
      })),
    ];
    return itens.sort((a, b) => a.at - b.at);
  }, [msgs, eventos]);

  // Scroll do chat: abre sempre na última interação real (mensagem ou evento).
  const ultimoItemId =
    timeline.length === 0
      ? null
      : (() => {
          const u = timeline[timeline.length - 1];
          return u.kind === "msg" ? `m-${u.msg.id}` : `e-${u.ev.id}`;
        })();
  const chat = useChatScroll({
    conversaId: sel?.id ?? null,
    total: timeline.length,
    ultimoId: ultimoItemId,
  });

  // Medição temporária de desempenho (ligue com localStorage "nina:perf"=1):
  // marca quando a conversa terminou de desenhar e quando o scroll ficou no fim.
  useEffect(() => {
    if (!conteudoDaConversa) return;
    medidor.current?.marcar("render");
    marcarTroca("T5_render");
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        medidor.current?.marcar("scroll");
        marcarTroca("T6_scroll");
        medidor.current = null;
      });
    });
    return () => cancelAnimationFrame(id);
  }, [conteudoDaConversa, conversaCarregadaId]);

  // Histórico antigo sob demanda: só é buscado quando a atendente pede,
  // preservando a posição de leitura (a tela não "pula" ao carregar).
  const carregarAntigas = useCallback(async () => {
    if (!clinicaId || !sel?.id || carregandoAntigas) return;
    const alvo: string = sel.id;
    const cursor = cursorMaisAntigo(msgs);
    if (!cursor) return;
    setCarregandoAntigas(true);
    // A partir daqui quem manda na posição é a atendente, não a abertura.
    chat.encerrarAbertura();
    const cont = chat.containerRef.current;
    const alturaAntes = cont?.scrollHeight ?? 0;
    const topoAntes = cont?.scrollTop ?? 0;

    try {
      const antigas = await listarMsgs({
        data: { clinicaId, conversaId: alvo, limit: JANELA_ANTERIOR, antesDe: cursor },
      });
      if (selIdRef.current !== alvo) return;
      janelaRef.current += JANELA_ANTERIOR;
      setMsgs((prev) => {
        const juntas = mesclarAnteriores(prev, antigas as any[]);
        const atual = cacheConversas.current.obter(alvo);
        if (atual) cacheConversas.current.guardar(alvo, { ...atual, msgs: juntas });
        return juntas;
      });
      setTemMaisAntigas(podeCarregarMais((antigas as any[]).length, JANELA_ANTERIOR));
      requestAnimationFrame(() => {
        const c2 = chat.containerRef.current;
        if (!c2) return;
        c2.scrollTop = topoAntes + (c2.scrollHeight - alturaAntes);
      });
    } catch (e: any) {
      mostrarErro(e);
    } finally {
      setCarregandoAntigas(false);
    }
  }, [clinicaId, sel?.id, msgs, carregandoAntigas, listarMsgs, chat]);


  const janela24hExpirada = (() => {
    if (!sel || sel.canal !== "whatsapp") return false;
    const j = sel.janela_24h_em ? new Date(sel.janela_24h_em).getTime() : 0;
    if (!j) return true;
    return Date.now() - j > 24 * 60 * 60 * 1000;
  })();
  const nomeUsuario = useCallback(
    (id?: string | null) => {
      if (!id) return null;
      const u = usuarios.find((x: any) => x.user_id === id);
      return u?.nome ?? u?.email ?? "outro atendente";
    },
    [usuarios],
  );
  const responsavelId: string | null = sel?.atribuida_user_id ?? null;
  const souResponsavel = !!meuId && responsavelId === meuId;
  const conversaEncerrada = sel?.status === "closed" || sel?.status === "finished";
  const [assumindo, setAssumindo] = useState(false);
  const [assumirOpen, setAssumirOpen] = useState(false);

  /* ---------- Mensagens rápidas (comandos "/") ---------- */
  const respostasRapidas = useRespostasRapidas(clinicaId);
  const registrarUsoFn = useServerFn(registrarUsoResposta);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const [slash, setSlash] = useState<ComandoDigitado | null>(null);
  const [slashIdx, setSlashIdx] = useState(0);
  // Prioriza (sem esconder) respostas ligadas ao que já está no atendimento.
  const contextoResp = useMemo<string[]>(() => {
    const ags: any[] = contato?.agendamentos ?? [];
    return ags
      .map((a) => String(a?.procedimento ?? "").trim())
      .filter((s) => s.length > 3)
      .slice(0, 3);
  }, [contato]);
  const itensResp = useRespostasFiltradas(respostasRapidas, slash?.termo ?? "", contextoResp);
  useEffect(() => setSlashIdx(0), [slash?.termo]);

  /**
   * Variáveis: apenas dados reais. Só usa agendamento CONFIRMADO e futuro —
   * uma intenção de agendar nunca vira confirmação.
   */
  const ctxVariaveis = useMemo<ContextoVariaveis>(() => {
    const p = contato?.paciente ?? null;
    const ags: any[] = contato?.agendamentos ?? [];
    const agora = Date.now();
    const ag = ags
      .filter(
        (a) =>
          String(a?.status ?? "") === "confirmado" &&
          a?.inicio &&
          new Date(a.inicio).getTime() >= agora,
      )
      .sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime())[0];
    const dt = ag?.inicio ? new Date(ag.inicio) : null;
    return {
      "patient.name": p?.nome ?? "",
      "patient.first_name": primeiroNome(p?.nome),
      "patient.phone": p?.telefone ?? "",
      "doctor.name": ag?.medico_nome ?? "",
      "appointment.date": dt ? dt.toLocaleDateString("pt-BR") : "",
      "appointment.time": dt
        ? dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
        : "",
      "unit.name": (clinicaAtual as any)?.clinica?.nome ?? "",
      "procedure.name": ag?.procedimento ?? "",
      "attendant.name": nomeUsuario(meuId) ?? "",
    };
  }, [contato, clinicaAtual, nomeUsuario, meuId]);

  /**
   * Insere o texto no composer (nunca envia) substituindo apenas o comando
   * digitado, ou na posição do cursor quando veio do botão ⚡.
   */
  const inserirRespostaRapida = useCallback(
    (r: RespostaRapida) => {
      const { texto: conteudo, faltantes } = aplicarVariaveis(r.conteudo, ctxVariaveis);
      const el = composerRef.current;
      const pos = slash ?? {
        inicio: el?.selectionStart ?? draft.length,
        fim: el?.selectionEnd ?? draft.length,
        termo: "",
      };
      const { texto, cursor } = substituirTrecho(draft, pos.inicio, pos.fim, conteudo);
      setDraft(texto);
      setSlash(null);
      if (faltantes.length > 0)
        toast.warning(`Não foi possível preencher “${faltantes.join("”, “")}”. Complete antes de enviar.`);
      requestAnimationFrame(() => {
        el?.focus();
        try {
          el?.setSelectionRange(cursor, cursor);
        } catch {
          /* navegador sem suporte: o texto já foi inserido */
        }
      });
      if (clinicaId)
        void registrarUsoFn({
          data: { clinicaId, respostaId: r.id, conversaId: sel?.id ?? null },
        }).catch(() => {
          /* log de uso é best-effort e nunca bloqueia o atendimento */
        });
    },
    [ctxVariaveis, slash, draft, clinicaId, registrarUsoFn, sel],
  );



  const motivoBloqueio = !sel
    ? null
    : carregandoConversa
      ? "Carregando conversa…"
    : conversaEncerrada
      ? "Conversa encerrada. Não é possível enviar mensagens."
      : responsavelId && !souResponsavel
        ? `Em atendimento por ${nomeUsuario(responsavelId)}. Assuma a conversa para responder.`
        : !podeAtender
          ? "Você tem acesso somente de leitura no atendimento."
          : pausaAtiva
      ? "Você está em pausa. Encerre a pausa para enviar mensagens."
      : !filaAberta
        ? "Você está offline. Fique online para enviar mensagens."
        : janela24hExpirada
          ? "Janela de 24h do WhatsApp expirada. Envie um template para reabrir."
          : null;

  /**
   * Assume a conversa. O servidor decide de forma atômica: se outra pessoa
   * assumir no mesmo instante, o clique não vence e a tela é atualizada com o
   * responsável real.
   */
  const assumir = async (forcar: boolean, motivo?: string) => {
    if (!sel || !clinicaId || assumindo) return;
    setAssumindo(true);
    try {
      const r: any = await assumirFn({
        data: { clinicaId, conversaId: sel.id, forcar, motivo: motivo || undefined },
      });
      if (r?.ok) {
        toast.success("Você agora é responsável por esta conversa.");
        setAssumirOpen(false);
      } else if (r?.motivo === "ENCERRADA") {
        toast.error("Conversa encerrada. Não é possível assumir.");
      } else if (r?.motivo === "NAO_ENCONTRADA") {
        toast.error("Conversa não encontrada nesta clínica.");
      } else {
        toast.error(
          `Esta conversa já está com ${nomeUsuario(r?.atribuidaUserId) ?? "outro atendente"}.`,
        );
      }
      await carregarConvs();
      await carregarConversa();
    } catch (e: any) {
      mostrarErro(e);
    } finally {
      setAssumindo(false);
    }
  };

  const enviar = async () => {
    const t = draft.trim();
    if (!t || !sel || !clinicaId || enviando) return;
    // A ação só vale para a conversa que está de fato aberta e carregada.
    if (!acaoPermitida({ alvo: sel.id, selecionadaAgora: selIdRef.current, carregando: carregandoConversa, conversaIdUrl: conversaIdUrlRef.current })) {
      toast.error("Carregando a conversa. Tente novamente em instantes.");
      return;
    }
    if (motivoBloqueio) {
      toast.error(motivoBloqueio);
      return;
    }
    // Conversa de origem: o envio pertence a ela, não à que estiver aberta
    // quando a resposta chegar.
    const origem = sel.id;
    setEnviando(true);
    try {
      await enviarMsg({ data: { clinicaId, conversaId: origem, text: t } });
      limparRascunhoDe(origem);
      cacheConversas.current.invalidar(origem);
      if (selIdRef.current === origem) await carregarConversa();
    } catch (e: any) {
      mostrarErro(e);
    } finally {
      setEnviando(false);
    }
  };

  const adicionarNota = async () => {
    const t = novaNota.trim();
    if (!t || !sel || !clinicaId) return;
    const origem = sel.id;
    try {
      await criarNotaFn({ data: { clinicaId, conversaId: origem, conteudo: t } });
      cacheConversas.current.invalidar(origem);
      if (selIdRef.current !== origem) return;
      setNovaNota("");
      await carregarConversa();
    } catch (e: any) {
      mostrarErro(e);
    }
  };

  const transferir = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!sel || !clinicaId) return;
    if (
      !acaoPermitida({
        alvo: sel.id,
        selecionadaAgora: selIdRef.current,
        carregando: carregandoConversa,
        conversaIdUrl: conversaIdUrlRef.current,
      })
    ) {
      toast.error("Carregando a conversa. Tente novamente em instantes.");
      return;
    }
    const fd = new FormData(e.currentTarget);
    const userId = String(fd.get("userId") || "");
    const departamentoId = String(fd.get("departamentoId") || "") || undefined;
    const motivo = String(fd.get("motivo") || "") || undefined;
    // O formulário foi aberto sobre esta conversa: a transferência é dela.
    const origem = sel.id;
    try {
      await transferirFn({
        data: { clinicaId, conversaId: origem, userId: userId || null, departamentoId, motivo },
      });
      cacheConversas.current.invalidar(origem);
      setTransferOpen(false);
      await carregarConvs();
      if (selIdRef.current === origem) await carregarConversa();
    } catch (e: any) {
      mostrarErro(e);
    }
  };

  const fechar = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!sel || !clinicaId) return;
    if (
      !acaoPermitida({
        alvo: sel.id,
        selecionadaAgora: selIdRef.current,
        carregando: carregandoConversa,
        conversaIdUrl: conversaIdUrlRef.current,
      })
    ) {
      toast.error("Carregando a conversa. Tente novamente em instantes.");
      return;
    }
    const fd = new FormData(e.currentTarget);
    const origem = sel.id;
    try {
      await fecharFn({
        data: {
          clinicaId,
          conversaId: origem,
          motivo: String(fd.get("motivo") || "") || undefined,
          resumo: String(fd.get("resumo") || "") || undefined,
        },
      });
      cacheConversas.current.invalidar(origem);
      setFecharOpen(false);
      await carregarConvs();
      if (selIdRef.current === origem) await carregarConversa();
    } catch (e: any) {
      mostrarErro(e);
    }
  };

  const statusBadge = (s: string) => {
    if (s === "active")
      return (
        <Badge className="bg-atd-ok-bg text-atd-ok-ink hover:bg-atd-ok-bg border border-atd-ok/30">
          ● Ativa
        </Badge>
      );
    if (s === "waiting")
      return (
        <Badge className="bg-atd-warn-bg text-atd-warn-ink hover:bg-atd-warn-bg border border-atd-warn/40">
          ⏳ Em espera
        </Badge>
      );
    if (s === "bot_attending")
      return (
        <Badge className="bg-atd-ai-bg text-atd-ai-ink hover:bg-atd-ai-bg border border-atd-ai/30">
          ✦ Nina
        </Badge>
      );
    if (s === "closed" || s === "finished")
      return (
        <Badge className="bg-atd-idle-bg text-atd-idle-ink hover:bg-atd-idle-bg border border-atd-border">
          ✓ Fechada
        </Badge>
      );
    return <Badge variant="outline">{s}</Badge>;
  };

  return (
    <RelogioEsperaProvider>
    <div className="h-full overflow-hidden -mx-3 sm:-mx-4 lg:-mx-6 px-2 sm:px-3 lg:px-3">
      <div className="flex h-full gap-2 overflow-hidden">
        {/* COLUNA 1 — LISTA (encolhe/expande no hover, ou fica fixa) */}
        <Card
          data-a11y-secundario="true"
          ref={painelRef}
          className={`shrink-0 flex flex-col overflow-hidden transition-[width] duration-200 ease-out ${
            painelAberto ? "w-[300px]" : "w-[52px]"
          }`}
        >
          {!painelAberto && (
            <div className="flex h-full w-[52px] flex-col items-center gap-2 py-3">
              <MessageSquare className="h-5 w-5 text-muted-foreground" />
              <Badge variant="outline" className="px-1 text-[10px]">
                {convs.length}
              </Badge>
              <Circle
                className={`h-3 w-3 fill-current ${
                  pausaAtiva || ausenteAuto
                    ? "text-atd-warn"
                    : filaAberta
                      ? "text-atd-ok"
                      : "text-atd-idle"
                }`}
              />

            </div>
          )}
          <div className={`${painelAberto ? "flex" : "hidden"} w-[300px] flex-1 flex-col overflow-hidden`}>
          <div className="shrink-0 border-b p-2 space-y-1.5">
            <div className="flex items-center gap-1">
              <span className="block text-[11px] font-medium text-muted-foreground">Meu status</span>
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto h-6 w-6 p-0"
                title={painelFixado ? "Desafixar painel" : "Fixar painel aberto"}
                onClick={alternarFixado}
              >
                {painelFixado ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
              </Button>
            </div>

            <div className="grid grid-cols-3 gap-1">
              <Button
                size="sm"
                variant={online ? "default" : "outline"}
                className={`h-7 px-1 text-[11px] ${
                  online ? "bg-atd-ok hover:bg-atd-ok/90 text-atd-on-strong" : "text-atd-ok border-atd-ok/40"
                }`}
                onClick={() => definirStatus("online")}
              >
                <Circle className="h-2.5 w-2.5 mr-1 fill-current" /> Online
              </Button>
              <Button
                size="sm"
                variant={pausaAtiva || ausenteAuto ? "default" : "outline"}
                className={`h-7 px-1 text-[11px] ${
                  pausaAtiva || ausenteAuto
                    ? "bg-atd-warn hover:bg-atd-warn/90 text-atd-warn-ink"
                    : "text-atd-warn-ink border-atd-warn/40"
                }`}
                onClick={() => definirStatus("pausa")}
              >
                <Coffee className="h-3 w-3 mr-1" /> Pausa
              </Button>

              <Button
                size="sm"
                variant={!pausaAtiva && !filaAberta ? "default" : "outline"}
                className={`h-7 px-1 text-[11px] ${
                  !pausaAtiva && !filaAberta
                    ? "bg-atd-idle hover:bg-atd-idle/90 text-atd-on-strong"
                    : "text-atd-idle-ink border-atd-border"
                }`}
                onClick={() => definirStatus("offline")}
              >
                <PowerOff className="h-3 w-3 mr-1" /> Offline
              </Button>
            </div>
            {ausenteAuto && !pausaAtiva && (
              <p className="text-[11px] text-atd-warn-ink">
                Pausa automática por inatividade — mexa na tela para voltar a receber conversas.
              </p>
            )}
            {pausaAtiva?.atend_pause_reasons?.nome && (

              <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <span className="truncate flex-1">Em pausa · {pausaAtiva.atend_pause_reasons.nome}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-1.5 text-[11px]"
                  onClick={async () => {
                    if (!clinicaId) return;
                    await finalizarPausaFn({ data: { clinicaId } });
                    await carregarStatusAgente();
                    toast.success("Pausa finalizada");
                  }}
                >
                  Encerrar
                </Button>
              </div>
            )}
            <FilaHumana
              onAssumida={(id) => {
                const c = convs.find((x: any) => x.id === id);
                if (c) setSel({ ...c, owner_type: "HUMAN", status: "active" });
                abrirPelaUrl(id);
                void carregarConvs();
              }}
            />
          </div>
          <CardHeader className="py-2 space-y-2">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              <CardTitle className="text-base">Inbox</CardTitle>
              <Badge variant="outline" className="ml-auto">
                {convsVisiveis.length}
              </Badge>
            </div>
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2 top-2.5 text-muted-foreground" />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="pl-7 h-8 text-sm"
                placeholder="Buscar nome, telefone, protocolo…"
              />
            </div>
            <Select
              value={escopo}
              onValueChange={(v) => setEscopo(v as EscopoInbox)}
              onOpenChange={setPainelMenuAberto}
            >
              <SelectTrigger className="h-8 text-xs" aria-label="Escopo das conversas">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-50 min-w-[--radix-select-trigger-width]">
                <SelectItem value="minhas">Minhas conversas ({contadores.minhas})</SelectItem>
                <SelectItem value="nina">Nina ({contadores.nina})</SelectItem>
                <SelectItem value="nao_atribuidas">
                  Não atribuídas ({contadores.nao_atribuidas})
                </SelectItem>
                <SelectItem value="fechadas">Fechadas ({contadores.fechadas})</SelectItem>
                {souGestor && (
                  <SelectItem value="equipe">Equipe ({contadores.equipe})</SelectItem>
                )}
              </SelectContent>
            </Select>
            <Select
              value={filtroStatus}
              onValueChange={(v) => setFiltroStatus(v as any)}
              onOpenChange={setPainelMenuAberto}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-50 min-w-[--radix-select-trigger-width]">
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="waiting">Em espera</SelectItem>
                <SelectItem value="active">Ativas</SelectItem>
                <SelectItem value="bot_attending">Bot</SelectItem>
                <SelectItem value="closed">Fechadas</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={ordem}
              onValueChange={(v) => setOrdem(v as "recentes" | "espera")}
              onOpenChange={setPainelMenuAberto}
            >
              <SelectTrigger className="h-8 text-xs" aria-label="Ordenar conversas">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-50 min-w-[--radix-select-trigger-width]">
                <SelectItem value="recentes">Ordenar por: mais recentes</SelectItem>
                <SelectItem value="espera">Ordenar por: mais antigos aguardando</SelectItem>
              </SelectContent>
            </Select>
            {soNaoAtribuidas && (
              <button
                type="button"
                onClick={() => setSoNaoAtribuidas(false)}
                className="inline-flex items-center gap-1.5 rounded-md bg-atd-danger px-2 py-1 text-[11px] font-bold text-atd-on-strong"
                title="Mostrar todas as conversas"
              >
                Não atribuídas ({convsVisiveis.length}) ✕
              </button>
            )}

          </CardHeader>
          <div className="flex-1 overflow-auto border-t">
            {convsVisiveis.length === 0 && (
              <p className="p-4 text-sm text-muted-foreground">Nenhuma conversa.</p>
            )}
            {convsVisiveis.map((c) => (

              <button
                key={c.id}
                onClick={() => {
                  iniciarTroca(c.id);
                  medidor.current = criarMedidorConversa(`conversa ${c.id}`);
                  medidor.current.marcar("click");
                  // Só muda o endereço: a conversa aberta vem da URL.
                  abrirPelaUrl(c.id);
                }}
                onMouseEnter={() => agendarPrefetch(c.id)}
                onMouseLeave={() => cancelarPrefetch(c.id)}
                onFocus={() => agendarPrefetch(c.id)}
                onBlur={() => cancelarPrefetch(c.id)}
                className={`relative w-full border-b border-atd-border p-3 pl-4 text-left transition-colors hover:bg-atd-blue-hover ${
                  sel?.id === c.id
                    ? "bg-atd-blue-soft before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-atd-blue before:content-['']"
                    : "bg-atd-surface"
                }`}
              >

                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm truncate flex-1">
                    {c.contato_nome || c.contato_telefone || "—"}
                  </span>
                  {c.unread_count > 0 && (
                    <Badge className="bg-atd-blue text-atd-on-strong text-xs px-1.5 py-0">
                      {c.unread_count}
                    </Badge>
                  )}
                </div>
                <div className="flex min-h-[24px] flex-wrap items-center gap-1.5 mt-1">
                  {statusBadge(c.status)}
                  {c.owner_type === "NONE" && (
                    <Badge className="bg-atd-danger text-atd-on-strong text-[11px]">🔴 Não atribuída</Badge>
                  )}
                  {c.owner_type === "HUMAN" && (
                    <Badge className="bg-atd-human-bg text-atd-human-ink text-[11px] border border-atd-human-ink/20">👤 Humano</Badge>
                  )}
                  {c.owner_type === "AI" && (
                    <Badge className="bg-atd-ai-bg text-atd-ai-ink text-[11px] border border-atd-ai/30">✦ Nina</Badge>
                  )}
                  {c.handoff_motivo === "patient_response_timeout" && (
                    <Badge
                      title="Transferida automaticamente: o paciente não respondeu no prazo"
                      className="bg-atd-warn-bg text-atd-warn-ink text-[11px] border border-atd-warn"
                    >
                      🟡 Timeout da Nina — sem resposta por 30 min
                    </Badge>
                  )}
                  {c.atribuida_user_id && (
                    <Badge
                      className={`text-[11px] ${
                        c.atribuida_user_id === meuId
                          ? "bg-atd-go/15 text-atd-ink border border-atd-go/30"
                          : "bg-atd-warn-bg text-atd-warn-ink border border-atd-warn"
                      }`}
                    >
                      {c.atribuida_user_id === meuId ? "Você" : nomeUsuario(c.atribuida_user_id)}
                    </Badge>
                  )}
                  {c.protocol_number && (
                    <code className="text-[11px] text-muted-foreground">#{c.protocol_number}</code>
                  )}
                  <BadgeEspera desde={espera[c.id]} className="ml-auto" />
                </div>
                <div className="mt-1 min-h-[16px] truncate text-xs text-muted-foreground">
                  {c.ultima_msg_preview || "—"}
                </div>
                <div className="mt-0.5 min-h-[14px] text-[11px] text-muted-foreground">
                  {fmtData(c.ultima_msg_em)}
                </div>
              </button>
            ))}
          </div>
          </div>
        </Card>

        {/* COLUNA 2 — CHAT */}
        <Card
          data-a11y-principal="true"
          className="flex min-w-0 flex-1 flex-col overflow-hidden"
        >
          {!sel ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
              {erroAcesso ? (
                <>
                  <p className="font-medium text-foreground">{erroAcesso}</p>
                  <Button variant="outline" size="sm" onClick={() => setErroAcesso(null)}>
                    Voltar para a Inbox
                  </Button>
                </>
              ) : (
                "Selecione uma conversa"
              )}
            </div>
          ) : (
            <>
              <CardHeader className="py-2 border-b">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="text-base flex items-center gap-2 truncate">
                      {sel.contato_nome || sel.contato_telefone}
                      {statusBadge(sel.status)}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground flex items-center gap-2">
                      <Phone className="h-3 w-3" /> {sel.contato_telefone}
                      {sel.protocol_number && (
                        <>
                          {" "}
                          · <code>#{sel.protocol_number}</code>
                        </>
                      )}
                      {sel.sla_first_response_seg != null && (
                        <> · 1ª resp: {fmtSeg(sel.sla_first_response_seg)}</>
                      )}
                    </p>
                    {espera[sel.id] && (
                      <BadgeEspera
                        desde={espera[sel.id]}
                        prefixo="Aguardando resposta há"
                        className="mt-1"
                      />
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {!conversaEncerrada && !souResponsavel && podeAtender && (
                      <Button
                        size="sm"
                        variant="default"
                        disabled={assumindo || carregandoConversa}
                        className="bg-atd-blue text-atd-on-strong hover:bg-atd-blue/90"
                        onClick={() => (responsavelId ? setAssumirOpen(true) : assumir(false))}
                      >
                        {assumindo ? (
                          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <UserCheck className="mr-1 h-3.5 w-3.5" />
                        )}
                        Assumir conversa
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="default"
                      disabled={!souResponsavel || conversaEncerrada || carregandoConversa}
                      className="bg-atd-go text-atd-on-strong hover:bg-atd-go-hover"
                      onClick={() => setAgendaOpen(true)}
                    >
                      <CalendarPlus className="h-3.5 w-3.5 mr-1" /> Agendar
                    </Button>

                    {/* Conversas não atribuídas são distribuídas automaticamente
                        quando alguém fica online — sem botões manuais. */}
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={(!!responsavelId && !souResponsavel) || carregandoConversa}
                      className="border-atd-border text-atd-blue-ink hover:bg-atd-blue-tint hover:text-atd-blue-ink"
                      onClick={() => setTransferOpen(true)}
                    >
                      <ArrowRightLeft className="h-3.5 w-3.5 mr-1" /> Transferir
                    </Button>
                    {sel.status !== "closed" && sel.status !== "finished" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!souResponsavel || carregandoConversa}
                        className="border-atd-border text-atd-ink-soft hover:bg-atd-danger-bg hover:text-atd-danger-ink"
                        onClick={() => setFecharOpen(true)}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Encerrar
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <div
                aria-live="polite"
                className={`flex items-center gap-2 border-b px-3 py-1.5 text-xs ${
                  souResponsavel
                    ? "border-atd-go/30 bg-atd-go/10 text-atd-ink"
                    : responsavelId
                      ? "border-atd-warn bg-atd-warn-bg text-atd-warn-ink"
                      : "border-atd-border bg-atd-idle-bg text-atd-ink-soft"
                }`}
              >
                <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
                {sel.handoff_motivo === "patient_response_timeout" && (
                  <span className="rounded-full border border-atd-warn bg-atd-warn-bg px-2 py-0.5 text-[11px] text-atd-warn-ink">
                    🟡 Timeout da Nina — sem resposta por 30 min
                  </span>
                )}
                <span className="truncate">
                  {souResponsavel
                    ? "Você é o responsável por esta conversa."
                    : responsavelId
                      ? `Em atendimento por ${nomeUsuario(responsavelId)} — modo somente leitura.`
                      : "Sem responsável. Assuma para responder."}
                </span>
              </div>
              <div className="relative flex-1 min-h-0">
              <div
                ref={chat.containerRef}
                className="h-full overflow-auto p-4 space-y-2 bg-atd-bg"
              >

                {conteudoDaConversa && temMaisAntigas && (
                  <div className="flex justify-center pb-1">
                    <button
                      type="button"
                      onClick={() => void carregarAntigas()}
                      disabled={carregandoAntigas}
                      className="rounded-full border border-atd-border bg-atd-surface px-3 py-1 text-xs text-atd-ink-soft hover:bg-atd-blue-hover disabled:opacity-60"
                    >
                      {carregandoAntigas ? "Carregando…" : "Carregar mensagens anteriores"}
                    </button>
                  </div>
                )}
                {clinicaId && conteudoDaConversa && (
                  <ResumoHandoffCard key={sel.id} clinicaId={clinicaId} conversaId={sel.id} />
                )}
                {!conteudoDaConversa && <ConversaSkeleton />}
                {conteudoDaConversa && msgs.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center">Sem mensagens.</p>
                )}
                {(conteudoDaConversa ? timeline : []).map((item, idxTimeline) => {
                  if (item.kind === "evento") {
                    return <ConversationSystemEvent key={`ev-${item.ev.id}`} evento={item.ev} />;
                  }
                  const m = item.msg;
                  const out = m.direction === "out";
                  if (m.enviada_por === "sistema") {
                    return (
                      <div key={m.id} className="flex justify-center">
                        <div className="max-w-[85%] whitespace-pre-wrap rounded-lg border border-atd-blue/20 bg-atd-blue-tint px-3 py-2 text-center text-xs text-atd-blue-ink">
                          {m.body}
                          <div className="mt-1 text-[10px] opacity-70">
                            {fmtHora(m.recebida_em)}
                          </div>
                        </div>
                      </div>
                    );
                  }
                  const daNina = out && m.enviada_por === "nina";
                  // Pergunta do paciente = última mensagem recebida antes desta.
                  let perguntaPaciente: string | null = null;
                  if (daNina) {
                    for (let i = idxTimeline - 1; i >= 0; i--) {
                      const ant = timeline[i];
                      if (ant.kind !== "msg") continue;
                      if (ant.msg.direction === "in") {
                        perguntaPaciente = ant.msg.body ?? ant.msg.transcricao ?? null;
                        break;
                      }
                    }
                  }
                  return (
                    <div key={m.id} className={`flex ${out ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[68%] rounded-2xl px-3 py-2 text-sm shadow-sm break-words ${
                          out
                            ? "bg-atd-go text-atd-on-strong rounded-br-sm"
                            : "bg-atd-surface border border-atd-border text-atd-ink rounded-bl-sm"
                        }`}
                      >
                        <div className="whitespace-pre-wrap">{m.body || `[${m.tipo}]`}</div>
                        <div
                          className={`text-[11px] mt-1 flex items-center justify-between gap-2 ${out ? "text-atd-on-strong/80" : "text-atd-ink-soft"}`}
                        >
                          <span className="whitespace-nowrap">
                            {fmtHora(m.recebida_em)} {m.enviada_por === "nina" && "· Nina"}
                          </span>
                          {daNina && clinicaId && (
                            <ReportarErroNinaBotao
                              clinicaId={clinicaId}
                              conversaId={sel.id}
                              mensagemId={m.id}
                              respostaNina={m.body ?? ""}
                              perguntaPaciente={perguntaPaciente}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {/* Âncora do fim da conversa: é para cá que a tela vai ao abrir. */}
                <div ref={chat.ancoraRef} />
              </div>
              {chat.novas > 0 && (
                <button
                  type="button"
                  onClick={() => chat.irParaFim(true)}
                  className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-atd-border bg-atd-surface px-3 py-1.5 text-xs font-medium text-atd-ink shadow-md hover:bg-atd-bg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                  aria-live="polite"
                >
                  ↓ {rotuloNovasMensagens(chat.novas)}
                </button>
              )}
              </div>

              <div className="border-t p-3 space-y-2">
                {motivoBloqueio && (
                  <div className="flex items-start gap-1.5 rounded-md border border-atd-warn bg-atd-warn-bg px-2 py-1.5 text-xs text-atd-warn-ink">
                    <span aria-hidden="true">⚠️</span>
                    <span>{motivoBloqueio}</span>
                  </div>
                )}
                <div className="relative flex gap-2">
                  {slash && (
                    <ListaRespostasRapidas
                      itens={itensResp}
                      indice={slashIdx}
                      termo={slash.termo}
                      favoritos={respostasRapidas.favoritos}
                      onSelecionar={inserirRespostaRapida}
                      onIndice={setSlashIdx}
                      onFavoritar={respostasRapidas.favoritar}
                    />
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    title="Respostas rápidas"
                    aria-label="Respostas rápidas"
                    aria-expanded={!!slash}
                    className="h-9 w-9 shrink-0 p-0 text-atd-ink-soft"
                    disabled={enviando || !!motivoBloqueio}
                    onClick={() => {
                      const el = composerRef.current;
                      const pos = el?.selectionStart ?? draft.length;
                      setSlash((s) => (s ? null : { inicio: pos, fim: pos, termo: "" }));
                      el?.focus();
                    }}
                  >
                    <Zap className="h-4 w-4" />
                  </Button>
                  <Textarea
                    ref={composerRef}
                    value={draft}
                    onChange={(e) => {
                      setDraft(e.target.value);
                      setSlash(
                        detectarComandoNoTexto(e.target.value, e.target.selectionStart ?? 0),
                      );
                    }}
                    onBlur={() => setSlash(null)}
                    onKeyDown={(e) => {
                      // Com a lista aberta, o teclado navega nela — Enter insere
                      // a resposta no campo e NUNCA envia a mensagem.
                      if (slash && itensResp.length > 0) {
                        if (e.key === "ArrowDown") {
                          e.preventDefault();
                          setSlashIdx((i) => (i + 1) % itensResp.length);
                          return;
                        }
                        if (e.key === "ArrowUp") {
                          e.preventDefault();
                          setSlashIdx((i) => (i - 1 + itensResp.length) % itensResp.length);
                          return;
                        }
                        if (e.key === "Enter" || e.key === "Tab") {
                          e.preventDefault();
                          const escolhida = itensResp[slashIdx];
                          if (escolhida) inserirRespostaRapida(escolhida);
                          return;
                        }
                      }
                      if (slash && e.key === "Escape") {
                        e.preventDefault();
                        setSlash(null);
                        return;
                      }
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        enviar();
                      }
                    }}
                    placeholder={
                      motivoBloqueio
                        ? "Envio bloqueado"
                        : "Mensagem… (digite / para respostas rápidas)"
                    }
                    rows={1}
                    className="min-h-9 resize-none border-atd-border bg-atd-surface focus-visible:border-atd-blue focus-visible:ring-2 focus-visible:ring-atd-blue/30"
                    disabled={enviando || !!motivoBloqueio}
                  />

                  <Button
                    onClick={enviar}
                    disabled={enviando || !draft.trim() || !!motivoBloqueio}
                    className="bg-atd-go text-atd-on-strong hover:bg-atd-go-hover disabled:bg-atd-idle-bg disabled:text-atd-ink-soft"
                  >
                    {enviando ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </>
          )}
        </Card>

        {/* COLUNA 3 — CONTATO (encolhe/expande no hover, ou fica fixa) */}
        <Card
          data-a11y-secundario="true"
          ref={contatoRef}
          className={`hidden lg:flex shrink-0 flex-col overflow-hidden transition-[width] duration-200 ease-out ${
            contatoAberto ? "w-[260px] xl:w-[300px]" : "w-[52px]"
          }`}
        >
          {!contatoAberto && (
            <div className="flex h-full w-[52px] flex-col items-center gap-2 py-3">
              <Users className="h-5 w-5 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground [writing-mode:vertical-rl]">
                Contato
              </span>
            </div>
          )}
          <div
            className={`${contatoAberto ? "flex" : "hidden"} w-[260px] xl:w-[300px] flex-1 flex-col overflow-hidden`}
          >
          <CardHeader className="py-2 border-b">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">Contato</CardTitle>
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto h-6 w-6 p-0"
                title={contatoFixado ? "Desafixar painel" : "Fixar painel aberto"}
                onClick={alternarContatoFixado}
              >
                {contatoFixado ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </CardHeader>

          <div className="flex-1 overflow-auto p-3 space-y-4 text-sm">
            {!contatoAtual ? (
              // O esqueleto é só deste painel: o chat nunca espera pelo contato.
              !dadosSecundariosProntos ? (
                <ContatoSkeleton />
              ) : (
                <p className="text-muted-foreground">—</p>
              )
            ) : (
              <>
                <section>
                  <div className="font-medium">
                    {contatoAtual.paciente?.nome ||
                      contatoAtual.conversa?.contato_nome ||
                      contatoAtual.conversa?.contato_telefone ||
                      "Sem nome"}
                  </div>
                  <div className="text-xs text-muted-foreground space-y-0.5 mt-1">
                    {(contatoAtual.conversa?.contato_telefone || contatoAtual.paciente?.telefone) && (
                      <div>
                        📱 {contatoAtual.conversa?.contato_telefone || contatoAtual.paciente?.telefone}
                      </div>
                    )}
                    {contatoAtual.paciente?.email && <div>✉️ {contatoAtual.paciente.email}</div>}
                    {contatoAtual.paciente?.cpf && <div>CPF: {contatoAtual.paciente.cpf}</div>}
                    {contatoAtual.paciente?.cidade && (
                      <div>
                        📍 {contatoAtual.paciente.cidade}/{contatoAtual.paciente.estado}
                      </div>
                    )}
                    {contatoAtual.conversa?.protocolo && (
                      <div>Protocolo: {contatoAtual.conversa.protocolo}</div>
                    )}
                    {contatoAtual.conversa?.canal && <div>Canal: {contatoAtual.conversa.canal}</div>}
                    {contatoAtual.conversa?.status && <div>Status: {contatoAtual.conversa.status}</div>}
                    {contatoAtual.conversa?.atend_departamentos?.nome && (
                      <div>Depto: {contatoAtual.conversa.atend_departamentos.nome}</div>
                    )}
                    {contatoAtual.conversa?.ultima_mensagem_em && (
                      <div>Última mensagem: {fmtData(contatoAtual.conversa.ultima_mensagem_em)}</div>
                    )}
                  </div>
                  {!contatoAtual.paciente && (
                    <div className="text-xs text-muted-foreground mt-2">
                      Não vinculado a paciente cadastrado.
                    </div>
                  )}
                </section>


                {contatoAtual.agendamentos?.length > 0 && (
                  <section>
                    <div className="text-xs font-semibold text-muted-foreground uppercase mb-1">
                      Agendamentos
                    </div>
                    {contatoAtual.agendamentos.map((a: any) => (
                      <div key={a.id} className="text-xs border rounded p-2 mb-1 space-y-0.5">
                        <div className="font-medium">
                          {a.procedimento || a.tipo_atendimento || "Consulta"}
                        </div>
                        <div className="text-muted-foreground">
                          Médico: {a.medico_nome || "não definido"}
                        </div>
                        <div className="text-muted-foreground">
                          {fmtData(a.inicio)} · {a.status}
                        </div>
                      </div>
                    ))}
                  </section>
                )}

                {contatoAtual.contratos?.length > 0 && (
                  <section>
                    <div className="text-xs font-semibold text-muted-foreground uppercase mb-1">
                      Contratos
                    </div>
                    {contatoAtual.contratos.map((c: any) => (
                      <div key={c.id} className="text-xs border rounded p-2 mb-1">
                        <div className="font-medium">#{c.numero}</div>
                        <div className="text-muted-foreground">
                          {c.status} · {fmtData(c.data_inicio)}
                        </div>
                      </div>
                    ))}
                  </section>
                )}

                <section>
                  <div className="text-xs font-semibold text-muted-foreground uppercase mb-1">
                    Notas internas
                  </div>
                  <div className="space-y-1.5">
                    {notas.length === 0 && (
                      <p className="text-xs text-muted-foreground">Sem notas.</p>
                    )}
                    {(dadosSecundariosProntos ? notas : []).map((n: any) => (
                      <div
                        key={n.id}
                        className="rounded border border-atd-ai-line bg-atd-ai-soft p-2 text-xs text-atd-ai-deep"
                      >
                        <div className="whitespace-pre-wrap">{n.conteudo}</div>
                        <div className="text-[11px] text-muted-foreground mt-1">
                          {fmtData(n.created_at)}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-1 mt-2">
                    <Textarea
                      value={novaNota}
                      onChange={(e) => setNovaNota(e.target.value)}
                      rows={2}
                      className="text-xs"
                      placeholder="Nota interna (não vai para o paciente)…"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={adicionarNota}
                      disabled={!novaNota.trim() || carregandoConversa}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </section>

                {contatoAtual.atribuido_nome && (
                  <section className="text-xs text-muted-foreground">
                    Atribuída a{" "}
                    <span className="font-medium text-foreground">{contatoAtual.atribuido_nome}</span>
                  </section>
                )}
              </>
            )}
          </div>
          </div>
        </Card>

        {/* Agenda dentro da conversa: não troca de tela nem perde o rascunho. */}
        {clinicaId && sel && (
          <AgendaConversaDrawer
            open={agendaOpen}
            onOpenChange={setAgendaOpen}
            clinicaId={clinicaId}
            conversaId={sel.id}
            contatoNome={sel.contato_nome ?? null}
            contatoTelefone={sel.contato_telefone ?? null}
            pacienteIdVinculado={contatoAtual?.paciente?.id ?? null}
            onMensagemPronta={(t) => setDraft((d) => (d ? `${d}\n${t}` : t))}
          />
        )}

        {/* DIALOGS */}

        <Dialog open={assumirOpen} onOpenChange={setAssumirOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Assumir conversa</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                void assumir(true, String(fd.get("motivo") || ""));
              }}
              className="space-y-3"
            >
              <p className="text-sm text-muted-foreground">
                Esta conversa está sendo atendida por{" "}
                <strong>{nomeUsuario(responsavelId)}</strong>. Ao assumir, essa pessoa passa a
                somente leitura e a troca fica registrada no histórico.
              </p>
              <div className="space-y-1">
                <Label htmlFor="motivo-assumir">Motivo (opcional)</Label>
                <Textarea id="motivo-assumir" name="motivo" rows={2} maxLength={500} />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setAssumirOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={assumindo}>
                  {assumindo && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                  Assumir mesmo assim
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Transferir conversa</DialogTitle>
            </DialogHeader>
            <form onSubmit={transferir} className="space-y-3">
              <div>
                <Label>Agente</Label>
                <Select name="userId">
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione (opcional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <div className="p-1 sticky top-0 bg-popover z-10">
                      <Input
                        autoFocus
                        value={buscaAgente}
                        onChange={(e) => setBuscaAgente(e.target.value)}
                        onKeyDown={(e) => e.stopPropagation()}
                        placeholder="Digite o nome do agente…"
                        className="h-8 text-sm"
                      />
                    </div>
                    {(() => {
                      const alvo = normalizarNomeBusca(buscaAgente);
                      const lista = usuarios.filter((u: any) =>
                        !alvo
                          ? true
                          : normalizarNomeBusca(
                              `${u.nome ?? ""} ${u.email ?? ""}`,
                            ).includes(alvo),
                      );
                      if (lista.length === 0)
                        return (
                          <p className="px-3 py-2 text-xs text-muted-foreground">
                            Nenhum agente encontrado.
                          </p>
                        );
                      return lista.map((u: any) => (
                        <SelectItem key={u.user_id} value={u.user_id}>
                          {u.nome ?? u.email ?? u.user_id}
                        </SelectItem>
                      ));
                    })()}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Departamento</Label>
                <Select name="departamentoId">
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione (opcional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {deptos.map((d: any) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Motivo</Label>
                <Input name="motivo" maxLength={200} />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setTransferOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit">Transferir</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={fecharOpen} onOpenChange={setFecharOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Encerrar conversa</DialogTitle>
            </DialogHeader>
            <form onSubmit={fechar} className="space-y-3">
              <div>
                <Label>Motivo</Label>
                <Input name="motivo" maxLength={120} placeholder="Resolvido, sem resposta, etc." />
              </div>
              <div>
                <Label>Resumo do atendimento</Label>
                <Textarea name="resumo" rows={4} maxLength={2000} />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setFecharOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit">Encerrar</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={pausaDialogOpen} onOpenChange={setPausaDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Entrar em pausa</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Motivo</Label>
            <Select value={pausaReasonSel} onValueChange={setPausaReasonSel}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o motivo" />
              </SelectTrigger>
              <SelectContent>
                {pauseReasons.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPausaDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={confirmarPausa}>Entrar em pausa</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </RelogioEsperaProvider>
  );
}

function Stat({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: any;
  tone?: string;
  icon: any;
}) {
  return (
    <div className="rounded-lg border bg-card p-3 flex items-center gap-3">
      <div
        className={`h-10 w-10 rounded-lg bg-muted flex items-center justify-center ${tone ?? ""}`}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-2xl font-semibold ${tone ?? ""}`}>{value}</div>
      </div>
    </div>
  );
}

