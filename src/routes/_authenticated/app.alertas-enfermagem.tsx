import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { BellRing, Phone, CheckCircle2, MessageCircle, Clock, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/alertas-enfermagem")({
  component: AlertasEnfermagemPage,
  head: () => ({ meta: [{ title: "Enfermeira IA — Alertas — ClinicaOS" }] }),
});

type Status = "aberto" | "em_contato" | "resolvido" | "sem_contato";
type Severidade = "pendente" | "normal" | "alterado" | "critico";
type Alerta = {
  id: string;
  paciente_id: string | null;
  paciente_nome: string | null;
  origem: string;
  origem_id: string | null;
  severidade: Severidade;
  titulo: string;
  descricao: string | null;
  mensagem_sugerida: string | null;
  status: Status;
  observacao_contato: string | null;
  contatado_em: string | null;
  resolvido_em: string | null;
  created_at: string;
};

const SEV_COR: Record<Severidade, string> = {
  pendente: "bg-muted text-muted-foreground",
  normal: "bg-emerald-500/15 text-emerald-700",
  alterado: "bg-amber-500/15 text-amber-700",
  critico: "bg-red-500/15 text-red-700",
};

function AlertasEnfermagemPage() {
  const { clinicaAtual } = useClinica();
  const podeEscrever = usePodeEscrever("alertas-enfermagem");
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [filtro, setFiltro] = useState<"aberto" | "todos">("aberto");
  const [loading, setLoading] = useState(true);
  const [obs, setObs] = useState<Record<string, string>>({});

  const clinicaId = clinicaAtual?.clinica_id;

  const load = async () => {
    if (!clinicaId) return;
    setLoading(true);
    let q = supabase.from("alertas_enfermagem")
      .select("*").eq("clinica_id", clinicaId)
      .order("severidade", { ascending: false })
      .order("created_at", { ascending: false }).limit(100);
    if (filtro === "aberto") q = q.in("status", ["aberto", "em_contato"]);
    const { data } = await q;
    setAlertas((data as Alerta[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [clinicaId, filtro]);

  const updateStatus = async (a: Alerta, novo: Status) => {
    if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
    const observacao = obs[a.id] ?? a.observacao_contato ?? null;
    const patch: Partial<Alerta> = { status: novo, observacao_contato: observacao };
    if (novo === "em_contato") patch.contatado_em = new Date().toISOString();
    if (novo === "resolvido") patch.resolvido_em = new Date().toISOString();
    const { error } = await supabase.from("alertas_enfermagem").update(patch as never).eq("id", a.id);
    if (error) return mostrarErro(error);
    toast.success("Alerta atualizado");
    load();
  };

  const abertos = alertas.filter((a) => a.status === "aberto").length;
  const criticos = alertas.filter((a) => a.severidade === "critico" && a.status !== "resolvido").length;

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-2 flex-wrap">
        <BellRing className="h-6 w-6 text-red-500" />
        <h1 className="text-2xl font-bold">Enfermeira IA — Alertas</h1>
        <Badge variant="destructive" className="ml-2">{criticos} críticos</Badge>
        <Badge variant="secondary">{abertos} abertos</Badge>
        <div className="ml-auto">
          <Select value={filtro} onValueChange={(v) => setFiltro(v as typeof filtro)}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="aberto">Em aberto</SelectItem>
              <SelectItem value="todos">Todos</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading && <Loader2 className="h-5 w-5 animate-spin" />}
      {!loading && alertas.length === 0 && (
        <Card className="p-6 text-center text-muted-foreground">Nenhum alerta {filtro === "aberto" ? "aberto" : ""}.</Card>
      )}

      <div className="space-y-3">
        {alertas.map((a) => (
          <Card key={a.id} className="p-4 border-l-4"
            style={{ borderLeftColor: a.severidade === "critico" ? "#dc2626" : a.severidade === "alterado" ? "#d97706" : "#16a34a" }}>
            <div className="flex items-start gap-3 flex-wrap">
              <div className="flex-1 min-w-[260px]">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className={`uppercase ${SEV_COR[a.severidade]}`}>{a.severidade}</Badge>
                  <Badge variant="outline">{a.status}</Badge>
                  <span className="font-semibold">{a.titulo}</span>
                </div>
                <div className="text-sm text-muted-foreground mt-0.5">
                  {a.paciente_nome ?? "—"} · {new Date(a.created_at).toLocaleString("pt-BR")}
                </div>
                {a.descricao && <p className="text-sm mt-2">{a.descricao}</p>}
                {a.mensagem_sugerida && (
                  <div className="mt-2 bg-muted/40 p-3 rounded text-sm">
                    <div className="flex items-center gap-1 text-xs uppercase font-semibold text-muted-foreground mb-1">
                      <MessageCircle className="h-3 w-3" /> Mensagem sugerida ao paciente
                    </div>
                    <p className="whitespace-pre-wrap">{a.mensagem_sugerida}</p>
                  </div>
                )}
                <div className="mt-2">
                  <Textarea
                    rows={2}
                    placeholder="Observação do contato (ex.: ligado às 14h, paciente confirmou agendamento)"
                    value={obs[a.id] ?? a.observacao_contato ?? ""}
                    onChange={(e) => setObs((o) => ({ ...o, [a.id]: e.target.value }))}
                  />
                </div>
              </div>
              {podeEscrever && (
                <div className="flex flex-col gap-2 min-w-[180px]">
                  <Button size="sm" variant="outline" onClick={() => updateStatus(a, "em_contato")}>
                    <Phone className="h-4 w-4 mr-1" /> Em contato
                  </Button>
                  <Button size="sm" onClick={() => updateStatus(a, "resolvido")}>
                    <CheckCircle2 className="h-4 w-4 mr-1" /> Resolvido
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => updateStatus(a, "sem_contato")}>
                    <Clock className="h-4 w-4 mr-1" /> Sem contato
                  </Button>
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
