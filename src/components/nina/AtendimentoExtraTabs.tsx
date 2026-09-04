import { useCallback, useEffect, useMemo, useState } from "react";
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
} from "lucide-react";
import { useClinica } from "@/hooks/use-clinica";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import {
  ConversationSystemEvent,
  type ConversaEvento,
} from "@/components/nina/ConversationSystemEvent";
import { DateInputBR } from "@/components/ui/date-input-br";
import {
  listarConversas,
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
} from "@/lib/atendimento.functions";
import { FilaHumana } from "@/components/nina/FilaHumana";

function fmtHora(s?: string | null) {
  if (!s) return "";
  return new Date(s).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
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

  const [convs, setConvs] = useState<any[]>([]);
  const [sel, setSel] = useState<any>(null);
  const [msgs, setMsgs] = useState<any[]>([]);
  const [eventos, setEventos] = useState<ConversaEvento[]>([]);
  const [contato, setContato] = useState<any>(null);
  const [notas, setNotas] = useState<any[]>([]);
  const [deptos, setDeptos] = useState<any[]>([]);
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<
    "all" | "active" | "waiting" | "closed" | "bot_attending"
  >("all");
  const [draft, setDraft] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [novaNota, setNovaNota] = useState("");
  const [transferOpen, setTransferOpen] = useState(false);
  const [buscaAgente, setBuscaAgente] = useState("");
  const [fecharOpen, setFecharOpen] = useState(false);
  const [filaAberta, setFilaAberta] = useState<boolean>(true);
  const [pausaAtiva, setPausaAtiva] = useState<any>(null);
  const [pauseReasons, setPauseReasons] = useState<any[]>([]);
  const [pausaDialogOpen, setPausaDialogOpen] = useState(false);
  const [pausaReasonSel, setPausaReasonSel] = useState<string>("");
  // Painel esquerdo: encolhe ao tirar o mouse, expande ao passar; pode ser fixado.
  const [painelFixado, setPainelFixado] = useState(false);
  const [painelHover, setPainelHover] = useState(false);
  // Enquanto um menu suspenso da coluna estiver aberto o painel não pode
  // encolher: o menu é renderizado fora do painel, o mouse "sai" da coluna e
  // a lista sumia embaixo do menu.
  const [painelMenuAberto, setPainelMenuAberto] = useState(false);
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
  const [contatoHover, setContatoHover] = useState(false);
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
    } catch {
      // Estado auxiliar da fila: se falhar, a aba segue com os valores atuais.
    }
  }, [clinicaId, meuStatusFn, pausaAtualFn, listarReasonsFn]);

  useEffect(() => {
    carregarStatusAgente();
  }, [carregarStatusAgente]);

  // Presença real: enquanto a pessoa está online (e não em pausa), o sistema
  // avisa o servidor a cada minuto. Sem esse sinal por 5 minutos, ela deixa de
  // receber conversas automaticamente — nada cai para quem fechou o sistema.
  const online = !pausaAtiva && filaAberta;
  useEffect(() => {
    if (!clinicaId) return;
    const bater = () => {
      presencaFn({
        data: {
          clinicaId,
          status: online ? ("ONLINE" as const) : pausaAtiva ? ("AWAY" as const) : ("OFFLINE" as const),
          aceitaNovas: online,
        },
      }).catch(() => {
        /* heartbeat: falha isolada não atrapalha o atendimento */
      });
    };
    bater();
    if (!online) return;
    const t = setInterval(bater, 60_000);
    return () => clearInterval(t);
  }, [clinicaId, online, pausaAtiva, presencaFn]);

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
          toast.error("Cadastre motivos de pausa em Atendimento — Pausas");
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

  const carregarConvs = useCallback(async () => {
    if (!clinicaId) return;
    try {
      const rows = await listarConvs({
        data: {
          clinicaId,
          status: filtroStatus,
          busca: busca || undefined,
          canal: "todos",
          limit: 200,
        },
      });
      setConvs(rows);
      if (!sel && rows[0]) setSel(rows[0]);
    } catch (e: any) {
      mostrarErro(e);
    }
  }, [clinicaId, filtroStatus, busca, listarConvs, sel]);

  const carregarConversa = useCallback(async () => {
    if (!clinicaId || !sel?.id) return;
    try {
      const [m, c, n, ev] = await Promise.all([
        listarMsgs({ data: { clinicaId, conversaId: sel.id, limit: 200 } }),
        obterContato({ data: { clinicaId, conversaId: sel.id } }),
        listarNotasFn({ data: { clinicaId, conversaId: sel.id } }),
        listarEventosFn({ data: { clinicaId, conversaId: sel.id } }).catch(
          () => [] as ConversaEvento[],
        ),
      ]);
      if (!c) {
        // Conversa não existe mais nesta clínica: limpa a seleção sem quebrar.
        setSel(null);
        setMsgs([]);
        setContato(null);
        setNotas([]);
        setEventos([]);
        return;
      }
      setMsgs(m);
      setContato(c);
      setNotas(n);
      setEventos((ev ?? []) as ConversaEvento[]);
    } catch (e: any) {
      mostrarErro(e);
    }
  }, [clinicaId, sel?.id, listarMsgs, obterContato, listarNotasFn, listarEventosFn]);

  useEffect(() => {
    carregarConvs();
  }, [carregarConvs]);
  useEffect(() => {
    carregarConversa();
  }, [carregarConversa]);
  // Mantém mensagens/contato sincronizados enquanto a conversa está aberta.
  useEffect(() => {
    if (!sel?.id) return;
    const t = setInterval(() => {
      carregarConversa();
    }, 8000);
    return () => clearInterval(t);
  }, [sel?.id, carregarConversa]);

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

  useRealtimeRefresh(["atend_conversas", "whatsapp_mensagens"], carregarConvs, !!clinicaId);
  useRealtimeRefresh(
    ["whatsapp_mensagens", "atend_notas_internas", "atend_conversa_eventos"],
    carregarConversa,
    !!clinicaId && !!sel?.id,
  );

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

  const janela24hExpirada = (() => {
    if (!sel || sel.canal !== "whatsapp") return false;
    const j = sel.janela_24h_em ? new Date(sel.janela_24h_em).getTime() : 0;
    if (!j) return true;
    return Date.now() - j > 24 * 60 * 60 * 1000;
  })();
  const motivoBloqueio = !sel
    ? null
    : pausaAtiva
      ? "Você está em pausa. Encerre a pausa para enviar mensagens."
      : !filaAberta
        ? "Você está offline. Fique online para enviar mensagens."
        : janela24hExpirada
          ? "Janela de 24h do WhatsApp expirada. Envie um template para reabrir."
          : null;

  const enviar = async () => {
    const t = draft.trim();
    if (!t || !sel || !clinicaId || enviando) return;
    if (motivoBloqueio) {
      toast.error(motivoBloqueio);
      return;
    }
    setEnviando(true);
    try {
      await enviarMsg({ data: { clinicaId, conversaId: sel.id, text: t } });
      setDraft("");
      await carregarConversa();
    } catch (e: any) {
      mostrarErro(e);
    } finally {
      setEnviando(false);
    }
  };

  const adicionarNota = async () => {
    const t = novaNota.trim();
    if (!t || !sel || !clinicaId) return;
    try {
      await criarNotaFn({ data: { clinicaId, conversaId: sel.id, conteudo: t } });
      setNovaNota("");
      await carregarConversa();
    } catch (e: any) {
      mostrarErro(e);
    }
  };

  const transferir = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!sel || !clinicaId) return;
    const fd = new FormData(e.currentTarget);
    const userId = String(fd.get("userId") || "");
    const departamentoId = String(fd.get("departamentoId") || "") || undefined;
    const motivo = String(fd.get("motivo") || "") || undefined;
    try {
      await transferirFn({
        data: { clinicaId, conversaId: sel.id, userId: userId || null, departamentoId, motivo },
      });
      setTransferOpen(false);
      await carregarConvs();
      await carregarConversa();
    } catch (e: any) {
      mostrarErro(e);
    }
  };

  const fechar = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!sel || !clinicaId) return;
    const fd = new FormData(e.currentTarget);
    try {
      await fecharFn({
        data: {
          clinicaId,
          conversaId: sel.id,
          motivo: String(fd.get("motivo") || "") || undefined,
          resumo: String(fd.get("resumo") || "") || undefined,
        },
      });
      setFecharOpen(false);
      await carregarConvs();
      await carregarConversa();
    } catch (e: any) {
      mostrarErro(e);
    }
  };

  const statusBadge = (s: string) => {
    if (s === "active")
      return (
        <Badge className="bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/20">Ativa</Badge>
      );
    if (s === "waiting")
      return (
        <Badge className="bg-amber-500/15 text-amber-600 hover:bg-amber-500/20">Em espera</Badge>
      );
    if (s === "bot_attending") return <Badge variant="secondary">Bot</Badge>;
    if (s === "closed" || s === "finished") return <Badge variant="outline">Fechada</Badge>;
    return <Badge variant="outline">{s}</Badge>;
  };

  return (
    <div className="h-full overflow-hidden -mx-3 sm:-mx-4 lg:-mx-6 px-2 sm:px-3 lg:px-3">
      <div className="flex h-full gap-2 overflow-hidden">
        {/* COLUNA 1 — LISTA (encolhe/expande no hover, ou fica fixa) */}
        <Card
          onMouseEnter={() => setPainelHover(true)}
          onMouseLeave={() => setPainelHover(false)}
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
                  pausaAtiva
                    ? "text-amber-500"
                    : filaAberta
                      ? "text-emerald-600"
                      : "text-slate-400"
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
                variant={!pausaAtiva && filaAberta ? "default" : "outline"}
                className={`h-7 px-1 text-[11px] ${
                  !pausaAtiva && filaAberta
                    ? "bg-emerald-600 hover:bg-emerald-600/90 text-white"
                    : ""
                }`}
                onClick={() => definirStatus("online")}
              >
                <Circle className="h-2.5 w-2.5 mr-1 fill-current" /> Online
              </Button>
              <Button
                size="sm"
                variant={pausaAtiva ? "default" : "outline"}
                className={`h-7 px-1 text-[11px] ${
                  pausaAtiva ? "bg-amber-500 hover:bg-amber-500/90 text-white" : ""
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
                    ? "bg-slate-600 hover:bg-slate-600/90 text-white"
                    : ""
                }`}
                onClick={() => definirStatus("offline")}
              >
                <PowerOff className="h-3 w-3 mr-1" /> Offline
              </Button>
            </div>
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
                void carregarConvs();
              }}
            />
          </div>
          <CardHeader className="py-2 space-y-2">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              <CardTitle className="text-base">Inbox</CardTitle>
              <Badge variant="outline" className="ml-auto">
                {convs.length}
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

          </CardHeader>
          <div className="flex-1 overflow-auto border-t">
            {convs.length === 0 && (
              <p className="p-4 text-sm text-muted-foreground">Nenhuma conversa.</p>
            )}
            {convs.map((c) => (
              <button
                key={c.id}
                onClick={() => setSel(c)}
                className={`w-full text-left p-3 border-b hover:bg-muted/50 transition-colors ${sel?.id === c.id ? "bg-muted/60" : ""}`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm truncate flex-1">
                    {c.contato_nome || c.contato_telefone || "—"}
                  </span>
                  {c.unread_count > 0 && (
                    <Badge className="bg-emerald-500 text-white text-xs px-1.5 py-0">
                      {c.unread_count}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  {statusBadge(c.status)}
                  {c.owner_type === "NONE" && (
                    <Badge className="bg-amber-500/15 text-amber-600 text-[11px]">Na fila</Badge>
                  )}
                  {c.owner_type === "HUMAN" && (
                    <Badge className="bg-sky-500/15 text-sky-600 text-[11px]">Humano</Badge>
                  )}
                  {c.owner_type === "AI" && (
                    <Badge variant="secondary" className="text-[11px]">Nina</Badge>
                  )}
                  {c.protocol_number && (
                    <code className="text-[11px] text-muted-foreground">#{c.protocol_number}</code>
                  )}
                </div>
                <div className="text-xs text-muted-foreground truncate mt-1">
                  {c.ultima_msg_preview || "—"}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {fmtData(c.ultima_msg_em)}
                </div>
              </button>
            ))}
          </div>
          </div>
        </Card>

        {/* COLUNA 2 — CHAT */}
        <Card className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {!sel ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
              Selecione uma conversa
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
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="default"
                      className="bg-emerald-500 hover:bg-emerald-600"
                      onClick={() => {
                        const params = new URLSearchParams();
                        params.set("novo", "1");
                        const pacId = contato?.paciente?.id;
                        const pacNome = contato?.paciente?.nome || sel.contato_nome || "";
                        const tel = sel.contato_telefone || contato?.paciente?.telefone || "";
                        if (pacId) params.set("novoPacId", pacId);
                        if (pacNome) params.set("novoPacNome", pacNome);
                        if (tel) params.set("novoTelefone", tel);
                        window.location.assign(`/app/agenda?${params.toString()}`);
                      }}
                    >
                      <CalendarPlus className="h-3.5 w-3.5 mr-1" /> Agendar
                    </Button>
                    {/* Conversas não atribuídas são distribuídas automaticamente
                        quando alguém fica online — sem botões manuais. */}
                    <Button size="sm" variant="outline" onClick={() => setTransferOpen(true)}>
                      <ArrowRightLeft className="h-3.5 w-3.5 mr-1" /> Transferir
                    </Button>
                    {sel.status !== "closed" && sel.status !== "finished" && (
                      <Button size="sm" variant="outline" onClick={() => setFecharOpen(true)}>
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Encerrar
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <div className="flex-1 overflow-auto p-4 space-y-2 bg-muted/20">
                {msgs.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center">Sem mensagens.</p>
                )}
                {timeline.map((item) => {
                  if (item.kind === "evento") {
                    return <ConversationSystemEvent key={`ev-${item.ev.id}`} evento={item.ev} />;
                  }
                  const m = item.msg;
                  const out = m.direction === "out";
                  if (m.enviada_por === "sistema") {
                    return (
                      <div key={m.id} className="flex justify-center">
                        <div className="max-w-[85%] rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 whitespace-pre-wrap text-center">
                          {m.body}
                          <div className="mt-1 text-[10px] opacity-70">
                            {fmtHora(m.recebida_em)}
                          </div>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div key={m.id} className={`flex ${out ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[68%] rounded-2xl px-3 py-2 text-sm shadow-sm break-words ${
                          out
                            ? "bg-emerald-500 text-white rounded-br-sm"
                            : "bg-card border border-border rounded-bl-sm"
                        }`}
                      >
                        <div className="whitespace-pre-wrap">{m.body || `[${m.tipo}]`}</div>
                        <div
                          className={`text-[11px] mt-1 ${out ? "text-emerald-50" : "text-muted-foreground"}`}
                        >
                          {fmtHora(m.recebida_em)} {m.enviada_por === "nina" && "· Nina"}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="border-t p-3 space-y-2">
                {motivoBloqueio && (
                  <div className="text-xs rounded-md border border-amber-300 bg-amber-50 text-amber-900 px-2 py-1.5">
                    {motivoBloqueio}
                  </div>
                )}
                <div className="flex gap-2">
                  <Textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        enviar();
                      }
                    }}
                    placeholder={
                      motivoBloqueio
                        ? "Envio bloqueado"
                        : "Mensagem… (Enter envia, Shift+Enter quebra linha)"
                    }
                    rows={1}
                    className="resize-none min-h-9"
                    disabled={enviando || !!motivoBloqueio}
                  />
                  <Button
                    onClick={enviar}
                    disabled={enviando || !draft.trim() || !!motivoBloqueio}
                    className="bg-emerald-500 hover:bg-emerald-600"
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
          onMouseEnter={() => setContatoHover(true)}
          onMouseLeave={() => setContatoHover(false)}
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
            {!contato ? (
              <p className="text-muted-foreground">—</p>
            ) : (
              <>
                <section>
                  <div className="font-medium">
                    {contato.paciente?.nome ||
                      contato.conversa?.contato_nome ||
                      contato.conversa?.contato_telefone ||
                      "Sem nome"}
                  </div>
                  <div className="text-xs text-muted-foreground space-y-0.5 mt-1">
                    {(contato.conversa?.contato_telefone || contato.paciente?.telefone) && (
                      <div>
                        📱 {contato.conversa?.contato_telefone || contato.paciente?.telefone}
                      </div>
                    )}
                    {contato.paciente?.email && <div>✉️ {contato.paciente.email}</div>}
                    {contato.paciente?.cpf && <div>CPF: {contato.paciente.cpf}</div>}
                    {contato.paciente?.cidade && (
                      <div>
                        📍 {contato.paciente.cidade}/{contato.paciente.estado}
                      </div>
                    )}
                    {contato.conversa?.protocolo && (
                      <div>Protocolo: {contato.conversa.protocolo}</div>
                    )}
                    {contato.conversa?.canal && <div>Canal: {contato.conversa.canal}</div>}
                    {contato.conversa?.status && <div>Status: {contato.conversa.status}</div>}
                    {contato.conversa?.atend_departamentos?.nome && (
                      <div>Depto: {contato.conversa.atend_departamentos.nome}</div>
                    )}
                    {contato.conversa?.ultima_mensagem_em && (
                      <div>Última mensagem: {fmtData(contato.conversa.ultima_mensagem_em)}</div>
                    )}
                  </div>
                  {!contato.paciente && (
                    <div className="text-xs text-muted-foreground mt-2">
                      Não vinculado a paciente cadastrado.
                    </div>
                  )}
                </section>


                {contato.agendamentos?.length > 0 && (
                  <section>
                    <div className="text-xs font-semibold text-muted-foreground uppercase mb-1">
                      Agendamentos
                    </div>
                    {contato.agendamentos.map((a: any) => (
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

                {contato.contratos?.length > 0 && (
                  <section>
                    <div className="text-xs font-semibold text-muted-foreground uppercase mb-1">
                      Contratos
                    </div>
                    {contato.contratos.map((c: any) => (
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
                    {notas.map((n: any) => (
                      <div
                        key={n.id}
                        className="text-xs bg-amber-500/10 border border-amber-500/20 rounded p-2"
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
                      disabled={!novaNota.trim()}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </section>

                {contato.atribuido_nome && (
                  <section className="text-xs text-muted-foreground">
                    Atribuída a{" "}
                    <span className="font-medium text-foreground">{contato.atribuido_nome}</span>
                  </section>
                )}
              </>
            )}
          </div>
          </div>
        </Card>

        {/* DIALOGS */}
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
  );
}

/* ============================================================
 *  SUPERVISOR — visão live de todos os agentes
 * ========================================================== */
export function AtendSupervisor() {
  const { clinicaAtual } = useClinica();
  const clinicaId = clinicaAtual?.clinica_id;
  const liveFn = useServerFn(supervisaoLive);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const carregar = useCallback(async () => {
    if (!clinicaId) return;
    setLoading(true);
    try {
      setRows(await liveFn({ data: { clinicaId } }));
    } catch (e: any) {
      mostrarErro(e);
    } finally {
      setLoading(false);
    }
  }, [clinicaId, liveFn]);
  useEffect(() => {
    carregar();
    const t = setInterval(carregar, 10000);
    return () => clearInterval(t);
  }, [carregar]);
  useRealtimeRefresh(["atend_conversas", "atend_pausas_log"], carregar, !!clinicaId);

  const espera = rows.filter((r) => r.status === "waiting");
  const ativas = rows.filter((r) => r.status === "active");
  const bot = rows.filter((r) => r.status === "bot_attending");

  // Alertas: espera > 5min
  const alertas = espera.filter((r) => {
    if (!r.aguardando_desde) return false;
    return (Date.now() - new Date(r.aguardando_desde).getTime()) / 60000 > 5;
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Em espera" value={espera.length} tone="text-amber-500" icon={Clock} />
        <Stat label="Ativas" value={ativas.length} tone="text-emerald-500" icon={Users} />
        <Stat label="Bot atendendo" value={bot.length} icon={MessageSquare} />
        <Stat
          label="Alertas SLA"
          value={alertas.length}
          tone="text-destructive"
          icon={AlertTriangle}
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" /> Conversas em tempo real
          </CardTitle>
          <Button size="sm" variant="outline" onClick={carregar} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Atualizar"}
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-auto max-h-[60vh]">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground sticky top-0">
                <tr>
                  <th className="text-left p-2">Contato</th>
                  <th className="text-left p-2">Status</th>
                  <th className="text-left p-2">Agente</th>
                  <th className="text-left p-2">Departamento</th>
                  <th className="text-left p-2">Espera</th>
                  <th className="text-left p-2">SLA 1ª resp.</th>
                  <th className="text-left p-2">Última mensagem</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-4 text-center text-muted-foreground">
                      Nenhuma conversa ativa.
                    </td>
                  </tr>
                )}
                {rows.map((r) => {
                  const espMin = r.aguardando_desde
                    ? (Date.now() - new Date(r.aguardando_desde).getTime()) / 60000
                    : null;
                  const alerta = espMin != null && espMin > 5;
                  return (
                    <tr key={r.id} className={`border-t ${alerta ? "bg-destructive/5" : ""}`}>
                      <td className="p-2">
                        <div className="font-medium">{r.contato_nome || r.contato_telefone}</div>
                        <div className="text-xs text-muted-foreground">{r.contato_telefone}</div>
                      </td>
                      <td className="p-2">
                        <Badge
                          variant={r.status === "waiting" ? "secondary" : "outline"}
                          className={
                            r.status === "active" ? "bg-emerald-500/15 text-emerald-600" : ""
                          }
                        >
                          {r.status}
                        </Badge>
                      </td>
                      <td className="p-2">
                        {r.agente_nome ?? <span className="text-muted-foreground">—</span>}
                        {r.agente_em_pausa && (
                          <Badge variant="outline" className="ml-1 text-[11px]">
                            em pausa
                          </Badge>
                        )}
                      </td>
                      <td className="p-2 text-muted-foreground">{r.departamento_nome ?? "—"}</td>
                      <td className="p-2">
                        {espMin != null ? (
                          <span className={alerta ? "text-destructive font-medium" : ""}>
                            {Math.round(espMin)}min
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="p-2">{fmtSeg(r.sla_first_response_seg)}</td>
                      <td className="p-2 text-xs text-muted-foreground max-w-[280px] truncate">
                        {r.ultima_msg_preview}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
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

/* ============================================================
 *  RELATÓRIOS — por período / agente / departamento
 * ========================================================== */
export function AtendRelatorios() {
  const { clinicaAtual } = useClinica();
  const clinicaId = clinicaAtual?.clinica_id;
  const relFn = useServerFn(relatorioAtendimento);

  const hoje = new Date();
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const [de, setDe] = useState(inicioMes.toISOString().slice(0, 10));
  const [ate, setAte] = useState(hoje.toISOString().slice(0, 10));
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const carregar = useCallback(async () => {
    if (!clinicaId) return;
    setLoading(true);
    try {
      const r = await relFn({
        data: { clinicaId, de: `${de}T00:00:00Z`, ate: `${ate}T23:59:59Z` },
      });
      setData(r);
    } catch (e: any) {
      mostrarErro(e);
    } finally {
      setLoading(false);
    }
  }, [clinicaId, de, ate, relFn]);
  useEffect(() => {
    carregar();
  }, [carregar]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" /> Relatórios de Atendimento
          </CardTitle>
          <div className="flex items-end gap-2">
            <div>
              <Label className="text-xs">De</Label>
              <DateInputBR value={de} onChange={(e) => setDe(e.target.value)} className="h-8" />
            </div>
            <div>
              <Label className="text-xs">Até</Label>
              <DateInputBR value={ate} onChange={(e) => setAte(e.target.value)} className="h-8" />
            </div>
            <Button size="sm" onClick={carregar} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Atualizar"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <Stat label="Conversas" value={data?.totais?.conversas ?? "—"} icon={MessageSquare} />
            <Stat
              label="Ativas"
              value={data?.totais?.ativas ?? "—"}
              tone="text-emerald-500"
              icon={Users}
            />
            <Stat
              label="Em espera"
              value={data?.totais?.espera ?? "—"}
              tone="text-amber-500"
              icon={Clock}
            />
            <Stat label="Fechadas" value={data?.totais?.fechadas ?? "—"} icon={CheckCircle2} />
            <Stat label="SLA 1ª resp." value={fmtSeg(data?.totais?.sla_medio_seg)} icon={Clock} />
            <Stat label="CSAT" value={data?.totais?.csat ?? "—"} icon={CheckCircle2} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Por agente</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left p-2">Agente</th>
                <th className="text-right p-2">Conversas</th>
                <th className="text-right p-2">Fechadas</th>
                <th className="text-right p-2">SLA médio</th>
              </tr>
            </thead>
            <tbody>
              {(data?.agentes ?? []).length === 0 && (
                <tr>
                  <td colSpan={4} className="p-4 text-center text-muted-foreground">
                    Sem dados.
                  </td>
                </tr>
              )}
              {(data?.agentes ?? []).map((a: any) => (
                <tr key={a.user_id} className="border-t">
                  <td className="p-2 font-medium">{a.nome}</td>
                  <td className="p-2 text-right">{a.conversas}</td>
                  <td className="p-2 text-right">{a.fechadas}</td>
                  <td className="p-2 text-right">{fmtSeg(a.sla_medio)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Por departamento</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left p-2">Departamento</th>
                <th className="text-right p-2">Conversas</th>
                <th className="text-right p-2">Fechadas</th>
              </tr>
            </thead>
            <tbody>
              {(data?.departamentos ?? []).length === 0 && (
                <tr>
                  <td colSpan={3} className="p-4 text-center text-muted-foreground">
                    Sem dados.
                  </td>
                </tr>
              )}
              {(data?.departamentos ?? []).map((d: any) => (
                <tr key={d.id} className="border-t">
                  <td className="p-2 font-medium">{d.nome}</td>
                  <td className="p-2 text-right">{d.conversas}</td>
                  <td className="p-2 text-right">{d.fechadas}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

/* ============================================================
 *  ROTEAMENTO — regras automáticas
 * ========================================================== */
const DIAS = [
  { v: 1, l: "Seg" },
  { v: 2, l: "Ter" },
  { v: 3, l: "Qua" },
  { v: 4, l: "Qui" },
  { v: 5, l: "Sex" },
  { v: 6, l: "Sáb" },
  { v: 7, l: "Dom" },
];

export function AtendRoteamento() {
  const { clinicaAtual } = useClinica();
  const clinicaId = clinicaAtual?.clinica_id;
  const listar = useServerFn(listarRoutingRules);
  const salvar = useServerFn(salvarRoutingRule);
  const excluir = useServerFn(excluirRoutingRule);
  const listarDeptosFn = useServerFn(listarDepartamentos);

  const [rows, setRows] = useState<any[]>([]);
  const [deptos, setDeptos] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<any>(null);
  const [palavras, setPalavras] = useState<string>("");
  const [diasSel, setDiasSel] = useState<number[]>([1, 2, 3, 4, 5]);

  const carregar = useCallback(async () => {
    if (!clinicaId) return;
    try {
      const [r, d] = await Promise.all([
        listar({ data: { clinicaId } }),
        listarDeptosFn({ data: { clinicaId } }),
      ]);
      setRows(r);
      setDeptos(d);
    } catch (e: any) {
      mostrarErro(e);
    }
  }, [clinicaId, listar, listarDeptosFn]);
  useEffect(() => {
    carregar();
  }, [carregar]);
  useRealtimeRefresh(["atend_routing_rules"], carregar, !!clinicaId);

  const abrirNovo = () => {
    setEdit(null);
    setPalavras("");
    setDiasSel([1, 2, 3, 4, 5]);
    setOpen(true);
  };
  const abrirEdit = (r: any) => {
    setEdit(r);
    setPalavras((r.palavras_chave ?? []).join(", "));
    setDiasSel(r.dias_semana ?? [1, 2, 3, 4, 5]);
    setOpen(true);
  };

  const handleSalvar = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!clinicaId) return;
    const fd = new FormData(e.currentTarget);
    const pal = palavras
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    try {
      await salvar({
        data: {
          clinicaId,
          id: edit?.id,
          nome: String(fd.get("nome") || ""),
          ordem: Number(fd.get("ordem") || 0),
          ativo: fd.get("ativo") === "on",
          canal: String(fd.get("canal") || "") || null,
          palavras_chave: pal,
          horario_inicio: String(fd.get("horario_inicio") || "") || null,
          horario_fim: String(fd.get("horario_fim") || "") || null,
          dias_semana: diasSel,
          departamento_id: String(fd.get("departamento_id") || "") || null,
          mensagem_auto: String(fd.get("mensagem_auto") || "") || null,
        },
      });
      toast.success("Regra salva");
      setOpen(false);
      setEdit(null);
      await carregar();
    } catch (e: any) {
      mostrarErro(e);
    }
  };

  const toggleDia = (d: number) =>
    setDiasSel((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort()));

  const deptoNome = (id?: string | null) => deptos.find((d) => d.id === id)?.nome ?? "—";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <ArrowRightLeft className="h-5 w-5" /> Roteamento automático
        </CardTitle>
        <Button size="sm" onClick={abrirNovo}>
          <Plus className="h-4 w-4 mr-1" /> Nova regra
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nenhuma regra. Regras direcionam novas conversas a departamentos com base em canal,
            palavras-chave ou horário.
          </p>
        )}
        {rows.map((r) => (
          <div key={r.id} className="flex items-start justify-between rounded-lg border p-3 gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium">{r.nome}</span>
                <Badge variant="outline" className="text-xs">
                  ordem {r.ordem}
                </Badge>
                {!r.ativo && <Badge variant="outline">Inativa</Badge>}
                {r.canal && (
                  <Badge variant="secondary" className="text-xs">
                    {r.canal}
                  </Badge>
                )}
                <Badge variant="outline" className="text-xs">
                  → {deptoNome(r.departamento_id)}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                {(r.palavras_chave ?? []).length > 0 && (
                  <div>Palavras: {(r.palavras_chave ?? []).join(", ")}</div>
                )}
                {(r.horario_inicio || r.horario_fim) && (
                  <div>
                    Horário: {r.horario_inicio ?? "00:00"} – {r.horario_fim ?? "23:59"}
                  </div>
                )}
                <div>
                  Dias:{" "}
                  {(r.dias_semana ?? [])
                    .map((d: number) => DIAS.find((x) => x.v === d)?.l)
                    .join(", ")}
                </div>
                {r.mensagem_auto && <div className="italic">Auto: "{r.mensagem_auto}"</div>}
              </div>
            </div>
            <div className="flex gap-1 shrink-0">
              <Button size="icon" variant="ghost" onClick={() => abrirEdit(r)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={async () => {
                  if (!(await confirmDialog("Excluir regra?"))) return;
                  try {
                    await excluir({ data: { clinicaId: clinicaId!, id: r.id } });
                    await carregar();
                    toast.success("Excluída");
                  } catch (e: any) {
                    mostrarErro(e);
                  }
                }}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{edit ? "Editar" : "Nova"} regra de roteamento</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSalvar} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <Label>Nome *</Label>
                <Input name="nome" defaultValue={edit?.nome ?? ""} required maxLength={120} />
              </div>
              <div>
                <Label>Ordem</Label>
                <Input
                  name="ordem"
                  type="number"
                  min={0}
                  max={999}
                  defaultValue={edit?.ordem ?? 0}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Canal</Label>
                <Select name="canal" defaultValue={edit?.canal ?? ""}>
                  <SelectTrigger>
                    <SelectValue placeholder="Qualquer" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="instagram">Instagram</SelectItem>
                    <SelectItem value="facebook">Facebook</SelectItem>
                    <SelectItem value="webchat">Webchat</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Departamento de destino</Label>
                <Select name="departamento_id" defaultValue={edit?.departamento_id ?? ""}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
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
            </div>
            <div>
              <Label>Palavras-chave (separadas por vírgula)</Label>
              <Input
                value={palavras}
                onChange={(e) => setPalavras(e.target.value)}
                placeholder="agendamento, marcar, consulta"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Horário início</Label>
                <Input
                  name="horario_inicio"
                  type="time"
                  defaultValue={edit?.horario_inicio ?? ""}
                />
              </div>
              <div>
                <Label>Horário fim</Label>
                <Input name="horario_fim" type="time" defaultValue={edit?.horario_fim ?? ""} />
              </div>
            </div>
            <div>
              <Label>Dias da semana</Label>
              <div className="flex flex-wrap gap-1 mt-1">
                {DIAS.map((d) => (
                  <Button
                    key={d.v}
                    type="button"
                    size="sm"
                    variant={diasSel.includes(d.v) ? "default" : "outline"}
                    onClick={() => toggleDia(d.v)}
                  >
                    {d.l}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <Label>Mensagem automática (opcional)</Label>
              <Textarea
                name="mensagem_auto"
                defaultValue={edit?.mensagem_auto ?? ""}
                maxLength={1000}
                rows={2}
                placeholder="Olá! Em instantes um atendente vai te responder."
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch name="ativo" defaultChecked={edit?.ativo ?? true} />
              <Label>Ativa</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">Salvar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
