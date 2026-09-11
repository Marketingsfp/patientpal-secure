/**
 * Homologação da Nina — mesma experiência visual do atendimento real.
 *
 * A camada visual (lista de conversas, cabeçalho, balões, eventos de sistema,
 * scroll e composer) usa os MESMOS componentes e tokens do inbox real
 * (`AtendimentoExtraTabs`). O que muda é apenas a fonte de dados: aqui ela vem
 * dos 10 leads de teste (`teste-console.functions`), que nunca passam pela
 * camada de transporte do WhatsApp — nada é enviado ao paciente.
 *
 * Fluxo: mensagem de teste → adapter de homologação → pipeline real da Nina →
 * resposta → conversa de homologação. Nunca → WhatsApp real.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  CheckCheck,
  Download,
  FlaskConical,
  RefreshCw,
  Send,
  Wrench,
  Bot,
  Pause,
  Play,
  Square,
} from "lucide-react";
import { toast } from "sonner";
import { useClinica } from "@/hooks/use-clinica";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { mostrarErro } from "@/lib/traduzir-erro";
import {
  listarLeadsTeste,
  historicoLeadTeste,
  enviarMensagemTeste,
  resolverConversaTeste,
  ferramentasUsadasTeste,
  marcarLeadTesteLido,
  detalheExecucaoTeste,
  diagnosticoCiclosLead,
} from "@/lib/nina/teste-console.functions";
import {
  iniciarSimulacaoTerra,
  proximaMensagemTerra,
  controlarSimulacaoTerra,
  simulacaoAtualTerra,
} from "@/lib/nina/simulador-terra.functions";
import { AvaliacaoSol } from "@/components/nina/AvaliacaoSol";
import { descreverEventoRastreio } from "@/lib/nina/arquitetura/estado-evento";
import { valorOuNaoRegistrado } from "@/lib/nina/evidencias-resumo";
import { EvidenciasLimites } from "@/components/nina/EvidenciasLimites";

import {
  CENARIOS_SUGERIDOS,
  DETALHES,
  ESTILOS,
  LIMITES_PADRAO,
  PERSONA_PADRAO,
  ROTULO_MOTIVO,
  type EstiloPersona,
  type Limites,
  type NivelDetalhe,
  type Persona,
} from "@/lib/nina/simulador-terra";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ConversationSystemEvent,
  type ConversaEvento,
} from "@/components/nina/ConversationSystemEvent";
import { NinaMessage, TypingDots } from "@/components/nina/NinaMessage";
import { ReportarErroNinaBotao } from "@/components/nina/ReportarErroNinaDialog";
import { RegistroTurnoResumo } from "@/components/nina/RegistroTurnoResumo";

import {
  ConfiancaMensagemBadge,
  ConfiancaNaoAvaliadaBadge,
  useConfiancaMensagens,
} from "@/components/nina/ConfiancaMensagem";
import {
  execucoesDasRespostasNina,
  montarMetadadosMensagemNina,
} from "@/lib/nina/mensagem-meta";

import { ConversaSkeleton } from "@/components/nina/ConversaSkeleton";
import { useChatScroll } from "@/hooks/use-chat-scroll";
import { formatarDataHoraMensagem } from "@/lib/atendimento/data-hora";
import { textoMarcadorSistema } from "@/lib/atendimento/marcador-handoff";
import { definirSelecaoTeste } from "@/lib/webmcp/selecao-teste";
import { assinarAtualizacao } from "@/lib/webmcp/atualizacao";
import {
  rotuloAutorResumo,
  aplicarMensagemRealtime,
  type MensagemResumoRow,
} from "@/lib/nina/leads-resumo";
import { supabase } from "@/integrations/supabase/client";
import {
  aceitaMensagemRealtime,
  mesclarMensagemTimeline,
  paraMensagemTimeline,
  reconciliarHistorico,
  waIdDoEnvio,
  type LinhaMensagemRealtime,
} from "@/lib/nina/homologacao-realtime";


type Lead = {
  id: string;
  indice: number;
  nome: string;
  telefone: string;
  sessao: number;
  conversaId: string | null;
  cicloId?: string | null;
  status: string;
  mensagens: number;
  /** FASE 2 — resumo da última mensagem conversacional (paciente ou Nina). */
  ultimaMensagemId?: string | null;
  ultimaMensagemTexto?: string | null;
  /** FASE 4 — fonte estável de "atividade recente" (só conversa). */
  ultimaAtividadeEm?: string | null;
  ultimaMensagemAutor?: "paciente" | "nina" | "atendente" | null;
  ultimaMensagemEm?: string | null;
  naoLidas?: number;
};


type Msg = {
  id: string;
  /** Conversa REAL da mensagem: o lead pode ter vários ciclos/conversas. */
  conversa_id?: string | null;
  direction: string;
  body: string | null;
  enviada_por: string | null;
  created_at: string;
  execucao_id?: string | null;
  /** Identidade idempotente do envio — usada para reconciliar a bolha. */
  wa_message_id?: string | null;
  /** Estado individual desta mensagem (nunca um estado global da tela). */
  estado?: "pending" | "confirmed" | "failed";
};

/** Rastro técnico de uma chamada de ferramenta feita pela Nina no teste. */
type EventoFerramenta = {
  id: string;
  em: string;
  ferramenta: string;
  argumentos: unknown;
  ms: number;
  ok: boolean;
  erro: string | null;
  resposta: unknown;
};

type TipoMensagem = "text" | "audio" | "image" | "document" | "sticker";

/**
 * Nome de exibição do lead: sempre "Paciente Teste NN", para que seja
 * impossível confundir homologação com um paciente real.
 */
function nomeLead(l: Pick<Lead, "indice">): string {
  return `Paciente Teste ${String(l.indice).padStart(2, "0")}`;
}

