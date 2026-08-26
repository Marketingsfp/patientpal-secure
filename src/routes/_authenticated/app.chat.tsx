import { createFileRoute } from "@tanstack/react-router";
import { confirmDialog } from "@/lib/confirm";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useClinica } from "@/hooks/use-clinica";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { sanitizePostgrestSearch } from "@/lib/sanitize-search";
import {
  Plus,
  Send,
  Hash,
  Users,
  Trash2,
  Search,
  MessageSquarePlus,
  Paperclip,
  UserPlus,
  Smile,
  Zap,
  Info,
  X,
  FileText,
  Loader2,
} from "lucide-react";
import { formatDateTime } from "@/lib/date-utils";

export const Route = createFileRoute("/_authenticated/app/chat")({
  component: ChatPage,
});

type Canal = {
  id: string;
  tipo: "direto" | "grupo" | "setor";
  nome: string | null;
  clinica_id: string;
};

type Mensagem = {
  id: string;
  canal_id: string;
  autor_id: string;
  texto: string | null;
  anexo_tipo: string | null;
  anexo_url: string | null;
  created_at: string;
};

type Membro = {
  user_id: string;
  nome: string | null;
  avatar_url: string | null;
  setor: string;
};

type CanalMeta = { ultimaEm: string | null; ultimaTexto: string; naoLidas: number };

const SETOR_LABEL: Record<string, string> = {
  admin: "Gestão",
  tesouraria: "Financeiro",
  medico: "Médicos",
  enfermagem: "Enfermagem",
  recepcao: "Recepção",
  marketing: "Marketing",
  rh: "RH",
  equipe: "Equipe",
};

const RESPOSTAS_RAPIDAS = [
  "Paciente liberado para o consultório.",
  "Paciente aguardando na recepção.",
  "Exame concluído, resultado em preparação.",
  "Pode encaminhar o próximo paciente.",
  "Estou em atendimento, retorno em instantes.",
];

const EMOJIS = [
  "👍",
  "👏",
  "🙏",
  "✅",
  "❗",
  "⏰",
  "😀",
  "😉",
  "😅",
  "🤝",
  "💉",
  "🩺",
  "📋",
  "🚑",
  "❤️",
  "🔔",
];

function iniciais(nome: string | null | undefined) {
  const partes = (nome ?? "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  return (
    (partes[0][0] ?? "") + (partes.length > 1 ? (partes[partes.length - 1][0] ?? "") : "")
  ).toUpperCase();
}

