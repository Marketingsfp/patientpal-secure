import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Bot, CheckCheck, Download, FlaskConical, Loader2, RefreshCw, Send, User } from "lucide-react";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ConversationSystemEvent,
  type ConversaEvento,
} from "@/components/nina/ConversationSystemEvent";
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

export function ConsoleTesteNina() {
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
  // Eventos operacionais da conversa (resolvida, memória resetada, atribuição).
  const [eventosConversa, setEventosConversa] = useState<ConversaEvento[]>([]);
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
  const [conversaId, setConversaId] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ultimoTexto, setUltimoTexto] = useState("");
  const [tipo, setTipo] = useState<"text" | "audio" | "image" | "document" | "sticker">("text");
  const [audio, setAudio] = useState<string | null>(null);
  const fimRef = useRef<HTMLDivElement | null>(null);
  // Homologação: limpar da agenda o que a Nina marcou nesta sessão.
  const [limparAgenda, setLimparAgenda] = useState(true);
  const [ferramentas, setFerramentas] = useState<EventoFerramenta[]>([]);
  // Estado estruturado do fluxo (homologação): mostra por que a Nina
  // perguntou — ou deixou de perguntar — algo.
  const [debugEstado, setDebugEstado] = useState<Record<string, unknown> | null>(null);

  // Informa à ferramenta WebMCP de leitura qual lead de homologação está
  // aberto. Guarda só identificadores e o nome fictício do lead.
  useEffect(() => {
    const lead = leads.find((l) => l.id === leadId) ?? null;
    definirSelecaoTeste(
      lead ? { leadId: lead.id, leadNome: lead.nome, conversaId } : null,
    );
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
   * mesmo que a chamada do navegador caia (recarregar a página, HMR, rede).
   * Depois de enviar, buscamos o histórico algumas vezes até a resposta
   * aparecer — assim nenhuma mensagem "some" da tela.
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
    if (leadId) void carregarHistorico(leadId);
    else {
      setMsgs([]);
      setConversaId(null);
    }
    setAudio(null);
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

  useEffect(() => {
    fimRef.current?.scrollIntoView({ block: "end" });
  }, [msgs.length, processando]);

  const leadAtual = leads.find((l) => l.id === leadId) ?? null;

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
      // A chamada do navegador caiu, mas o servidor pode ter concluído e
      // gravado a resposta: buscamos até ela aparecer antes de acusar erro.
      const chegou = await aguardarResposta(leadId);
      setTexto("");
      await carregarLeads();
      if (!chegou) setErro(String(e?.message ?? e));
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

      escrever(["Console de teste da Nina - conversa de homologacao"], margem, 14, true);
      y += 4;
      escrever(
        doc.splitTextToSize(
          sanear(
            `${leadAtual.nome} · ${leadAtual.telefone} · sessão ${leadAtual.sessao} · exportado em ${new Date().toLocaleString("pt-BR")}`,
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

        // Quebra por parágrafo para preservar as quebras de linha originais
        // da mensagem (listas, horários em linhas separadas etc.).
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

      const nome = `nina-teste-${leadAtual.nome.toLowerCase().replace(/\s+/g, "-")}-${new Date()
        .toISOString()
        .slice(0, 10)}.pdf`;
      doc.save(nome);
      toast.success("PDF gerado com as mensagens do lead de teste.");
    } catch (e: any) {
      mostrarErro(e);
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
      // Sem popup: a confirmação aparece como evento dentro da própria
      // conversa (resolvida por… / memória resetada). Toast só para erro.
      await carregarHistorico(leadId);
      await carregarLeads();
    } catch (e: any) {
      mostrarErro(e);
    } finally {
      setProcessando(false);
    }
  };


  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FlaskConical className="h-5 w-5 text-primary" />
              Console de teste da Nina
              <Badge variant="outline" className="border-amber-500 text-amber-600">
                Ambiente de teste
              </Badge>
            </CardTitle>
            <CardDescription>
              Conversa com a Nina real (mesmo modelo, prompt e ferramentas) sem passar pelo
              WhatsApp. Nada é enviado ao paciente e nada entra no atendimento real.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => void carregarLeads()}>
            <RefreshCw className={`h-4 w-4 ${carregando ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-5 md:grid-cols-[200px_1fr]">
          <div className="max-h-[180px] space-y-1 overflow-y-auto rounded-lg border p-2 md:max-h-[640px]">
            {leads.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => setLeadId(l.id)}
                className={`w-full rounded-md px-2 py-2 text-left text-sm transition-colors ${
                  l.id === leadId ? "bg-primary/10 text-primary" : "hover:bg-muted"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{l.nome}</span>
                  <Badge variant={l.conversaId ? "default" : "secondary"} className="shrink-0">
                    {l.conversaId ? "ativa" : "nova"}
                  </Badge>
                </div>
                <span className="text-xs text-muted-foreground">
                  sessão {l.sessao} · {l.mensagens} msg
                </span>
              </button>
            ))}
            {leads.length === 0 && !carregando && (
              <p className="p-2 text-sm text-muted-foreground">Nenhum lead de teste.</p>
            )}
          </div>

          <div className="flex min-h-[540px] flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm text-muted-foreground">
                {leadAtual ? (
                  <>
                    <strong>{leadAtual.nome}</strong> · sessão {leadAtual.sessao} ·{" "}
                    <span className="font-mono">{leadAtual.telefone}</span>
                  </>
                ) : (
                  "Selecione um lead de teste"
                )}
              </div>
              <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={msgs.length === 0}
                onClick={() => void baixarPdf()}
              >
                <Download className="h-4 w-4" />
                Baixar PDF
              </Button>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-current"
                  checked={limparAgenda}
                  onChange={(e) => setLimparAgenda(e.target.checked)}
                />
                Remover agendamentos deste teste ao finalizar
              </label>
              <Button
                variant="outline"
                size="sm"
                disabled={!conversaId || processando}
                onClick={() => void resolverConversa()}
              >
                <CheckCheck className="h-4 w-4" />
                Resolver
              </Button>
              </div>
            </div>

            {debugEstado && (
              <div className="rounded-md border bg-muted/30 p-2">
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  Estado do fluxo (homologação — nunca visível ao paciente)
                </p>
                <div className="grid max-h-40 grid-cols-1 gap-x-4 overflow-y-auto font-mono text-[11px] leading-tight sm:grid-cols-2">
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
              <div className="rounded-md border bg-muted/30 p-2">
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  Ferramentas usadas pela Nina (visível só aqui)
                </p>
                <div className="max-h-40 space-y-1 overflow-y-auto">
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


            <ScrollArea className="h-[450px] flex-1 rounded-lg border p-4 md:h-[520px]">
              {timeline.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Conversa nova e sem memória. Envie a primeira mensagem como paciente.
                </p>
              ) : (
                <div className="space-y-2">
                  {timeline.map((item) => {
                    if (item.kind === "evento")
                      return <ConversationSystemEvent key={item.id} evento={item.evento} />;
                    const m = item.msg;
                    if (m.enviada_por === "sistema") {
                      return (
                        <div key={m.id} className="flex justify-center">
                          <div className="max-w-[90%] rounded-md border border-dashed bg-muted/50 px-3 py-1.5 text-center text-xs text-muted-foreground">
                            {m.body}
                          </div>
                        </div>
                      );
                    }
                    const daNina = m.direction === "out";
                    return (
                      <div
                        key={m.id}
                        className={`flex gap-2 ${daNina ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                            daNina ? "bg-primary/10" : "bg-muted"
                          }`}
                        >
                          <div className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
                            {daNina ? <Bot className="h-3 w-3" /> : <User className="h-3 w-3" />}
                            {daNina ? "Nina" : "Paciente (teste)"}
                          </div>
                          {m.body}
                        </div>
                      </div>
                    );
                  })}

                </div>
              )}
              {processando && (
                <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> A Nina está respondendo…
                </div>
              )}
              <div ref={fimRef} />
            </ScrollArea>

            {erro && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-2 text-sm text-destructive">
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
              <div className="space-y-1 rounded-lg border p-2">
                <p className="text-xs text-muted-foreground">
                  Resposta em áudio da Nina (mesma voz usada no WhatsApp)
                </p>
                <audio controls src={audio} className="w-full" />
              </div>
            )}

            <div className="space-y-2 pt-1">
              <Select value={tipo} onValueChange={(v) => setTipo(v as typeof tipo)}>
                <SelectTrigger className="w-full sm:w-[240px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Texto</SelectItem>
                  <SelectItem value="audio">Áudio (texto = transcrição)</SelectItem>
                  <SelectItem value="image">Imagem</SelectItem>
                  <SelectItem value="document">Documento</SelectItem>
                  <SelectItem value="sticker">Figurinha</SelectItem>
                </SelectContent>
              </Select>
              <Textarea
                rows={3}
                value={texto}
                placeholder={
                  tipo === "audio"
                    ? "Transcrição do áudio (deixe vazio para simular falha na transcrição)…"
                    : tipo === "text"
                      ? "Escreva a mensagem como se fosse o paciente…"
                      : "Mídia sem texto — a Nina responde como no WhatsApp."
                }
                onChange={(e) => setTexto(e.target.value)}
                disabled={processando || !podeEscrever || tipo !== "text" && tipo !== "audio"}
              />
              <div className="flex justify-end">
                <Button
                  onClick={() => void dispararMensagem(texto)}
                  disabled={
                    processando || !podeEscrever || !leadId || (tipo === "text" && !texto.trim())
                  }
                >
                  {processando ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Mensagem teste
                </Button>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
