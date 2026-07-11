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

const fmt = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function EstornosBell() {
  const { clinicaAtual } = useClinica();
  const { user } = useAuth();
  const [items, setItems] = useState<Solic[]>([]);
  const [open, setOpen] = useState(false);

  // Segue a matriz de Perfis de Acesso (módulo "financeiro"), não mais uma
  // lista fixa de papéis.
  const podeAprovar = usePodeEscrever("financeiro");

  const load = useCallback(async () => {
    if (!clinicaAtual) { setItems([]); return; }
    const { data } = await supabase
      .from("estorno_solicitacoes")
      .select("id, paciente_nome, descricao, valor, motivo, solicitado_em, solicitado_por")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .eq("status", "pendente")
      .order("solicitado_em", { ascending: false })
      .limit(20);
    setItems((data ?? []) as Solic[]);
  }, [clinicaAtual]);

  useEffect(() => { void load(); }, [load]);

  // Realtime
  useEffect(() => {
    if (!clinicaAtual) return;
    const ch = supabase
      .channel(`estornos-${clinicaAtual.clinica_id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "estorno_solicitacoes", filter: `clinica_id=eq.${clinicaAtual.clinica_id}` },
        (payload) => {
          void load();
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
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [clinicaAtual, load, podeAprovar, user?.id]);

  const count = items.length;

  const cancelar = async (id: string) => {
    const { error } = await supabase
      .from("estorno_solicitacoes")
      .update({ status: "cancelado", resolvido_em: new Date().toISOString() })
      .eq("id", id);
    if (error) mostrarErro(error); else { toast.success("Solicitação cancelada"); void load(); }
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
    if (error) mostrarErro(error); else { toast.success("Recusado"); void load(); }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 w-9 p-0 rounded-full relative"
          title={count > 0 ? `${count} solicitação(ões) de estorno` : "Notificações"}
        >
          <Bell className="h-4 w-4" />
          {count > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] leading-[18px] font-bold text-center">
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
                <div className="text-[10px] text-muted-foreground">
                  {new Date(s.solicitado_em).toLocaleString("pt-BR")}
                </div>
                <div className="flex gap-1.5 pt-1">
                  {podeAprovar && (
                    <Link to="/app/financeiro/atendimentos" onClick={() => setOpen(false)}>
                      <Button size="sm" variant="default" className="h-7 text-xs">
                        <ExternalLink className="h-3 w-3 mr-1" /> Abrir financeiro
                      </Button>
                    </Link>
                  )}
                  {podeAprovar && (
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => rejeitar(s.id)}>
                      <X className="h-3 w-3 mr-1" /> Recusar
                    </Button>
                  )}
                  {minha && !podeAprovar && (
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => cancelar(s.id)}>
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