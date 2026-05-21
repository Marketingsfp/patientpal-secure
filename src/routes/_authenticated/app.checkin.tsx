import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { BadgeCheck, Search, ConciergeBell } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/checkin")({
  component: CheckinPage,
  head: () => ({ meta: [{ title: "Check-in de pacientes — ClinicaOS" }] }),
});

type Item = {
  id: string;
  paciente_nome: string;
  paciente_id: string | null;
  inicio: string;
  procedimento: string | null;
  fluxo_etapa: string;
  medicos?: { nome: string } | null;
  pacientes?: { cpf: string | null; telefone: string | null; foto_url: string | null } | null;
};

function normalizar(t: string) {
  return (t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function CheckinPage() {
  const { clinicaAtual } = useClinica();
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10));
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [busca, setBusca] = useState("");

  const load = useCallback(async () => {
    if (!clinicaAtual) return;
    setLoading(true);
    const inicio = new Date(`${data}T00:00:00`).toISOString();
    const fim = new Date(`${data}T23:59:59`).toISOString();
    const { data: ags, error } = await supabase
      .from("agendamentos")
      .select("id,paciente_nome,paciente_id,inicio,procedimento,fluxo_etapa,medicos(nome),pacientes(cpf,telefone,foto_url)")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .gte("inicio", inicio)
      .lte("inicio", fim)
      .in("fluxo_etapa", ["aguardando_recepcao", "recepcao"])
      .neq("status", "cancelado")
      .order("inicio", { ascending: true });
    if (error) { setLoading(false); toast.error(error.message); return; }
    const ids = (ags ?? []).map((a) => a.id);
    let pagos = new Set<string>();
    if (ids.length) {
      const { data: pg } = await supabase
        .from("fin_lancamentos")
        .select("agendamento_id")
        .eq("clinica_id", clinicaAtual.clinica_id)
        .eq("tipo", "receita")
        .in("agendamento_id", ids);
      pagos = new Set(((pg ?? []) as Array<{ agendamento_id: string | null }>)
        .map((r) => r.agendamento_id).filter((x): x is string => !!x));
    }
    setItems(((ags ?? []) as Item[]).filter((a) => pagos.has(a.id)));
    setLoading(false);
  }, [clinicaAtual, data]);

  useEffect(() => { void load(); }, [load]);

  const filtrados = useMemo(() => {
    const b = normalizar(busca.trim());
    if (!b) return items;
    return items.filter((a) => {
      const cpf = (a.pacientes?.cpf ?? "").replace(/\D/g, "");
      return normalizar(a.paciente_nome).includes(b) || cpf.includes(b.replace(/\D/g, ""));
    });
  }, [items, busca]);

  const confirmar = async (a: Item) => {
    const { error } = await supabase
      .from("agendamentos")
      .update({ fluxo_etapa: "triagem", fluxo_atualizado_em: new Date().toISOString() } as never)
      .eq("id", a.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Presença de ${a.paciente_nome} confirmada — liberado para triagem`);
    setItems((xs) => xs.filter((x) => x.id !== a.id));
  };

  const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ConciergeBell className="h-6 w-6" /> Check-in de pacientes
          </h1>
          <p className="text-sm text-muted-foreground">
            Pacientes que já pagaram e estão aguardando confirmação de presença no balcão.
          </p>
        </div>
        <Badge variant="outline" className="text-base px-3 py-1">
          {filtrados.length} aguardando
        </Badge>
      </div>

      <Card className="p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-3">
          <div className="space-y-1.5">
            <Label>Data</Label>
            <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Buscar paciente (nome ou CPF)</Label>
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Digite o nome ou CPF..."
                autoFocus
              />
            </div>
          </div>
        </div>
      </Card>

      {loading ? (
        <p className="text-sm text-muted-foreground p-4">Carregando...</p>
      ) : filtrados.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          Nenhum paciente aguardando check-in para esta data.
        </Card>
      ) : (
        <div className="grid gap-2">
          {filtrados.map((a) => (
            <Card key={a.id} className="p-3 flex items-center gap-3 flex-wrap">
              {a.pacientes?.foto_url ? (
                <img src={a.pacientes.foto_url} alt="" className="h-12 w-12 rounded-full object-cover border" />
              ) : (
                <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center font-semibold text-muted-foreground">
                  {a.paciente_nome.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-[200px]">
                <div className="font-semibold flex items-center gap-2">
                  {a.paciente_nome}
                  <Badge className="bg-emerald-600 text-white">PAGO</Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  {hora(a.inicio)} • {a.medicos?.nome ?? "—"} • {a.procedimento ?? "CONSULTA"}
                  {a.pacientes?.cpf && ` • CPF ${a.pacientes.cpf}`}
                  {a.pacientes?.telefone && ` • ${a.pacientes.telefone}`}
                </div>
              </div>
              <Button
                onClick={() => confirmar(a)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <BadgeCheck className="h-4 w-4 mr-2" /> Confirmar presença
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}