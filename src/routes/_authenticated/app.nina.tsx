import { createFileRoute, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { confirmDialog } from "@/lib/confirm";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  MessageCircle,
  Send,
  Mic,
  Bot,
  CheckCheck,
  Phone,
  FileText,
  DollarSign,
  Cake,
  Calendar,
  Sparkles,
  Brain,
  Loader2,
  Copy,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Smartphone,
  Instagram,
  Facebook,
  Globe,
  Plus,
  Pencil,
  X,
  Paperclip,
  Smile,
  Search,
  PanelRightClose,
  PanelRightOpen,
  MoreVertical,
  User,
  Tag,
  ArrowLeft,
  RefreshCw,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useClinica } from "@/hooks/use-clinica";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { chatNina } from "@/lib/nina.functions";
import { registrarFeedbackNina } from "@/lib/nina/aprendizado.functions";
import { BaseConhecimento } from "@/components/nina/BaseConhecimento";

import {
  obterWhatsappConfig,
  salvarWhatsappConfig,
  testarConexaoWhatsapp,
  statusNumeroWhatsapp,
  registrarNumeroWhatsapp,
  statusInscricaoWaba,
  inscreverAppWaba,
  listarEventosWebhook,
} from "@/lib/whatsapp.functions";
import {
  enviarMensagemWhatsapp,
  listarTemplatesWhatsapp,
  criarTemplateWhatsapp,
  excluirTemplateWhatsapp,
} from "@/lib/whatsapp.functions";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { NinaMessage, TypingDots } from "@/components/nina/NinaMessage";
import { formatWhatsappText } from "@/components/nina/formatWhatsappText";
import { HomologacaoWhatsapp } from "@/components/nina/HomologacaoWhatsapp";
import {
  AtendMacros,
} from "@/components/nina/AtendimentoTabs";
import {
  AtendInbox,
} from "@/components/nina/AtendimentoExtraTabs";

export const Route = createFileRoute("/_authenticated/app/nina")({
  // A rota filha /app/nina/<id> só existe para dar endereço próprio a cada
  // conversa; sem o <Outlet /> o roteador não encontra a rota e mostra
  // "Not Found" ao abrir o link direto.
  component: () => (
    <>
      <NinaPage />
      <Outlet />
    </>
  ),
  head: () => ({ meta: [{ title: "Nina — WhatsApp — ClinicaOS" }] }),
});

