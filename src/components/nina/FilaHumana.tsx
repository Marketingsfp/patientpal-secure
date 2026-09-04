import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Inbox, Hand, RefreshCw, AlertTriangle } from "lucide-react";
import { useClinica } from "@/hooks/use-clinica";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import { listarFilaHumana, assumirConversa } from "@/lib/atendimento.functions";

type ConversaFila = {
  id: string;
  contato_nome: string | null;
  contato_telefone: string | null;
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
 * O atendente clica em "Assumir": a trava é feita no banco, então dois
 * cliques simultâneos nunca colocam duas pessoas na mesma conversa.
 */
export function FilaHumana({ onAssumida }: { onAssumida?: (conversaId: string) => void }) {
  const { clinicaAtual } = useClinica();
  const clinicaId = clinicaAtual?.clinica_id;
  const listarFn = useServerFn(listarFilaHumana);
  const assumirFn = useServerFn(assumirConversa);
  const [rows, setRows] = useState<ConversaFila[]>([]);
  const [loading, setLoading] = useState(false);
  const [claiming, setClaiming] = useState<string | null>(null);

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

  const assumir = async (c: ConversaFila) => {
    if (!clinicaId) return;
    setClaiming(c.id);
    try {
      const r = (await assumirFn({ data: { clinicaId, conversaId: c.id } })) as {
        ok: boolean;
        motivo: string | null;
      };
      if (!r.ok) {
        toast.warning("Outro atendente assumiu esta conversa primeiro.");
      } else {
        toast.success("Conversa assumida — a Nina parou de responder.");
        onAssumida?.(c.id);
      }
      await carregar();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao assumir");
    } finally {
      setClaiming(null);
    }
  };

  if (rows.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5 text-xs text-muted-foreground">
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
        <Inbox className="h-4 w-4" />
        <CardTitle className="text-base">Não atribuídas</CardTitle>
        <Badge variant="default" className="ml-1">
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
                  className={`flex items-start gap-3 rounded-lg border p-3 ${urgente ? "border-rose-300 bg-rose-500/5" : ""}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-sm truncate">
                        {c.contato_nome || c.contato_telefone || "—"}
                      </span>
                      <Badge variant="outline" className="text-[11px]">
                        #{c.posicao} na fila
                      </Badge>
                      <Badge variant="secondary" className="text-[11px]">
                        esperando {espera(c.aguardando_desde)}
                      </Badge>
                      {urgente && (
                        <Badge className="bg-rose-500/15 text-rose-600 text-[11px]">
                          <AlertTriangle className="h-3 w-3 mr-1" /> urgente
                        </Badge>
                      )}
                    </div>
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
                  <Button size="sm" onClick={() => assumir(c)} disabled={claiming === c.id}>
                    <Hand className="h-3.5 w-3.5 mr-1" />
                    {claiming === c.id ? "Assumindo…" : "Assumir"}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
