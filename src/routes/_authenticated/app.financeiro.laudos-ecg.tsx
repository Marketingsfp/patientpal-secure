import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { mostrarErro } from "@/lib/traduzir-erro";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollText, Calculator, Send } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/financeiro/laudos-ecg")({
  component: LaudosEcgPage,
  head: () => ({ meta: [{ title: "Laudos ECG — ClinicaOS" }] }),
});

type AgendaOpt = { id: string; nome: string };
type Config = {
  laudador_medico_id: string;
  laudador_nome: string;
  tipo_repasse: "percentual" | "valor";
  percentual: number | null;
  valor: number | null;
};
type LinhaCalc = {
  laudador_medico_id: string;
  laudador_nome: string;
  tipo_repasse: "percentual" | "valor";
  base: string; // texto explicativo do cálculo
  valor_sugerido: number;
  valor_editado: string;
};

const fmt = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
const primeiroDiaMes = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};
const hoje = () => new Date().toISOString().slice(0, 10);

function LaudosEcgPage() {
  const { clinicaAtual } = useClinica();
  const clinicaId = clinicaAtual?.clinica_id ?? null;

  const [agendas, setAgendas] = useState<AgendaOpt[]>([]);
  const [agendaId, setAgendaId] = useState<string>("");
  const [inicio, setInicio] = useState(primeiroDiaMes());
  const [fim, setFim] = useState(hoje());

  const [totalEcgs, setTotalEcgs] = useState(0);
  const [somaFaturado, setSomaFaturado] = useState(0);
  const [configs, setConfigs] = useState<Config[]>([]);
  const [linhas, setLinhas] = useState<LinhaCalc[]>([]);
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [obs, setObs] = useState("");

  // Carrega agendas com laudo terceiro cadastrado
  useEffect(() => {
    if (!clinicaId) return;
    void (async () => {
      const { data } = await supabase
        .from("medico_repasse_laudo")
        .select("agenda_medico_id, agenda:medicos!medico_repasse_laudo_agenda_medico_id_fkey(id, nome, ativo)")
        .eq("clinica_id", clinicaId);
      const seen = new Set<string>();
      const opts: AgendaOpt[] = [];
      for (const r of (data as any[]) ?? []) {
        const a = r?.agenda;
        if (!a?.id || seen.has(a.id) || a.ativo === false) continue;
        seen.add(a.id);
        opts.push({ id: a.id, nome: a.nome });
      }
      opts.sort((a, b) => a.nome.localeCompare(b.nome));
      setAgendas(opts);
      if (opts.length && !agendaId) setAgendaId(opts[0].id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicaId]);

  const calcular = async () => {
    if (!clinicaId || !agendaId) {
      toast.error("Selecione uma agenda de exame.");
      return;
    }
    setLoading(true);
    try {
      // 1) Config de laudadores
      const { data: configsData, error: eConf } = await supabase
        .from("medico_repasse_laudo")
        .select("laudador_medico_id, tipo_repasse, percentual, valor, laudador:medicos!medico_repasse_laudo_laudador_medico_id_fkey(nome)")
        .eq("clinica_id", clinicaId)
        .eq("agenda_medico_id", agendaId)
        .eq("ativo", true);
      if (eConf) throw eConf;
      const cfgs: Config[] = ((configsData as any[]) ?? []).map((c) => ({
        laudador_medico_id: c.laudador_medico_id,
        laudador_nome: c.laudador?.nome ?? "?",
        tipo_repasse: c.tipo_repasse,
        percentual: c.percentual != null ? Number(c.percentual) : null,
        valor: c.valor != null ? Number(c.valor) : null,
      })).filter((c) => (c.tipo_repasse === "percentual" ? (c.percentual ?? 0) > 0 : (c.valor ?? 0) > 0));
      setConfigs(cfgs);

      // 2) Atendimentos da agenda no período
      const { data: atends, error: eA } = await supabase
        .from("fin_atendimentos")
        .select("id, valor_total, status")
        .eq("clinica_id", clinicaId)
        .eq("medico_id", agendaId)
        .gte("data", inicio)
        .lte("data", fim);
      if (eA) throw eA;
      // Considera atendimentos não cancelados
      const validos = ((atends as any[]) ?? []).filter((a) => a.status !== "cancelado");
      const qtd = validos.length;
      const soma = validos.reduce((s, a) => s + Number(a.valor_total ?? 0), 0);
      setTotalEcgs(qtd);
      setSomaFaturado(soma);

      // 3) Linhas de cálculo
      setLinhas(cfgs.map((c) => {
        let sugerido = 0;
        let base = "";
        if (c.tipo_repasse === "percentual") {
          sugerido = soma * ((c.percentual ?? 0) / 100);
          base = `${c.percentual}% de ${fmt(soma)}`;
        } else {
          sugerido = (c.valor ?? 0) * qtd;
          base = `${fmt(c.valor ?? 0)} × ${qtd} exame${qtd === 1 ? "" : "s"}`;
        }
        sugerido = Math.round(sugerido * 100) / 100;
        return {
          laudador_medico_id: c.laudador_medico_id,
          laudador_nome: c.laudador_nome,
          tipo_repasse: c.tipo_repasse,
          base,
          valor_sugerido: sugerido,
          valor_editado: sugerido.toFixed(2),
        };
      }));
    } catch (e) {
      mostrarErro(e);
    } finally {
      setLoading(false);
    }
  };

  const totalLote = useMemo(
    () => linhas.reduce((s, l) => s + (Number(l.valor_editado) || 0), 0),
    [linhas],
  );

  const lancar = async () => {
    if (!clinicaId || !agendaId) return;
    const itens = linhas.filter((l) => Number(l.valor_editado) > 0);
    if (!itens.length) {
      toast.error("Nenhum valor a lançar.");
      return;
    }
    setSalvando(true);
    try {
      // 1) Cria lote
      const { data: userRes } = await supabase.auth.getUser();
      const { data: lote, error: eL } = await supabase
        .from("fin_laudo_lotes")
        .insert({
          clinica_id: clinicaId,
          agenda_medico_id: agendaId,
          periodo_inicio: inicio,
          periodo_fim: fim,
          total_ecgs: totalEcgs,
          total_repasse: totalLote,
          observacoes: obs || null,
          criado_por: userRes?.user?.id ?? null,
        })
        .select("id")
        .single();
      if (eL) throw eL;
      const loteId = (lote as { id: string }).id;

      // 2) Cria um fin_lancamento (despesa) por laudador
      const descBase = `Repasse laudo ECG ${inicio.split("-").reverse().join("/")}–${fim.split("-").reverse().join("/")}`;
      const rows = itens.map((l) => ({
        clinica_id: clinicaId,
        tipo: "despesa" as const,
        descricao: `${descBase} — ${l.laudador_nome}`,
        valor: Number(l.valor_editado),
        data: hoje(),
        status: "pendente" as const,
        medico_id: l.laudador_medico_id,
        observacoes: `Lote de laudo terceiro. Base: ${l.base}. ${obs ? `Obs: ${obs}` : ""}`.trim(),
        laudo_lote_id: loteId,
      }));
      const { error: eIns } = await supabase.from("fin_lancamentos").insert(rows as never);
      if (eIns) throw eIns;

      toast.success(`Lote criado: ${itens.length} lançamento(s), total ${fmt(totalLote)}.`);
      setLinhas([]);
      setTotalEcgs(0);
      setSomaFaturado(0);
      setObs("");
    } catch (e) {
      mostrarErro(e);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <ScrollText className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-semibold">Laudos ECG — repasse por período</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Selecione a agenda de exame (ex.: ELETROCARDIOGRAMA) e o período. O sistema pré-calcula o repasse
        de cada laudador conforme cadastrado na aba <b>Laudo Terceiro</b> do médico-agenda.
        Os valores são editáveis antes de lançar.
      </p>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label>Agenda de exame</Label>
            <Select value={agendaId} onValueChange={setAgendaId}>
              <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
              <SelectContent>
                {agendas.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-muted-foreground">
                    Nenhuma agenda com laudo terceiro cadastrado.
                  </div>
                ) : agendas.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>De</Label>
            <Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Até</Label>
            <Input type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button type="button" onClick={calcular} disabled={loading || !agendaId} className="w-full">
              <Calculator className="h-4 w-4 mr-2" />
              {loading ? "Calculando…" : "Calcular"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {linhas.length > 0 && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground uppercase tracking-wide">Exames no período</div><div className="text-2xl font-bold">{totalEcgs}</div></CardContent></Card>
            <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground uppercase tracking-wide">Faturado</div><div className="text-2xl font-bold">{fmt(somaFaturado)}</div></CardContent></Card>
            <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground uppercase tracking-wide">Total do lote</div><div className="text-2xl font-bold">{fmt(totalLote)}</div></CardContent></Card>
          </div>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Repasses sugeridos</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Laudador</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Base do cálculo</TableHead>
                    <TableHead className="text-right w-40">Valor a lançar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhas.map((l, i) => (
                    <TableRow key={l.laudador_medico_id}>
                      <TableCell className="font-medium">{l.laudador_nome}</TableCell>
                      <TableCell><Badge variant="outline">{l.tipo_repasse === "percentual" ? "%" : "R$"}</Badge></TableCell>
                      <TableCell className="text-sm text-muted-foreground">{l.base}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          step="0.01"
                          min={0}
                          value={l.valor_editado}
                          onChange={(e) => setLinhas((rows) => rows.map((r, j) => j === i ? { ...r, valor_editado: e.target.value } : r))}
                          className="text-right"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="mt-4 space-y-2">
                <Label>Observações do lote (opcional)</Label>
                <Input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: lote referente à competência de julho" />
              </div>

              <div className="mt-4 flex justify-end">
                <Button onClick={lancar} disabled={salvando || totalLote <= 0}>
                  <Send className="h-4 w-4 mr-2" />
                  {salvando ? "Lançando…" : `Lançar ${fmt(totalLote)} em despesas`}
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {configs.length === 0 && !loading && linhas.length === 0 && agendaId && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nenhum laudador com valor configurado para esta agenda.
            Cadastre em <b>Equipe → Médicos → Laudo Terceiro</b>.
          </CardContent>
        </Card>
      )}
    </div>
  );
}