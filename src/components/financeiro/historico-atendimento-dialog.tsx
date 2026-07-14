import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type Props = {
  open: boolean;
  onClose: () => void;
  lancamentoId?: string | null;
  agendamentoId?: string | null;
  clinicaId?: string | null;
};

type Row = {
  id: string;
  action: string;
  table_name: string;
  user_id: string | null;
  user_email: string | null;
  created_at: string;
  dados_antes: unknown;
  dados_depois: unknown;
};

const ACTION_LABEL: Record<string, string> = {
  INSERT: "Criação",
  UPDATE: "Alteração",
  DELETE: "Exclusão",
};

export function HistoricoAtendimentoDialog({ open, onClose, lancamentoId, agendamentoId, clinicaId }: Props) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [autores, setAutores] = useState<Record<string, { nome: string; papel: "medico" | "funcionario" | "desconhecido" }>>({});

  useEffect(() => {
    if (!open) return;
    const ids = [lancamentoId, agendamentoId].filter((x): x is string => !!x);
    if (!ids.length || !clinicaId) {
      setRows([]);
      return;
    }
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from("audit_log")
        .select("id, action, table_name, user_id, user_email, created_at, dados_antes, dados_depois")
        .eq("clinica_id", clinicaId)
        .in("record_id", ids)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) {
        setRows([]);
        setLoading(false);
        return;
      }
      const list = (data ?? []) as Row[];
      setRows(list);
      // Resolve autores
      const userIds = Array.from(new Set(list.map((r) => r.user_id).filter((x): x is string => !!x)));
      if (userIds.length) {
        const [{ data: profs }, { data: meds }] = await Promise.all([
          supabase.from("profiles").select("id, nome, email").in("id", userIds),
          supabase.from("medicos").select("user_id, nome").in("user_id", userIds),
        ]);
        const map: Record<string, { nome: string; papel: "medico" | "funcionario" | "desconhecido" }> = {};
        const medUserIds = new Set((meds ?? []).map((m: any) => m.user_id));
        for (const p of profs ?? []) {
          const nome = (p as any).nome || (p as any).email || "Usuário";
          map[(p as any).id] = {
            nome,
            papel: medUserIds.has((p as any).id) ? "medico" : "funcionario",
          };
        }
        for (const m of meds ?? []) {
          const uid = (m as any).user_id as string;
          if (!map[uid]) map[uid] = { nome: (m as any).nome, papel: "medico" };
        }
        setAutores(map);
      } else {
        setAutores({});
      }
      setLoading(false);
    })();
  }, [open, lancamentoId, agendamentoId, clinicaId]);

  function autorDe(r: Row) {
    if (r.user_id && autores[r.user_id]) return autores[r.user_id];
    return { nome: r.user_email || "Sistema", papel: "desconhecido" as const };
  }

  function descricaoAcao(r: Row): string {
    const antes = (r.dados_antes ?? {}) as Record<string, unknown>;
    const depois = (r.dados_depois ?? {}) as Record<string, unknown>;
    if (r.action === "INSERT") {
      if (r.table_name === "fin_lancamentos" || r.table_name === "fin_atendimentos") return "Pagamento registrado";
      return ACTION_LABEL[r.action] ?? r.action;
    }
    if (r.action === "DELETE") return "Registro excluído / estornado";
    // UPDATE
    if (antes && depois) {
      if (antes.repasse_pago === false && depois.repasse_pago === true) return "Baixa do repasse realizada";
      if (antes.repasse_pago === true && depois.repasse_pago === false) return "Baixa do repasse desfeita";
      if (antes.status !== depois.status) return `Status: ${String(antes.status ?? "-")} → ${String(depois.status ?? "-")}`;
    }
    return "Alteração";
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Histórico do atendimento</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando...
          </div>
        ) : rows.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Nenhum registro de histórico encontrado.</div>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto divide-y">
            {rows.map((r) => {
              const a = autorDe(r);
              return (
                <div key={r.id} className="py-3 space-y-1">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="font-medium text-sm">{descricaoAcao(r)}</div>
                    <div className="text-xs text-muted-foreground">
                      {format(new Date(r.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Por: <span className="text-foreground">{a.nome}</span></span>
                    {a.papel === "medico" && <Badge variant="secondary" className="text-[10px]">Médico</Badge>}
                    {a.papel === "funcionario" && <Badge variant="outline" className="text-[10px]">Funcionário</Badge>}
                    <span className="ml-auto text-[10px] opacity-60">{r.table_name}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}