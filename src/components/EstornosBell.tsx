import { useEffect, useState, useCallback } from "react";
import { Bell, Check, X, ExternalLink, Undo2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface Solic {
  id: string;
  paciente_nome: string | null;
  descricao: string | null;
  valor: number | null;
  motivo: string;
  solicitado_em: string;
  solicitado_por: string;
}

/** Solicitação própria já decidida pelo financeiro — o retorno para quem pediu. */
interface Resposta {
  id: string;
  paciente_nome: string | null;
  descricao: string | null;
  valor: number | null;
  motivo: string;
  status: "aprovado" | "rejeitado" | string;
  resposta: string | null;
  resolvido_em: string | null;
}

const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Quem pediu o estorno não era avisado da decisão: o financeiro aprovava ou
// recusava e a recepção só descobria olhando o botão do caixa voltar ao normal.
// As respostas ficam visíveis no sino por alguns dias; o "já vi" é guardado no
// próprio navegador (localStorage) para não precisar de coluna nova no banco.
const DIAS_VISIVEIS = 7;
const MAX_LIDAS_GUARDADAS = 200;

const chaveLidas = (userId: string) => `estorno_respostas_lidas_${userId}`;

/**
 * Quem enxerga a fila de estornos pendentes DA CLÍNICA INTEIRA.
 *
 * O balão trazia nome do paciente, descrição e valor de cada pedido — repasse
 * médico incluído — para qualquer pessoa logada, porque a consulta só filtrava
 * por clínica. Nos computadores da recepção, dos consultórios e do laboratório
 * isso é informação financeira que não tem nada a ver com o trabalho de lá.
 *
 * Agora a fila só é carregada para quem trabalha no dinheiro: caixa,
 * financeiro, supervisor, gestor e administrador. Para os demais perfis a
 * consulta nem sai do navegador e o sino não é montado — some do cabeçalho.
 *
 * A resposta do financeiro ao pedido QUE A PRÓPRIA PESSOA FEZ continua chegando
 * para todo mundo: é o retorno do trabalho dela, não a fila dos outros.
 */
const PAPEIS_DO_CAIXA = ["admin", "gestor", "supervisor", "caixa", "financeiro"];

function lerLidas(userId: string | undefined): Set<string> {
  if (!userId) return new Set();
  try {
    const raw = localStorage.getItem(chaveLidas(userId));
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

function gravarLidas(userId: string | undefined, ids: Set<string>) {
  if (!userId) return;
  try {
    // Mantém só as últimas para o registro não crescer sem limite.
    const arr = Array.from(ids).slice(-MAX_LIDAS_GUARDADAS);
    localStorage.setItem(chaveLidas(userId), JSON.stringify(arr));
  } catch {
    /* navegador sem localStorage — o aviso apenas reaparece, não quebra nada */
  }
}

export function EstornosBell() {
  const { clinicaAtual } = useClinica();
  const { user } = useAuth();
  const [items, setItems] = useState<Solic[]>([]);
  const [respostas, setRespostas] = useState<Resposta[]>([]);
  const [lidas, setLidas] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);

  // Segue a matriz de Perfis de Acesso (módulo "financeiro"), não mais uma
  // lista fixa de papéis.
  const podeAprovar = usePodeEscrever("financeiro");

  // Ver a fila da clínica é mais restrito do que aprovar: aqui vale o papel,
  // porque é ele que separa o balcão do caixa. Sem isso, o perfil "médico" ou
  // "recepção" chegava a ler valor e paciente de todo pedido em aberto.
  const podeVerFila = PAPEIS_DO_CAIXA.includes(clinicaAtual?.role ?? "");

  const load = useCallback(async () => {
    // A trava começa aqui, na consulta: para quem não é do caixa a lista nem
    // é pedida ao banco, então não há como ela aparecer na tela por engano.
    if (!clinicaAtual || !podeVerFila) {
      setItems([]);
      return;
    }
    const { data } = await supabase
      .from("estorno_solicitacoes")
      .select("id, paciente_nome, descricao, valor, motivo, solicitado_em, solicitado_por")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .eq("status", "pendente")
      .order("solicitado_em", { ascending: false })
      .limit(20);
    setItems((data ?? []) as Solic[]);
  }, [clinicaAtual, podeVerFila]);

  // Respostas do financeiro às solicitações QUE EU MESMO enviei.
  const loadRespostas = useCallback(async () => {
    if (!clinicaAtual || !user) {
      setRespostas([]);
      return;
    }
    const corte = new Date(Date.now() - DIAS_VISIVEIS * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from("estorno_solicitacoes")
      .select("id, paciente_nome, descricao, valor, motivo, status, resposta, resolvido_em")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .eq("solicitado_por", user.id)
      .in("status", ["aprovado", "rejeitado"])
      .gte("resolvido_em", corte)
      .order("resolvido_em", { ascending: false })
      .limit(20);
    setRespostas((data ?? []) as Resposta[]);
  }, [clinicaAtual, user]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadRespostas();
  }, [loadRespostas]);

  useEffect(() => {
    setLidas(lerLidas(user?.id));
  }, [user?.id]);

  // Realtime
  useEffect(() => {
    if (!clinicaAtual || !user) return;
    // A assinatura de tempo real também é estreitada: quem não é do caixa só
    // escuta os PRÓPRIOS pedidos, para receber o "aprovado/recusado". Assim o
    // movimento de estorno dos outros nem trafega para a máquina da recepção,
    // do consultório ou do laboratório.
    const filtro = podeVerFila
      ? `clinica_id=eq.${clinicaAtual.clinica_id}`
      : `solicitado_por=eq.${user.id}`;
    const ch = supabase
      .channel(`estornos-${clinicaAtual.clinica_id}-${podeVerFila ? "fila" : user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "estorno_solicitacoes",
          filter: filtro,
        },
        (payload) => {
          void load();
          void loadRespostas();
          // Toast quando uma nova solicitação chega (e não foi eu)
          if (
            payload.eventType === "INSERT" &&
            podeAprovar &&
            (payload.new as { solicitado_por?: string } | null)?.solicitado_por !== user?.id
          ) {
            const n = payload.new as { paciente_nome?: string | null; valor?: number | null };
            toast.warning("Nova solicitação de estorno", {
              description: `${n.paciente_nome ?? "—"} • ${n.valor != null ? fmt(Number(n.valor)) : ""}`,
            });
          }
          // Toast para QUEM PEDIU quando o financeiro decide. A tabela está com
          // REPLICA IDENTITY FULL, então `payload.old` traz o status anterior e
          // dá para disparar só na transição de pendente -> decidido.
          if (payload.eventType === "UPDATE") {
            const antes = payload.old as { status?: string } | null;
            const depois = payload.new as {
              status?: string;
              solicitado_por?: string;
              paciente_nome?: string | null;
              resposta?: string | null;
            } | null;
            const decidiu =
              antes?.status === "pendente" &&
              (depois?.status === "aprovado" || depois?.status === "rejeitado");
            if (decidiu && depois?.solicitado_por === user?.id) {
              const paciente = depois.paciente_nome ?? "sem paciente";
              if (depois.status === "aprovado") {
                toast.success("Seu estorno foi aprovado", {
                  description: `${paciente}${depois.resposta ? ` — ${depois.resposta}` : ""}`,
                  duration: 10000,
                });
              } else {
                toast.error("Seu estorno foi recusado", {
                  description: `${paciente}${depois.resposta ? ` — motivo: ${depois.resposta}` : ""}`,
                  duration: 10000,
                });
              }
            }
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [clinicaAtual, load, loadRespostas, podeAprovar, podeVerFila, user]);

  const naoLidas = respostas.filter((r) => !lidas.has(r.id));
  const count = items.length + naoLidas.length;

  // Sem fila para acompanhar e sem resposta pendente, o sino não tem o que
  // mostrar: some do cabeçalho em vez de abrir um balão vazio.
  if (!podeVerFila && naoLidas.length === 0) return null;

  const marcarLida = (id: string) => {
    const novo = new Set(lidas);
    novo.add(id);
    setLidas(novo);
    gravarLidas(user?.id, novo);
  };

  const marcarTodasLidas = () => {
    const novo = new Set(lidas);
    naoLidas.forEach((r) => novo.add(r.id));
    setLidas(novo);
    gravarLidas(user?.id, novo);
  };

  const cancelar = async (id: string) => {
    const { error } = await supabase
      .from("estorno_solicitacoes")
      .update({ status: "cancelado", resolvido_em: new Date().toISOString() })
      .eq("id", id);
    if (error) mostrarErro(error);
    else {
      toast.success("Solicitação cancelada");
      void load();
    }
  };

  const rejeitar = async (id: string) => {
    if (!user) return;
    const resp = window.prompt("Motivo da recusa (opcional):") ?? "";
    const { error } = await supabase
      .from("estorno_solicitacoes")
      .update({
        status: "rejeitado",
        resolvido_por: user.id,
        resolvido_em: new Date().toISOString(),
        resposta: resp || null,
      })
      .eq("id", id);
    if (error) mostrarErro(error);
    else {
      toast.success("Recusado");
      void load();
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 w-9 p-0 rounded-full relative"
          title={
            !podeVerFila
              ? `${naoLidas.length} resposta(s) do financeiro`
              : count > 0
                ? `${items.length} estorno(s) pendente(s) e ${naoLidas.length} resposta(s) do financeiro`
                : "Notificações"
          }
        >
          <Bell className="h-4 w-4" />
          {count > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[11px] leading-[18px] font-bold text-center">
              {count > 9 ? "9+" : count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0 max-h-[480px] overflow-auto">
        <div className="px-3 py-2 border-b flex items-center gap-2 sticky top-0 bg-background">
          <Undo2 className="h-4 w-4 text-rose-600" />
          <strong className="text-sm">
            {podeVerFila ? "Solicitações de estorno" : "Respostas do financeiro"}
          </strong>
          {podeVerFila && (
            <span className="text-xs text-muted-foreground ml-auto">
              {items.length} pendente(s)
            </span>
          )}
        </div>

        {naoLidas.length > 0 && (
          <div className="border-b bg-muted/40">
            <div className="px-3 py-1.5 flex items-center gap-2">
              {/* Sem a fila acima, o título já é este no cabeçalho do balão. */}
              {podeVerFila && <strong className="text-xs">Respostas do financeiro</strong>}
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-[12px] ml-auto"
                onClick={marcarTodasLidas}
              >
                Marcar tudo como visto
              </Button>
            </div>
            <ul className="divide-y">
              {naoLidas.map((r) => {
                const aprovado = r.status === "aprovado";
                return (
                  <li key={r.id} className="p-3 text-sm space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">
                          {r.paciente_nome ?? "Sem paciente"}
                        </div>
                        {r.descricao && (
                          <div className="text-xs text-muted-foreground truncate">
                            {r.descricao}
                          </div>
                        )}
                      </div>
                      <span
                        className={`text-[11px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap ${
                          aprovado
                            ? "bg-emerald-100 text-emerald-900 border border-emerald-300"
                            : "bg-rose-100 text-rose-900 border border-rose-300"
                        }`}
                      >
                        {aprovado ? "Aprovado" : "Recusado"}
                      </span>
                    </div>
                    <div className="text-xs italic text-muted-foreground">"{r.motivo}"</div>
                    {r.resposta && (
                      <div className="text-xs">
                        <span className="text-muted-foreground">Financeiro: </span>
                        {r.resposta}
                      </div>
                    )}
                    {!r.resposta && !aprovado && (
                      <div className="text-xs text-muted-foreground">
                        O financeiro não escreveu um motivo.
                      </div>
                    )}
                    <div className="flex items-center gap-2 pt-1">
                      <span className="text-[11px] text-muted-foreground">
                        {r.resolvido_em ? new Date(r.resolvido_em).toLocaleString("pt-BR") : ""}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-[12px] ml-auto"
                        onClick={() => marcarLida(r.id)}
                      >
                        <Check className="h-3 w-3 mr-1" /> Ok, vi
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {count === 0 && (
          <div className="p-6 text-sm text-center text-muted-foreground">
            Nenhuma solicitação pendente.
          </div>
        )}
        <ul className="divide-y">
          {items.map((s) => {
            const minha = s.solicitado_por === user?.id;
            return (
              <li key={s.id} className="p-3 text-sm space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{s.paciente_nome ?? "Sem paciente"}</div>
                    {s.descricao && (
                      <div className="text-xs text-muted-foreground truncate">{s.descricao}</div>
                    )}
                  </div>
                  {s.valor != null && (
                    <div className="font-semibold whitespace-nowrap">{fmt(Number(s.valor))}</div>
                  )}
                </div>
                <div className="text-xs italic text-muted-foreground">"{s.motivo}"</div>
                <div className="text-[11px] text-muted-foreground">
                  {new Date(s.solicitado_em).toLocaleString("pt-BR")}
                </div>
                <div className="flex gap-1.5 pt-1">
                  {podeAprovar && (
                    <Link to="/app/financeiro/estorno" onClick={() => setOpen(false)}>
                      <Button size="sm" variant="default" className="h-7 text-xs">
                        <ExternalLink className="h-3 w-3 mr-1" /> Abrir financeiro
                      </Button>
                    </Link>
                  )}
                  {podeAprovar && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => rejeitar(s.id)}
                    >
                      <X className="h-3 w-3 mr-1" /> Recusar
                    </Button>
                  )}
                  {minha && !podeAprovar && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => cancelar(s.id)}
                    >
                      Cancelar
                    </Button>
                  )}
                  {!podeAprovar && !minha && (
                    <span className="text-xs text-muted-foreground italic flex items-center gap-1">
                      <Check className="h-3 w-3" /> aguardando financeiro
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
