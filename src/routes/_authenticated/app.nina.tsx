import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect, useCallback } from "react";
import { MessageCircle, Send, Mic, Bot, CheckCheck, Phone, FileText, DollarSign, Cake, Calendar, Sparkles, Brain, Loader2, Copy, CheckCircle2, AlertCircle, Eye, EyeOff } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useClinica } from "@/hooks/use-clinica";
import { chatNina } from "@/lib/nina.functions";
import { obterWhatsappConfig, salvarWhatsappConfig, testarConexaoWhatsapp } from "@/lib/whatsapp.functions";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/app/nina")({
  component: NinaPage,
  head: () => ({ meta: [{ title: "Nina — WhatsApp — ClinicaOS" }] }),
});

type Msg = { from: "paciente" | "nina"; text: string; at: string; tipo?: "texto" | "audio" };
type Conv = { id: string; nome: string; telefone: string; ultima: string; quando: string; naoLidas: number; msgs: Msg[] };

const MOCK: Conv[] = [
  {
    id: "1", nome: "Ana Beatriz Souza", telefone: "+55 11 98765-4321",
    ultima: "Obrigada! Confirmado 👍", quando: "agora", naoLidas: 0,
    msgs: [
      { from: "nina", at: "09:12", tipo: "texto", text: "Olá Ana! Aqui é a Nina da Clínica 💚. Confirmando sua consulta com Dr. Pereira amanhã (17/05) às 14h30. Posso confirmar? (1) Sim (2) Remarcar" },
      { from: "paciente", at: "09:15", tipo: "texto", text: "1" },
      { from: "nina", at: "09:15", tipo: "texto", text: "Perfeito! Consulta confirmada ✅. Endereço: Av. Paulista, 1000. Qualquer dúvida é só chamar." },
      { from: "paciente", at: "09:16", tipo: "texto", text: "Obrigada! Confirmado 👍" },
    ],
  },
  {
    id: "2", nome: "Carlos Henrique", telefone: "+55 11 97654-3210",
    ultima: "🎤 Áudio (0:14)", quando: "12 min", naoLidas: 2,
    msgs: [
      { from: "paciente", at: "10:02", tipo: "audio", text: "🎤 Áudio transcrito: \"Oi, queria remarcar meu exame de ultrassom para semana que vem se possível\"" },
      { from: "nina", at: "10:02", tipo: "texto", text: "Claro Carlos! Temos esses horários: (1) Ter 21/05 09h (2) Qua 22/05 15h (3) Qui 23/05 10h30" },
    ],
  },
  {
    id: "3", nome: "Mariana Costa", telefone: "+55 11 96543-2109",
    ultima: "Boleto enviado", quando: "1h", naoLidas: 0,
    msgs: [
      { from: "nina", at: "08:30", tipo: "texto", text: "Mariana, segue o boleto da sua consulta de R$ 130,00 com vencimento 20/05. Linha digitável: 23793.38128 60082.901141 51000.063307 5 98760000013000" },
      { from: "nina", at: "08:30", tipo: "texto", text: "📎 boleto_2025_05.pdf" },
    ],
  },
  {
    id: "4", nome: "João Pedro Silva", telefone: "+55 11 95432-1098",
    ultima: "🎉 Parabéns recebido", quando: "ontem", naoLidas: 0,
    msgs: [
      { from: "nina", at: "08:00", tipo: "texto", text: "🎂 Feliz aniversário, João! A equipe da Clínica deseja muita saúde. Como presente: 20% OFF em qualquer exame neste mês 🎁" },
    ],
  },
];

