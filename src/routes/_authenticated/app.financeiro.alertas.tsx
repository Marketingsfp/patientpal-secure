import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/app/financeiro/alertas")({
  component: Page,
  head: () => ({ meta: [{ title: "Alertas — Financeiro" }] }),
});

interface Alerta {
  id: string; tipo_alerta: string; mensagem: string; data_alerta: string; lido: boolean;
}

function Page() {
  const { clinicaAtual } = useClinica();
  const podeEscrever = usePodeEscrever("financeiro");
  const [items, setItems] = useState<Alerta[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!clinicaAtual) { setItems([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase.from("fin_alertas")
      .select("id, tipo_alerta, mensagem, data_alerta, lido")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .order("lido").order("data_alerta", { ascending: false });
    if (error) mostrarErro(error); else setItems((data ?? []) as Alerta[]);
    setLoading(false);
  };
  useEffect(() => { void load(); }, [clinicaAtual?.clinica_id]);

  const marcar = async (a: Alerta) => {
    if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
    const { error } = await supabase.from("fin_alertas").update({ lido: !a.lido }).eq("id", a.id);
    if (error) mostrarErro(error); else await load();
  };
  const remove = async (a: Alerta) => {
    if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
    if (!confirm("Excluir alerta?")) return;
    const { error } = await supabase.from("fin_alertas").delete().eq("id", a.id);
    if (error) mostrarErro(error); else { toast.success("Removido"); await load(); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Alertas</h1>
        <p className="text-sm text-muted-foreground">Notificações automáticas do sistema financeiro</p>
      </div>
      {loading ? <Card><CardContent className="py-12 text-center text-muted-foreground">Carregando...</CardContent></Card>
        : items.length === 0 ? <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhum alerta no momento.</CardContent></Card>
        : <div className="space-y-2">{items.map((a) => (
          <Card key={a.id} className={a.lido ? "opacity-60" : ""}>
            <CardContent className="pt-4 pb-4 flex items-center gap-3">
              <AlertTriangle className={`h-5 w-5 ${a.lido ? "text-muted-foreground" : "text-amber-500"}`} />
              <div className="flex-1 min-w-0">
                <p className="font-medium">{a.mensagem}</p>
                <p className="text-xs text-muted-foreground">{new Date(a.data_alerta).toLocaleDateString("pt-BR")}</p>
              </div>
              <Badge variant="outline">{a.tipo_alerta}</Badge>
              {podeEscrever && (
                <>
                  <Button variant="ghost" size="icon" onClick={() => marcar(a)}>
                    <CheckCircle2 className={`h-4 w-4 ${a.lido ? "text-green-600" : ""}`} />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => remove(a)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </>
              )}
            </CardContent>
          </Card>))}</div>}
    </div>
  );
}
