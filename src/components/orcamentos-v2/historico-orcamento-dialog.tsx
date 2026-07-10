import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { mostrarErro } from "@/lib/traduzir-erro";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type AuditRow = {
  id: string;
  user_email: string | null;
  table_name: string;
  record_id: string | null;
  action: string;
  dados_antes: Record<string, unknown> | null;
  dados_depois: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
};

interface Props {
  open: boolean;
  onClose: () => void;
  orcamentoId: string;
  clinicaId: string;
}

/**
 * Diálogo de histórico do orçamento — replica a lógica de
 * `app.orcamentos.tsx` (clássico) para uso no shell V2. Só use
 * com role admin/gestor.
 */
export function HistoricoOrcamentoDialog({ open, onClose, orcamentoId, clinicaId }: Props) {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancel = false;
    setLoading(true);
    void (async () => {
      const { data: itens } = await supabase
        .from("orcamento_itens").select("id").eq("orcamento_id", orcamentoId);
      const itemIds = (itens ?? []).map((i) => i.id);
      const ids = [orcamentoId, ...itemIds];
      const { data, error } = await supabase
        .from("audit_log" as never)
        .select("*")
        .eq("clinica_id", clinicaId)
        .in("record_id", ids)
        .order("created_at", { ascending: false })
        .limit(500);
      if (cancel) return;
      setLoading(false);
      if (error) { mostrarErro(error); return; }
      setRows((data as unknown as AuditRow[]) ?? []);
    })();
    return () => { cancel = true; };
  }, [open, orcamentoId, clinicaId]);

  const label = (a: string) => a === "INSERT" ? "Criou" : a === "UPDATE" ? "Alterou" : a === "DELETE" ? "Excluiu"
    : a === "blocked_UPDATE" ? "Tentou alterar (bloqueado)" : a === "blocked_DELETE" ? "Tentou excluir (bloqueado)" : a;

  const diff = (r: AuditRow): string[] => {
    if (!r.dados_antes || !r.dados_depois) return [];
    const before = r.dados_antes as Record<string, unknown>;
    const after = r.dados_depois as Record<string, unknown>;
    const out: string[] = [];
    for (const k of Object.keys(after)) {
      if (k === "updated_at" || k === "atualizado_por") continue;
      const a = JSON.stringify(before[k] ?? null);
      const b = JSON.stringify(after[k] ?? null);
      if (a !== b) out.push(`${k}: ${a} → ${b}`);
    }
    return out;
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto" data-testid="orcamento-historico-dialog">
        <DialogHeader><DialogTitle>Histórico do orçamento</DialogTitle></DialogHeader>
        {loading ? (
          <p className="py-8 text-center text-muted-foreground">Carregando…</p>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">Nenhum registro de alteração.</p>
        ) : (
          <div className="space-y-3">
            {rows.map((r) => {
              const isBlocked = r.action.startsWith("blocked_");
              const isItem = r.table_name === "orcamento_itens";
              const changes = diff(r);
              return (
                <div key={r.id} className={`border rounded p-3 text-sm ${isBlocked ? "border-rose-300 bg-rose-50" : ""}`}>
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <div className="font-medium">{label(r.action)} {isItem ? "item" : "orçamento"}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.user_email ?? "—"} · {new Date(r.created_at).toLocaleString("pt-BR")}
                        {r.ip_address ? ` · IP ${r.ip_address}` : ""}
                      </div>
                    </div>
                  </div>
                  {changes.length > 0 && (
                    <ul className="mt-2 text-xs font-mono text-muted-foreground space-y-0.5">
                      {changes.map((c, i) => <li key={i}>• {c}</li>)}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}