function NinaPage() {
  const { clinicaAtual } = useClinica();
  const clinicaId = clinicaAtual?.clinica_id;
  const location = useLocation();
  const navigate = useNavigate();
  const hashAba = (location.hash ?? "").replace(/^#/, "");
  const abaAtiva = [
    "chat",
    "config",
    "templates",
    "homologacao",
    "atend-macros",
    "atend-inbox",
    "base-conhecimento",
  ].includes(hashAba)
    ? hashAba === "chat"
      ? "atend-inbox"
      : hashAba
    : "atend-inbox";
  const setAbaAtiva = (v: string) => {
    navigate({ to: "/app/nina", hash: v, replace: true });
  };
  useEffect(() => {
    // Só normaliza o hash enquanto o usuário ainda está na tela da Nina.
    // Sem essa guarda, ao clicar em outro item do menu a rota muda, o hash
    // fica vazio e este efeito redirecionava de volta para /app/nina —
    // prendendo o usuário na tela.
    if (location.pathname !== "/app/nina") return;
    if (!hashAba) {
      navigate({ to: "/app/nina", hash: "atend-inbox", replace: true });
    } else if (hashAba === "chat") {
      navigate({ to: "/app/nina", hash: "atend-inbox", replace: true });
    }
  }, [hashAba, navigate, location.pathname]);

  return (
    <div className={abaAtiva === "atend-inbox" ? "h-full" : "space-y-6"}>
      <Tabs
        value={abaAtiva}
        onValueChange={setAbaAtiva}
        className={abaAtiva === "atend-inbox" ? "h-full" : "space-y-4"}
      >
        {/* ============ CONVERSAS ============ */}

        {/* ============ CONFIGURAÇÃO ============ */}
        <TabsContent value="config">
          <ConfiguracaoWhatsApp />
        </TabsContent>

        {/* ============ TEMPLATES (HSM) ============ */}
        <TabsContent value="templates">
          <TemplatesWhatsapp />
        </TabsContent>

        {/* ============ HOMOLOGAÇÃO ============ */}
        <TabsContent value="homologacao">
          <HomologacaoWhatsapp />
        </TabsContent>

        {/* ============ ATENDIMENTO — Dashboard ============ */}
        <TabsContent value="atend-macros">
          <AtendMacros />
        </TabsContent>
        <TabsContent value="atend-inbox" className="mt-0 h-full">
          <AtendInbox />
        </TabsContent>

        {/* ============ APRENDIZADO ============ */}

        {/* ============ BASE DE CONHECIMENTOS ============ */}
        <TabsContent value="base-conhecimento">
          <BaseConhecimento />
        </TabsContent>
      </Tabs>
    </div>
  );
}

type NinaMsg = { role: "user" | "assistant"; content: string };

/* ===================== FEEDBACK DA RESPOSTA (aprendizado) ===================== */

/**
 * 👍 / 👎 em cada resposta da Nina. O 👎 abre um campo de correção que, se
 * preenchido, entra na fila "Nina → Aprendizado" para um gestor aprovar.
 * Nada muda no comportamento da Nina até essa aprovação.
 */
function FeedbackResposta({ pergunta, resposta }: { pergunta: string; resposta: string }) {
  const { clinicaAtual } = useClinica();
  const enviar = useServerFn(registrarFeedbackNina);
  const [enviado, setEnviado] = useState<null | "positivo" | "negativo">(null);
  const [abrirCorrecao, setAbrirCorrecao] = useState(false);
  const [correcao, setCorrecao] = useState("");
  const [salvando, setSalvando] = useState(false);

  const registrar = async (avaliacao: 1 | -1, texto?: string) => {
    if (!clinicaAtual) return;
    setSalvando(true);
    try {
      await enviar({
        data: {
          clinicaId: clinicaAtual.clinica_id,
          canal: "interno" as const,
          pergunta: pergunta.slice(0, 4000),
          resposta: resposta.slice(0, 8000),
          avaliacao,
          ...(texto?.trim() ? { correcao: texto.trim(), virarAprendizado: true } : {}),
        },
      });
      setEnviado(avaliacao === 1 ? "positivo" : "negativo");
      setAbrirCorrecao(false);
      toast.success(
        texto?.trim()
          ? "Correção enviada para aprovação em Nina → Aprendizado"
          : "Obrigado! Avaliação registrada.",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível registrar");
    } finally {
      setSalvando(false);
    }
  };

  if (enviado && !abrirCorrecao) {
    return (
      <p className="mt-1 text-[11px] text-muted-foreground">
        {enviado === "positivo" ? "👍 avaliada como boa" : "👎 avaliação registrada"}
      </p>
    );
  }

  return (
    <div className="mt-1 space-y-2">
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={salvando}
          onClick={() => registrar(1)}
          title="Resposta boa"
          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-emerald-600 disabled:opacity-50"
        >
          <ThumbsUp className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          disabled={salvando}
          onClick={() => setAbrirCorrecao(true)}
          title="Resposta errada — ensinar a Nina"
          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive disabled:opacity-50"
        >
          <ThumbsDown className="h-3.5 w-3.5" />
        </button>
      </div>
      {abrirCorrecao && (
        <div className="space-y-2">
          <Textarea
            rows={3}
            value={correcao}
            onChange={(e) => setCorrecao(e.target.value)}
            placeholder="Como a Nina deveria ter respondido? (vai para aprovação, não muda nada sozinho)"
            className="text-xs"
          />
          <div className="flex gap-2">
            <Button size="sm" disabled={salvando} onClick={() => registrar(-1, correcao)}>
              Enviar correção
            </Button>
            <Button size="sm" variant="ghost" disabled={salvando} onClick={() => registrar(-1)}>
              Só marcar como ruim
            </Button>
          </div>
        </div>
      )}
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
  const buscarStatus = useServerFn(statusNumeroWhatsapp);
  const registrarNumero = useServerFn(registrarNumeroWhatsapp);
  const buscarInscricao = useServerFn(statusInscricaoWaba);
  const inscreverApp = useServerFn(inscreverAppWaba);

  const [cfg, setCfg] = useState<WppCfg | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [canal, setCanal] = useState<"evolution" | "oficial" | "instagram" | "facebook" | "site">(
    "oficial",
  );
  const [showToken, setShowToken] = useState(false);
  const [form, setForm] = useState({
    display_name: "",
    phone_number_id: "",
    waba_id: "",
    access_token: "",
    app_secret: "",
  });
  const [horario, setHorario] = useState({ inicio: "08:00", fim: "18:00" });
  const [savingHorario, setSavingHorario] = useState(false);
  const [metaStatus, setMetaStatus] = useState<{
    status: string | null;
    name_status: string | null;
    quality_rating?: string | null;
  } | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [registrando, setRegistrando] = useState(false);
  const [inscricao, setInscricao] = useState<{
    estado: "desconhecido" | "sem-waba" | "inscrito" | "sem-inscricao";
    erro?: string;
  }>({ estado: "desconhecido" });
  const [inscricaoLoading, setInscricaoLoading] = useState(false);
  const [inscrevendo, setInscrevendo] = useState(false);

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

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const atualizarStatusMeta = useCallback(async () => {
    if (!clinicaAtual) return;
    setStatusLoading(true);
    try {
      const r: any = await buscarStatus({ data: { clinicaId: clinicaAtual.clinica_id } });
      if (r?.ok) {
        setMetaStatus({
          status: r.status ?? null,
          name_status: r.name_status ?? null,
          quality_rating: r.quality_rating ?? null,
        });
      } else {
        setMetaStatus(null);
      }
    } catch {
      setMetaStatus(null);
    } finally {
      setStatusLoading(false);
    }
  }, [clinicaAtual, buscarStatus]);

  const atualizarInscricao = useCallback(async () => {
    if (!clinicaAtual) return;
    setInscricaoLoading(true);
    try {
      const r: any = await buscarInscricao({ data: { clinicaId: clinicaAtual.clinica_id } });
      if (r?.semWaba) setInscricao({ estado: "sem-waba" });
      else if (r?.ok)
        setInscricao({ estado: (r.apps?.length ?? 0) > 0 ? "inscrito" : "sem-inscricao" });
      else setInscricao({ estado: "desconhecido", erro: r?.error });
    } catch (e: any) {
      setInscricao({ estado: "desconhecido", erro: String(e?.message ?? e) });
    } finally {
      setInscricaoLoading(false);
    }
  }, [clinicaAtual, buscarInscricao]);

  const onInscreverApp = async () => {
    if (!cfg) return;
    setInscrevendo(true);
    try {
      const r: any = await inscreverApp({ data: { clinicaId: cfg.clinica_id } });
      if (r?.ok) {
        toast.success("App inscrito na conta do WhatsApp. As mensagens já devem chegar.");
      } else {
        toast.error(r?.error ?? "Falha ao inscrever o app na conta.");
      }
      await Promise.all([atualizarStatusMeta(), atualizarInscricao()]);
    } catch (e: any) {
      mostrarErro(e);
    } finally {
      setInscrevendo(false);
    }
  };

  useEffect(() => {
    if (cfg?.phone_number_id && cfg?.has_access_token) void atualizarStatusMeta();
  }, [cfg?.phone_number_id, cfg?.has_access_token, atualizarStatusMeta]);

  useEffect(() => {
    if (cfg?.has_access_token) void atualizarInscricao();
  }, [cfg?.has_access_token, cfg?.waba_id, atualizarInscricao]);

  const onRegistrar = async () => {
    if (!cfg) return;
    if (!/^\d{6}$/.test(pin)) {
      toast.error("Informe um PIN de exatamente 6 dígitos.");
      return;
    }
    setRegistrando(true);
    try {
      const r: any = await registrarNumero({ data: { clinicaId: cfg.clinica_id, pin } });
      if (r?.ok) {
        toast.success("Número registrado na Cloud API.");
        setPinOpen(false);
        setPin("");
      } else {
        toast.error(r?.error ?? "Falha ao registrar o número.");
      }
      await atualizarStatusMeta();
    } catch (e: any) {
      mostrarErro(e);
    } finally {
      setRegistrando(false);
    }
  };

  const abrirDialog = () => {
    if (!cfg) return;
    setCanal("oficial");
    setForm({
      display_name: cfg.display_name ?? "",
      phone_number_id: cfg.phone_number_id ?? "",
      waba_id: cfg.waba_id ?? "",
      access_token: "",
      app_secret: "",
    });
    setShowToken(false);
    setDialogOpen(true);
  };

  if (!clinicaAtual) {
    return <p className="text-sm text-muted-foreground">Selecione uma clínica primeiro.</p>;
  }
  if (loading || !cfg) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando configuração…
        </CardContent>
      </Card>
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
    if (!podeEscrever) {
      toast.error("Você não tem permissão de edição neste módulo.");
      return;
    }
    setSaving(true);
    try {
      await salvar({
        data: {
          clinicaId: cfg.clinica_id,
          phone_number_id: form.phone_number_id,
          waba_id: form.waba_id,
          display_name: form.display_name,
          access_token: form.access_token || undefined,
          app_secret: form.app_secret || undefined,
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
    if (!podeEscrever) {
      toast.error("Você não tem permissão de edição neste módulo.");
      return;
    }
    // se há valores não salvos, salva antes de testar
    if (
      form.phone_number_id !== cfg.phone_number_id ||
      form.waba_id !== cfg.waba_id ||
      form.display_name !== cfg.display_name ||
      form.access_token
    ) {
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
    if (!podeEscrever) {
      toast.error("Você não tem permissão de edição neste módulo.");
      return;
    }
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

  const metaStatusBadge = statusLoading ? (
    <Badge variant="outline">
      <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Verificando na Meta…
    </Badge>
  ) : metaStatus?.status ? (
    metaStatus.status === "CONNECTED" ? (
      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
        <CheckCircle2 className="h-3 w-3 mr-1" /> CONNECTED
        {cfg.display_phone_number ? ` — ${cfg.display_phone_number}` : ""}
      </Badge>
    ) : metaStatus.status === "PENDING" ? (
      <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
        <AlertCircle className="h-3 w-3 mr-1" /> {metaStatus.status}
      </Badge>
    ) : (
      <Badge variant="destructive">
        <AlertCircle className="h-3 w-3 mr-1" /> {metaStatus.status}
      </Badge>
    )
  ) : cfg.ultimo_teste_ok === false ? (
    <Badge variant="destructive">
      <AlertCircle className="h-3 w-3 mr-1" /> Falha no último teste
    </Badge>
  ) : (
    <Badge variant="outline">Status desconhecido</Badge>
  );

  const statusDetalhe = metaStatus ? (
    <span className="text-[11px] text-muted-foreground">
      Nome: {metaStatus.name_status ?? "—"}
      {metaStatus.quality_rating ? ` · Qualidade: ${metaStatus.quality_rating}` : ""}
    </span>
  ) : null;

  const precisaRegistrar = Boolean(
    cfg.phone_number_id &&
    cfg.has_access_token &&
    metaStatus?.status &&
    metaStatus.status !== "CONNECTED",
  );

  const botaoRegistrar =
    podeEscrever && precisaRegistrar ? (
      <Button size="sm" variant="outline" onClick={() => setPinOpen(true)}>
        Registrar na Cloud API
      </Button>
    ) : null;

  const linhaInscricao = (
    <div className="flex items-center gap-2 flex-wrap text-[11px]">
      <span className="text-muted-foreground">Webhook da conta:</span>
      {inscricaoLoading ? (
        <span className="text-muted-foreground inline-flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" /> verificando…
        </span>
      ) : inscricao.estado === "sem-waba" ? (
        <span className="text-muted-foreground">WABA ID não informado</span>
      ) : inscricao.estado === "inscrito" ? (
        <span className="font-medium text-emerald-600">Inscrito</span>
      ) : inscricao.estado === "sem-inscricao" ? (
        <span className="font-medium text-destructive">Sem inscrição</span>
      ) : (
        <span className="text-muted-foreground">{inscricao.erro ?? "não verificado"}</span>
      )}
      {podeEscrever && inscricao.estado === "sem-inscricao" && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => void onInscreverApp()}
          disabled={inscrevendo}
        >
          {inscrevendo ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
          Inscrever app na conta
        </Button>
      )}
    </div>
  );

  const canaisDisponiveis = [
    {
      id: "oficial",
      label: "API Oficial",
      icon: MessageCircle,
      color: "text-emerald-600",
      disabled: false,
    },
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
              <Button onClick={abrirDialog}>
                <Plus className="h-4 w-4 mr-1" /> Nova Conexão
              </Button>
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
                  <div className="font-medium truncate">
                    {cfg.display_name || "WhatsApp API Oficial"}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {cfg.display_phone_number || cfg.phone_number_id || "—"}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <div className="flex flex-col items-end gap-0.5">
                  {metaStatusBadge}
                  {statusDetalhe}
                  {linhaInscricao}
                </div>
                {botaoRegistrar}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => void atualizarStatusMeta()}
                  disabled={statusLoading}
                  title="Atualizar status na Meta"
                >
                  <RefreshCw className={`h-4 w-4 ${statusLoading ? "animate-spin" : ""}`} />
                </Button>
                {podeEscrever && (
                  <Button variant="ghost" size="icon" onClick={abrirDialog}>
                    <Pencil className="h-4 w-4" />
                  </Button>
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
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  onClick={() => copy(webhookUrl, "URL")}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Verify Token</Label>
              <div className="flex gap-2">
                <Input value={cfg.verify_token} readOnly className="font-mono text-xs" />
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  onClick={() => copy(cfg.verify_token, "Verify Token")}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Em{" "}
              <strong>Meta for Developers → Seu App → WhatsApp → Configuration → Webhooks</strong>,
              cole a URL e o Verify Token, depois assine o campo <code>messages</code>.
            </p>
            <p className="text-xs">
              App Secret:{" "}
              {cfg.has_app_secret ? (
                <span className="font-medium text-emerald-600">preenchido</span>
              ) : (
                <span className="font-medium text-destructive">vazio</span>
              )}
            </p>
            {!cfg.has_app_secret && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700">
                Assinatura não verificada — confirme o App Secret do app usado no webhook. As
                mensagens continuam sendo recebidas normalmente.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <EventosWebhookCard clinicaId={cfg.clinica_id} />

      <Card>
        <CardHeader>
          <CardTitle>Horário de atendimento humano</CardTitle>
          <CardDescription>
            Dentro deste intervalo a equipe responde manualmente. <strong>Fora</strong> dele a Nina
            responde automaticamente pelo WhatsApp.
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
                {savingHorario ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando…
                  </>
                ) : (
                  "Salvar horário"
                )}
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
                        active
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border hover:bg-muted/50"
                      } ${c.disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                    >
                      <Icon className={`h-5 w-5 ${active ? "text-primary" : c.color}`} />
                      <span className="font-medium leading-tight text-center">{c.label}</span>
                      {c.disabled && (
                        <span className="absolute -top-1.5 -right-1.5 text-[10px] bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 border">
                          em breve
                        </span>
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
                  placeholder={
                    cfg.has_access_token
                      ? "•••••••• (preenchido — deixe em branco para manter)"
                      : "Permanent token ou System User token"
                  }
                  autoComplete="off"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  onClick={() => setShowToken((v) => !v)}
                >
                  {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="space-y-1">
              <Label>App Secret (opcional)</Label>
              <Input
                type="password"
                value={form.app_secret}
                onChange={(e) => setForm({ ...form, app_secret: e.target.value })}
                placeholder={
                  cfg.has_app_secret
                    ? "•••••••• (preenchido — deixe em branco para manter)"
                    : "App Secret do app da Meta usado no webhook"
                }
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                Use o App Secret do <strong>mesmo app</strong> que está configurado no webhook. Se
                for de outro app, a assinatura não confere — as mensagens continuam sendo salvas,
                mas ficam marcadas como “assinatura não verificada”.
              </p>
            </div>

            {(cfg.phone_number_id || cfg.has_access_token) && (
              <div className="rounded-md border p-3 flex items-center justify-between gap-2 flex-wrap">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-medium">Status na Cloud API</span>
                  {statusDetalhe}
                  {linhaInscricao}
                </div>
                <div className="flex items-center gap-2">
                  {metaStatusBadge}
                  {botaoRegistrar}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => void atualizarStatusMeta()}
                    disabled={statusLoading}
                  >
                    <RefreshCw className={`h-4 w-4 ${statusLoading ? "animate-spin" : ""}`} />
                  </Button>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={onTestar} disabled={testing || saving}>
              {testing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Testando…
                </>
              ) : (
                "Testar Conexão"
              )}
            </Button>
            <Button onClick={onSalvar} disabled={saving || testing}>
              {saving ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={pinOpen}
        onOpenChange={(o) => {
          setPinOpen(o);
          if (!o) setPin("");
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar na Cloud API</DialogTitle>
            <DialogDescription>
              Informe um PIN de 6 dígitos. Esse PIN se torna a verificação em duas etapas do número
              na Meta — guarde-o, será exigido em registros futuros.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>PIN (6 dígitos)</Label>
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              className="font-mono tracking-[0.4em] text-center text-lg"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPinOpen(false)} disabled={registrando}>
              Cancelar
            </Button>
            <Button onClick={onRegistrar} disabled={registrando || pin.length !== 6}>
              {registrando ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Registrando…
                </>
              ) : (
                "Registrar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ============================ INBOX WHATSAPP (Hi-style) ============================ */

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

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const resetForm = () => {
    setName("");
    setCategory("UTILITY");
    setLanguage("pt_BR");
    setHeaderText("");
    setBody("Olá {{1}}, sua consulta está confirmada para {{2}}.");
    setFooter("");
    setExamples(["Maria", "20/05 às 14h"]);
  };

  const submeter = async () => {
    if (!podeEscrever) {
      toast.error("Você não tem permissão de edição neste módulo.");
      return;
    }
    if (!clinicaId) return;
    if (!/^[a-z0-9_]+$/.test(name)) {
      toast.error(
        "Nome inválido. Use apenas minúsculas, números e _ (underline). Ex: confirmacao_consulta",
      );
      return;
    }
    if (!body.trim()) {
      toast.error("Corpo da mensagem é obrigatório");
      return;
    }
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
    if (!podeEscrever) {
      toast.error("Você não tem permissão de edição neste módulo.");
      return;
    }
    if (!clinicaId) return;
    if (!(await confirmDialog(`Excluir o template "${n.name}"? Esta ação não pode ser desfeita.`)))
      return;
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
    return (
      <Badge variant="outline" className={map[s] ?? ""}>
        {s}
      </Badge>
    );
  };

  const bodyOf = (t: TplRow) => (t.components ?? []).find((c) => c.type === "BODY")?.text ?? "";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Templates aprovados pela Meta</h2>
          <p className="text-sm text-muted-foreground">
            Mensagens iniciadas pela clínica (fora da janela de 24h) só podem usar templates
            aprovados pela Meta.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={carregar} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Atualizar"}
          </Button>
          {podeEscrever && (
            <Button
              onClick={() => {
                resetForm();
                setOpen(true);
              }}
              disabled={!clinicaId}
            >
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
                      <Badge variant="secondary" className="text-[11px]">
                        {t.category}
                      </Badge>
                      <Badge variant="outline" className="text-[11px]">
                        {t.language}
                      </Badge>
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
              O template será enviado para aprovação da Meta. Pode levar de alguns minutos a 24h
              para ser aprovado.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-2 md:col-span-1">
                <Label>Nome (id) *</Label>
                <Input
                  value={name}
                  onChange={(e) =>
                    setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))
                  }
                  placeholder="confirmacao_consulta"
                />
                <p className="text-[12px] text-muted-foreground">Minúsculas, números e _</p>
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
              <Label>
                Corpo da mensagem *{" "}
                <span className="text-muted-foreground">
                  — use {"{{1}}"}, {"{{2}}"} para variáveis
                </span>
              </Label>
              <Textarea
                rows={5}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={1024}
                placeholder="Olá {{1}}, sua consulta está marcada para {{2}}."
              />
              <p className="text-[12px] text-muted-foreground">
                {body.length}/1024 — {varCount} variável(is) detectada(s)
              </p>
            </div>

            {varCount > 0 && (
              <div className="space-y-2">
                <Label>Exemplos das variáveis *</Label>
                <p className="text-[12px] text-muted-foreground">
                  A Meta exige um valor de exemplo para cada {"{{n}}"}.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {examples.map((v, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-10">{`{{${i + 1}}}`}</span>
                      <Input
                        value={v}
                        onChange={(e) => {
                          const next = [...examples];
                          next[i] = e.target.value;
                          setExamples(next);
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
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={submeter} disabled={saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Enviar para aprovação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ====================== EVENTOS RECEBIDOS DA META ====================== */

interface EventoWebhook {
  id: string;
  metodo: string;
  recebido_em: string;
  assinatura: string | null;
  corpo: string | null;
  resultado: string | null;
}

function corResultado(resultado: string | null): string {
  if (!resultado) return "text-muted-foreground";
  if (resultado === "processado_ok") return "text-emerald-600";
  if (resultado.startsWith("erro") || resultado === "assinatura_invalida")
    return "text-destructive";
  return "text-amber-600";
}

function EventosWebhookCard({ clinicaId }: { clinicaId: string }) {
  const listar = useServerFn(listarEventosWebhook);
  const [eventos, setEventos] = useState<EventoWebhook[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [aberto, setAberto] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r: any = await listar({ data: { clinicaId } });
      setEventos((r?.eventos ?? []) as EventoWebhook[]);
    } catch (e: any) {
      toast.error(String(e?.message ?? e));
    } finally {
      setCarregando(false);
    }
  }, [clinicaId, listar]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>Eventos recebidos da Meta</CardTitle>
            <CardDescription>Últimas 20 requisições feitas ao nosso webhook</CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={() => void carregar()} disabled={carregando}>
            <RefreshCw className={`h-4 w-4 ${carregando ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {eventos.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Nenhuma requisição recebida da Meta até agora.
          </p>
        ) : (
          <div className="divide-y">
            {eventos.map((ev) => (
              <div key={ev.id} className="py-2 text-xs">
                <button
                  type="button"
                  className="flex w-full items-center gap-3 text-left"
                  onClick={() => setAberto(aberto === ev.id ? null : ev.id)}
                >
                  <span className="font-mono text-muted-foreground">
                    {new Date(ev.recebido_em).toLocaleString("pt-BR")}
                  </span>
                  <span className="font-medium">{ev.metodo}</span>
                  <span className={`font-medium ${corResultado(ev.resultado)}`}>
                    {ev.resultado ?? "sem resultado"}
                  </span>
                  <span className="ml-auto text-muted-foreground">
                    {aberto === ev.id ? "ocultar" : "ver corpo"}
                  </span>
                </button>
                {aberto === ev.id && (
                  <pre className="mt-2 max-h-64 overflow-auto rounded bg-muted p-2 font-mono text-[11px] whitespace-pre-wrap break-all">
                    {ev.assinatura ? `x-hub-signature-256: ${ev.assinatura}\n\n` : ""}
                    {ev.corpo || "(corpo vazio)"}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
