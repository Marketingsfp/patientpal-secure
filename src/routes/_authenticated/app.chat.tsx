import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useClinica } from "@/hooks/use-clinica";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { Plus, Send, Hash, User as UserIcon, Users, Trash2 } from "lucide-react";
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
  created_at: string;
};

type Membro = { user_id: string; nome: string | null };

function ChatPage() {
  const { user } = useAuth();
  const { clinicaAtual } = useClinica();
  const clinicaId = clinicaAtual?.clinica_id;

  const [canais, setCanais] = useState<Canal[]>([]);
  const [canalSel, setCanalSel] = useState<string | null>(null);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [autores, setAutores] = useState<Record<string, string>>({});
  const [nomesDiretos, setNomesDiretos] = useState<Record<string, string>>({});
  const [texto, setTexto] = useState("");
  const [openNovo, setOpenNovo] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [equipe, setEquipe] = useState<Membro[]>([]);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const listRef = useRef<HTMLDivElement>(null);

  // Carrega canais
  useEffect(() => {
    if (!clinicaId || !user) return;
    (async () => {
      const { data: mems } = await supabase.from("chat_membros").select("canal_id").eq("user_id", user.id);

      const ids = (mems ?? []).map((m: any) => m.canal_id);
      if (ids.length === 0) {
        setCanais([]);
        return;
      }

      const { data } = await supabase
        .from("chat_canais")
        .select("id, tipo, nome, clinica_id")
        .in("id", ids)
        .eq("clinica_id", clinicaId)
        .order("updated_at", { ascending: false });

      const canaisCarregados = (data ?? []) as Canal[];

      // Mapeamento dos nomes para conversas diretas
      const canaisDiretosIds = canaisCarregados.filter((c) => c.tipo === "direto").map((c) => c.id);
      if (canaisDiretosIds.length > 0) {
        const { data: outrosMembros } = await supabase
          .from("chat_membros")
          .select("canal_id, user_id")
          .in("canal_id", canaisDiretosIds)
          .neq("user_id", user.id);

        if (outrosMembros && outrosMembros.length > 0) {
          const outrosIds = Array.from(new Set(outrosMembros.map((m: any) => m.user_id)));
          const { data: profs } = await supabase.from("profiles").select("id, nome").in("id", outrosIds);

          const profsMap = Object.fromEntries((profs ?? []).map((p: any) => [p.id, p.nome]));
          const novosNomesDiretos: Record<string, string> = {};

          outrosMembros.forEach((m: any) => {
            novosNomesDiretos[m.canal_id] = profsMap[m.user_id] ?? "Usuário";
          });

          setNomesDiretos(novosNomesDiretos);
        }
      }

      setCanais(canaisCarregados);
      if (!canalSel && canaisCarregados.length > 0) setCanalSel(canaisCarregados[0].id);
    })();
  }, [clinicaId, user]);

  // Carrega equipe da clínica para criar canal
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
      const { data: profs } = await supabase.from("profiles").select("id, nome").in("id", ids);
      setEquipe(
        (profs ?? []).map((p: { id: string; nome: string | null }) => ({
          user_id: p.id,
          nome: p.nome,
        })),
      );
    })();
  }, [clinicaId]);

  // Carrega mensagens do canal + realtime
  useEffect(() => {
    if (!canalSel) return;
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("chat_mensagens")
        .select("id, canal_id, autor_id, texto, created_at")
        .eq("canal_id", canalSel)
        .is("deletada_em", null)
        .order("created_at", { ascending: true })
        .limit(200);
      if (!active) return;
      const msgs = (data ?? []) as Mensagem[];
      setMensagens(msgs);
      await carregarAutores(msgs);
      setTimeout(() => listRef.current?.scrollTo({ top: 99999 }), 50);
    })();

    const channel = supabase
      .channel(`chat:${canalSel}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_mensagens", filter: `canal_id=eq.${canalSel}` },
        async (payload) => {
          const m = payload.new as Mensagem;
          setMensagens((prev) => [...prev, m]);
          await carregarAutores([m]);
          setTimeout(() => listRef.current?.scrollTo({ top: 99999 }), 50);
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [canalSel]);

  async function carregarAutores(msgs: Mensagem[]) {
    const faltam = Array.from(new Set(msgs.map((m) => m.autor_id))).filter((id) => !autores[id]);
    if (faltam.length === 0) return;
    const { data } = await supabase.from("profiles").select("id, nome").in("id", faltam);
    setAutores((prev) => {
      const next = { ...prev };
      (data ?? []).forEach((p: { id: string; nome: string | null }) => {
        next[p.id] = p.nome ?? "Usuário";
      });
      return next;
    });
  }

  async function enviar() {
    if (!texto.trim() || !canalSel || !user || !clinicaId) return;
    const { error } = await supabase.from("chat_mensagens").insert({
      canal_id: canalSel,
      clinica_id: clinicaId,
      autor_id: user.id,
      texto: texto.trim(),
    });
    if (error) {
      mostrarErro(error);
      return;
    }
    setTexto("");
  }

  async function criarCanal() {
    if (!clinicaId || !user) return;
    if (selecionados.size === 0) {
      toast.error("Selecione ao menos um participante");
      return;
    }
    const tipo: Canal["tipo"] = selecionados.size === 1 ? "direto" : "grupo";
    const nome = tipo === "grupo" ? novoNome.trim() || "Novo grupo" : null;
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
      if (prof) {
        setNomesDiretos((prev) => ({ ...prev, [canal.id]: prof.nome ?? "Usuário" }));
      }
    }

    toast.success("Conversa iniciada");
    setCanais((p) => [canal as Canal, ...p]);
    setCanalSel(canal.id);
    setOpenNovo(false);
    setNovoNome("");
    setSelecionados(new Set());
  }

  async function excluirCanal(id: string) {
    if (!confirm("Tem certeza que deseja apagar esta conversa para todos?")) return;
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

  return (
    <div className="flex gap-4 h-[calc(100vh-7rem)]">
      <Card className="w-72 p-3 flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Conversas</h2>
          <Dialog open={openNovo} onOpenChange={setOpenNovo}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <Plus className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nova conversa</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Nome (para grupos)</Label>
                  <Input
                    value={novoNome}
                    onChange={(e) => setNovoNome(e.target.value)}
                    placeholder="Deixe em branco para conversar no privado..."
                  />
                </div>
                <div>
                  <Label>Participantes</Label>
                  <div className="max-h-64 overflow-auto border rounded mt-1">
                    {equipe
                      .filter((m) => m.user_id !== user?.id)
                      .map((m) => {
                        const sel = selecionados.has(m.user_id);
                        return (
                          <button
                            key={m.user_id}
                            type="button"
                            onClick={() => {
                              const s = new Set(selecionados);
                              if (sel) s.delete(m.user_id);
                              else s.add(m.user_id);
                              setSelecionados(s);
                            }}
                            className={`w-full text-left px-3 py-2 text-sm border-b last:border-b-0 transition-colors ${sel ? "bg-primary/20 font-medium" : "hover:bg-muted"}`}
                          >
                            {m.nome ?? "Usuário"}
                          </button>
                        );
                      })}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={criarCanal}>Iniciar Conversa</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        <div className="flex-1 overflow-auto space-y-1 pr-1">
          {canais.length === 0 && <p className="text-xs text-muted-foreground p-2">Sem conversas ainda</p>}
          {canais.map((c) => {
            const ativo = c.id === canalSel;
            const Icon = c.tipo === "direto" ? UserIcon : c.tipo === "setor" ? Hash : Users;
            const nomeDisplay = c.tipo === "direto" ? (nomesDiretos[c.id] ?? "Conversa direta") : (c.nome ?? "Grupo");

            return (
              <div
                key={c.id}
                className={`w-full flex items-center justify-between px-3 py-2 rounded text-sm group transition-colors cursor-pointer ${ativo ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                onClick={() => setCanalSel(c.id)}
              >
                <div className="flex-1 flex items-center gap-2 overflow-hidden">
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{nomeDisplay}</span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    void excluirCanal(c.id);
                  }}
                  className={`shrink-0 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive hover:text-destructive-foreground transition-opacity ${ativo ? "text-primary-foreground hover:bg-primary-foreground/20" : "text-muted-foreground"}`}
                  title="Excluir conversa"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="flex-1 flex flex-col">
        {!canalAtual ? (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            Selecione ou inicie uma conversa ao lado
          </div>
        ) : (
          <>
            <div className="px-4 py-3 border-b flex items-center justify-between bg-muted/30">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  {canalAtual.tipo === "direto" ? <UserIcon className="h-5 w-5" /> : <Users className="h-5 w-5" />}
                </div>
                <div>
                  <h3 className="font-semibold text-sm leading-none mb-1">{nomeAtual}</h3>
                  <Badge variant="secondary" className="text-[10px] h-4">
                    {canalAtual.tipo}
                  </Badge>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void excluirCanal(canalAtual.id)}
                className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-4 w-4 mr-1" /> Excluir
              </Button>
            </div>
            <div ref={listRef} className="flex-1 overflow-auto p-4 space-y-4">
              {mensagens.map((m) => {
                const meu = m.autor_id === user?.id;
                return (
                  <div key={m.id} className={`flex ${meu ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[70%] rounded-2xl px-4 py-2 text-sm shadow-sm ${meu ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted border rounded-bl-sm"}`}
                    >
                      {!meu && <p className="text-[11px] font-bold opacity-80 mb-1">{autores[m.autor_id] ?? "…"}</p>}
                      <p className="whitespace-pre-wrap break-words leading-relaxed">{m.texto}</p>
                      <p
                        className={`text-[10px] mt-1 text-right ${meu ? "text-primary-foreground/70" : "text-muted-foreground"}`}
                      >
                        {formatDateTime(m.created_at)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
            <form
              className="p-3 border-t bg-muted/20 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void enviar();
              }}
            >
              <Input
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="Escreva sua mensagem…"
                className="bg-background rounded-full px-4"
              />
              <Button type="submit" disabled={!texto.trim()} className="rounded-full h-10 w-10 p-0">
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </>
        )}
      </Card>
    </div>
  );
}
