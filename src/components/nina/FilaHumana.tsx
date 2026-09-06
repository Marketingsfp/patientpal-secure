import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Inbox, RefreshCw, AlertTriangle } from "lucide-react";
import { useClinica } from "@/hooks/use-clinica";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import { listarFilaHumana } from "@/lib/atendimento.functions";
import { tituloConversa } from "@/lib/atendimento/rotulo-conversa";

type ConversaFila = {
  id: string;
  contato_nome: string | null;
  contato_telefone: string | null;
  pacientes?: { nome?: string | null } | null;
  prioridade: number | null;
  aguardando_desde: string | null;
  handoff_motivo: string | null;
  handoff_resumo: { resumo?: string; urgencia?: string } | null;
  ultima_msg_preview: string | null;
  posicao: number;
};

function espera(desde?: string | null) {
  if (!desde) return "—";
  const seg = Math.max(0, Math.round((Date.now() - new Date(desde).getTime()) / 1000));
  if (seg < 60) return `${seg}s`;
  if (seg < 3600) return `${Math.round(seg / 60)}min`;
  return `${(seg / 3600).toFixed(1)}h`;
}

/**
 * Fila de conversas que a Nina encaminhou para atendimento humano.
 * Não há ação manual: assim que alguém fica online, o sistema distribui
 * automaticamente as conversas para quem tem menos conversas ativas.
 */
export function FilaHumana(_props: { onAssumida?: (conversaId: string) => void } = {}) {
  const { clinicaAtual } = useClinica();
  const clinicaId = clinicaAtual?.clinica_id;
  const listarFn = useServerFn(listarFilaHumana);
  const [rows, setRows] = useState<ConversaFila[]>([]);
  const [loading, setLoading] = useState(false);

  const carregar = useCallback(async () => {
    if (!clinicaId) return;
    setLoading(true);
    try {
      const r = (await listarFn({ data: { clinicaId, limit: 100 } })) as unknown as ConversaFila[];
      setRows(r ?? []);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao carregar a fila");
    } finally {
      setLoading(false);
    }
  }, [clinicaId, listarFn]);

  useEffect(() => {
    void carregar();
    const t = setInterval(() => void carregar(), 20000);
    return () => clearInterval(t);
  }, [carregar]);

  useRealtimeRefresh(["atend_conversas"], carregar);

  if (rows.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-atd-border bg-atd-surface px-3 py-1.5 text-xs text-atd-ink-soft">
        <Inbox className="h-3.5 w-3.5" />
        <span>Não atribuídas: 0 — tudo distribuído entre os atendentes online.</span>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto h-6 px-2"
          onClick={carregar}
          disabled={loading}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="py-2 flex-row items-center gap-2 space-y-0">
        <Inbox className="h-4 w-4 text-atd-danger" />
        <CardTitle className="text-base text-atd-danger-ink">🔴 Não atribuídas</CardTitle>
        <Badge className="ml-1 bg-atd-danger text-atd-on-strong">
          {rows.length}
        </Badge>
        <Button size="sm" variant="ghost" className="ml-auto" onClick={carregar} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent className="pt-0">
        {(


          <div className="space-y-2">
            {rows.map((c) => {
              const urgente = (c.prioridade ?? 0) >= 2;
              return (
                <div
                  key={c.id}
                  className={`flex items-start gap-3 rounded-lg border p-3 ${
                    urgente
                      ? "border-atd-danger bg-atd-danger-bg"
                      : "border-atd-border bg-atd-surface"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-sm truncate" title={tituloConversa(c)}>
                        {tituloConversa(c)}
                      </span>
                      <Badge variant="outline" className="text-[11px]">
                        #{c.posicao} na fila
                      </Badge>
                      <Badge variant="secondary" className="text-[11px]">
                        esperando {espera(c.aguardando_desde)}
                      </Badge>
                      {urgente && (
                        <Badge className="bg-atd-danger-bg text-atd-danger-ink text-[11px] border border-atd-danger/40">
                          <AlertTriangle className="h-3 w-3 mr-1" /> urgente
                        </Badge>
                      )}
                    </div>
                    {c.contato_telefone && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {c.contato_telefone}
                      </p>
                    )}
                    {c.handoff_motivo && (
                      <p className="text-xs text-muted-foreground mt-1">
                        <span className="font-medium">Motivo:</span> {c.handoff_motivo}
                      </p>
                    )}
                    {c.handoff_resumo?.resumo && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        <span className="font-medium">Resumo da Nina:</span>{" "}
                        {c.handoff_resumo.resumo}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
