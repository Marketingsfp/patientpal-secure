import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { mostrarErro } from "@/lib/traduzir-erro";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

type AuditRow = {
  id: string;
  user_email: string | null;
  user_id: string | null;
  table_name: string;
  record_id: string | null;
  action: string;
  dados_antes: Record<string, unknown> | null;
  dados_depois: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
};

interface Props {
  open: boolean;
  onClose: () => void;
  lancamentoId: string;
  agendamentoId?: string | null;
  clinicaId: string;
}

// Campos irrelevantes/ruído no diff — omitidos.
const IGNORAR = new Set([
  "updated_at",
  "atualizado_por",
  "created_at",
  "criado_por",
]);

// Rótulos amigáveis para os campos alterados.
const LABEL_CAMPO: Record<string, string> = {
  valor: "Valor",
  valor_medico_override: "Valor do médico",
  forma_pagamento: "Forma de pagamento",
  descricao: "Descrição",
  status: "Status",
  data: "Data",
  repasse_pago: "Repasse pago",
  repasse_pago_em: "Data da baixa",
  repasse_pago_por: "Responsável pela baixa",
  repasse_forma_pagamento: "Forma do repasse",
  observacoes: "Observações",
  paciente_nome: "Paciente",
  procedimento: "Procedimento",
  inicio: "Início",
};

const fmtVal = (v: unknown): string => {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "sim" : "não";
  return String(v);
};

