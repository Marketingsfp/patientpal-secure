import { useCallback, useEffect, useRef, useState } from "react";
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
  const [tipo, setTipo] = useState<"text" | "audio" | "image" | "document" | "sticker">("text");
  const [audio, setAudio] = useState<string | null>(null);
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
    setAudio(null);
  }, [leadId, carregarHistorico]);

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
      setErro(String(e?.message ?? e));
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
      const r = (await resolver({
        data: { clinicaId, leadId, conversaId, removerAgendamentos: limparAgenda },
      })) as { agendamentosRemovidos?: number };
      setConversaId(null);
      setErro(null);
      setAudio(null);
      setFerramentas([]);
      // O histórico permanece na tela: só entra o marcador de encerramento.
      await carregarHistorico(leadId);
      await carregarLeads();
      const n = r?.agendamentosRemovidos ?? 0;
      toast.success(
        n > 0
          ? `Conversa encerrada, memória resetada e ${n} agendamento(s) de teste removido(s).`
          : "Conversa encerrada. A memória da Nina foi resetada.",
      );
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


            <ScrollArea className="h-[450px] flex-1 rounded-lg border p-4 md:h-[520px]">
              {msgs.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Conversa nova e sem memória. Envie a primeira mensagem como paciente.
                </p>
              ) : (
                <div className="space-y-2">
                  {msgs.map((m) => {
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