function NinaPage() {
  const [sel, setSel] = useState<Conv>(MOCK[0]);
  const [draft, setDraft] = useState("");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MessageCircle className="h-6 w-6 text-emerald-500" /> Nina — WhatsApp Business
          </h1>
          <p className="text-sm text-muted-foreground">Atendimento automático com IA via WhatsApp oficial</p>
        </div>
        <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30">
          <span className="h-2 w-2 rounded-full bg-emerald-500 mr-2 animate-pulse" /> Nina online
        </Badge>
      </div>

      <Tabs defaultValue="chat" className="space-y-4">
        <TabsList>
          <TabsTrigger value="treinada">Nina treinada</TabsTrigger>
          <TabsTrigger value="chat">Conversas WhatsApp</TabsTrigger>
          <TabsTrigger value="automacoes">Automações</TabsTrigger>
          <TabsTrigger value="config">Configuração</TabsTrigger>
        </TabsList>

        {/* ============ NINA TREINADA ============ */}
        <TabsContent value="treinada">
          <NinaTreinada />
        </TabsContent>

        {/* ============ CONVERSAS ============ */}
        <TabsContent value="chat">
          <div className="grid grid-cols-12 gap-4 h-[calc(100vh-280px)] min-h-[500px]">
            {/* Lista */}
            <Card className="col-span-4 overflow-hidden flex flex-col">
              <CardHeader className="py-3 border-b">
                <Input placeholder="Buscar conversa…" className="h-9" />
              </CardHeader>
              <div className="flex-1 overflow-auto">
                {MOCK.map(c => (
                  <button key={c.id} onClick={() => setSel(c)}
                    className={`w-full text-left px-4 py-3 border-b border-border hover:bg-muted/50 transition-colors ${sel.id === c.id ? "bg-muted" : ""}`}>
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{c.nome}</div>
                        <div className="text-xs text-muted-foreground truncate">{c.ultima}</div>
                      </div>
                      <div className="text-xs text-muted-foreground shrink-0 flex flex-col items-end gap-1">
                        <span>{c.quando}</span>
                        {c.naoLidas > 0 && <Badge className="bg-emerald-500 text-white h-5 min-w-5 px-1.5">{c.naoLidas}</Badge>}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </Card>

            {/* Chat */}
            <Card className="col-span-8 overflow-hidden flex flex-col">
              <CardHeader className="py-3 border-b flex flex-row items-center justify-between space-y-0">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/15 text-primary flex items-center justify-center font-semibold">
                    {sel.nome.split(" ").map(n => n[0]).slice(0, 2).join("")}
                  </div>
                  <div>
                    <div className="font-medium">{sel.nome}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <Phone className="h-3 w-3" /> {sel.telefone}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <Bot className="h-4 w-4 text-emerald-500" />
                  <span className="text-muted-foreground">Nina respondendo</span>
                  <Switch defaultChecked />
                </div>
              </CardHeader>

              <div className="flex-1 overflow-auto p-4 space-y-3 bg-muted/20">
                {sel.msgs.map((m, i) => (
                  <div key={i} className={`flex ${m.from === "nina" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm shadow-sm ${
                      m.from === "nina" ? "bg-emerald-500 text-white rounded-br-sm" : "bg-card border border-border rounded-bl-sm"
                    }`}>
                      {m.tipo === "audio" && <div className="text-xs opacity-70 mb-1 flex items-center gap-1"><Mic className="h-3 w-3" /> transcrito por IA</div>}
                      <div className="whitespace-pre-wrap">{m.text}</div>
                      <div className={`text-[10px] mt-1 flex items-center gap-1 ${m.from === "nina" ? "text-white/80 justify-end" : "text-muted-foreground"}`}>
                        {m.at} {m.from === "nina" && <CheckCheck className="h-3 w-3" />}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t p-3 flex items-center gap-2">
                <Button variant="ghost" size="icon" title="Gravar áudio"><Mic className="h-4 w-4" /></Button>
                <Input
                  placeholder="Digite uma mensagem… (Nina responde se IA estiver ligada)"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  className="flex-1"
                />
                <Button size="icon" className="bg-emerald-500 hover:bg-emerald-600">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          </div>
        </TabsContent>

        {/* ============ AUTOMAÇÕES ============ */}
        <TabsContent value="automacoes" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <AutoCard icon={Calendar} cor="text-blue-500"
              titulo="Confirmação de agendamento"
              desc="Envia mensagem 24h antes da consulta pedindo confirmação. Reagenda se o paciente responder."
              ativa />
            <AutoCard icon={FileText} cor="text-purple-500"
              titulo="Envio da GR / comprovante"
              desc="Após o pagamento, envia automaticamente a Guia de Recolhimento ou comprovante em PDF." ativa />
            <AutoCard icon={DollarSign} cor="text-amber-500"
              titulo="Cobrança de boleto / Pix"
              desc="Envia o boleto/Pix no dia da emissão e lembretes 3 dias antes e no vencimento." ativa />
            <AutoCard icon={Cake} cor="text-pink-500"
              titulo="Aniversários e campanhas"
              desc="Parabeniza pacientes no aniversário e dispara campanhas segmentadas (ex: revisão anual)." ativa />
            <AutoCard icon={Mic} cor="text-emerald-500"
              titulo="Resposta a áudios"
              desc="Transcreve áudios do paciente com IA (Gemini) e responde por texto ou áudio." ativa />
            <AutoCard icon={Sparkles} cor="text-primary"
              titulo="Atendimento inteligente"
              desc="Nina responde dúvidas frequentes (preços, endereço, horários) e escala para atendente quando necessário." ativa />
          </div>
        </TabsContent>

        {/* ============ CONFIGURAÇÃO ============ */}
        <TabsContent value="config">
          <Card>
            <CardHeader>
              <CardTitle>Conexão WhatsApp Business API</CardTitle>
              <CardDescription>Configurações da integração oficial via Nina</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 max-w-2xl">
              <div className="space-y-1">
                <Label>Número conectado</Label>
                <Input value="+55 11 4000-0000" readOnly />
              </div>
              <div className="space-y-1">
                <Label>Nome de exibição</Label>
                <Input defaultValue="Clínica — Nina" />
              </div>
              <div className="space-y-1">
                <Label>Mensagem de boas-vindas</Label>
                <Textarea rows={3} defaultValue="Olá! Sou a Nina, assistente virtual da clínica 💚. Posso te ajudar a agendar, confirmar ou tirar dúvidas." />
              </div>
              <div className="space-y-1">
                <Label>Horário de atendimento humano</Label>
                <div className="flex items-center gap-2">
                  <Input defaultValue="08:00" className="w-28" />
                  <span>às</span>
                  <Input defaultValue="18:00" className="w-28" />
                </div>
                <p className="text-xs text-muted-foreground">Fora do horário, apenas a Nina responde.</p>
              </div>
              <Button>Salvar configurações</Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AutoCard({ icon: Icon, cor, titulo, desc, ativa }: { icon: any; cor: string; titulo: string; desc: string; ativa: boolean }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-start gap-3">
        <div className={`h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0 ${cor}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-medium">{titulo}</h3>
            <Switch defaultChecked={ativa} />
          </div>
          <p className="text-sm text-muted-foreground mt-1">{desc}</p>
        </div>
      </CardContent>
    </Card>
  );
}

type NinaMsg = { role: "user" | "assistant"; content: string };

function NinaTreinada() {
  const { clinicaAtual } = useClinica();
  const ask = useServerFn(chatNina);
  const [messages, setMessages] = useState<NinaMsg[]>([
    {
      role: "assistant",
      content:
        "Olá! Sou a Nina 💚. Estou treinada com os médicos, horários e valores de exames desta clínica. Pergunte coisas como:\n• Quais dias atende o Dr. Fulano?\n• Quanto custa um ultrassom no PIX?\n• Tem cardiologista na quinta de manhã?",
    },
  ]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const send = async () => {
    const text = draft.trim();
    if (!text || loading || !clinicaAtual) return;
    const next: NinaMsg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setDraft("");
    setLoading(true);
    try {
      const r = await ask({
        data: {
          clinicaId: clinicaAtual.clinica_id,
          messages: next.slice(-20),
        },
      });
      if (r.error) {
        toast.error(r.error);
        setMessages((m) => [...m, { role: "assistant", content: `⚠️ ${r.error}` }]);
      } else {
        setMessages((m) => [...m, { role: "assistant", content: r.reply || "(sem resposta)" }]);
      }
    } catch (e) {
      toast.error("Falha ao falar com a Nina");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <Card className="lg:col-span-2 flex flex-col h-[calc(100vh-280px)] min-h-[500px]">
        <CardHeader className="py-3 border-b">
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="h-5 w-5 text-emerald-500" /> Nina treinada — pergunte qualquer coisa
          </CardTitle>
          <CardDescription>
            Responde em tempo real consultando médicos, horários e valores cadastrados.
          </CardDescription>
        </CardHeader>
        <div ref={scrollRef} className="flex-1 overflow-auto p-4 space-y-3 bg-muted/20">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "assistant" ? "justify-start" : "justify-end"}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm shadow-sm whitespace-pre-wrap ${
                  m.role === "assistant"
                    ? "bg-card border border-border rounded-bl-sm"
                    : "bg-emerald-500 text-white rounded-br-sm"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-card border border-border rounded-2xl rounded-bl-sm px-4 py-2 text-sm flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Nina está digitando…
              </div>
            </div>
          )}
        </div>
        <div className="border-t p-3 flex items-center gap-2">
          <Input
            placeholder="Ex.: Quanto custa raio-x no PIX?"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            disabled={loading}
            className="flex-1"
          />
          <Button
            onClick={send}
            disabled={loading || !draft.trim()}
            className="bg-emerald-500 hover:bg-emerald-600"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Sugestões
          </CardTitle>
          <CardDescription>Clique para perguntar</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {[
            "Quais médicos atendem na segunda-feira?",
            "Quanto custa ultrassom abdominal no PIX?",
            "Tem cardiologista de manhã?",
            "Lista todos os tipos de raio-x e os valores",
            "Em quais dias o Dr. atende à tarde?",
          ].map((s, i) => (
            <button
              key={i}
              onClick={() => setDraft(s)}
              disabled={loading}
              className="w-full text-left text-sm px-3 py-2 rounded-md border border-border hover:bg-muted/50 transition-colors disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