export function HomologacaoInbox() {
  const { clinicaAtual } = useClinica();
  const clinicaId = clinicaAtual?.clinica_id;
  const podeEscrever = usePodeEscrever("nina");

  const listar = useServerFn(listarLeadsTeste);
  const historico = useServerFn(historicoLeadTeste);
  const enviar = useServerFn(enviarMensagemTeste);
  const resolver = useServerFn(resolverConversaTeste);
  const ferramentasFn = useServerFn(ferramentasUsadasTeste);
  const marcarLido = useServerFn(marcarLeadTesteLido);

  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadId, setLeadId] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [eventosConversa, setEventosConversa] = useState<ConversaEvento[]>([]);
  const [conversaId, setConversaId] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [carregandoConversa, setCarregandoConversa] = useState(false);
  /**
   * Quantos envios estão sendo processados pela Nina AGORA. É contador, não
   * boolean: podem existir vários envios em andamento ao mesmo tempo, e o
   * indicador só some quando o último termina. Serve apenas para informar
   * ("Nina está digitando") — nunca para travar o composer.
   */
  const [emProcessamento, setEmProcessamento] = useState(0);
  const processando = emProcessamento > 0;
  const [erro, setErro] = useState<string | null>(null);
  const [ultimoTexto, setUltimoTexto] = useState("");
  const [tipo, setTipo] = useState<TipoMensagem>("text");
  // FASE 3 — detalhe técnico de uma execução da Nina (prompt, versão,
  // conhecimento, ferramentas, modelo, erros e resposta).
  const carregarDetalhe = useServerFn(detalheExecucaoTeste);
  const [detalhe, setDetalhe] = useState<any | null>(null);
  const [detalheAberto, setDetalheAberto] = useState(false);
  const [detalheCarregando, setDetalheCarregando] = useState(false);
  const abrirDetalhe = useCallback(
    async (execucaoId: string) => {
      if (!clinicaId) return;
      setDetalheAberto(true);
      setDetalheCarregando(true);
      setDetalhe(null);
      try {
        const r = await carregarDetalhe({ data: { clinicaId, execucaoId } });
        setDetalhe(r);
      } catch (e) {
        mostrarErro(e);
        setDetalheAberto(false);
      } finally {
        setDetalheCarregando(false);
      }
    },
    [carregarDetalhe, clinicaId],
  );
  const [audio, setAudio] = useState<string | null>(null);
  const [limparAgenda, setLimparAgenda] = useState(true);
  const [ferramentas, setFerramentas] = useState<EventoFerramenta[]>([]);
  const [debugEstado, setDebugEstado] = useState<Record<string, unknown> | null>(null);
  const [painelTecnico, setPainelTecnico] = useState(false);

  // FASE 5 — diagnóstico dos ciclos (prova de que a memória foi zerada).
  const diagnosticoCiclos = useServerFn(diagnosticoCiclosLead);
  const [ciclos, setCiclos] = useState<any[]>([]);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  // FASE 4 — simulador automático de paciente (GPT Terra).
  const iniciarSim = useServerFn(iniciarSimulacaoTerra);
  const proximaSim = useServerFn(proximaMensagemTerra);
  const controlarSim = useServerFn(controlarSimulacaoTerra);
  const simAtual = useServerFn(simulacaoAtualTerra);
  const [modo, setModo] = useState<"manual" | "terra">("manual");
  const [cenario, setCenario] = useState<string>(CENARIOS_SUGERIDOS[0] ?? "");
  const [persona, setPersona] = useState<Persona>(PERSONA_PADRAO);
  const [limites, setLimites] = useState<Limites>(LIMITES_PADRAO);
  const [sim, setSim] = useState<
    { id: string; status: string; turnos: number; maxTurnos: number } | null
  >(null);
  const [simMotivo, setSimMotivo] = useState<string | null>(null);
  const controleRef = useRef<{ parar: boolean; pausar: boolean }>({ parar: false, pausar: false });
  const rodandoRef = useRef(false);


  // Mensagens e eventos na MESMA linha do tempo, ordenados por created_at.
  const timeline = useMemo<
    ({ id: string; em: string } & (
      | { kind: "msg"; msg: Msg }
      | { kind: "evento"; evento: ConversaEvento }
    ))[]
  >(() => {
    const itens = [
      ...msgs.map((m) => ({ id: `m-${m.id}`, em: m.created_at, kind: "msg" as const, msg: m })),
      ...eventosConversa.map((e) => ({
        id: `e-${e.id}`,
        em: e.created_at,
        kind: "evento" as const,
        evento: e,
      })),
    ];
    return itens.sort((a, b) => a.em.localeCompare(b.em));
  }, [msgs, eventosConversa]);

  // FASE 1 — mesma leitura de confiança da Inbox de produção: UM lote por
  // conversa (sem consulta por balão) e nada é recalculado na tela.
  const execucoesDaNina = useMemo(() => execucoesDasRespostasNina(msgs), [msgs]);
  const confiancaPorExecucao = useConfiancaMensagens(clinicaId, execucoesDaNina);

  /** Metadados internos padronizados da mensagem (produção/homologação/teste). */
  const metadadosDaMensagem = useCallback(
    (m: Msg) => {
      const c = m.execucao_id ? confiancaPorExecucao[String(m.execucao_id)] : undefined;
      const cicloAtual = ciclos.length > 0 ? (ciclos[ciclos.length - 1] as any) : null;
      return montarMetadadosMensagemNina({
        messageId: m.id,
        conversaTesteId: m.conversa_id ?? conversaId,
        isTeste: true,
        cicloId: cicloAtual?.cycle_id ?? leads.find((l) => l.id === leadId)?.cicloId ?? null,
        ninaSessionId: cicloAtual?.nina_session_id ?? null,
        criadaEm: m.created_at,
        execucaoId: m.execucao_id ?? null,
        confianca: c ? { score: c.score, nivel: c.nivel } : null,
      });
    },
    [conversaId, confiancaPorExecucao, ciclos, leads, leadId],
  );



  const chat = useChatScroll({
    conversaId: leadId,
    total: timeline.length,
    ultimoId: timeline[timeline.length - 1]?.id ?? null,
  });

  const leadAtual = leads.find((l) => l.id === leadId) ?? null;

  // Carrega o diagnóstico só quando o painel técnico está aberto (leitura leve).
  useEffect(() => {
    if (!painelTecnico || !clinicaId || !leadId) return;
    let vivo = true;
    void diagnosticoCiclos({ data: { clinicaId, leadId } })
      .then((r: any) => {
        if (vivo) setCiclos(r?.ciclos ?? []);
      })
      .catch(() => {
        if (vivo) setCiclos([]);
      });
    return () => {
      vivo = false;
    };
  }, [painelTecnico, clinicaId, leadId, diagnosticoCiclos, msgs.length]);

  // Informa à ferramenta WebMCP de leitura qual lead está aberto.
  useEffect(() => {
    const lead = leads.find((l) => l.id === leadId) ?? null;
    definirSelecaoTeste(lead ? { leadId: lead.id, leadNome: lead.nome, conversaId } : null);
    return () => definirSelecaoTeste(null);
  }, [leadId, conversaId, leads]);

  const carregarLeads = useCallback(
    async (silencioso = false) => {
      if (!clinicaId) return;
      if (!silencioso) setCarregando(true);
      try {
        const r = (await listar({ data: { clinicaId } })) as { leads: Lead[] };
        setLeads(r.leads);
        setLeadId((atual) => atual ?? r.leads[0]?.id ?? null);
      } catch (e: any) {
        if (!silencioso) mostrarErro(e);
      } finally {
        if (!silencioso) setCarregando(false);
      }
    },
    [clinicaId, listar],
  );

  /**
   * FASE 4 — inbox em tempo real.
   *
   * Cada mensagem nova é aplicada NA HORA no card certo (prévia, horário,
   * total e bolinha azul), usando o identificador da mensagem para não contar
   * duas vezes. Logo depois, uma recarga silenciosa reconcilia os números com
   * o banco. Só escuta mensagens desta clínica e nunca toca no atendimento
   * real.
   */
  const aplicadasRef = useRef<Set<string>>(new Set());
  const leadAbertoRef = useRef<string | null>(null);
  leadAbertoRef.current = conversaId;
  useEffect(() => {
    if (!clinicaId) return;
    let pendente: ReturnType<typeof setTimeout> | null = null;
    const canal = supabase
      .channel(`homologacao-leads-${clinicaId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "whatsapp_mensagens",
          filter: `clinica_id=eq.${clinicaId}`,
        },
        (payload) => {
          const nova = (payload as any).new as MensagemResumoRow | null;
          // Timeline em tempo real: a mensagem entra na hora na conversa
          // aberta, sem esperar recarga do histórico. Só entra se for desta
          // clínica, desta conversa e do ambiente de HOMOLOGAÇÃO — mensagem
          // real do WhatsApp nunca aparece aqui.
          if (
            aceitaMensagemRealtime(nova as unknown as LinhaMensagemRealtime, {
              ambiente: "homologacao",
              clinicaId,
              conversaId: leadAbertoRef.current,
            })
          ) {
            setMsgs((atuais) =>
              mesclarMensagemTimeline(
                atuais,
                paraMensagemTimeline(nova as unknown as LinhaMensagemRealtime),
              ),
            );
            const oficial = (nova as any).wa_message_id as string | null;
            if (oficial) {
              for (const [chave, o] of otimistasRef.current) {
                if (o.msg.wa_message_id === oficial) otimistasRef.current.delete(chave);
              }
            }
          }
          if (nova?.id && nova.conversa_id && !aplicadasRef.current.has(nova.id)) {
            const jaAplicada = false;
            const abertoAgora =
              leadAbertoRef.current === nova.conversa_id &&
              (typeof document === "undefined" || document.visibilityState === "visible");
            aplicadasRef.current.add(nova.id);
            if (aplicadasRef.current.size > 500) aplicadasRef.current.clear();
            setLeads((ls) =>
              ls.map((l) =>
                l.conversaId === nova.conversa_id
                  ? ({
                      ...l,
                      ...aplicarMensagemRealtime(l, nova, { jaAplicada, abertoAgora }),
                    } as Lead)
                  : l,
              ),
            );
          }
          if (pendente) clearTimeout(pendente);
          pendente = setTimeout(() => void carregarLeads(true), 800);
        },
      )
      .subscribe();
    return () => {
      if (pendente) clearTimeout(pendente);
      void supabase.removeChannel(canal);
    };
  }, [clinicaId, carregarLeads]);



  useEffect(() => {
    void carregarLeads();
  }, [carregarLeads]);

  /**
   * FASE 4 — troca rápida entre Teste 01 → 02 → 03: guardamos qual lead está
   * aberto e descartamos qualquer resposta atrasada de um lead anterior, para
   * que nenhum card receba mensagens, horário ou contador de outro.
   */
  const leadSelecionadoRef = useRef<string | null>(null);

  /**
   * Bolhas otimistas: a mensagem do testador aparece na hora e continua na
   * tela até o histórico do servidor já contê-la. Ficam guardadas por lead —
   * uma bolha do Teste 01 nunca aparece no Teste 02.
   */
  const otimistasRef = useRef<Map<string, { leadId: string; msg: Msg }>>(new Map());
  const otimistasDoLead = useCallback(
    (id: string | null) =>
      id
        ? [...otimistasRef.current.values()].filter((o) => o.leadId === id).map((o) => o.msg)
        : [],
    [],
  );
  const registrarOtimista = useCallback(
    (lead: string, msg: Msg) => {
      otimistasRef.current.set(msg.id.replace("otimista:", ""), { leadId: lead, msg });
      if (leadSelecionadoRef.current === lead) setMsgs((atuais) => [...atuais, msg]);
    },
    [],
  );
  /**
   * O envio terminou. A bolha NÃO é removida: quem a substitui é a mensagem
   * oficial que chega pelo Realtime (mesma identidade `wa_message_id`), sem
   * piscar. Aqui só deixa de ser "pendente" para o controle interno.
   */
  const concluirOtimista = useCallback((chave: string) => {
    otimistasRef.current.delete(chave);
  }, []);

  /**
   * Falha de UMA mensagem: só ela é marcada. As outras seguem normalmente —
   * não existe estado de erro global travando a conversa.
   */
  const falharOtimista = useCallback((chave: string) => {
    const o = otimistasRef.current.get(chave);
    if (!o) return;
    otimistasRef.current.set(chave, { ...o, msg: { ...o.msg, estado: "failed" } });
    setMsgs((atuais) =>
      atuais.map((m) => (m.id === o.msg.id ? { ...m, estado: "failed" as const } : m)),
    );
  }, []);

  const carregarHistorico = useCallback(
    async (id: string) => {
      if (!clinicaId) return;
      leadSelecionadoRef.current = id;
      try {
        const r = (await historico({ data: { clinicaId, leadId: id } })) as {
          mensagens: Msg[];
          eventos?: ConversaEvento[];
          conversaId: string | null;
        };
        if (leadSelecionadoRef.current !== id) return; // resposta atrasada
        // As mensagens ainda em envio continuam visíveis: uma carga do
        // servidor não pode apagar o que o testador acabou de mandar.
        setMsgs(reconciliarHistorico(r.mensagens, otimistasDoLead(id)));
        setEventosConversa(r.eventos ?? []);
        setConversaId(r.conversaId);
        if (r.conversaId) {
          const f = (await ferramentasFn({
            data: { clinicaId, conversaId: r.conversaId },
          })) as { eventos: EventoFerramenta[]; debug?: Record<string, unknown> };
          if (leadSelecionadoRef.current !== id) return; // resposta atrasada
          setFerramentas(f.eventos);
          setDebugEstado(f.debug ?? null);
        } else {
          setFerramentas([]);
          setDebugEstado(null);
        }
      } catch (e: any) {
        mostrarErro(e);
      }
    },
    [clinicaId, historico, ferramentasFn, otimistasDoLead],
  );

  /**
   * FASE 3 — leitura individual dos leads de teste.
   *
   * Só marca como lido quando o testador abriu o lead E as mensagens estão
   * realmente na tela (aba visível). Prefetch, cache, hover ou recarga em
   * segundo plano não zeram o contador. A gravação é por usuário — a leitura
   * de um testador não interfere na de outro nem nos pacientes reais.
   */
  const marcadoRef = useRef<string>("");
  useEffect(() => {
    if (!clinicaId || !leadId || !conversaId) return;
    if (carregandoConversa) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    const ultima = msgs[msgs.length - 1];
    if (!ultima) return;
    const chave = `${conversaId}:${ultima.id}`;
    if (marcadoRef.current === chave) return;
    marcadoRef.current = chave;
    void (async () => {
      try {
        await marcarLido({ data: { clinicaId, conversaId, mensagemId: ultima.id } });
        setLeads((ls) => ls.map((l) => (l.id === leadId ? { ...l, naoLidas: 0 } : l)));
      } catch {
        marcadoRef.current = ""; // falhou: tenta de novo na próxima visualização
      }
    })();
  }, [clinicaId, leadId, conversaId, msgs, carregandoConversa, marcarLido]);


  /**
   * Rede de segurança: a resposta da Nina é gravada no banco pelo servidor,
   * mesmo que a chamada do navegador caia. Buscamos o histórico algumas vezes
   * até a resposta aparecer — assim nenhuma mensagem "some" da tela.
   */
  const aguardarResposta = useCallback(
    async (id: string, tentativas = 8) => {
      if (!clinicaId) return false;
      for (let i = 0; i < tentativas; i++) {
        try {
          const r = (await historico({ data: { clinicaId, leadId: id } })) as {
            mensagens: Msg[];
            eventos?: ConversaEvento[];
            conversaId: string | null;
          };
          setMsgs(reconciliarHistorico(r.mensagens, otimistasDoLead(id)));
          setEventosConversa(r.eventos ?? []);
          setConversaId(r.conversaId);
          const ultima = r.mensagens[r.mensagens.length - 1];
          if (ultima && ultima.direction === "out") return true;
        } catch {
          /* tenta de novo */
        }
        await new Promise((res) => setTimeout(res, 2500));
      }
      return false;
    },
    [clinicaId, historico, otimistasDoLead],
  );

  // FASE 8 — "Ver conversa" no Relatório da homologação seleciona o lead aqui.
  useEffect(() => {
    function abrir(ev: Event) {
      const d = (ev as CustomEvent).detail as { leadIndice?: number | null; conversaId?: string | null };
      const alvo =
        leads.find((l) => l.conversaId && l.conversaId === d?.conversaId) ??
        (typeof d?.leadIndice === "number" ? leads.find((l) => l.indice === d.leadIndice) : null);
      if (alvo) setLeadId(alvo.id);
    }
    window.addEventListener("nina:abrir-lead-teste", abrir);
    return () => window.removeEventListener("nina:abrir-lead-teste", abrir);
  }, [leads]);

  useEffect(() => {
    if (!leadId) {
      setMsgs([]);
      setEventosConversa([]);
      setConversaId(null);
      setAudio(null);
      return;
    }
    setCarregandoConversa(true);
    setAudio(null);
    setErro(null);
    marcadoRef.current = "";
    void carregarHistorico(leadId).finally(() => setCarregandoConversa(false));
  }, [leadId, carregarHistorico]);

  // Trocar de lead interrompe o loop automático do lead anterior e carrega a
  // situação da última simulação daquele lead (cada lead é independente).
  useEffect(() => {
    controleRef.current.parar = true;
    setSim(null);
    setSimMotivo(null);
    if (!clinicaId || !leadId) return;
    let vivo = true;
    void (async () => {
      try {
        const r = (await simAtual({ data: { clinicaId, leadId } })) as { simulacao: any };
        if (!vivo || !r.simulacao) return;
        setSim({
          id: r.simulacao.id,
          status: r.simulacao.status,
          turnos: r.simulacao.turnos ?? 0,
          maxTurnos: r.simulacao.max_turnos ?? LIMITES_PADRAO.maxTurnos,
        });
        if (r.simulacao.cenario) setCenario(r.simulacao.cenario);
        // O objetivo do paciente simulado vem sempre do cenário atual; restaurar
        // o objetivo de uma execução anterior faria o Terra falar de outro assunto.
        if (r.simulacao.persona)
          setPersona({ ...PERSONA_PADRAO, ...r.simulacao.persona, objetivo: null });
        setSimMotivo(
          r.simulacao.erro ??
            (r.simulacao.motivo_fim
              ? (ROTULO_MOTIVO[r.simulacao.motivo_fim as keyof typeof ROTULO_MOTIVO] ?? null)
              : null),
        );
      } catch {
        /* sem simulação anterior */
      }
    })();
    return () => {
      vivo = false;
    };
  }, [clinicaId, leadId, simAtual]);


  // Recarga incremental após uma operação feita pela automação (WebMCP).
  useEffect(
    () =>
      assinarAtualizacao("teste-nina", () => {
        void carregarLeads();
        if (leadId) void carregarHistorico(leadId);
      }),
    [carregarLeads, carregarHistorico, leadId],
  );

  /**
   * Envio do chat manual — a bolha aparece na hora e o campo fica livre.
   *
   * O processamento da Nina continua igual, só que em segundo plano: nada
   * aqui espera banco, modelo, ferramentas ou resposta antes de liberar o
   * testador para escrever a próxima mensagem. Cada envio guarda o lead de
   * origem e descarta qualquer efeito visual se o testador já trocou de lead.
   */
  const dispararMensagem = async (
    conteudo: string,
    tipoForcado?: TipoMensagem,
  ): Promise<{ ok: boolean; transferida: boolean; erro: string | null }> => {
    const leadOrigem = leadId;
    const conversaOrigem = conversaId;
    if (!clinicaId || !leadOrigem) return { ok: false, transferida: false, erro: null };
    const tipoEnvio = tipoForcado ?? tipo;
    const corpo = conteudo.trim();
    // Só texto exige conteúdo: áudio sem transcrição e mídias simulam o webhook real.
    if (tipoEnvio === "text" && !corpo) return { ok: false, transferida: false, erro: null };
    const chave = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // 1) campo livre e foco de volta, ANTES de qualquer chamada.
    setTexto("");
    composerRef.current?.focus();
    setErro(null);
    setUltimoTexto(corpo);
    // 2) bolha imediata na timeline do lead de origem, já com a MESMA
    // identidade que o servidor vai gravar: quando o Realtime trouxer a
    // mensagem oficial, ela mescla nesta bolha em vez de criar outra.
    registrarOtimista(leadOrigem, {
      id: `otimista:${chave}`,
      conversa_id: conversaOrigem,
      direction: "in",
      body: corpo,
      enviada_por: "paciente",
      created_at: new Date().toISOString(),
      wa_message_id: waIdDoEnvio(leadOrigem, chave),
      estado: "pending",
    });
    const meuLead = () => leadSelecionadoRef.current === leadOrigem;
    setEmProcessamento((n) => n + 1);
    try {
      const r = (await enviar({
        data: { clinicaId, leadId: leadOrigem, tipo: tipoEnvio, texto: corpo, chave },
      })) as {
        duplicada: boolean;
        reply: string | null;
        erro: string | null;
        transferida?: boolean;
        audio: { base64: string; mime: string; texto: string } | null;
        processamento?: "RESPONDIDA" | "AGRUPADA" | "OBSOLETA" | "ERRO";
        absorvidaPeloLote?: boolean;
      };
      concluirOtimista(chave);
      // Mensagem absorvida por um envio mais recente do mesmo lead: é o
      // agrupamento normal (as três viram um turno só). Não é falta de
      // resposta e não deve mostrar aviso.
      const agrupada =
        r.absorvidaPeloLote === true ||
        r.processamento === "AGRUPADA" ||
        r.processamento === "OBSOLETA";
      if (meuLead()) {
        setAudio(r.audio ? `data:${r.audio.mime};base64,${r.audio.base64}` : null);
        // Conciliação eventual (ferramentas, eventos, execuções): a timeline
        // em si já foi atualizada pelo Realtime, sem esperar esta chamada.
        void carregarHistorico(leadOrigem);
      }
      void carregarLeads();
      if (meuLead()) {
        if (r.erro) setErro(r.erro);
        else if (!r.reply && !agrupada)
          setErro(
            "A Nina não respondeu. Se a conversa foi transferida para atendimento humano, use “Resolver / Reiniciar teste” antes de começar um novo teste.",
          );
      }
      return {
        ok: agrupada ? true : !r.erro && !!r.reply,
        transferida: !!r.transferida,
        erro: r.erro ?? null,
      };
    } catch (e: any) {
      const chegou = meuLead() ? await aguardarResposta(leadOrigem) : false;
      if (chegou) concluirOtimista(chave);
      else falharOtimista(chave);
      void carregarLeads();
      const msg = String(e?.message ?? e);
      if (!chegou && meuLead()) setErro(msg);
      return { ok: chegou, transferida: false, erro: chegou ? null : msg };
    } finally {
      setEmProcessamento((n) => Math.max(0, n - 1));
    }
  };

  /**
   * Loop do teste automático: Terra escreve como paciente → a Nina real
   * responde pelo mesmo pipeline → Terra lê a resposta e decide a próxima
   * mensagem. Sempre limitado por turnos, duração, tokens e pelos botões do
   * operador — nunca duas IAs conversando sem teto.
   */
  const rodarLoopTerra = async (simulacaoId: string) => {
    if (!clinicaId || rodandoRef.current) return;
    rodandoRef.current = true;
    try {
      while (!controleRef.current.parar && !controleRef.current.pausar) {
        const r = (await proximaSim({ data: { clinicaId, simulacaoId } })) as {
          encerrada: boolean;
          pausada: boolean;
          mensagem: string | null;
          motivo: string | null;
          turno: number;
        };
        if (r.pausada) {
          setSim((s) => (s ? { ...s, status: "pausada" } : s));
          break;
        }
        if (r.encerrada || !r.mensagem) {
          setSimMotivo(r.motivo ?? ROTULO_MOTIVO.objetivo_concluido);
          setSim((s) => (s ? { ...s, status: "concluida" } : s));
          break;
        }
        setSim((s) => (s ? { ...s, turnos: r.turno } : s));

        const env = await dispararMensagem(r.mensagem, "text");
        if (controleRef.current.parar) break;
        if (env.transferida) {
          await controlarSim({
            data: { clinicaId, simulacaoId, acao: "concluir", motivo: "transferencia" },
          });
          setSimMotivo(ROTULO_MOTIVO.transferencia);
          setSim((s) => (s ? { ...s, status: "concluida" } : s));
          break;
        }
        if (!env.ok) {
          await controlarSim({
            data: { clinicaId, simulacaoId, acao: "parar", motivo: "erro" },
          });
          setSimMotivo(env.erro ?? ROTULO_MOTIVO.erro);
          setSim((s) => (s ? { ...s, status: "erro" } : s));
          break;
        }
      }
      if (controleRef.current.parar) setSim((s) => (s ? { ...s, status: "parada" } : s));
    } catch (e) {
      mostrarErro(e);
      setSim((s) => (s ? { ...s, status: "erro" } : s));
    } finally {
      rodandoRef.current = false;
    }
  };

  const iniciarTerra = async () => {
    if (!clinicaId || !leadId) return;
    if (!cenario.trim()) {
      toast.error("Defina o cenário do teste antes de iniciar.");
      return;
    }
    controleRef.current = { parar: false, pausar: false };
    setSimMotivo(null);
    try {
      const r = (await iniciarSim({
        data: {
          clinicaId,
          leadId,
          cenario: cenario.trim(),
          persona: { ...persona, objetivo: cenario.trim() },
          limites,
        },
      })) as { simulacao: { id: string; status: string; turnos: number; max_turnos: number } };
      const s = {
        id: r.simulacao.id,
        status: "executando",
        turnos: r.simulacao.turnos ?? 0,
        maxTurnos: r.simulacao.max_turnos ?? limites.maxTurnos,
      };
      setSim(s);
      void rodarLoopTerra(s.id);
    } catch (e) {
      mostrarErro(e);
    }
  };

  const pausarTerra = async () => {
    if (!clinicaId || !sim) return;
    controleRef.current.pausar = true;
    try {
      await controlarSim({ data: { clinicaId, simulacaoId: sim.id, acao: "pausar" } });
      setSim((s) => (s ? { ...s, status: "pausada" } : s));
    } catch (e) {
      mostrarErro(e);
    }
  };

  const retomarTerra = async () => {
    if (!clinicaId || !sim) return;
    controleRef.current = { parar: false, pausar: false };
    try {
      await controlarSim({ data: { clinicaId, simulacaoId: sim.id, acao: "retomar" } });
      setSim((s) => (s ? { ...s, status: "executando" } : s));
      void rodarLoopTerra(sim.id);
    } catch (e) {
      mostrarErro(e);
    }
  };

  const pararTerra = async () => {
    if (!clinicaId || !sim) return;
    controleRef.current.parar = true;
    try {
      await controlarSim({
        data: { clinicaId, simulacaoId: sim.id, acao: "parar", motivo: "operador" },
      });
      setSim((s) => (s ? { ...s, status: "parada" } : s));
      setSimMotivo(ROTULO_MOTIVO.operador);
    } catch (e) {
      mostrarErro(e);
    }
  };

  const resolverConversa = async () => {
    if (!clinicaId || !leadId || !conversaId) return;
    setEmProcessamento((n) => n + 1);
    try {
      await resolver({
        data: { clinicaId, leadId, conversaId, removerAgendamentos: limparAgenda },
      });
      setConversaId(null);
      setErro(null);
      setAudio(null);
      setFerramentas([]);
      // Nova sessão: leitura e idempotência recomeçam; o histórico anterior
      // continua disponível no console.
      marcadoRef.current = "";
      aplicadasRef.current.clear();
      setLeads((ls) => ls.map((l) => (l.id === leadId ? { ...l, naoLidas: 0 } : l)));
      await carregarHistorico(leadId);
      await carregarLeads();
    } catch (e: any) {
      mostrarErro(e);
    } finally {
      setEmProcessamento((n) => Math.max(0, n - 1));
    }
  };

  const baixarPdf = async () => {
    if (!leadAtual || msgs.length === 0) {
      toast.error("Não há mensagens para exportar.");
      return;
    }
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const margem = 40;
      const largura = doc.internal.pageSize.getWidth() - margem * 2;
      const alturaPag = doc.internal.pageSize.getHeight();
      const alturaLinha = 13;
      let y = margem;

      // A fonte padrão do PDF (WinAnsi) não tem emoji nem caracteres fora do
      // Latin-1: sem esse saneamento eles saem como símbolos trocados.
      const sanear = (txt: string) =>
        txt
          .normalize("NFC")
          .replace(/\r\n?/g, "\n")
          .replace(/[\u2018\u2019\u201B]/g, "'")
          .replace(/[\u201C\u201D]/g, '"')
          .replace(/[\u2013\u2014]/g, "-")
          .replace(/\u2026/g, "...")
          .replace(/\u00a0/g, " ")
          .replace(/[\u200b-\u200f\u2028\u2029\ufeff]/g, "")
          // eslint-disable-next-line no-control-regex
          .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
          .replace(/[^\n\u0020-\u00ff]/g, "");

      const escrever = (linhas: string[], x: number, tamanho: number, negrito: boolean) => {
        doc.setFont("helvetica", negrito ? "bold" : "normal");
        doc.setFontSize(tamanho);
        for (const linha of linhas) {
          if (y + alturaLinha > alturaPag - margem) {
            doc.addPage();
            y = margem;
            doc.setFont("helvetica", negrito ? "bold" : "normal");
            doc.setFontSize(tamanho);
          }
          doc.text(linha, x, y);
          y += alturaLinha;
        }
      };

      escrever(["Homologacao da Nina - conversa de teste"], margem, 14, true);
      y += 4;
      escrever(
        doc.splitTextToSize(
          sanear(
            `${nomeLead(leadAtual)} · ${leadAtual.telefone} · sessão ${leadAtual.sessao} · exportado em ${new Date().toLocaleString("pt-BR")}`,
          ),
          largura,
        ) as string[],
        margem,
        10,
        false,
      );
      y += 10;

      for (const m of msgs) {
        const quem =
          m.enviada_por === "sistema"
            ? "— sistema —"
            : m.direction === "out"
              ? "Nina"
              : "Paciente (teste)";
        const quando = new Date(m.created_at).toLocaleString("pt-BR");
        escrever([sanear(`${quem} · ${quando}`)], margem, 9, true);

        const corpo = sanear(String(m.body ?? "")).split("\n");
        const linhas: string[] = [];
        for (const par of corpo) {
          if (par.trim() === "") {
            linhas.push("");
            continue;
          }
          linhas.push(...(doc.splitTextToSize(par, largura - 12) as string[]));
        }
        escrever(linhas.length ? linhas : ["(sem texto)"], margem + 12, 10, false);
        y += 8;
      }

      const nome = `nina-homologacao-${nomeLead(leadAtual).toLowerCase().replace(/\s+/g, "-")}-${new Date()
        .toISOString()
        .slice(0, 10)}.pdf`;
      doc.save(nome);
      toast.success("PDF gerado com as mensagens do lead de teste.");
    } catch (e: any) {
      mostrarErro(e);
    }
  };

  const terraRodando = modo === "terra" && sim?.status === "executando";
  // O processamento da Nina NÃO entra aqui: ele acontece em segundo plano e o
  // testador continua escrevendo e enviando normalmente, como num chat real.
  const composerBloqueado =
    !podeEscrever || !leadId || terraRodando || (tipo !== "text" && tipo !== "audio");

  return (
    <div id="homologacao-inbox" className="flex h-[calc(100vh-11rem)] min-h-[560px] gap-3">
      {/* COLUNA 1 — LEADS DE TESTE */}
      <Card className="flex w-[300px] shrink-0 flex-col overflow-hidden">
        <CardHeader className="gap-2 py-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <FlaskConical className="h-4 w-4 text-primary" />
              Leads de teste
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              aria-label="Recarregar leads de teste"
              onClick={() => void carregarLeads()}
            >
              <RefreshCw className={`h-4 w-4 ${carregando ? "animate-spin" : ""}`} />
            </Button>
          </div>
          <p className="text-[11px] leading-tight text-muted-foreground">
            Ambiente de homologação. Nada é enviado para o WhatsApp e nenhum paciente real é
            usado.
          </p>
        </CardHeader>
        <div className="flex-1 overflow-auto border-t">
          {leads.length === 0 && !carregando && (
            <p className="p-4 text-sm text-muted-foreground">Nenhum lead de teste.</p>
          )}
          {leads.map((l) => (
            <button
              key={l.id}
              type="button"
              data-testid="item-lead-teste"
              data-lead-id={l.id}
              onClick={() => setLeadId(l.id)}
              className={`relative w-full border-b border-atd-border p-3 pl-4 text-left transition-colors hover:bg-atd-blue-hover ${
                leadId === l.id
                  ? "bg-atd-blue-soft before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-atd-blue before:content-['']"
                  : "bg-atd-surface"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="flex-1 truncate text-sm font-medium">{nomeLead(l)}</span>
                {Number(l.naoLidas ?? 0) > 0 && (
                  <Badge
                    data-testid="nao-lidas-lead-teste"
                    className="bg-atd-blue px-1.5 py-0 text-xs text-atd-on-strong"
                  >
                    {Number(l.naoLidas ?? 0)}
                  </Badge>
                )}
                <Badge className="border border-atd-warn bg-atd-warn-bg text-[10px] text-atd-warn-ink">
                  TESTE
                </Badge>
              </div>
              <div className="mt-1 flex min-h-[24px] flex-wrap items-center gap-1.5">
                <Badge className="border border-atd-ai/30 bg-atd-ai-bg text-[11px] text-atd-ai-ink">
                  ✦ Nina
                </Badge>
                <Badge variant={l.conversaId ? "default" : "secondary"} className="text-[11px]">
                  {l.conversaId ? "conversa ativa" : "nova"}
                </Badge>
              </div>
              {l.ultimaMensagemTexto ? (
                <div className="mt-1.5" data-testid="previa-lead-teste">
                  <p className="line-clamp-2 text-xs leading-snug text-foreground/80">
                    <span className="font-medium text-foreground">
                      {rotuloAutorResumo(l.ultimaMensagemAutor ?? null)}:
                    </span>{" "}
                    {l.ultimaMensagemTexto}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {formatarDataHoraMensagem(l.ultimaMensagemEm)}
                  </p>
                </div>
              ) : (
                <p className="mt-1.5 text-xs italic text-muted-foreground">Sem mensagens ainda</p>
              )}
              <div className="mt-1 min-h-[16px] truncate text-xs text-muted-foreground">
                sessão {l.sessao} · {l.mensagens} mensagens
              </div>

              <div className="mt-0.5 min-h-[14px] font-mono text-[11px] text-muted-foreground">
                {l.telefone} (virtual)
              </div>
            </button>
          ))}
        </div>
      </Card>

      {/* COLUNA 2 — CONVERSA DE HOMOLOGAÇÃO */}
      <Card className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {!leadAtual ? (
          <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
            Selecione um lead de teste
          </div>
        ) : (
          <>
            <CardHeader className="border-b py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <CardTitle
                    className="flex items-center gap-2 truncate text-base"
                    data-testid="titulo-conversa-teste"
                  >
                    <span className="truncate">{nomeLead(leadAtual)}</span>
                    <Badge className="border border-atd-warn bg-atd-warn-bg text-[11px] text-atd-warn-ink">
                      TESTE
                    </Badge>
                    <Badge variant={conversaId ? "default" : "secondary"} className="text-[11px]">
                      {conversaId ? "ativa" : "nova"}
                    </Badge>
                  </CardTitle>
                  <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <span className="font-mono">{leadAtual.telefone}</span>
                    <span>· número virtual (não existe no WhatsApp)</span>
                    <span>· sessão {leadAtual.sessao}</span>
                    {leadAtual.cicloId ? (
                      <span className="font-mono">
                        · ciclo {ciclos.length > 0 ? ciclos[ciclos.length - 1]?.ciclo_seq : leadAtual.cicloId.slice(0, 8)}
                      </span>
                    ) : null}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={msgs.length === 0}
                    onClick={() => void baixarPdf()}
                  >
                    <Download className="mr-1 h-3.5 w-3.5" /> PDF
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    aria-pressed={painelTecnico}
                    onClick={() => setPainelTecnico((v) => !v)}
                  >
                    <Wrench className="mr-1 h-3.5 w-3.5" /> Diagnóstico
                  </Button>
                  <AvaliacaoSol
                    clinicaId={clinicaId}
                    leadId={leadId}
                    podeAvaliar={podeEscrever}
                  />

                  <Button
                    size="sm"
                    variant="outline"
                    className="border-atd-border text-atd-ink-soft hover:bg-atd-danger-bg hover:text-atd-danger-ink"
                    disabled={!conversaId || processando}
                    onClick={() => void resolverConversa()}
                  >
                    <CheckCheck className="mr-1 h-3.5 w-3.5" /> Resolver / Reiniciar teste
                  </Button>
                </div>
              </div>
            </CardHeader>

            <div
              aria-live="polite"
              className="flex items-center gap-2 border-b border-atd-warn bg-atd-warn-bg px-3 py-1.5 text-xs text-atd-warn-ink"
            >
              <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="truncate">
                Conversa de homologação: usa a Nina real (mesmo modelo, prompt e ferramentas), mas
                nenhuma mensagem sai para o WhatsApp.
              </span>
            </div>

            {painelTecnico && (
              <div className="max-h-56 space-y-2 overflow-auto border-b bg-muted/30 p-2">
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 accent-current"
                    checked={limparAgenda}
                    onChange={(e) => setLimparAgenda(e.target.checked)}
                  />
                  Remover agendamentos deste teste ao finalizar
                </label>
                {ciclos.length > 0 && (
                  <div data-testid="diagnostico-ciclos">
                    <p className="mb-1 text-xs font-medium text-muted-foreground">
                      Ciclos deste lead (memória da Nina)
                    </p>
                    <div className="space-y-1">
                      {ciclos
                        .slice()
                        .reverse()
                        .map((c: any) => (
                          <details
                            key={c.cycle_id}
                            className="rounded border bg-background/60 p-1.5 text-[11px]"
                          >
                            <summary className="cursor-pointer">
                              Ciclo {c.ciclo_seq} · sessão {c.sessao ?? "—"} ·{" "}
                              {c.cycle_status === "active" ? "em andamento" : "encerrado"}
                              {c.end_reason ? ` (${c.end_reason})` : ""}
                              {c.memoria_resetada ? " · memória zerada" : ""}
                            </summary>
                            <div className="mt-1 grid grid-cols-1 gap-x-4 font-mono leading-tight sm:grid-cols-2">
                              {[
                                ["cycle_id", c.cycle_id],
                                ["nina_session_id", c.nina_session_id],
                                ["cycle_status", c.cycle_status],
                                ["end_reason", c.end_reason],
                                ["started_at", c.started_at],
                                ["ended_at", c.ended_at],
                                ["memory_reset_at", c.memory_reset_at],
                                ["conversation_id", c.conversa_id],
                              ].map(([k, v]) => (
                                <div key={String(k)}>
                                  <span className="text-muted-foreground">{k}:</span>{" "}
                                  <span>{v === null || v === undefined || v === "" ? "—" : String(v)}</span>
                                </div>
                              ))}
                            </div>
                          </details>
                        ))}
                    </div>
                  </div>
                )}
                {debugEstado && (
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">
                      Estado do fluxo (nunca visível ao paciente)
                    </p>
                    <div className="grid grid-cols-1 gap-x-4 font-mono text-[11px] leading-tight sm:grid-cols-2">
                      {Object.entries(debugEstado).map(([k, v]) => (
                        <div key={k}>
                          <span className="text-muted-foreground">{k}:</span>{" "}
                          <span>{v === null || v === undefined ? "—" : String(v)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {ferramentas.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">
                      Ferramentas usadas pela Nina
                    </p>
                    <div className="space-y-1">
                      {ferramentas.map((f) => (
                        <div key={f.id} className="font-mono text-[11px] leading-tight">
                          <span className={f.ok ? "text-emerald-600" : "text-destructive"}>
                            {f.ok ? "✔" : "✖"}
                          </span>{" "}
                          <span className="font-semibold">{f.ferramenta}</span>{" "}
                          <span className="text-muted-foreground">
                            {JSON.stringify(f.argumentos)} → {f.erro ?? "OK"} ({f.ms}ms)
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {!debugEstado && ferramentas.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Sem rastros técnicos nesta conversa ainda.
                  </p>
                )}
              </div>
            )}

            <div className="relative min-h-0 flex-1">
              <div ref={chat.containerRef} className="h-full space-y-2 overflow-auto bg-atd-bg p-4">
                {carregandoConversa && timeline.length === 0 && <ConversaSkeleton />}
                {!carregandoConversa && timeline.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground">
                    Conversa nova e sem memória. Envie a primeira mensagem como paciente de teste.
                  </p>
                )}

                {timeline.map((item) => {
                  if (item.kind === "evento")
                    return <ConversationSystemEvent key={item.id} evento={item.evento} />;
                  const m = item.msg;
                  if (m.enviada_por === "sistema") {
                    return (
                      <div key={item.id} className="flex justify-center">
                        <div className="max-w-[85%] whitespace-pre-wrap rounded-lg border border-atd-blue/20 bg-atd-blue-tint px-3 py-2 text-center text-xs text-atd-blue-ink">
                          {textoMarcadorSistema(m.body)}
                          <div className="mt-1 text-[10px] opacity-70">
                            {formatarDataHoraMensagem(m.created_at)}
                          </div>
                        </div>
                      </div>
                    );
                  }
                  const out = m.direction === "out";
                  // FASE 3: só a resposta da própria Nina recebe indicador de
                  // confiança e botão de reporte. Envio humano no teste, não.
                  const daNina = out && m.enviada_por === "nina";
                  const autoria = daNina ? "· Nina" : out ? "· Equipe (teste)" : "· Paciente (teste)";

                  const meta = metadadosDaMensagem(m);
                  return (
                    <div
                      key={item.id}
                      data-msg-id={m.id}
                      data-nina-environment={meta.environment}
                      data-nina-test-conversation-id={meta.test_conversation_id ?? undefined}
                      data-nina-cycle-id={meta.cycle_id ?? undefined}
                      data-nina-session-id={meta.nina_session_id ?? undefined}
                      data-nina-audit-trace-id={meta.audit_trace_id ?? undefined}
                      className={`flex items-start gap-2 ${out ? "justify-end" : "justify-start"}`}
                    >
                      {/* Reporte de um clique — mesmo mecanismo do atendimento
                          real, apenas em respostas da Nina neste teste. */}
                      {m.enviada_por === "nina" && out && clinicaId && meta.test_conversation_id && (
                        <ReportarErroNinaBotao
                          clinicaId={clinicaId}
                          conversaId={meta.test_conversation_id}
                          mensagemId={meta.message_id}
                        />
                      )}
                      <div

                        className={`max-w-[68%] break-words rounded-2xl px-3 py-2 text-sm shadow-sm ${
                          out
                            ? "rounded-br-sm bg-atd-go text-atd-on-strong"
                            : "rounded-bl-sm border border-atd-border bg-atd-surface text-atd-ink"
                        }`}
                      >
                        <NinaMessage
                          content={m.body || "[mídia]"}
                          variant={daNina ? "assistant" : "user"}
                        />
                        <div
                          className={`mt-1 flex items-center justify-between gap-2 text-[11px] ${out ? "text-atd-on-strong/80" : "text-atd-ink-soft"}`}
                        >
                          <span className="whitespace-nowrap">
                            {formatarDataHoraMensagem(m.created_at)} {autoria}
                            {/* Falha é sempre DESTA mensagem: as outras seguem. */}
                            {m.estado === "failed" && " · ⚠ falhou"}
                          </span>
                          {daNina && (
                            <span className="flex items-center gap-2">
                              {clinicaId && m.execucao_id && confiancaPorExecucao[String(m.execucao_id)] ? (
                                <ConfiancaMensagemBadge
                                  clinicaId={clinicaId}
                                  mensagemId={m.id ? String(m.id) : null}
                                  confianca={confiancaPorExecucao[String(m.execucao_id)]!}
                                />

                              ) : (
                                <ConfiancaNaoAvaliadaBadge />
                              )}
                              {m.execucao_id && (
                                <button
                                  type="button"
                                  className="underline underline-offset-2 hover:opacity-80"
                                  onClick={() => void abrirDetalhe(m.execucao_id as string)}
                                >
                                  Detalhes técnicos
                                </button>
                              )}
                            </span>
                          )}
                        </div>

                      </div>
                    </div>
                  );
                })}

                {processando && (
                  <div className="flex justify-end">
                    <div className="rounded-2xl rounded-br-sm bg-atd-go px-3 py-2 text-atd-on-strong shadow-sm">
                      <TypingDots />
                    </div>
                  </div>
                )}
                <div ref={chat.ancoraRef} />
              </div>
              {chat.novas > 0 && (
                <button
                  type="button"
                  onClick={() => chat.irParaFim(true)}
                  className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-atd-border bg-atd-surface px-3 py-1.5 text-xs font-medium text-atd-ink shadow-md hover:bg-atd-bg"
                  aria-live="polite"
                >
                  ↓ {chat.novas} nova{chat.novas > 1 ? "s" : ""}
                </button>
              )}
            </div>

            {erro && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-destructive/40 bg-destructive/5 p-2 text-sm text-destructive">
                <span className="min-w-0 break-words">{erro}</span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={processando || !ultimoTexto}
                  onClick={() => void dispararMensagem(ultimoTexto)}
                >
                  Tentar novamente
                </Button>
              </div>
            )}

            {audio && (
              <div className="space-y-1 border-t p-2">
                <p className="text-xs text-muted-foreground">
                  Resposta em áudio da Nina (mesma voz usada no WhatsApp)
                </p>
                <audio controls src={audio} className="w-full" />
              </div>
            )}

            {/* FASE 4 — modo do lead: manual ou paciente simulado (Terra). */}
            <div className="space-y-2 border-t bg-muted/20 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">Modo do teste</span>
                <Select
                  value={modo}
                  onValueChange={(v) => setModo(v as "manual" | "terra")}
                  disabled={terraRodando}
                >
                  <SelectTrigger className="h-8 w-[220px] text-xs" aria-label="Modo do teste">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-50">
                    <SelectItem value="manual">Manual</SelectItem>
                    <SelectItem value="terra">Automático — Terra</SelectItem>
                  </SelectContent>
                </Select>
                {sim && (
                  <Badge variant={terraRodando ? "default" : "secondary"} className="text-[11px]">
                    {sim.status} · turno {sim.turnos}/{sim.maxTurnos}
                  </Badge>
                )}
                {simMotivo && (
                  <span className="text-xs text-muted-foreground">{simMotivo}</span>
                )}
              </div>

              {modo === "terra" && (
                <div className="space-y-2 rounded-md border bg-atd-surface p-2">
                  <p className="text-[11px] text-muted-foreground">
                    O paciente é simulado por outra IA (Terra). Ela só vê o cenário, a persona
                    sintética e as mensagens da conversa — nunca as instruções internas da Nina.
                  </p>

                  <div className="flex flex-wrap gap-2">
                    <Select value={cenario} onValueChange={setCenario} disabled={terraRodando}>
                      <SelectTrigger className="h-8 min-w-[280px] flex-1 text-xs" aria-label="Cenário">
                        <SelectValue placeholder="Escolha um cenário" />
                      </SelectTrigger>
                      <SelectContent className="z-50">
                        {CENARIOS_SUGERIDOS.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                        {cenario && !CENARIOS_SUGERIDOS.includes(cenario) && (
                          <SelectItem value={cenario}>{cenario}</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <Textarea
                    rows={2}
                    value={cenario}
                    onChange={(e) => setCenario(e.target.value)}
                    disabled={terraRodando}
                    placeholder="Cenário do teste (ex.: Paciente quer marcar cardiologista.)"
                    className="resize-none text-xs"
                    aria-label="Cenário do teste"
                  />

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Select
                      value={persona.estilo}
                      onValueChange={(v) =>
                        setPersona((p) => ({ ...p, estilo: v as EstiloPersona }))
                      }
                      disabled={terraRodando}
                    >
                      <SelectTrigger className="h-8 text-xs" aria-label="Comportamento">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="z-50">
                        {ESTILOS.map((e) => (
                          <SelectItem key={e.valor} value={e.valor}>
                            {e.rotulo}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={persona.detalhe}
                      onValueChange={(v) =>
                        setPersona((p) => ({ ...p, detalhe: v as NivelDetalhe }))
                      }
                      disabled={terraRodando}
                    >
                      <SelectTrigger className="h-8 text-xs" aria-label="Nível de detalhe">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="z-50">
                        {DETALHES.map((d) => (
                          <SelectItem key={d.valor} value={d.valor}>
                            {d.rotulo}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 accent-current"
                        checked={persona.errosDigitacao}
                        disabled={terraRodando}
                        onChange={(e) =>
                          setPersona((p) => ({ ...p, errosDigitacao: e.target.checked }))
                        }
                      />
                      Erros de digitação
                    </label>
                    <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 accent-current"
                        checked={persona.respondeParcialmente}
                        disabled={terraRodando}
                        onChange={(e) =>
                          setPersona((p) => ({ ...p, respondeParcialmente: e.target.checked }))
                        }
                      />
                      Responde parcialmente
                    </label>
                    <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 accent-current"
                        checked={persona.mudaDeAssunto}
                        disabled={terraRodando}
                        onChange={(e) =>
                          setPersona((p) => ({ ...p, mudaDeAssunto: e.target.checked }))
                        }
                      />
                      Muda de assunto
                    </label>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    <label className="flex items-center gap-1">
                      Máx. turnos
                      <input
                        type="number"
                        min={1}
                        max={30}
                        value={limites.maxTurnos}
                        disabled={terraRodando}
                        onChange={(e) =>
                          setLimites((l) => ({ ...l, maxTurnos: Number(e.target.value) || 1 }))
                        }
                        className="h-7 w-16 rounded border border-atd-border bg-atd-surface px-1"
                      />
                    </label>
                    <label className="flex items-center gap-1">
                      Duração (s)
                      <input
                        type="number"
                        min={30}
                        max={1800}
                        value={limites.maxDuracaoS}
                        disabled={terraRodando}
                        onChange={(e) =>
                          setLimites((l) => ({ ...l, maxDuracaoS: Number(e.target.value) || 30 }))
                        }
                        className="h-7 w-20 rounded border border-atd-border bg-atd-surface px-1"
                      />
                    </label>
                    <label className="flex items-center gap-1">
                      Máx. tokens
                      <input
                        type="number"
                        min={500}
                        max={200000}
                        step={500}
                        value={limites.maxTokens}
                        disabled={terraRodando}
                        onChange={(e) =>
                          setLimites((l) => ({ ...l, maxTokens: Number(e.target.value) || 500 }))
                        }
                        className="h-7 w-24 rounded border border-atd-border bg-atd-surface px-1"
                      />
                    </label>
                    <label className="flex items-center gap-1">
                      Timeout (s)
                      <input
                        type="number"
                        min={10}
                        max={180}
                        value={limites.timeoutS}
                        disabled={terraRodando}
                        onChange={(e) =>
                          setLimites((l) => ({ ...l, timeoutS: Number(e.target.value) || 10 }))
                        }
                        className="h-7 w-16 rounded border border-atd-border bg-atd-surface px-1"
                      />
                    </label>
                    <label className="flex items-center gap-1">
                      Máx. mensagens
                      <input
                        type="number"
                        min={2}
                        max={200}
                        value={limites.maxMensagens}
                        disabled={terraRodando}
                        onChange={(e) =>
                          setLimites((l) => ({ ...l, maxMensagens: Number(e.target.value) || 2 }))
                        }
                        className="h-7 w-20 rounded border border-atd-border bg-atd-surface px-1"
                      />
                    </label>
                    <label className="flex items-center gap-1">
                      Créditos / mil tokens
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.1}
                        value={limites.creditosPorMilTokens}
                        disabled={terraRodando}
                        onChange={(e) =>
                          setLimites((l) => ({
                            ...l,
                            creditosPorMilTokens: Number(e.target.value) || 0,
                          }))
                        }
                        className="h-7 w-20 rounded border border-atd-border bg-atd-surface px-1"
                      />
                    </label>
                    <label className="flex items-center gap-1">
                      Máx. custo (créditos)
                      <input
                        type="number"
                        min={0}
                        max={1000}
                        step={0.5}
                        value={limites.maxCustoCreditos}
                        disabled={terraRodando}
                        onChange={(e) =>
                          setLimites((l) => ({
                            ...l,
                            maxCustoCreditos: Number(e.target.value) || 0,
                          }))
                        }
                        className="h-7 w-20 rounded border border-atd-border bg-atd-surface px-1"
                      />
                    </label>
                    <span className="w-full text-[10px] text-muted-foreground">
                      O custo é estimado a partir dos tokens e da taxa informada acima — o provedor
                      não devolve preço por chamada. Deixe 0 para não limitar por custo.
                    </span>
                  </div>


                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      disabled={!podeEscrever || terraRodando || !leadId}
                      onClick={() => void iniciarTerra()}
                    >
                      <Bot className="mr-1 h-3.5 w-3.5" /> Iniciar teste
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!terraRodando}
                      onClick={() => void pausarTerra()}
                    >
                      <Pause className="mr-1 h-3.5 w-3.5" /> Pausar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={sim?.status !== "pausada"}
                      onClick={() => void retomarTerra()}
                    >
                      <Play className="mr-1 h-3.5 w-3.5" /> Retomar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!sim || (sim.status !== "executando" && sim.status !== "pausada")}
                      onClick={() => void pararTerra()}
                    >
                      <Square className="mr-1 h-3.5 w-3.5" /> Parar
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2 border-t p-3">
              <div className="flex gap-2">
                <Select value={tipo} onValueChange={(v) => setTipo(v as TipoMensagem)}>
                  <SelectTrigger className="h-9 w-[190px] shrink-0 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-50">
                    <SelectItem value="text">Texto</SelectItem>
                    <SelectItem value="audio">Áudio (texto = transcrição)</SelectItem>
                    <SelectItem value="image">Imagem</SelectItem>
                    <SelectItem value="document">Documento</SelectItem>
                    <SelectItem value="sticker">Figurinha</SelectItem>
                  </SelectContent>
                </Select>
                <Textarea
                  ref={composerRef}
                  rows={1}
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void dispararMensagem(texto);
                    }
                  }}
                  placeholder={
                    tipo === "audio"
                      ? "Transcrição do áudio (vazio simula falha na transcrição)…"
                      : tipo === "text"
                        ? "Mensagem do paciente de teste…"
                        : "Mídia sem texto — a Nina responde como no WhatsApp."
                  }
                  className="min-h-9 resize-none border-atd-border bg-atd-surface focus-visible:border-atd-blue focus-visible:ring-2 focus-visible:ring-atd-blue/30"
                  disabled={composerBloqueado}
                />
                <Button
                  onClick={() => void dispararMensagem(texto)}
                  disabled={
                    composerBloqueado || (tipo === "text" && !texto.trim())
                  }
                  className="bg-atd-go text-atd-on-strong hover:bg-atd-go-hover disabled:bg-atd-idle-bg disabled:text-atd-ink-soft"
                >
                  <Send className="h-4 w-4" />
                  <span className="ml-2 hidden sm:inline">Enviar como paciente</span>
                </Button>
              </div>
              {!podeEscrever && (
                <p className="text-xs text-muted-foreground">
                  Você não tem permissão para enviar mensagens de teste.
                </p>
              )}
            </div>
          </>
        )}
      </Card>

      <Dialog open={detalheAberto} onOpenChange={setDetalheAberto}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-auto">
          <DialogHeader>
            <DialogTitle>Detalhes técnicos da resposta</DialogTitle>
            <DialogDescription>
              Mesma execução registrada pelo atendimento real da Nina. É o registro desta resposta —
              não a prévia da versão atual.
            </DialogDescription>
          </DialogHeader>
          {detalheCarregando && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {!detalheCarregando && detalhe?.execucao && (
            <div className="space-y-3 text-xs">
              {/* FASE 3 — registro do turno (fase 1) desta mensagem. */}
              <RegistroTurnoResumo eventos={(detalhe.eventos ?? []) as any[]} compacto />
              <div className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
                {[
                  ["Modelo", detalhe.execucao.model],
                  ["Raciocínio", detalhe.execucao.thinking_level],
                  ["Instruções (versão)", detalhe.execucao.prompt_versao],
                  ["Origem das instruções", detalhe.execucao.prompt_origem],
                  ["Publicada em", detalhe.execucao.prompt_publicado_em],
                  ["Conhecimento", detalhe.execucao.knowledge_status],
                  // FASE 5 — este campo é o registro da execução; o confronto
                  // entre disponíveis e chamadas fica no bloco abaixo.
                  ["Ferramentas chamadas (registro da execução)", detalhe.execucao.tool_calls],
                  ["Transferência", detalhe.execucao.handoff ? "sim" : "não"],
                  [
                    // FASE 2 — retorno técnico da chamada; não comprova
                    // cumprimento do prompt.
                    "Chamada ao modelo",
                    detalhe.execucao.success
                      ? "concluída sem erro registrado"
                      : "falhou (erro registrado)",
                  ],
                  ["Erro", detalhe.execucao.error_category],
                  ["Tempo (ms)", detalhe.execucao.latency_ms],
                  ["Trace", detalhe.traceId],
                ].map(([k, v]) => (
                  <div key={String(k)}>
                    <span className="text-muted-foreground">{k}:</span>{" "}
                    <span className="font-mono">
                      {/* FASE 5 — campo sem informação é "Não registrado", nunca
                          um traço mudo que pareça ausência de uso. */}
                      {valorOuNaoRegistrado(v)}
                    </span>
                  </div>
                ))}
              </div>

              {/* FASE 2 — o retorno técnico da chamada não é conferência de
                  conteúdo. Nenhuma validação é inventada aqui. */}
              <p className="text-muted-foreground">
                Conferência de conteúdo: não há validação automática de cumprimento das instruções
                neste registro. A chamada concluída sem erro não comprova que a resposta seguiu o
                prompt.
              </p>

              {detalhe.eventos?.length > 0 && (
                <div>
                  <p className="mb-1 font-medium text-muted-foreground">Etapas do fluxo</p>
                  <div className="space-y-0.5 font-mono text-[11px]">
                    {detalhe.eventos.map((ev: any, i: number) => {
                      // FASE 4 — contrato real de estados (ok/error/running/
                      // skipped/cancelled). ✔ só para sucesso confirmado.
                      const e = descreverEventoRastreio(ev);
                      return (
                        <div key={i}>
                          <span className={e.classe}>{e.simbolo}</span> {ev.node_id}
                          <span className="text-muted-foreground"> · {e.rotulo}</span>
                          {ev.duration_ms != null ? ` (${ev.duration_ms}ms)` : ""}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {detalhe.etapas?.length > 0 && (
                <div>
                  <p className="mb-1 font-medium text-muted-foreground">Evidências registradas</p>
                  <div className="space-y-1">
                    {detalhe.etapas.map((et: any, i: number) => (
                      <details key={i} className="rounded border bg-muted/30 p-1.5">
                        <summary className="cursor-pointer">{et.titulo ?? et.tipo}</summary>
                        <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words text-[10px]">
                          {JSON.stringify(et.dados ?? et, null, 2)}
                        </pre>
                      </details>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {!detalheCarregando && detalhe && !detalhe.execucao && (
            <p className="text-sm text-muted-foreground">
              Sem registro técnico para esta mensagem.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
