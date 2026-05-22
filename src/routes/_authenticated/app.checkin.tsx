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
import { BadgeCheck, Search, ConciergeBell, X } from "lucide-react";

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
  paciente?: { cpf: string | null; telefone: string | null; foto_url: string | null } | null;
  pago?: boolean;
};

const ETAPAS_CHECKIN = ["aguardando_recepcao", "recepcao"] as const;

function estaPendenteCheckin(etapa: string) {
  return (ETAPAS_CHECKIN as readonly string[]).includes(etapa);
}

function etapaLabel(etapa: string) {
  const labels: Record<string, string> = {
    aguardando_recepcao: "AGUARDANDO RECEPÇÃO",
    recepcao: "RECEPÇÃO",
    triagem: "CHECK-IN JÁ REALIZADO",
    atendimento: "EM ATENDIMENTO",
    caixa: "NO CAIXA",
  };
  return labels[etapa] ?? etapa.replace(/_/g, " ").toUpperCase();
}

function normalizar(t: string) {
  return (t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function apenasDigitos(t: string) {
  return (t || "").replace(/\D/g, "");
}

function itemCombinaComBuscaPaciente(a: Item, termo: string) {
  const buscaNormalizada = normalizar(termo.trim());
  const buscaCpf = apenasDigitos(termo);
  if (!buscaNormalizada && !buscaCpf) return true;
  const cpf = apenasDigitos(a.paciente?.cpf ?? "");
  return normalizar(a.paciente_nome).includes(buscaNormalizada) || (!!buscaCpf && cpf.includes(buscaCpf));
}

function CheckinPage() {
  const { clinicaAtual } = useClinica();
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10));
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [buscaAmpla, setBuscaAmpla] = useState(false);

  const load = useCallback(async () => {
    if (!clinicaAtual) return;
    setLoading(true);
    const inicio = new Date(`${data}T00:00:00`).toISOString();
    const fim = new Date(`${data}T23:59:59`).toISOString();
    let query = supabase
      .from("agendamentos")
      .select("id,paciente_nome,paciente_id,inicio,procedimento,fluxo_etapa,medicos(nome)")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .gte("inicio", inicio)
      .lte("inicio", fim)
      .neq("status", "cancelado")
      .not("paciente_id", "is", null);
    // Modo padrão (sem clicar Buscar): só etapas de check-in.
    // Modo ampliado (clicou Buscar): traz o dia inteiro, qualquer etapa.
    if (!buscaAmpla) query = query.in("fluxo_etapa", ETAPAS_CHECKIN);
    const { data: ags, error } = await query.order("inicio", { ascending: true });
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
    const base = ((ags ?? []) as unknown as Item[]);
    const candidatos = buscaAmpla ? base : base.filter((a) => pagos.has(a.id));
    const pacIds = Array.from(new Set(candidatos.map((a) => a.paciente_id).filter((x): x is string => !!x)));
    const pacMap = new Map<string, { cpf: string | null; telefone: string | null; foto_url: string | null }>();
    if (pacIds.length) {
      const { data: pacs } = await supabase
        .from("pacientes")
        .select("id,cpf,telefone,foto_url")
        .in("id", pacIds);
      (pacs ?? []).forEach((p) => pacMap.set(p.id, { cpf: p.cpf, telefone: p.telefone, foto_url: p.foto_url }));
    }
    const comPaciente = candidatos.map((a) => ({
      ...a,
      paciente: a.paciente_id ? pacMap.get(a.paciente_id) ?? null : null,
      pago: pagos.has(a.id),
    }));
    const termoAplicado = buscaAplicada.trim();
    setItems(
      buscaAmpla && termoAplicado.length > 0
        ? comPaciente.filter((a) => itemCombinaComBuscaPaciente(a, termoAplicado))
        : comPaciente,
    );
    setLoading(false);
  }, [clinicaAtual, data, buscaAmpla, buscaAplicada]);

  useEffect(() => { void load(); }, [load]);

  const filtrados = useMemo(() => {
    if (buscaAmpla) return items;
    return items.filter((a) => itemCombinaComBuscaPaciente(a, busca));
  }, [items, busca, buscaAmpla]);

  const acionarBusca = () => { setBuscaAplicada(busca.trim()); setBuscaAmpla(true); };
  const limparBusca = () => { setBusca(""); setBuscaAplicada(""); setBuscaAmpla(false); };

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
            {buscaAmpla
              ? "Modo busca ampliada: mostrando todos os agendados do dia ainda sem check-in."
              : "Pacientes que já pagaram e estão aguardando confirmação de presença no balcão."}
          </p>
        </div>
        <Badge variant="outline" className="text-base px-3 py-1">
          {filtrados.length} {buscaAmpla ? "resultado(s)" : "aguardando"}
        </Badge>
      </div>

      <Card className="p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-[180px_1fr_auto] gap-3 items-end">
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
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); acionarBusca(); } }}
                placeholder="Digite o nome ou CPF..."
                autoFocus
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={acionarBusca} className="bg-primary text-primary-foreground">
              <Search className="h-4 w-4 mr-2" /> Buscar
            </Button>
            {buscaAmpla && (
              <Button variant="outline" onClick={limparBusca}>
                <X className="h-4 w-4 mr-2" /> Limpar
              </Button>
            )}
          </div>
        </div>
        {buscaAmpla && (
          <p className="text-xs text-muted-foreground">
            Dica: com nome ou CPF digitado, a busca também mostra pacientes já avançados para triagem, atendimento ou caixa.
          </p>
        )}
      </Card>

      {loading ? (
        <p className="text-sm text-muted-foreground p-4">Carregando...</p>
      ) : filtrados.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          {buscaAmpla
            ? "Nenhum agendamento pendente de check-in encontrado para esta data."
            : "Nenhum paciente aguardando check-in para esta data."}
        </Card>
      ) : (
        <div className="grid gap-2">
          {filtrados.map((a) => (
            <Card key={a.id} className="p-3 flex items-center gap-3 flex-wrap">
              {a.paciente?.foto_url ? (
                <img src={a.paciente.foto_url} alt="" className="h-12 w-12 rounded-full object-cover border" />
              ) : (
                <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center font-semibold text-muted-foreground">
                  {a.paciente_nome.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-[200px]">
                <div className="font-semibold flex items-center gap-2">
                  {a.paciente_nome}
                  {a.pago ? (
                    <Badge className="bg-emerald-600 text-white">PAGO</Badge>
                  ) : (
                    <Badge className="bg-amber-500 text-white">PAGAMENTO PENDENTE</Badge>
                  )}
                  {!estaPendenteCheckin(a.fluxo_etapa) && (
                    <Badge variant="outline">{etapaLabel(a.fluxo_etapa)}</Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {hora(a.inicio)} • {a.medicos?.nome ?? "—"} • {a.procedimento ?? "CONSULTA"}
                  {a.paciente?.cpf && ` • CPF ${a.paciente.cpf}`}
                  {a.paciente?.telefone && ` • ${a.paciente.telefone}`}
                </div>
              </div>
              {estaPendenteCheckin(a.fluxo_etapa) ? (
                <Button
                  onClick={() => confirmar(a)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <BadgeCheck className="h-4 w-4 mr-2" /> Confirmar presença
                </Button>
              ) : (
                <Button variant="outline" disabled>
                  {etapaLabel(a.fluxo_etapa)}
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}