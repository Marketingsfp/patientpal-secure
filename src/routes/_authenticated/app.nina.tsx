import { createFileRoute, useLocation, useNavigate } from "@tanstack/react-router";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { MessageCircle, Send, Mic, Bot, CheckCheck, Phone, FileText, DollarSign, Cake, Calendar, Sparkles, Brain, Loader2, Copy, CheckCircle2, AlertCircle, Eye, EyeOff, Smartphone, Instagram, Facebook, Globe, Plus, Pencil, X, Paperclip, Smile, Search, PanelRightClose, PanelRightOpen, MoreVertical, User, Tag, ArrowLeft } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useClinica } from "@/hooks/use-clinica";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { chatNina } from "@/lib/nina.functions";
import { obterWhatsappConfig, salvarWhatsappConfig, testarConexaoWhatsapp } from "@/lib/whatsapp.functions";
import { enviarMensagemWhatsapp, listarTemplatesWhatsapp, criarTemplateWhatsapp, excluirTemplateWhatsapp } from "@/lib/whatsapp.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { NinaMessage, TypingDots } from "@/components/nina/NinaMessage";
import { formatWhatsappText } from "@/components/nina/formatWhatsappText";
import { AtendDashboard, AtendDepartamentos, AtendMacros, AtendKb, AtendPausas, AtendMeuStatus } from "@/components/nina/AtendimentoTabs";
import { AtendInbox, AtendSupervisor, AtendRelatorios, AtendRoteamento } from "@/components/nina/AtendimentoExtraTabs";

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

function formatRelativo(iso: string): string {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "agora";
  if (diff < 3600) return `${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 172800) return "ontem";
  return d.toLocaleDateString("pt-BR");
}
function formatHora(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function formatTelefone(num: string): string {
  const d = (num || "").replace(/\D/g, "");
  if (d.length === 13) return `+${d.slice(0, 2)} ${d.slice(2, 4)} ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.length === 12) return `+${d.slice(0, 2)} ${d.slice(2, 4)} ${d.slice(4, 8)}-${d.slice(8)}`;
  return num || "—";
}