export function HistoricoAtendimentoDialog({
  open,
  onClose,
  lancamentoId,
  agendamentoId,
  clinicaId,
}: Props) {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [autores, setAutores] = useState<Map<string, { nome: string; papel: "medico" | "funcionario" }>>(new Map());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancel = false;
    setLoading(true);
    void (async () => {
      const ids = [lancamentoId, agendamentoId].filter(Boolean) as string[];
      const { data, error } = await supabase
        .from("audit_log" as never)
        .select("*")
        .eq("clinica_id", clinicaId)
        .in("record_id", ids)
        .order("created_at", { ascending: false })
        .limit(300);
      if (cancel) return;
      if (error) {
        setLoading(false);
        mostrarErro(error);
        return;
      }
      const list = (data as unknown as AuditRow[]) ?? [];
      setRows(list);

      // Resolve autores → nome + papel (médico/funcionário)
      const userIds = Array.from(new Set(list.map((r) => r.user_id).filter(Boolean))) as string[];
      const map = new Map<string, { nome: string; papel: "medico" | "funcionario" }>();
      if (userIds.length) {
        const [{ data: profs }, { data: meds }] = await Promise.all([
          supabase.from("profiles").select("id, nome").in("id", userIds),
          supabase.from("medicos").select("user_id, nome").in("user_id", userIds),
        ]);
        const medUsers = new Set(((meds ?? []) as Array<{ user_id: string | null }>).map((m) => m.user_id).filter(Boolean) as string[]);
        ((profs ?? []) as Array<{ id: string; nome: string | null }>).forEach((p) => {
          map.set(p.id, {
            nome: p.nome ?? "—",
            papel: medUsers.has(p.id) ? "medico" : "funcionario",
          });
        });
        // médicos sem profile (raro): usa nome do cadastro
        ((meds ?? []) as Array<{ user_id: string | null; nome: string }>).forEach((m) => {
          if (m.user_id && !map.has(m.user_id)) {
            map.set(m.user_id, { nome: m.nome, papel: "medico" });
          }
        });
      }
      if (!cancel) {
        setAutores(map);
        setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [open, lancamentoId, agendamentoId, clinicaId]);

  const rotulo = (r: AuditRow): string => {
    const isLanc = r.table_name === "fin_lancamentos";
    const isAgend = r.table_name === "agendamentos";
    if (isLanc && r.action === "INSERT") return "Pagamento registrado";
    if (isLanc && r.action === "UPDATE") {
      const antes = (r.dados_antes ?? {}) as Record<string, unknown>;
      const depois = (r.dados_depois ?? {}) as Record<string, unknown>;
      if (antes.repasse_pago === false && depois.repasse_pago === true) return "Baixa do repasse realizada";
      if (antes.repasse_pago === true && depois.repasse_pago === false) return "Baixa do repasse desfeita";
      if (antes.status !== depois.status && depois.status === "cancelado") return "Lançamento estornado";
      return "Lançamento editado";
    }
    if (isLanc && r.action === "DELETE") return "Lançamento excluído";
    if (isAgend && r.action === "UPDATE") {
      const antes = (r.dados_antes ?? {}) as Record<string, unknown>;
      const depois = (r.dados_depois ?? {}) as Record<string, unknown>;
      if (!antes.executado_por && depois.executado_por) return "Baixa realizada (agenda)";
      if (antes.executado_por && !depois.executado_por) return "Baixa desfeita (agenda)";
      return "Agendamento alterado";
    }
    if (isAgend && r.action === "INSERT") return "Agendamento criado";
    if (r.action.startsWith("blocked_")) return `Tentativa bloqueada (${r.action.replace("blocked_", "")})`;
    return `${r.table_name} · ${r.action}`;
  };

  const diff = (r: AuditRow): Array<{ campo: string; antes: string; depois: string }> => {
    if (!r.dados_antes || !r.dados_depois) return [];
    const antes = r.dados_antes as Record<string, unknown>;
    const depois = r.dados_depois as Record<string, unknown>;
    const out: Array<{ campo: string; antes: string; depois: string }> = [];
    for (const k of Object.keys(depois)) {
      if (IGNORAR.has(k)) continue;
      const a = JSON.stringify(antes[k] ?? null);
      const b = JSON.stringify(depois[k] ?? null);
      if (a !== b) {
        out.push({
          campo: LABEL_CAMPO[k] ?? k,
          antes: fmtVal(antes[k]),
          depois: fmtVal(depois[k]),
        });
      }
    }
    return out;
  };

  const autorInfo = (r: AuditRow) => {
    const a = r.user_id ? autores.get(r.user_id) : undefined;
    return {
      nome: a?.nome ?? r.user_email ?? "Sistema",
      papel: a?.papel,
      email: r.user_email,
    };
  };

  // ordena cronologicamente (mais antigo → mais recente) para leitura em linha do tempo
  const ordenadas = [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at));

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto" data-testid="historico-atendimento-dialog">
        <DialogHeader>
          <DialogTitle>Histórico do atendimento</DialogTitle>
        </DialogHeader>
        {loading ? (
          <p className="py-8 text-center text-muted-foreground">Carregando…</p>
        ) : ordenadas.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">
            Nenhum evento registrado para este atendimento.
          </p>
        ) : (
          <div className="space-y-3">
            {ordenadas.map((r) => {
              const info = autorInfo(r);
              const isBlocked = r.action.startsWith("blocked_");
              const changes = diff(r);
              return (
                <div
                  key={r.id}
                  className={`border rounded p-3 text-sm ${isBlocked ? "border-rose-300 bg-rose-50" : ""}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium flex items-center gap-2 flex-wrap">
                        {rotulo(r)}
                        {info.papel === "medico" && (
                          <Badge variant="secondary" className="text-[10px]">Médico</Badge>
                        )}
                        {info.papel === "funcionario" && (
                          <Badge variant="outline" className="text-[10px]">Funcionário</Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Por <strong>{info.nome}</strong>
                        {info.email && info.nome !== info.email ? ` (${info.email})` : ""} ·{" "}
                        {new Date(r.created_at).toLocaleString("pt-BR")}
                        {r.ip_address ? ` · IP ${r.ip_address}` : ""}
                      </div>
                    </div>
                  </div>
                  {changes.length > 0 && (
                    <ul className="mt-2 text-xs space-y-0.5">
                      {changes.map((c, i) => (
                        <li key={i}>
                          <span className="text-muted-foreground">{c.campo}:</span>{" "}
                          <span className="line-through text-muted-foreground">{c.antes}</span>{" "}
                          <span aria-hidden>→</span>{" "}
                          <span className="font-medium">{c.depois}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground pt-2 border-t">
          Registros podem estar ausentes para eventos anteriores à ativação da auditoria.
        </p>
      </DialogContent>
    </Dialog>
  );
}