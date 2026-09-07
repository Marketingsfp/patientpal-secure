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
  Loader2,
  RefreshCw,
  Send,
  Wrench,
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
} from "@/lib/nina/teste-console.functions";
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
import { ConversaSkeleton } from "@/components/nina/ConversaSkeleton";
import { useChatScroll } from "@/hooks/use-chat-scroll";
import { formatarDataHoraMensagem } from "@/lib/atendimento/data-hora";
import { definirSelecaoTeste } from "@/lib/webmcp/selecao-teste";
import { assinarAtualizacao } from "@/lib/webmcp/atualizacao";

type Lead = {
  id: string;
  indice: number;
  nome: string;
  telefone: string;
  sessao: number;
  conversaId: string | null;
  status: string;
  mensagens: number;
};

type Msg = {
  id: string;
  direction: string;
  body: string | null;
  enviada_por: string | null;
  created_at: string;
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

  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadId, setLeadId] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [eventosConversa, setEventosConversa] = useState<ConversaEvento[]>([]);
  const [conversaId, setConversaId] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [carregandoConversa, setCarregandoConversa] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ultimoTexto, setUltimoTexto] = useState("");
  const [tipo, setTipo] = useState<TipoMensagem>("text");
  const [audio, setAudio] = useState<string | null>(null);
  const [limparAgenda, setLimparAgenda] = useState(true);
  const [ferramentas, setFerramentas] = useState<EventoFerramenta[]>([]);
  const [debugEstado, setDebugEstado] = useState<Record<string, unknown> | null>(null);
  const [painelTecnico, setPainelTecnico] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

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

  const chat = useChatScroll({
    conversaId: leadId,
    total: timeline.length,
    ultimoId: timeline[timeline.length - 1]?.id ?? null,
  });

  const leadAtual = leads.find((l) => l.id === leadId) ?? null;

  // Informa à ferramenta WebMCP de leitura qual lead está aberto.
  useEffect(() => {
    const lead = leads.find((l) => l.id === leadId) ?? null;
    definirSelecaoTeste(lead ? { leadId: lead.id, leadNome: lead.nome, conversaId } : null);
    return () => definirSelecaoTeste(null);
  }, [leadId, conversaId, leads]);

  const carregarLeads = useCallback(async () => {
    if (!clinicaId) return;
    setCarregando(true);
    try {
      const r = (await listar({ data: { clinicaId } })) as { leads: Lead[] };
      setLeads(r.leads);
      setLeadId((atual) => atual ?? r.leads[0]?.id ?? null);
    } catch (e: any) {
      mostrarErro(e);
    } finally {
      setCarregando(false);
    }
  }, [clinicaId, listar]);

  useEffect(() => {
    void carregarLeads();
  }, [carregarLeads]);

  const carregarHistorico = useCallback(
    async (id: string) => {
      if (!clinicaId) return;
      try {
        const r = (await historico({ data: { clinicaId, leadId: id } })) as {
          mensagens: Msg[];
          eventos?: ConversaEvento[];
          conversaId: string | null;
        };
        setMsgs(r.mensagens);
        setEventosConversa(r.eventos ?? []);
        setConversaId(r.conversaId);
        if (r.conversaId) {
          const f = (await ferramentasFn({
            data: { clinicaId, conversaId: r.conversaId },
          })) as { eventos: EventoFerramenta[]; debug?: Record<string, unknown> };
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
    [clinicaId, historico, ferramentasFn],
  );

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
          setMsgs(r.mensagens);
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
    [clinicaId, historico],
  );

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
    void carregarHistorico(leadId).finally(() => setCarregandoConversa(false));
  }, [leadId, carregarHistorico]);

  // Recarga incremental após uma operação feita pela automação (WebMCP).
  useEffect(
    () =>
      assinarAtualizacao("teste-nina", () => {
        void carregarLeads();
        if (leadId) void carregarHistorico(leadId);
      }),
    [carregarLeads, carregarHistorico, leadId],
  );

  const dispararMensagem = async (conteudo: string) => {
    if (!clinicaId || !leadId) return;
    const corpo = conteudo.trim();
    // Só texto exige conteúdo: áudio sem transcrição e mídias simulam o webhook real.
    if (tipo === "text" && !corpo) return;
    setProcessando(true);
    setErro(null);
    setUltimoTexto(corpo);
    try {
      const chave = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const r = (await enviar({ data: { clinicaId, leadId, tipo, texto: corpo, chave } })) as {
        duplicada: boolean;
        reply: string | null;
        erro: string | null;
        audio: { base64: string; mime: string; texto: string } | null;
      };
      setTexto("");
      setAudio(r.audio ? `data:${r.audio.mime};base64,${r.audio.base64}` : null);
      await carregarHistorico(leadId);
      await carregarLeads();
      if (r.erro) setErro(r.erro);
      else if (!r.reply) setErro("A Nina não retornou resposta para esta mensagem.");
    } catch (e: any) {
      const chegou = await aguardarResposta(leadId);
      setTexto("");
      await carregarLeads();
      if (!chegou) setErro(String(e?.message ?? e));
    } finally {
      setProcessando(false);
    }
  };

  const resolverConversa = async () => {
    if (!clinicaId || !leadId || !conversaId) return;
    setProcessando(true);
    try {
      await resolver({
        data: { clinicaId, leadId, conversaId, removerAgendamentos: limparAgenda },
      });
      setConversaId(null);
      setErro(null);
      setAudio(null);
      setFerramentas([]);
      await carregarHistorico(leadId);
      await carregarLeads();
    } catch (e: any) {
      mostrarErro(e);
    } finally {
      setProcessando(false);
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

  const composerBloqueado =
    !podeEscrever || !leadId || processando || (tipo !== "text" && tipo !== "audio");

  return (
    <div className="flex h-[calc(100vh-11rem)] min-h-[560px] gap-3">
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
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-atd-border text-atd-ink-soft hover:bg-atd-danger-bg hover:text-atd-danger-ink"
                    disabled={!conversaId || processando}
                    onClick={() => void resolverConversa()}
                  >
                    <CheckCheck className="mr-1 h-3.5 w-3.5" /> Resolver
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
                          {m.body}
                          <div className="mt-1 text-[10px] opacity-70">
                            {formatarDataHoraMensagem(m.created_at)}
                          </div>
                        </div>
                      </div>
                    );
                  }
                  const out = m.direction === "out";
                  const daNina = out && m.enviada_por !== "sistema";
                  return (
                    <div
                      key={item.id}
                      data-msg-id={m.id}
                      className={`flex items-start gap-2 ${out ? "justify-end" : "justify-start"}`}
                    >
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
                          className={`mt-1 text-[11px] ${out ? "text-atd-on-strong/80" : "text-atd-ink-soft"}`}
                        >
                          {formatarDataHoraMensagem(m.created_at)}{" "}
                          {daNina ? "· Nina" : "· Paciente (teste)"}
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
                    processando || !podeEscrever || !leadId || (tipo === "text" && !texto.trim())
                  }
                  className="bg-atd-go text-atd-on-strong hover:bg-atd-go-hover disabled:bg-atd-idle-bg disabled:text-atd-ink-soft"
                >
                  {processando ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
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
    </div>
  );
}