function NinaPage() {
  const { clinicaAtual } = useClinica();
  const clinicaId = clinicaAtual?.clinica_id;
  const [conversas, setConversas] = useState<Conv[]>([]);
  const [sel, setSel] = useState<Conv | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const hashAba = (location.hash ?? "").replace(/^#/, "");
  const abaAtiva = ["treinada", "chat", "automacoes", "config", "templates", "atend-status", "atend-dashboard", "atend-depto", "atend-macros", "atend-kb", "atend-pausas", "atend-inbox", "atend-supervisor", "atend-relatorios", "atend-roteamento"].includes(hashAba) ? (hashAba === "chat" ? "atend-inbox" : hashAba) : "atend-inbox";
  const setAbaAtiva = (v: string) => {
    navigate({ to: "/app/nina", hash: v, replace: true });
  };
  useEffect(() => {
    if (!hashAba) {
      navigate({ to: "/app/nina", hash: "atend-inbox", replace: true });
    } else if (hashAba === "chat") {
      navigate({ to: "/app/nina", hash: "atend-inbox", replace: true });
    }
  }, [hashAba, navigate]);
  const [draft, setDraft] = useState("");
  const [busca, setBusca] = useState("");
  const [loadingConv, setLoadingConv] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const enviarFn = useServerFn(enviarMensagemWhatsapp);

  const enviarMensagem = async () => {
    const text = draft.trim();
    if (!text || !sel || !clinicaId || enviando) return;
    setEnviando(true);
    try {
      const to = sel.id.startsWith("+") ? sel.id : `+${sel.id}`;
      await enviarFn({ data: { clinicaId, to, text } });
      setDraft("");
      await carregar();
    } catch (e: any) {
      mostrarErro(e);
    } finally {
      setEnviando(false);
    }
  };

  const carregar = useCallback(async () => {
    if (!clinicaId) return;
    setLoadingConv(true);
    const { data, error } = await supabase
      .from("whatsapp_mensagens")
      .select("id, wa_message_id, direction, from_number, to_number, body, tipo, enviada_por, recebida_em")
      .eq("clinica_id", clinicaId)
      .order("recebida_em", { ascending: true })
      .limit(1000);
    setLoadingConv(false);
    if (error) {
      mostrarErro(error, "erro ao carregar conversas");
      return;
    }
    const map = new Map<string, Conv>();
    for (const row of data || []) {
      const telefone = row.direction === "in" ? (row.from_number || "") : (row.to_number || "");
      if (!telefone) continue;
      const key = telefone.replace(/\D/g, "");
      let conv = map.get(key);
      if (!conv) {
        conv = {
          id: key,
          nome: formatTelefone(telefone),
          telefone: formatTelefone(telefone),
          ultima: "",
          quando: "",
          naoLidas: 0,
          msgs: [],
        };
        map.set(key, conv);
      }
      const isIn = row.direction === "in";
      conv.msgs.push({
        from: isIn ? "paciente" : "nina",
        text: row.body || `[${row.tipo}]`,
        at: formatHora(row.recebida_em),
        tipo: row.tipo === "audio" ? "audio" : "texto",
      });
      conv.ultima = row.body || `[${row.tipo}]`;
      conv.quando = formatRelativo(row.recebida_em);
    }
    const lista = Array.from(map.values()).sort((a, b) => (a.quando === "agora" ? -1 : 1));
    setConversas(lista);
    setSel((prev) => (prev ? lista.find((c) => c.id === prev.id) || lista[0] || null : lista[0] || null));
  }, [clinicaId]);

  useEffect(() => { carregar(); }, [carregar]);

  // Realtime: novas mensagens chegam automaticamente
  useEffect(() => {
    if (!clinicaId) return;
    const channel = supabase
      .channel(`wa-msgs-${clinicaId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "whatsapp_mensagens", filter: `clinica_id=eq.${clinicaId}` },
        () => { carregar(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [clinicaId, carregar]);

  const conversasFiltradas = conversas.filter((c) =>
    !busca || c.nome.toLowerCase().includes(busca.toLowerCase()) || c.telefone.includes(busca),
  );

  return (
    <div className="space-y-6">
      <Tabs value={abaAtiva} onValueChange={setAbaAtiva} className="space-y-4">
        {/* ============ NINA TREINADA ============ */}
        <TabsContent value="treinada">
          <NinaTreinada />
        </TabsContent>

        {/* ============ CONVERSAS ============ */}

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
          <ConfiguracaoWhatsApp />
        </TabsContent>

        {/* ============ TEMPLATES (HSM) ============ */}
        <TabsContent value="templates">
          <TemplatesWhatsapp />
        </TabsContent>

        {/* ============ ATENDIMENTO — Dashboard ============ */}
        <TabsContent value="atend-dashboard"><AtendDashboard /></TabsContent>
        <TabsContent value="atend-status"><AtendMeuStatus /></TabsContent>
        <TabsContent value="atend-depto"><AtendDepartamentos /></TabsContent>
        <TabsContent value="atend-macros"><AtendMacros /></TabsContent>
        <TabsContent value="atend-kb"><AtendKb /></TabsContent>
        <TabsContent value="atend-pausas"><AtendPausas /></TabsContent>
        <TabsContent value="atend-inbox"><AtendInbox /></TabsContent>
        <TabsContent value="atend-supervisor"><AtendSupervisor /></TabsContent>
        <TabsContent value="atend-relatorios"><AtendRelatorios /></TabsContent>
        <TabsContent value="atend-roteamento"><AtendRoteamento /></TabsContent>
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
                className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm shadow-sm break-words ${
                  m.role === "assistant"
                    ? "bg-card border border-border rounded-bl-sm"
                    : "bg-emerald-500 text-white rounded-br-sm"
                }`}
              >
                <NinaMessage
                  content={m.content}
                  variant={m.role === "assistant" ? "assistant" : "user"}
                />
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-card border border-border rounded-2xl rounded-bl-sm px-4 py-2 text-sm flex items-center gap-2 text-muted-foreground">
                <TypingDots /> <span>Nina está digitando…</span>
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

/* ============================ WHATSAPP CONFIG ============================ */

interface WppCfg {
  clinica_id: string;
  phone_number_id: string;
  waba_id: string;
  display_phone_number: string;
  display_name: string;
  welcome_message: string;
  horario_inicio: string;
  horario_fim: string;
  verify_token: string;
  ativo: boolean;
  has_access_token: boolean;
  has_app_secret: boolean;
  ultimo_teste_em: string | null;
  ultimo_teste_ok: boolean | null;
  ultimo_teste_erro: string | null;
}

function ConfiguracaoWhatsApp() {
  const { clinicaAtual } = useClinica();
  const podeEscrever = usePodeEscrever("nina");
  const obter = useServerFn(obterWhatsappConfig);
  const salvar = useServerFn(salvarWhatsappConfig);
  const testar = useServerFn(testarConexaoWhatsapp);

  const [cfg, setCfg] = useState<WppCfg | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [canal, setCanal] = useState<"evolution" | "oficial" | "instagram" | "facebook" | "site">("oficial");
  const [showToken, setShowToken] = useState(false);
  const [form, setForm] = useState({ display_name: "", phone_number_id: "", waba_id: "", access_token: "" });
  const [horario, setHorario] = useState({ inicio: "08:00", fim: "18:00" });
  const [savingHorario, setSavingHorario] = useState(false);

  const carregar = useCallback(async () => {
    if (!clinicaAtual) return;
    setLoading(true);
    try {
      const data = await obter({ data: { clinicaId: clinicaAtual.clinica_id } });
      setCfg(data as WppCfg);
      setHorario({
        inicio: (data as WppCfg).horario_inicio || "08:00",
        fim: (data as WppCfg).horario_fim || "18:00",
      });
    } catch (e: any) {
      mostrarErro(e);
    } finally {
      setLoading(false);
    }
  }, [clinicaAtual, obter]);

  useEffect(() => { void carregar(); }, [carregar]);

  const abrirDialog = () => {
    if (!cfg) return;
    setCanal("oficial");
    setForm({
      display_name: cfg.display_name ?? "",
      phone_number_id: cfg.phone_number_id ?? "",
      waba_id: cfg.waba_id ?? "",
      access_token: "",
    });
    setShowToken(false);
    setDialogOpen(true);
  };

  if (!clinicaAtual) {
    return <p className="text-sm text-muted-foreground">Selecione uma clínica primeiro.</p>;
  }
  if (loading || !cfg) {
    return (
      <Card><CardContent className="py-12 text-center text-muted-foreground flex items-center justify-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando configuração…
      </CardContent></Card>
    );
  }

  const webhookUrl = `https://patientpal-secure.lovable.app/api/public/whatsapp/${cfg.clinica_id}`;

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copiado`);
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  const onSalvar = async () => {
    if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
    setSaving(true);
    try {
      await salvar({
        data: {
          clinicaId: cfg.clinica_id,
          phone_number_id: form.phone_number_id,
          waba_id: form.waba_id,
          display_name: form.display_name,
          access_token: form.access_token || undefined,
        },
      });
      toast.success("Configuração salva");
      setDialogOpen(false);
      await carregar();
    } catch (e: any) {
      mostrarErro(e);
    } finally {
      setSaving(false);
    }
  };

  const onTestar = async () => {
    if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
    // se há valores não salvos, salva antes de testar
    if (form.phone_number_id !== cfg.phone_number_id || form.waba_id !== cfg.waba_id || form.display_name !== cfg.display_name || form.access_token) {
      await onSalvar();
    }
    setTesting(true);
    try {
      const r = await testar({ data: { clinicaId: cfg.clinica_id } });
      if ((r as any).ok) {
        toast.success(`Conectado a ${(r as any).display_phone_number || "WhatsApp"}`);
      } else {
        toast.error((r as any).error ?? "Falha ao testar conexão");
      }
      await carregar();
    } catch (e: any) {
      mostrarErro(e);
    } finally {
      setTesting(false);
    }
  };

  const onSalvarHorario = async () => {
    if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
    if (!cfg) return;
    if (horario.inicio >= horario.fim) {
      toast.error("O horário inicial deve ser menor que o final");
      return;
    }
    setSavingHorario(true);
    try {
      await salvar({
        data: {
          clinicaId: cfg.clinica_id,
          horario_inicio: horario.inicio,
          horario_fim: horario.fim,
        },
      });
      toast.success("Horário salvo");
      await carregar();
    } catch (e: any) {
      mostrarErro(e);
    } finally {
      setSavingHorario(false);
    }
  };

  const statusBadge = cfg.ultimo_teste_ok
    ? <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100"><CheckCircle2 className="h-3 w-3 mr-1" /> Conectado{cfg.display_phone_number ? ` — ${cfg.display_phone_number}` : ""}</Badge>
    : cfg.ultimo_teste_ok === false
      ? <Badge variant="destructive"><AlertCircle className="h-3 w-3 mr-1" /> Falha no último teste</Badge>
      : <Badge variant="outline">Não testado</Badge>;

  const canaisDisponiveis = [
    { id: "oficial", label: "API Oficial", icon: MessageCircle, color: "text-emerald-600", disabled: false },
  ] as const;

  return (
    <div className="space-y-6 max-w-3xl">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <CardTitle>Conexões de atendimento</CardTitle>
              <CardDescription>Gerencie os canais conectados à Nina</CardDescription>
            </div>
            {podeEscrever && (
              <Button onClick={abrirDialog}><Plus className="h-4 w-4 mr-1" /> Nova Conexão</Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {cfg.has_access_token || cfg.phone_number_id ? (
            <div className="rounded-lg border p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-10 w-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <MessageCircle className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="font-medium truncate">{cfg.display_name || "WhatsApp API Oficial"}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {cfg.display_phone_number || cfg.phone_number_id || "—"}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {statusBadge}
                {podeEscrever && (
                  <Button variant="ghost" size="icon" onClick={abrirDialog}><Pencil className="h-4 w-4" /></Button>
                )}
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground py-8 text-center">
              Nenhuma conexão configurada. Clique em <strong>Nova Conexão</strong> para começar.
            </div>
          )}

          {cfg.ultimo_teste_erro && (
            <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
              <strong>Erro no último teste:</strong> {cfg.ultimo_teste_erro}
            </div>
          )}

          <div className="mt-6 rounded-md border bg-muted/40 p-4 space-y-3">
            <p className="text-sm font-medium">Webhook para configurar na Meta</p>
            <div className="space-y-1">
              <Label className="text-xs">Callback URL</Label>
              <div className="flex gap-2">
                <Input value={webhookUrl} readOnly className="font-mono text-xs" />
                <Button type="button" size="icon" variant="outline" onClick={() => copy(webhookUrl, "URL")}><Copy className="h-4 w-4" /></Button>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Verify Token</Label>
              <div className="flex gap-2">
                <Input value={cfg.verify_token} readOnly className="font-mono text-xs" />
                <Button type="button" size="icon" variant="outline" onClick={() => copy(cfg.verify_token, "Verify Token")}><Copy className="h-4 w-4" /></Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Em <strong>Meta for Developers → Seu App → WhatsApp → Configuration → Webhooks</strong>, cole a URL e o Verify Token, depois assine o campo <code>messages</code>.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Horário de atendimento humano</CardTitle>
          <CardDescription>
            Dentro deste intervalo a equipe responde manualmente. <strong>Fora</strong> dele a Nina responde automaticamente pelo WhatsApp.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 max-w-sm">
            <div className="space-y-1">
              <Label>Início</Label>
              <Input
                type="time"
                value={horario.inicio}
                onChange={(e) => setHorario({ ...horario, inicio: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Fim</Label>
              <Input
                type="time"
                value={horario.fim}
                onChange={(e) => setHorario({ ...horario, fim: e.target.value })}
              />
            </div>
          </div>
          {podeEscrever && (
            <div className="flex justify-end">
              <Button onClick={onSalvarHorario} disabled={savingHorario}>
                {savingHorario ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando…</> : "Salvar horário"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Nova Conexão</DialogTitle>
            <DialogDescription>Conecte um canal de atendimento</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-xs mb-2 block">Canal</Label>
              <div className="grid grid-cols-1 gap-2">
                {canaisDisponiveis.map((c) => {
                  const Icon = c.icon;
                  const active = canal === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      disabled={c.disabled}
                      onClick={() => !c.disabled && setCanal(c.id as typeof canal)}
                      className={`relative flex flex-col items-center gap-1 rounded-lg border p-3 text-xs transition ${
                        active ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted/50"
                      } ${c.disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                    >
                      <Icon className={`h-5 w-5 ${active ? "text-primary" : c.color}`} />
                      <span className="font-medium leading-tight text-center">{c.label}</span>
                      {c.disabled && (
                        <span className="absolute -top-1.5 -right-1.5 text-[9px] bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 border">em breve</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1">
              <Label>Nome</Label>
              <Input
                value={form.display_name}
                onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                placeholder="Ex: WhatsApp Principal"
              />
            </div>

            <div className="space-y-1">
              <Label>Phone Number ID</Label>
              <Input
                value={form.phone_number_id}
                onChange={(e) => setForm({ ...form, phone_number_id: e.target.value })}
                placeholder="Ex: 123456789012345"
              />
            </div>

            <div className="space-y-1">
              <Label>WABA ID (opcional)</Label>
              <Input
                value={form.waba_id}
                onChange={(e) => setForm({ ...form, waba_id: e.target.value })}
                placeholder="Ex: 987654321098765"
              />
            </div>

            <div className="space-y-1">
              <Label>Access Token</Label>
              <div className="flex gap-2">
                <Input
                  type={showToken ? "text" : "password"}
                  value={form.access_token}
                  onChange={(e) => setForm({ ...form, access_token: e.target.value })}
                  placeholder={cfg.has_access_token ? "•••••••• (preenchido — deixe em branco para manter)" : "Permanent token ou System User token"}
                  autoComplete="off"
                />
                <Button type="button" size="icon" variant="outline" onClick={() => setShowToken((v) => !v)}>
                  {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={onTestar} disabled={testing || saving}>
              {testing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Testando…</> : "Testar Conexão"}
            </Button>
            <Button onClick={onSalvar} disabled={saving || testing}>
              {saving ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ============================ INBOX WHATSAPP (Hi-style) ============================ */

type InboxProps = {
  conversas: Conv[];
  todasConversas: Conv[];
  sel: Conv | null;
  setSel: (c: Conv | null) => void;
  busca: string;
  setBusca: (v: string) => void;
  draft: string;
  setDraft: (v: string) => void;
  enviando: boolean;
  enviarMensagem: () => Promise<void> | void;
  loadingConv: boolean;
};

function InboxWhatsapp({ conversas, todasConversas, sel, setSel, busca, setBusca, draft, setDraft, enviando, enviarMensagem, loadingConv }: InboxProps) {
  const [filtro, setFiltro] = useState<"todas" | "naolidas" | "nina" | "humano">("todas");
  const [painelAberto, setPainelAberto] = useState(false);
  const [notas, setNotas] = useState<Record<string, string>>({});
  const [isWide, setIsWide] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.matchMedia("(min-width: 1280px)").matches : true,
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 1280px)");
    const onChange = () => setIsWide(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const listaFinal = useMemo(() => {
    if (filtro === "naolidas") return conversas.filter(c => c.naoLidas > 0);
    if (filtro === "nina") return conversas.filter(c => c.msgs.at(-1)?.from === "nina");
    if (filtro === "humano") return conversas.filter(c => c.msgs.at(-1)?.from === "paciente");
    return conversas;
  }, [conversas, filtro]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [sel?.id, sel?.msgs.length]);

  const initials = (nome: string) =>
    nome.split(" ").filter(Boolean).map(n => n[0]).slice(0, 2).join("").toUpperCase() || "?";

  const totalNaoLidas = todasConversas.reduce((s, c) => s + c.naoLidas, 0);

  return (
    <div className="h-[calc(100dvh-220px)] min-h-[520px] border border-border rounded-lg overflow-hidden bg-card flex">
      {/* ============ COLUNA 1 — LISTA DE CONVERSAS ============ */}
      <aside
        className={`${sel ? "hidden sm:flex" : "flex"} w-full sm:w-[280px] lg:w-[320px] xl:w-[340px] sm:shrink-0 flex-col bg-card border-r border-border min-w-0`}
      >
        <div className="p-3 border-b border-border space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar conversa…"
              className="h-9 pl-8"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <div className="flex gap-1 flex-wrap">
            {([
              { k: "todas", label: "Todas", count: todasConversas.length },
              { k: "naolidas", label: "Não lidas", count: totalNaoLidas },
              { k: "nina", label: "Nina" },
              { k: "humano", label: "Aguardando" },
            ] as const).map(f => (
              <button
                key={f.k}
                onClick={() => setFiltro(f.k)}
                className={`text-xs px-2.5 py-1 rounded-full transition-colors flex items-center gap-1 ${
                  filtro === f.k
                    ? "bg-emerald-500 text-white"
                    : "bg-muted text-muted-foreground hover:bg-muted/70"
                }`}
              >
                {f.label}
                {("count" in f && f.count) ? <span className="opacity-80">·{f.count}</span> : null}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-auto">
          {listaFinal.length === 0 && (
            <div className="p-8 text-sm text-muted-foreground text-center">
              {loadingConv ? "Carregando…" : "Nenhuma conversa nesse filtro."}
            </div>
          )}
          {listaFinal.map(c => {
            const ativo = sel?.id === c.id;
            const ultimaFromNina = c.msgs.at(-1)?.from === "nina";
            return (
              <button
                key={c.id}
                onClick={() => setSel(c)}
                className={`w-full text-left px-3 py-3 border-b border-border/60 hover:bg-muted/50 transition-colors flex gap-3 relative ${
                  ativo ? "bg-muted" : ""
                }`}
              >
                {ativo && <span className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500" />}
                <div className="h-10 w-10 rounded-full bg-primary/15 text-primary flex items-center justify-center font-semibold text-sm shrink-0">
                  {initials(c.nome)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium truncate text-sm">{c.nome}</div>
                    <div className="text-[10px] text-muted-foreground shrink-0">{c.quando}</div>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <div className="text-xs text-muted-foreground truncate flex items-center gap-1">
                      {ultimaFromNina && <CheckCheck className="h-3 w-3 text-emerald-500 shrink-0" />}
                      <span className="truncate">{c.ultima || "—"}</span>
                    </div>
                    {c.naoLidas > 0 && (
                      <Badge className="bg-emerald-500 text-white h-5 min-w-5 px-1.5 text-[10px]">
                        {c.naoLidas}
                      </Badge>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* ============ COLUNA 2 — CHAT ============ */}
      <section
        className={`${sel ? "flex" : "hidden sm:flex"} flex-1 min-w-0 flex-col bg-[oklch(0.97_0.005_120)] dark:bg-muted/10`}
      >
        {sel ? (
          <>
            <header className="py-2.5 px-4 border-b border-border bg-card flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="sm:hidden -ml-2"
                  onClick={() => setSel(null)}
                  title="Voltar"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="h-10 w-10 rounded-full bg-primary/15 text-primary flex items-center justify-center font-semibold shrink-0">
                  {initials(sel.nome)}
                </div>
                <div className="min-w-0">
                  <div className="font-medium truncate">{sel.nome}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Phone className="h-3 w-3" /> {sel.telefone}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="flex items-center gap-2 text-xs">
                  <Bot className="h-4 w-4 text-emerald-500" />
                  <span className="text-muted-foreground hidden md:inline">Nina</span>
                  <Switch defaultChecked />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setPainelAberto(v => !v)}
                  title={painelAberto ? "Fechar painel" : "Abrir painel"}
                >
                  {painelAberto ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
                </Button>
                <Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button>
              </div>
            </header>

            <div ref={scrollRef} className="flex-1 overflow-auto p-4 space-y-1">
              {renderMensagensAgrupadas(sel.msgs)}
            </div>

            <div className="border-t border-border bg-card p-2.5 flex items-end gap-2">
              <Button variant="ghost" size="icon" title="Anexar"><Paperclip className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" title="Emoji"><Smile className="h-4 w-4" /></Button>
              <Textarea
                placeholder="Digite uma mensagem…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    enviarMensagem();
                  }
                }}
                disabled={enviando}
                rows={1}
                className="flex-1 resize-none min-h-9 max-h-32 py-2"
              />
              <Button variant="ghost" size="icon" title="Gravar áudio"><Mic className="h-4 w-4" /></Button>
              <Button
                size="icon"
                onClick={() => enviarMensagem()}
                disabled={enviando || !draft.trim()}
                className="bg-emerald-500 hover:bg-emerald-600"
              >
                {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-sm text-muted-foreground p-8 text-center gap-3">
            <MessageCircle className="h-12 w-12 opacity-30" />
            <div>Selecione uma conversa à esquerda para começar.</div>
          </div>
        )}
      </section>

      {/* ============ COLUNA 3 — PAINEL DO CONTATO (xl+ inline, menor vira Sheet) ============ */}
      {isWide && painelAberto && sel && (
        <aside className="flex w-[300px] 2xl:w-[340px] shrink-0 border-l border-border bg-card flex-col overflow-auto">
          <PainelContatoConteudo
            sel={sel}
            notas={notas}
            setNotas={setNotas}
            initials={initials}
          />
        </aside>
      )}
      {!isWide && (
        <Sheet
          open={painelAberto && !!sel}
          onOpenChange={(o) => setPainelAberto(o)}
        >
          <SheetContent side="right" className="w-[320px] sm:w-[360px] p-0">
            {sel && (
              <div className="h-full overflow-auto">
                <PainelContatoConteudo
                  sel={sel}
                  notas={notas}
                  setNotas={setNotas}
                  initials={initials}
                />
              </div>
            )}
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}

function PainelContatoConteudo({
  sel,
  notas,
  setNotas,
  initials,
}: {
  sel: Conv;
  notas: Record<string, string>;
  setNotas: (n: Record<string, string>) => void;
  initials: (n: string) => string;
}) {
  return (
    <div className="p-4 space-y-4">
              <div className="flex flex-col items-center text-center pb-3 border-b border-border">
                <div className="h-20 w-20 rounded-full bg-primary/15 text-primary flex items-center justify-center text-2xl font-semibold mb-2">
                  {initials(sel.nome)}
                </div>
                <div className="font-semibold">{sel.nome}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Phone className="h-3 w-3" /> {sel.telefone}
                </div>
              </div>

              <div>
                <div className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider mb-2 flex items-center gap-1">
                  <Tag className="h-3 w-3" /> Tags
                </div>
                <div className="flex flex-wrap gap-1">
                  <Badge variant="outline" className="text-[10px]">Paciente</Badge>
                  <Badge variant="outline" className="text-[10px]">WhatsApp</Badge>
                </div>
              </div>

              <PainelInfoCard icon={User} titulo="Paciente vinculado" valor="—" />
              <PainelInfoCard icon={Calendar} titulo="Próximo agendamento" valor="—" />
              <PainelInfoCard icon={FileText} titulo="Última consulta" valor="—" />
              <PainelInfoCard icon={DollarSign} titulo="Mensalidades em aberto" valor="—" />

              <div>
                <div className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider mb-2">
                  Notas internas
                </div>
                <Textarea
                  rows={4}
                  placeholder="Anotações sobre esse contato…"
                  value={notas[sel.id] || ""}
                  onChange={(e) => setNotas({ ...notas, [sel.id]: e.target.value })}
                  className="text-xs resize-none"
                />
              </div>
    </div>
  );
}

function PainelInfoCard({ icon: Icon, titulo, valor }: { icon: any; titulo: string; valor: string }) {
  return (
    <div className="rounded-md border border-border p-3 bg-muted/30">
      <div className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider flex items-center gap-1 mb-1">
        <Icon className="h-3 w-3" /> {titulo}
      </div>
      <div className="text-sm">{valor}</div>
    </div>
  );
}

function renderMensagensAgrupadas(msgs: Msg[]) {
  // As mensagens só têm hora ("HH:MM"), sem data. Para um separador útil,
  // marcamos um único grupo "Hoje" no topo se houver mensagens.
  if (!msgs.length) {
    return (
      <div className="text-center text-xs text-muted-foreground py-8">
        Nenhuma mensagem ainda.
      </div>
    );
  }
  return (
    <>
      <div className="flex justify-center my-2">
        <span className="text-[10px] text-muted-foreground bg-card border border-border rounded-full px-3 py-0.5">
          Hoje
        </span>
      </div>
      {msgs.map((m, i) => (
        <div key={i} className={`flex ${m.from === "nina" ? "justify-end" : "justify-start"} mb-1`}>
          <div
            className={`max-w-[70%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
              m.from === "nina"
                ? "bg-emerald-500 text-white rounded-br-sm"
                : "bg-card border border-border rounded-bl-sm"
            }`}
          >
            {m.tipo === "audio" && (
              <div className="text-xs opacity-70 mb-1 flex items-center gap-1">
                <Mic className="h-3 w-3" /> transcrito por IA
              </div>
            )}
            <div className="whitespace-pre-wrap break-words leading-snug">
              {formatWhatsappText(m.text)}
            </div>
            <div
              className={`text-[10px] mt-1 flex items-center gap-1 ${
                m.from === "nina" ? "text-white/80 justify-end" : "text-muted-foreground"
              }`}
            >
              {m.at} {m.from === "nina" && <CheckCheck className="h-3 w-3" />}
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

/* ============================ TEMPLATES (HSM) ============================ */
type TplStatus = "APPROVED" | "PENDING" | "REJECTED" | "PAUSED" | "DISABLED" | string;
interface TplRow {
  id: string;
  name: string;
  status: TplStatus;
  category: string;
  language: string;
  components: any[];
  rejected_reason?: string;
}

function TemplatesWhatsapp() {
  const { clinicaAtual } = useClinica();
  const podeEscrever = usePodeEscrever("nina");
  const clinicaId = clinicaAtual?.clinica_id;
  const listar = useServerFn(listarTemplatesWhatsapp);
  const criar = useServerFn(criarTemplateWhatsapp);
  const excluir = useServerFn(excluirTemplateWhatsapp);

  const [items, setItems] = useState<TplRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Formulário
  const [name, setName] = useState("");
  const [category, setCategory] = useState<"MARKETING" | "UTILITY" | "AUTHENTICATION">("UTILITY");
  const [language, setLanguage] = useState("pt_BR");
  const [headerText, setHeaderText] = useState("");
  const [body, setBody] = useState("Olá {{1}}, sua consulta está confirmada para {{2}}.");
  const [footer, setFooter] = useState("");
  const [examples, setExamples] = useState<string[]>(["Maria", "20/05 às 14h"]);

  // Detecta {{n}} variáveis no body e mantém array de exemplos sincronizado
  const varCount = useMemo(() => {
    const matches = body.match(/\{\{\s*(\d+)\s*\}\}/g) ?? [];
    const nums = matches.map((m) => Number(m.replace(/\D/g, ""))).filter((n) => n > 0);
    return nums.length ? Math.max(...nums) : 0;
  }, [body]);

  useEffect(() => {
    setExamples((prev) => {
      const next = [...prev];
      while (next.length < varCount) next.push("");
      return next.slice(0, varCount);
    });
  }, [varCount]);

  const carregar = useCallback(async () => {
    if (!clinicaId) return;
    setLoading(true);
    try {
      const r = await listar({ data: { clinicaId } });
      setItems((r.templates as TplRow[]) ?? []);
    } catch (e: any) {
      mostrarErro(e);
    } finally {
      setLoading(false);
    }
  }, [clinicaId, listar]);

  useEffect(() => { void carregar(); }, [carregar]);

  const resetForm = () => {
    setName(""); setCategory("UTILITY"); setLanguage("pt_BR");
    setHeaderText(""); setBody("Olá {{1}}, sua consulta está confirmada para {{2}}.");
    setFooter(""); setExamples(["Maria", "20/05 às 14h"]);
  };

  const submeter = async () => {
    if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
    if (!clinicaId) return;
    if (!/^[a-z0-9_]+$/.test(name)) {
      toast.error("Nome inválido. Use apenas minúsculas, números e _ (underline). Ex: confirmacao_consulta");
      return;
    }
    if (!body.trim()) { toast.error("Corpo da mensagem é obrigatório"); return; }
    if (varCount > 0 && examples.some((e) => !e.trim())) {
      toast.error("Preencha um exemplo para cada variável {{n}}");
      return;
    }

    const components: any[] = [];
    if (headerText.trim()) {
      components.push({ type: "HEADER", format: "TEXT", text: headerText.trim() });
    }
    const bodyComp: any = { type: "BODY", text: body.trim() };
    if (varCount > 0) bodyComp.example = { body_text: [examples] };
    components.push(bodyComp);
    if (footer.trim()) components.push({ type: "FOOTER", text: footer.trim() });

    setSaving(true);
    try {
      const r = await criar({ data: { clinicaId, name, category, language, components } });
      toast.success(`Template enviado — status: ${r.status}`);
      setOpen(false);
      resetForm();
      await carregar();
    } catch (e: any) {
      mostrarErro(e);
    } finally {
      setSaving(false);
    }
  };

  const remover = async (n: TplRow) => {
    if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
    if (!clinicaId) return;
    if (!confirm(`Excluir o template "${n.name}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await excluir({ data: { clinicaId, name: n.name } });
      toast.success("Template excluído");
      await carregar();
    } catch (e: any) {
      mostrarErro(e);
    }
  };

  const statusBadge = (s: TplStatus) => {
    const map: Record<string, string> = {
      APPROVED: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
      PENDING: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
      REJECTED: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30",
      PAUSED: "bg-muted text-muted-foreground border-border",
      DISABLED: "bg-muted text-muted-foreground border-border",
    };
    return <Badge variant="outline" className={map[s] ?? ""}>{s}</Badge>;
  };

  const bodyOf = (t: TplRow) =>
    (t.components ?? []).find((c) => c.type === "BODY")?.text ?? "";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Templates aprovados pela Meta</h2>
          <p className="text-sm text-muted-foreground">
            Mensagens iniciadas pela clínica (fora da janela de 24h) só podem usar templates aprovados pela Meta.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={carregar} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Atualizar"}
          </Button>
          {podeEscrever && (
            <Button onClick={() => { resetForm(); setOpen(true); }} disabled={!clinicaId}>
              <Plus className="h-4 w-4 mr-2" /> Novo template
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-12 text-center text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando templates…
            </div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-2 opacity-50" />
              Nenhum template encontrado. Crie um para enviar mensagens iniciadas pela clínica.
            </div>
          ) : (
            <div className="divide-y">
              {items.map((t) => (
                <div key={t.id} className="p-4 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{t.name}</span>
                      {statusBadge(t.status)}
                      <Badge variant="secondary" className="text-[10px]">{t.category}</Badge>
                      <Badge variant="outline" className="text-[10px]">{t.language}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap line-clamp-3">
                      {bodyOf(t) || "—"}
                    </p>
                    {t.status === "REJECTED" && t.rejected_reason && (
                      <p className="text-xs text-red-600 mt-1">Motivo: {t.rejected_reason}</p>
                    )}
                  </div>
                  {podeEscrever && (
                    <Button variant="ghost" size="icon" onClick={() => remover(t)} title="Excluir">
                      <X className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Novo template</DialogTitle>
            <DialogDescription>
              O template será enviado para aprovação da Meta. Pode levar de alguns minutos a 24h para ser aprovado.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-2 md:col-span-1">
                <Label>Nome (id) *</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
                  placeholder="confirmacao_consulta"
                />
                <p className="text-[11px] text-muted-foreground">Minúsculas, números e _</p>
              </div>
              <div className="space-y-2">
                <Label>Categoria *</Label>
                <select
                  className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as any)}
                >
                  <option value="UTILITY">Utilidade (transacional)</option>
                  <option value="MARKETING">Marketing</option>
                  <option value="AUTHENTICATION">Autenticação</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Idioma *</Label>
                <select
                  className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                >
                  <option value="pt_BR">Português (BR)</option>
                  <option value="pt_PT">Português (PT)</option>
                  <option value="en">Inglês</option>
                  <option value="es">Espanhol</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Cabeçalho (opcional)</Label>
              <Input
                value={headerText}
                onChange={(e) => setHeaderText(e.target.value)}
                maxLength={60}
                placeholder="Ex: Sua consulta na ClinicaOS"
              />
            </div>

            <div className="space-y-2">
              <Label>Corpo da mensagem * <span className="text-muted-foreground">— use {"{{1}}"}, {"{{2}}"} para variáveis</span></Label>
              <Textarea
                rows={5}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={1024}
                placeholder="Olá {{1}}, sua consulta está marcada para {{2}}."
              />
              <p className="text-[11px] text-muted-foreground">{body.length}/1024 — {varCount} variável(is) detectada(s)</p>
            </div>

            {varCount > 0 && (
              <div className="space-y-2">
                <Label>Exemplos das variáveis *</Label>
                <p className="text-[11px] text-muted-foreground">A Meta exige um valor de exemplo para cada {"{{n}}"}.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {examples.map((v, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-10">{`{{${i + 1}}}`}</span>
                      <Input
                        value={v}
                        onChange={(e) => {
                          const next = [...examples]; next[i] = e.target.value; setExamples(next);
                        }}
                        placeholder={`Exemplo para {{${i + 1}}}`}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Rodapé (opcional)</Label>
              <Input
                value={footer}
                onChange={(e) => setFooter(e.target.value)}
                maxLength={60}
                placeholder="Ex: Responda PARAR para não receber mais."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={submeter} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
              Enviar para aprovação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