function horaCurta(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const hoje = new Date();
  const mesmoDia = d.toDateString() === hoje.toDateString();
  return mesmoDia
    ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function ChatPage() {
  const { user } = useAuth();
  const { clinicaAtual } = useClinica();
  const podeEscrever = usePodeEscrever("chat");
  const clinicaId = clinicaAtual?.clinica_id;

  const [canais, setCanais] = useState<Canal[]>([]);
  const [metas, setMetas] = useState<Record<string, CanalMeta>>({});
  const [canalSel, setCanalSel] = useState<string | null>(null);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [autores, setAutores] = useState<Record<string, string>>({});
  const [nomesDiretos, setNomesDiretos] = useState<Record<string, string>>({});
  const [membrosDiretos, setMembrosDiretos] = useState<Record<string, string>>({});
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [equipe, setEquipe] = useState<Membro[]>([]);
  const [online, setOnline] = useState<Set<string>>(new Set());

  // filtros da lista
  const [buscaLista, setBuscaLista] = useState("");
  const [aba, setAba] = useState<"todas" | "diretas" | "canais" | "nao_lidas">("todas");

  // nova conversa
  const [novoModo, setNovoModo] = useState<null | "privada" | "canal">(null);
  const [novoNome, setNovoNome] = useState("");
  const [buscaEquipe, setBuscaEquipe] = useState("");
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

  // painel direito
  const [buscaConversa, setBuscaConversa] = useState<string | null>(null);
  const [infoAberta, setInfoAberta] = useState(false);
  const [pacienteDialog, setPacienteDialog] = useState(false);
  const [buscaPaciente, setBuscaPaciente] = useState("");
  const buscaPacienteDeb = useDebouncedValue(buscaPaciente, 350);
  const [pacientes, setPacientes] = useState<
    Array<{ id: string; nome: string; cpf: string | null; telefone: string | null }>
  >([]);
  const [buscandoPac, setBuscandoPac] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollFim = useCallback(() => {
    setTimeout(() => listRef.current?.scrollTo({ top: 999999 }), 60);
  }, []);

  // ---------- carregar canais + metadados ----------
  const carregarCanais = useCallback(async () => {
    if (!clinicaId || !user) return;
    const { data: mems } = await supabase
      .from("chat_membros")
      .select("canal_id")
      .eq("user_id", user.id);
    const ids = (mems ?? []).map((m: any) => m.canal_id);
    if (ids.length === 0) {
      setCanais([]);
      setMetas({});
      return;
    }
    const { data } = await supabase
      .from("chat_canais")
      .select("id, tipo, nome, clinica_id")
      .in("id", ids)
      .eq("clinica_id", clinicaId)
      .order("updated_at", { ascending: false });
    const carregados = (data ?? []) as Canal[];

    const diretos = carregados.filter((c) => c.tipo === "direto").map((c) => c.id);
    if (diretos.length > 0) {
      const { data: outros } = await supabase
        .from("chat_membros")
        .select("canal_id, user_id")
        .in("canal_id", diretos)
        .neq("user_id", user.id);
      if (outros && outros.length > 0) {
        const outrosIds = Array.from(new Set(outros.map((m: any) => m.user_id)));
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, nome")
          .in("id", outrosIds);
        const profsMap = Object.fromEntries((profs ?? []).map((p: any) => [p.id, p.nome]));
        const nomes: Record<string, string> = {};
        const donos: Record<string, string> = {};
        outros.forEach((m: any) => {
          nomes[m.canal_id] = profsMap[m.user_id] ?? "Usuário";
          donos[m.canal_id] = m.user_id;
        });
        setNomesDiretos(nomes);
        setMembrosDiretos(donos);
      }
    }

    // últimas mensagens + não lidas
    const [{ data: msgs }, { data: leituras }] = await Promise.all([
      supabase
        .from("chat_mensagens")
        .select("canal_id, texto, anexo_tipo, created_at")
        .in("canal_id", ids)
        .is("deletada_em", null)
        .order("created_at", { ascending: false })
        .limit(600),
      supabase.from("chat_leituras").select("canal_id, ultima_lida_em").eq("user_id", user.id),
    ]);
    const lidoMap = new Map((leituras ?? []).map((l: any) => [l.canal_id, l.ultima_lida_em]));
    const novoMeta: Record<string, CanalMeta> = {};
    for (const id of ids) novoMeta[id] = { ultimaEm: null, ultimaTexto: "", naoLidas: 0 };
    for (const m of (msgs ?? []) as any[]) {
      const meta = novoMeta[m.canal_id];
      if (!meta) continue;
      if (!meta.ultimaEm) {
        meta.ultimaEm = m.created_at;
        meta.ultimaTexto = m.anexo_tipo === "arquivo" ? "📎 Anexo" : (m.texto ?? "");
      }
      const lido = lidoMap.get(m.canal_id);
      if (!lido || new Date(m.created_at) > new Date(lido as string)) meta.naoLidas += 1;
    }
    setMetas(novoMeta);
    setCanais(carregados);
    setCanalSel((atual) => atual ?? null);
  }, [clinicaId, user]);

  useEffect(() => {
    void carregarCanais();
  }, [carregarCanais]);

  // ---------- equipe + setor ----------
  useEffect(() => {
    if (!clinicaId) return;
    (async () => {
      const { data: mems } = await supabase
        .from("clinica_memberships")
        .select("user_id")
        .eq("clinica_id", clinicaId)
        .eq("ativo", true);
      const ids = (mems ?? []).map((m: any) => m.user_id);
      if (ids.length === 0) {
        setEquipe([]);
        return;
      }
      const [{ data: profs }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("id, nome, avatar_url").in("id", ids),
        supabase.from("user_roles").select("user_id, role").in("user_id", ids),
      ]);
      const roleMap = new Map<string, string>();
      for (const r of (roles ?? []) as any[])
        if (!roleMap.has(r.user_id)) roleMap.set(r.user_id, r.role);
      setEquipe(
        (profs ?? []).map((p: any) => ({
          user_id: p.id,
          nome: p.nome,
          avatar_url: p.avatar_url ?? null,
          setor: SETOR_LABEL[roleMap.get(p.id) ?? ""] ?? "Equipe",
        })),
      );
    })();
  }, [clinicaId]);

  // ---------- presença (quem está online) ----------
  useEffect(() => {
    if (!clinicaId || !user) return;
    const ch = supabase.channel(`presenca-chat:${clinicaId}`, {
      config: { presence: { key: user.id } },
    });
    const sync = () => {
      const state = ch.presenceState() as Record<string, unknown[]>;
      setOnline(new Set(Object.keys(state)));
    };
    ch.on("presence", { event: "sync" }, sync).subscribe((status) => {
      if (status === "SUBSCRIBED") void ch.track({ at: new Date().toISOString() });
    });
    return () => {
      supabase.removeChannel(ch);
    };
  }, [clinicaId, user]);

  // ---------- mensagens do canal + realtime ----------
  useEffect(() => {
    if (!canalSel) return;
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("chat_mensagens")
        .select("id, canal_id, autor_id, texto, anexo_tipo, anexo_url, created_at")
        .eq("canal_id", canalSel)
        .is("deletada_em", null)
        .order("created_at", { ascending: true })
        .limit(300);
      if (!active) return;
      const msgs = (data ?? []) as Mensagem[];
      setMensagens(msgs);
      await carregarAutores(msgs);
      scrollFim();
    })();

    const channel = supabase
      .channel(`chat:${canalSel}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_mensagens",
          filter: `canal_id=eq.${canalSel}`,
        },
        async (payload) => {
          const m = payload.new as Mensagem;
          setMensagens((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
          setMetas((prev) => ({
            ...prev,
            [m.canal_id]: {
              ultimaEm: m.created_at,
              ultimaTexto: m.anexo_tipo === "arquivo" ? "📎 Anexo" : (m.texto ?? ""),
              naoLidas: 0,
            },
          }));
          await carregarAutores([m]);
          scrollFim();
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canalSel]);

  // marca como lido ao abrir
  useEffect(() => {
    if (!canalSel || !user) return;
    void supabase
      .from("chat_leituras")
      .upsert(
        { canal_id: canalSel, user_id: user.id, ultima_lida_em: new Date().toISOString() },
        { onConflict: "canal_id,user_id" },
      );
    setMetas((prev) => ({
      ...prev,
      [canalSel]: { ...(prev[canalSel] ?? { ultimaEm: null, ultimaTexto: "" }), naoLidas: 0 },
    }));
  }, [canalSel, user]);

  async function carregarAutores(msgs: Mensagem[]) {
    const faltam = Array.from(new Set(msgs.map((m) => m.autor_id))).filter((id) => !autores[id]);
    if (faltam.length === 0) return;
    const { data } = await supabase.from("profiles").select("id, nome").in("id", faltam);
    setAutores((prev) => {
      const next = { ...prev };
      (data ?? []).forEach((p: any) => {
        next[p.id] = p.nome ?? "Usuário";
      });
      return next;
    });
  }

  // ---------- busca de pacientes p/ anexar ficha ----------
  useEffect(() => {
    const termo = sanitizePostgrestSearch(buscaPacienteDeb);
    if (!pacienteDialog || termo.length < 3 || !clinicaId) {
      setPacientes([]);
      return;
    }
    let ativo = true;
    (async () => {
      setBuscandoPac(true);
      const { data } = await supabase
        .from("pacientes")
        .select("id, nome, cpf, telefone")
        .eq("clinica_id", clinicaId)
        .ilike("nome", `%${termo}%`)
        .order("nome")
        .limit(15);
      if (!ativo) return;
      setPacientes((data ?? []) as any);
      setBuscandoPac(false);
    })();
    return () => {
      ativo = false;
    };
  }, [buscaPacienteDeb, pacienteDialog, clinicaId]);

  async function inserirMensagem(payload: Partial<Mensagem>) {
    if (!canalSel || !user || !clinicaId) return false;
    const { error } = await supabase.from("chat_mensagens").insert({
      canal_id: canalSel,
      clinica_id: clinicaId,
      autor_id: user.id,
      ...payload,
    } as any);
    if (error) {
      mostrarErro(error);
      return false;
    }
    return true;
  }

  async function enviar() {
    if (!podeEscrever) {
      toast.error("Você não tem permissão de edição neste módulo.");
      return;
    }
    if (!texto.trim() || enviando) return;
    setEnviando(true);
    const ok = await inserirMensagem({ texto: texto.trim() });
    setEnviando(false);
    if (ok) {
      setTexto("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";
    }
  }

  async function enviarArquivo(file: File) {
    if (!user || !clinicaId || !canalSel) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Arquivo maior que 10MB.");
      return;
    }
    const caminho = `${clinicaId}/${canalSel}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
    const { error } = await supabase.storage.from("chat-anexos").upload(caminho, file);
    if (error) {
      mostrarErro(error, "erro ao enviar anexo");
      return;
    }
    await inserirMensagem({ texto: file.name, anexo_tipo: "arquivo", anexo_url: caminho });
  }

  async function abrirAnexo(caminho: string) {
    const { data, error } = await supabase.storage.from("chat-anexos").createSignedUrl(caminho, 60);
    if (error || !data) {
      mostrarErro(error, "erro ao abrir anexo");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  }

  async function criarConversa() {
    if (!podeEscrever) {
      toast.error("Você não tem permissão de edição neste módulo.");
      return;
    }
    if (!clinicaId || !user) return;
    const ehCanal = novoModo === "canal";
    if (!ehCanal && selecionados.size === 0) {
      toast.error("Selecione ao menos um colega");
      return;
    }
    if (ehCanal && !novoNome.trim()) {
      toast.error("Informe o nome do canal");
      return;
    }
    const tipo: Canal["tipo"] = ehCanal ? "grupo" : selecionados.size === 1 ? "direto" : "grupo";
    const nome = ehCanal
      ? novoNome.trim().replace(/^#/, "")
      : tipo === "grupo"
        ? novoNome.trim() || "Novo grupo"
        : null;

    const { data: canal, error } = await supabase
      .from("chat_canais")
      .insert({ clinica_id: clinicaId, tipo, nome, criado_por: user.id })
      .select("id, tipo, nome, clinica_id")
      .single();
    if (error || !canal) {
      mostrarErro(error);
      return;
    }
    const membros = [user.id, ...Array.from(selecionados)].map((uid) => ({
      canal_id: canal.id,
      user_id: uid,
    }));
    const { error: e2 } = await supabase.from("chat_membros").insert(membros);
    if (e2) {
      mostrarErro(e2);
      return;
    }
    if (tipo === "direto") {
      const outroId = Array.from(selecionados)[0];
      const prof = equipe.find((e) => e.user_id === outroId);
      setNomesDiretos((prev) => ({ ...prev, [canal.id]: prof?.nome ?? "Usuário" }));
      setMembrosDiretos((prev) => ({ ...prev, [canal.id]: outroId }));
    }
    toast.success(ehCanal ? "Canal criado" : "Conversa iniciada");
    setCanais((p) => [canal as Canal, ...p]);
    setMetas((p) => ({ ...p, [canal.id]: { ultimaEm: null, ultimaTexto: "", naoLidas: 0 } }));
    setCanalSel(canal.id);
    setNovoModo(null);
    setNovoNome("");
    setBuscaEquipe("");
    setSelecionados(new Set());
  }

  async function excluirCanal(id: string) {
    if (!podeEscrever) {
      toast.error("Você não tem permissão de edição neste módulo.");
      return;
    }
    if (!(await confirmDialog("Tem certeza que deseja apagar esta conversa para todos?"))) return;
    const { error } = await supabase.from("chat_canais").delete().eq("id", id);
    if (error) {
      mostrarErro(error, "erro ao excluir");
      return;
    }
    toast.success("Conversa excluída");
    setCanais((prev) => prev.filter((c) => c.id !== id));
    if (canalSel === id) {
      setCanalSel(null);
      setMensagens([]);
    }
  }

  const canalAtual = useMemo(() => canais.find((c) => c.id === canalSel), [canais, canalSel]);
  const nomeAtual = canalAtual
    ? canalAtual.tipo === "direto"
      ? (nomesDiretos[canalAtual.id] ?? "Conversa direta")
      : (canalAtual.nome ?? "Grupo")
    : "";
  const parceiro =
    canalAtual?.tipo === "direto"
      ? equipe.find((e) => e.user_id === membrosDiretos[canalAtual.id])
      : undefined;
  const parceiroOnline = parceiro ? online.has(parceiro.user_id) : false;

  const canaisFiltrados = useMemo(() => {
    const termo = buscaLista.trim().toLowerCase();
    return canais.filter((c) => {
      const nome =
        c.tipo === "direto" ? (nomesDiretos[c.id] ?? "Conversa direta") : (c.nome ?? "Grupo");
      if (termo && !nome.toLowerCase().includes(termo)) return false;
      if (aba === "diretas" && c.tipo !== "direto") return false;
      if (aba === "canais" && c.tipo === "direto") return false;
      if (aba === "nao_lidas" && !(metas[c.id]?.naoLidas > 0)) return false;
      return true;
    });
  }, [canais, buscaLista, aba, nomesDiretos, metas]);

  const mensagensVisiveis = useMemo(() => {
    const termo = (buscaConversa ?? "").trim().toLowerCase();
    if (!termo) return mensagens;
    return mensagens.filter((m) => (m.texto ?? "").toLowerCase().includes(termo));
  }, [mensagens, buscaConversa]);

  const equipePorSetor = useMemo(() => {
    const termo = buscaEquipe.trim().toLowerCase();
    const grupos = new Map<string, Membro[]>();
    for (const m of equipe) {
      if (m.user_id === user?.id) continue;
      if (termo && !(m.nome ?? "").toLowerCase().includes(termo)) continue;
      const arr = grupos.get(m.setor) ?? [];
      arr.push(m);
      grupos.set(m.setor, arr);
    }
    return Array.from(grupos.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [equipe, buscaEquipe, user]);

  function abrirNova(modo: "privada" | "canal") {
    setSelecionados(new Set());
    setNovoNome("");
    setBuscaEquipe("");
    setNovoModo(modo);
  }

  return (
    <div className="flex gap-4 h-[calc(100vh-7rem)]">
      {/* ---------------- Lista de conversas ---------------- */}
      <Card className="w-80 shrink-0 flex flex-col overflow-hidden">
        <div className="p-3 space-y-3 border-b">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm tracking-tight">Conversas</h2>
            {podeEscrever && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon"
                    variant="secondary"
                    className="h-8 w-8 rounded-full"
                    title="Nova conversa"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem onClick={() => abrirNova("privada")}>
                    <UserPlus className="h-4 w-4 mr-2" /> Conversa privada
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => abrirNova("canal")}>
                    <Hash className="h-4 w-4 mr-2" /> Novo canal / grupo
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={buscaLista}
              onChange={(e) => setBuscaLista(e.target.value)}
              placeholder="Buscar conversa ou colega..."
              className="pl-8 h-9"
            />
          </div>
          <Tabs value={aba} onValueChange={(v) => setAba(v as typeof aba)}>
            <TabsList className="w-full grid grid-cols-4 h-8">
              <TabsTrigger value="todas" className="text-[12px] px-1">
                Todas
              </TabsTrigger>
              <TabsTrigger value="diretas" className="text-[12px] px-1">
                Diretas
              </TabsTrigger>
              <TabsTrigger value="canais" className="text-[12px] px-1">
                Canais
              </TabsTrigger>
              <TabsTrigger value="nao_lidas" className="text-[12px] px-1">
                Não lidas
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex-1 overflow-auto p-2 space-y-1">
          {canaisFiltrados.length === 0 && (
            <div className="flex flex-col items-center text-center gap-2 px-4 py-10">
              <div className="h-11 w-11 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                <MessageSquarePlus className="h-5 w-5" />
              </div>
              <p className="text-xs font-medium">Nenhuma conversa aqui</p>
              <p className="text-[12px] text-muted-foreground">
                {canais.length === 0
                  ? "Comece uma conversa com a equipe."
                  : "Ajuste a busca ou o filtro."}
              </p>
              {podeEscrever && canais.length === 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-1"
                  onClick={() => abrirNova("privada")}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> Nova conversa
                </Button>
              )}
            </div>
          )}

          {canaisFiltrados.map((c) => {
            const ativo = c.id === canalSel;
            const direto = c.tipo === "direto";
            const nomeDisplay = direto
              ? (nomesDiretos[c.id] ?? "Conversa direta")
              : (c.nome ?? "Grupo");
            const membro = direto
              ? equipe.find((e) => e.user_id === membrosDiretos[c.id])
              : undefined;
            const estaOnline = membro ? online.has(membro.user_id) : false;
            const meta = metas[c.id];
            return (
              <div
                key={c.id}
                onClick={() => setCanalSel(c.id)}
                className={`group flex items-center gap-3 px-2.5 py-2 rounded-lg cursor-pointer transition-colors ${
                  ativo ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-muted"
                }`}
              >
                <div className="relative shrink-0">
                  <Avatar className="h-9 w-9">
                    {membro?.avatar_url && (
                      <AvatarImage src={membro.avatar_url} alt={nomeDisplay} />
                    )}
                    <AvatarFallback className="text-[12px] font-semibold">
                      {direto ? iniciais(nomeDisplay) : <Users className="h-4 w-4" />}
                    </AvatarFallback>
                  </Avatar>
                  {direto && (
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card ${
                        estaOnline ? "bg-emerald-500" : "bg-muted-foreground/40"
                      }`}
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate flex-1">
                      {direto ? nomeDisplay : `#${nomeDisplay}`}
                    </span>
                    <span className="text-[11px] text-muted-foreground shrink-0">
                      {horaCurta(meta?.ultimaEm ?? null)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] text-muted-foreground truncate flex-1">
                      {meta?.ultimaTexto ||
                        (direto ? (membro?.setor ?? "Equipe") : "Canal da equipe")}
                    </span>
                    {meta?.naoLidas > 0 && (
                      <Badge className="h-4 min-w-4 px-1 text-[11px] justify-center rounded-full">
                        {meta.naoLidas}
                      </Badge>
                    )}
                  </div>
                  {direto && membro?.setor && (
                    <Badge variant="secondary" className="mt-1 h-4 text-[10px] px-1.5 font-normal">
                      {membro.setor}
                    </Badge>
                  )}
                </div>
                {podeEscrever && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      void excluirCanal(c.id);
                    }}
                    className="shrink-0 opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-destructive transition-opacity"
                    title="Excluir conversa"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* ---------------- Painel de mensagens ---------------- */}
      <Card className="flex-1 flex flex-col overflow-hidden">
        {!canalAtual ? (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="max-w-sm w-full text-center rounded-2xl border bg-muted/20 px-8 py-10 space-y-3">
              <div className="mx-auto h-14 w-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                <MessageSquarePlus className="h-7 w-7" />
              </div>
              <h3 className="text-base font-semibold">Chat Interno da Policlínica</h3>
              <p className="text-sm text-muted-foreground">
                Comunique-se em tempo real com recepção, médicos e enfermagem.
              </p>
              {podeEscrever && (
                <Button className="mt-1" onClick={() => abrirNova("privada")}>
                  <Plus className="h-4 w-4 mr-1" /> Iniciar nova conversa
                </Button>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="px-4 py-3 border-b flex items-center justify-between gap-3 bg-muted/30">
              <div className="flex items-center gap-3 min-w-0">
                <div className="relative">
                  <Avatar className="h-10 w-10">
                    {parceiro?.avatar_url && (
                      <AvatarImage src={parceiro.avatar_url} alt={nomeAtual} />
                    )}
                    <AvatarFallback className="text-xs font-semibold">
                      {canalAtual.tipo === "direto" ? (
                        iniciais(nomeAtual)
                      ) : (
                        <Users className="h-4 w-4" />
                      )}
                    </AvatarFallback>
                  </Avatar>
                  {canalAtual.tipo === "direto" && (
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card ${
                        parceiroOnline ? "bg-emerald-500" : "bg-muted-foreground/40"
                      }`}
                    />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-sm truncate">
                      {canalAtual.tipo === "direto" ? nomeAtual : `#${nomeAtual}`}
                    </h3>
                    {parceiro?.setor && (
                      <Badge variant="secondary" className="h-4 text-[11px] px-1.5">
                        {parceiro.setor}
                      </Badge>
                    )}
                  </div>
                  <p className="text-[12px] text-muted-foreground">
                    {canalAtual.tipo === "direto"
                      ? parceiroOnline
                        ? "Online agora"
                        : "Offline — responderá em breve"
                      : "Canal da equipe"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {podeEscrever && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPacienteDialog(true)}
                    title="Anexar ficha de paciente"
                  >
                    <FileText className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setBuscaConversa((v) => (v === null ? "" : null))}
                  title="Buscar na conversa"
                >
                  {buscaConversa === null ? (
                    <Search className="h-4 w-4" />
                  ) : (
                    <X className="h-4 w-4" />
                  )}
                </Button>
                <Popover open={infoAberta} onOpenChange={setInfoAberta}>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="sm" title="Informações">
                      <Info className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-64 space-y-2">
                    <p className="text-sm font-semibold">
                      {canalAtual.tipo === "direto" ? nomeAtual : `#${nomeAtual}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Tipo: {canalAtual.tipo === "direto" ? "Conversa privada" : "Canal / grupo"}
                    </p>
                    {parceiro && (
                      <p className="text-xs text-muted-foreground">Setor: {parceiro.setor}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Mensagens carregadas: {mensagens.length}
                    </p>
                    {podeEscrever && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start text-destructive hover:text-destructive"
                        onClick={() => {
                          setInfoAberta(false);
                          void excluirCanal(canalAtual.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4 mr-2" /> Excluir conversa
                      </Button>
                    )}
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {buscaConversa !== null && (
              <div className="px-4 py-2 border-b bg-background">
                <Input
                  autoFocus
                  value={buscaConversa}
                  onChange={(e) => setBuscaConversa(e.target.value)}
                  placeholder="Buscar nesta conversa..."
                  className="h-8"
                />
              </div>
            )}

            {/* Mensagens */}
            <div ref={listRef} className="flex-1 overflow-auto p-4 space-y-3">
              {mensagensVisiveis.length === 0 && (
                <p className="text-center text-xs text-muted-foreground py-8">
                  {buscaConversa
                    ? "Nenhuma mensagem encontrada."
                    : "Nenhuma mensagem ainda. Diga olá 👋"}
                </p>
              )}
              {mensagensVisiveis.map((m) => {
                if (m.anexo_tipo === "sistema") {
                  return (
                    <div key={m.id} className="flex justify-center">
                      <span className="text-[12px] px-3 py-1 rounded-full bg-muted text-muted-foreground border">
                        {m.texto}
                      </span>
                    </div>
                  );
                }
                const meu = m.autor_id === user?.id;
                return (
                  <div key={m.id} className={`flex gap-2 ${meu ? "justify-end" : "justify-start"}`}>
                    {!meu && (
                      <Avatar className="h-7 w-7 mt-auto">
                        <AvatarFallback className="text-[11px]">
                          {iniciais(autores[m.autor_id])}
                        </AvatarFallback>
                      </Avatar>
                    )}
                    <div
                      className={`max-w-[70%] rounded-2xl px-3.5 py-2 text-sm shadow-sm ${
                        meu
                          ? "bg-primary text-primary-foreground rounded-br-sm"
                          : "bg-secondary text-secondary-foreground border rounded-bl-sm"
                      }`}
                    >
                      {!meu && (
                        <p className="text-[12px] font-semibold opacity-80 mb-0.5">
                          {autores[m.autor_id] ?? "…"}
                        </p>
                      )}
                      {m.anexo_tipo === "arquivo" && m.anexo_url ? (
                        <button
                          onClick={() => void abrirAnexo(m.anexo_url!)}
                          className="flex items-center gap-2 underline underline-offset-2"
                        >
                          <Paperclip className="h-3.5 w-3.5" /> {m.texto ?? "Anexo"}
                        </button>
                      ) : m.anexo_tipo === "paciente" ? (
                        <div className="rounded-lg border border-current/20 bg-background/10 px-2 py-1.5">
                          <p className="text-[11px] uppercase tracking-wide opacity-70">
                            Ficha de paciente
                          </p>
                          <p className="whitespace-pre-wrap break-words leading-relaxed">
                            {m.texto}
                          </p>
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap break-words leading-relaxed">{m.texto}</p>
                      )}
                      <p
                        className={`text-[11px] mt-1 text-right ${meu ? "text-primary-foreground/70" : "text-muted-foreground"}`}
                      >
                        {formatDateTime(m.created_at)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Barra de digitação */}
            {podeEscrever ? (
              <form
                className="p-3 border-t bg-muted/20"
                onSubmit={(e) => {
                  e.preventDefault();
                  void enviar();
                }}
              >
                <div className="flex items-end gap-2 rounded-2xl border bg-background px-2 py-1.5">
                  <Textarea
                    ref={textareaRef}
                    value={texto}
                    onChange={(e) => {
                      setTexto(e.target.value);
                      const el = e.currentTarget;
                      el.style.height = "auto";
                      el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void enviar();
                      }
                    }}
                    rows={1}
                    placeholder="Escreva uma mensagem..."
                    className="min-h-9 max-h-36 resize-none border-0 shadow-none focus-visible:ring-0 px-1 py-2"
                  />
                  <div className="flex items-center gap-0.5 pb-0.5">
                    <input
                      ref={fileRef}
                      type="file"
                      className="hidden"
                      accept="image/*,application/pdf"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void enviarArquivo(f);
                        e.target.value = "";
                      }}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title="Anexar arquivo"
                      onClick={() => fileRef.current?.click()}
                    >
                      <Paperclip className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title="Anexar paciente"
                      onClick={() => setPacienteDialog(true)}
                    >
                      <UserPlus className="h-4 w-4" />
                    </Button>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="Respostas rápidas"
                        >
                          <Zap className="h-4 w-4" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-72 p-1">
                        {RESPOSTAS_RAPIDAS.map((r) => (
                          <button
                            key={r}
                            type="button"
                            onClick={() => setTexto((t) => (t ? `${t} ${r}` : r))}
                            className="w-full text-left text-xs px-2 py-2 rounded hover:bg-muted"
                          >
                            {r}
                          </button>
                        ))}
                      </PopoverContent>
                    </Popover>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="Emojis"
                        >
                          <Smile className="h-4 w-4" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-56 p-2">
                        <div className="grid grid-cols-8 gap-1">
                          {EMOJIS.map((e) => (
                            <button
                              key={e}
                              type="button"
                              onClick={() => setTexto((t) => t + e)}
                              className="text-lg rounded hover:bg-muted"
                            >
                              {e}
                            </button>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                    <Button
                      type="submit"
                      size="icon"
                      disabled={!texto.trim() || enviando}
                      className="h-8 w-8 rounded-full"
                    >
                      {enviando ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </form>
            ) : (
              <div className="p-3 border-t bg-muted/20 text-center text-xs text-muted-foreground">
                Você tem acesso somente leitura a este módulo.
              </div>
            )}
          </>
        )}
      </Card>

      {/* ---------------- Dialog nova conversa ---------------- */}
      <Dialog open={novoModo !== null} onOpenChange={(o) => !o && setNovoModo(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {novoModo === "canal" ? "Novo canal / grupo" : "Conversa privada"}
            </DialogTitle>
            <DialogDescription>
              {novoModo === "canal"
                ? "Crie um canal por setor ou assunto (ex.: Recepção-Triagem, Avisos-Gerais)."
                : "Selecione um colega para conversar em privado."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {novoModo === "canal" && (
              <div>
                <Label>Nome do canal</Label>
                <Input
                  value={novoNome}
                  onChange={(e) => setNovoNome(e.target.value)}
                  placeholder="#Recepcao-Triagem"
                />
              </div>
            )}
            <div>
              <Label>{novoModo === "canal" ? "Participantes" : "Colegas"}</Label>
              <Input
                value={buscaEquipe}
                onChange={(e) => setBuscaEquipe(e.target.value)}
                placeholder="Buscar colega..."
                className="mt-1 h-9"
              />
              <ScrollArea className="h-64 border rounded-lg mt-2">
                {equipePorSetor.length === 0 && (
                  <p className="text-xs text-muted-foreground p-3">Nenhum colega encontrado.</p>
                )}
                {equipePorSetor.map(([setor, membros]) => (
                  <div key={setor}>
                    <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground bg-muted/50 sticky top-0">
                      {setor}
                    </div>
                    {membros.map((m) => {
                      const sel = selecionados.has(m.user_id);
                      return (
                        <button
                          key={m.user_id}
                          type="button"
                          onClick={() => {
                            const s = new Set(novoModo === "privada" ? [] : selecionados);
                            if (sel && novoModo !== "privada") s.delete(m.user_id);
                            else if (sel) s.clear();
                            else s.add(m.user_id);
                            setSelecionados(s);
                          }}
                          className={`w-full flex items-center gap-2 text-left px-3 py-2 text-sm transition-colors ${
                            sel ? "bg-primary/10 font-medium" : "hover:bg-muted"
                          }`}
                        >
                          <div className="relative">
                            <Avatar className="h-7 w-7">
                              {m.avatar_url && (
                                <AvatarImage src={m.avatar_url} alt={m.nome ?? ""} />
                              )}
                              <AvatarFallback className="text-[11px]">
                                {iniciais(m.nome)}
                              </AvatarFallback>
                            </Avatar>
                            <span
                              className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background ${
                                online.has(m.user_id) ? "bg-emerald-500" : "bg-muted-foreground/40"
                              }`}
                            />
                          </div>
                          <span className="flex-1 truncate">{m.nome ?? "Usuário"}</span>
                          {online.has(m.user_id) && (
                            <span className="text-[11px] text-emerald-600">online</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </ScrollArea>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNovoModo(null)}>
              Cancelar
            </Button>
            <Button onClick={() => void criarConversa()}>
              {novoModo === "canal" ? "Criar canal" : "Iniciar conversa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------------- Dialog anexar paciente ---------------- */}
      <Dialog open={pacienteDialog} onOpenChange={setPacienteDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Anexar ficha de paciente</DialogTitle>
            <DialogDescription>
              Busque pelo nome e envie os dados básicos na conversa.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={buscaPaciente}
            onChange={(e) => setBuscaPaciente(e.target.value)}
            placeholder="Digite ao menos 3 letras do nome..."
          />
          <ScrollArea className="h-60 border rounded-lg">
            {buscandoPac && <p className="text-xs text-muted-foreground p-3">Buscando...</p>}
            {!buscandoPac && pacientes.length === 0 && (
              <p className="text-xs text-muted-foreground p-3">Nenhum paciente encontrado.</p>
            )}
            {pacientes.map((p) => (
              <button
                key={p.id}
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-muted border-b last:border-b-0"
                onClick={async () => {
                  const ok = await inserirMensagem({
                    texto: `${p.nome}${p.cpf ? `\nCPF: ${p.cpf}` : ""}${p.telefone ? `\nTel: ${p.telefone}` : ""}`,
                    anexo_tipo: "paciente",
                  });
                  if (ok) {
                    setPacienteDialog(false);
                    setBuscaPaciente("");
                    setPacientes([]);
                  }
                }}
              >
                <span className="font-medium">{p.nome}</span>
                {p.cpf && <span className="text-xs text-muted-foreground ml-2">{p.cpf}</span>}
              </button>
            ))}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
