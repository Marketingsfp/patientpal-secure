import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Bot, CheckCheck, FlaskConical, Loader2, RefreshCw, Send, User } from "lucide-react";
import { toast } from "sonner";
import { useClinica } from "@/hooks/use-clinica";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { mostrarErro } from "@/lib/traduzir-erro";
import {
  listarLeadsTeste,
  historicoLeadTeste,
  enviarMensagemTeste,
  resolverConversaTeste,
} from "@/lib/nina/teste-console.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";

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

export function ConsoleTesteNina() {
  const { clinicaAtual } = useClinica();
  const clinicaId = clinicaAtual?.clinica_id;
  const podeEscrever = usePodeEscrever("nina");

  const listar = useServerFn(listarLeadsTeste);
  const historico = useServerFn(historicoLeadTeste);
  const enviar = useServerFn(enviarMensagemTeste);
  const resolver = useServerFn(resolverConversaTeste);

  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadId, setLeadId] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [conversaId, setConversaId] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ultimoTexto, setUltimoTexto] = useState("");
  const fimRef = useRef<HTMLDivElement | null>(null);

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
          conversaId: string | null;
        };
        setMsgs(r.mensagens);
        setConversaId(r.conversaId);
      } catch (e: any) {
        mostrarErro(e);
      }
    },
    [clinicaId, historico],
  );

  useEffect(() => {
    if (leadId) void carregarHistorico(leadId);
    else {
      setMsgs([]);
      setConversaId(null);
    }
  }, [leadId, carregarHistorico]);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ block: "end" });
  }, [msgs.length, processando]);

  const leadAtual = leads.find((l) => l.id === leadId) ?? null;

  const dispararMensagem = async (conteudo: string) => {
    if (!clinicaId || !leadId) return;
    const corpo = conteudo.trim();
    if (!corpo) return;
    setProcessando(true);
    setErro(null);
    setUltimoTexto(corpo);
    try {
      const chave = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const r = (await enviar({ data: { clinicaId, leadId, texto: corpo, chave } })) as {
        duplicada: boolean;
        reply: string | null;
        erro: string | null;
      };
      setTexto("");
      await carregarHistorico(leadId);
      await carregarLeads();
      if (r.erro) setErro(r.erro);
      else if (!r.reply) setErro("A Nina não retornou resposta para esta mensagem.");
    } catch (e: any) {
      setErro(String(e?.message ?? e));
    } finally {
      setProcessando(false);
    }
  };

  const resolverConversa = async () => {
    if (!clinicaId || !leadId || !conversaId) return;
    setProcessando(true);
    try {
      await resolver({ data: { clinicaId, leadId, conversaId } });
      setMsgs([]);
      setConversaId(null);
      setErro(null);
      await carregarLeads();
      toast.success("Conversa resolvida. A próxima mensagem começa sem memória.");
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
        <div className="grid gap-4 md:grid-cols-[220px_1fr]">
          <div className="max-h-[220px] space-y-1 overflow-y-auto rounded-lg border p-2 md:max-h-[520px]">
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

          <div className="flex min-h-[360px] flex-col gap-3">
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

            <ScrollArea className="h-[300px] rounded-lg border p-3">
              {msgs.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Conversa nova e sem memória. Envie a primeira mensagem como paciente.
                </p>
              ) : (
                <div className="space-y-2">
                  {msgs.map((m) => {
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

            <div className="space-y-2">
              <Textarea
                rows={3}
                value={texto}
                placeholder="Escreva a mensagem como se fosse o paciente…"
                onChange={(e) => setTexto(e.target.value)}
                disabled={processando || !podeEscrever}
              />
              <div className="flex justify-end">
                <Button
                  onClick={() => void dispararMensagem(texto)}
                  disabled={processando || !podeEscrever || !leadId || !texto.trim()}
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
