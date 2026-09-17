import { useEffect, useState, useCallback } from "react";
import { Bell, Check, X, ExternalLink, Undo2 } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
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

const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// O sino mostra EXCLUSIVAMENTE pedidos com status "pendente", do mais novo para
// o mais antigo. Antes ele também listava, por 7 dias e acima da fila, os
// pedidos da própria pessoa já aprovados/recusados; como o "já vi" ficava só no
// navegador, em outro computador esses itens voltavam, empurravam as
// solicitações novas para o fim do balão e inflavam o número do sino. Quem
// pediu continua sendo avisado da decisão pelo toast em tempo real.

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
 * para todo mundo, como toast: é o retorno do trabalho dela, não a fila dos outros.
 */
const PAPEIS_DO_CAIXA = ["admin", "gestor", "supervisor", "caixa", "financeiro"];

export function EstornosBell() {
  const { clinicaAtual } = useClinica();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<Solic[]>([]);
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

  useEffect(() => {
    void load();
  }, [load]);

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
          // Toast quando uma nova solicitação chega (e não foi eu)
          if (
            payload.eventType === "INSERT" &&
            podeAprovar &&
            (payload.new as { solicitado_por?: string } | null)?.solicitado_por !== user?.id
          ) {
            const n = payload.new as { paciente_nome?: string | null; valor?: number | null };
            // Card próprio (em vez de toast.warning) para ter o X de fechar e
            // levar direto à tela de Estorno ao clicar no corpo do aviso.
            toast.custom((id) => (
              <div
                role="button"
                tabIndex={0}
                onClick={() => {
                  toast.dismiss(id);
                  void navigate({ to: "/app/financeiro/estorno" });
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toast.dismiss(id);
                    void navigate({ to: "/app/financeiro/estorno" });
                  }
                }}
                className="relative flex w-89 max-w-full cursor-pointer items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-4 pr-9 text-amber-900 shadow-lg hover:bg-amber-100"
              >
                <Undo2 className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">Nova solicitação de estorno</p>
                  <p className="truncate text-sm">
                    {`${n.paciente_nome ?? "—"} • ${n.valor != null ? fmt(Number(n.valor)) : ""}`}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Fechar aviso"
                  onClick={(e) => {
                    e.stopPropagation();
                    toast.dismiss(id);
                  }}
                  onKeyDown={(e) => e.stopPropagation()}
                  className="absolute right-2 top-2 rounded p-1 text-amber-800 hover:bg-amber-200"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ));
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
  }, [clinicaAtual, load, navigate, podeAprovar, podeVerFila, user]);

  const count = items.length;

  // Quem não é do caixa não tem fila para ver: o sino some do cabeçalho, mas o
  // componente continua montado para disparar o toast da decisão do financeiro.
  if (!podeVerFila) return null;

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
          title={count > 0 ? `${count} estorno(s) pendente(s)` : "Notificações"}
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
          <strong className="text-sm">Solicitações de estorno</strong>
          <span className="text-xs text-muted-foreground ml-auto">{count} pendente(s)</span>
        </div>

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
