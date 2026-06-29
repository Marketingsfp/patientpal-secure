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

import { Plus, Send, Hash, User as UserIcon, Users } from "lucide-react";

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
      const { data: mems } = await supabase

        .from("chat_membros")

        .select("canal_id")

        .eq("user_id", user.id);

      const ids = (mems ?? []).map((m) => m.canal_id);

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

      setCanais((data ?? []) as Canal[]);

      if (!canalSel && data && data.length > 0) setCanalSel(data[0].id);
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

      const ids = (mems ?? []).map((m) => m.user_id);

      if (ids.length === 0) {
        setEquipe([]);

        return;
      }

      const { data: profs } = await supabase

        .from("profiles")

        .select("id, nome")

        .in("id", ids);

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
      toast.error(error.message);

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
      toast.error(error?.message ?? "Falha ao criar canal");

      return;
    }

    const membros = [user.id, ...Array.from(selecionados)].map((uid) => ({
      canal_id: canal.id,

      user_id: uid,
    }));

    const { error: e2 } = await supabase.from("chat_membros").insert(membros);

    if (e2) {
      toast.error(e2.message);

      return;
    }

    toast.success("Canal criado");

    setCanais((p) => [canal as Canal, ...p]);

    setCanalSel(canal.id);

    setOpenNovo(false);

    setNovoNome("");

    setSelecionados(new Set());
  }

  const canalAtual = useMemo(() => canais.find((c) => c.id === canalSel), [canais, canalSel]);

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
                    placeholder="Ex.: Equipe Recepção"
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
                            className={`w-full text-left px-3 py-2 text-sm border-b last:border-b-0 ${sel ? "bg-primary/10" : "hover:bg-muted"}`}
                          >
                            {m.nome ?? "Usuário"}
                          </button>
                        );
                      })}
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button onClick={criarCanal}>Criar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex-1 overflow-auto space-y-1">
          {canais.length === 0 && <p className="text-xs text-muted-foreground p-2">Sem conversas ainda</p>}

          {canais.map((c) => {
            const ativo = c.id === canalSel;

            const Icon = c.tipo === "direto" ? UserIcon : c.tipo === "setor" ? Hash : Users;

            return (
              <button
                key={c.id}
                onClick={() => setCanalSel(c.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded text-sm text-left ${ativo ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              >
                <Icon className="h-4 w-4 shrink-0" />

                <span className="truncate">{c.nome ?? "Conversa direta"}</span>
              </button>
            );
          })}
        </div>
      </Card>

      <Card className="flex-1 flex flex-col">
        {!canalAtual ? (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            Selecione ou crie uma conversa
          </div>
        ) : (
          <>
            <div className="px-4 py-3 border-b flex items-center gap-2">
              <h3 className="font-semibold">{canalAtual.nome ?? "Conversa direta"}</h3>

              <Badge variant="secondary">{canalAtual.tipo}</Badge>
            </div>

            <div ref={listRef} className="flex-1 overflow-auto p-4 space-y-3">
              {mensagens.map((m) => {
                const meu = m.autor_id === user?.id;

                return (
                  <div key={m.id} className={`flex ${meu ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[70%] rounded-2xl px-3 py-2 text-sm ${meu ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                    >
                      {!meu && (
                        <p className="text-[11px] font-semibold opacity-70 mb-0.5">{autores[m.autor_id] ?? "…"}</p>
                      )}

                      <p className="whitespace-pre-wrap break-words">{m.texto}</p>

                      <p className="text-[10px] opacity-60 mt-1">{formatDateTime(m.created_at)}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <form
              className="p-3 border-t flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void enviar();
              }}
            >
              <Input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Mensagem…" />

              <Button type="submit" disabled={!texto.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </>
        )}
      </Card>
    </div>
  );
}
