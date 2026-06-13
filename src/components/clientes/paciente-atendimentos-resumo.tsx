import { useEffect, useState } from "react";
import { Calendar, Stethoscope, Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { classifyAtendimento, type AtendCat } from "@/lib/atendimento-classify";

interface Props { pacienteId: string; clinicaId: string }

interface Row {
  id: string;
  data: string;
  descricao: string;
  valor: number;
  medico_id: string | null;
  agendamento_id: string | null;
  cat: AtendCat;
}

const fmtDt = (s: string) => new Date(s + "T00:00:00").toLocaleDateString("pt-BR");
const catLabel = (c: AtendCat) => c === "cartao_consulta" ? "Cartão" : c === "consulta_particular" ? "Particular" : "Exame";

export function PacienteAtendimentosResumo({ pacienteId, clinicaId }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [medicos, setMedicos] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("fin_lancamentos")
        .select("id, data, descricao, valor, medico_id, agendamento_id, tipo, status")
        .eq("clinica_id", clinicaId)
        .eq("paciente_id", pacienteId)
        .eq("tipo", "receita")
        .neq("status", "cancelado")
        .order("data", { ascending: false })
        .limit(5000);
      const raw = (data ?? []) as Array<{ id: string; data: string; descricao: string; valor: number; medico_id: string | null; agendamento_id: string | null }>;
      // dedupe: by agendamento_id when present; else by (data + descricao + medico)
      const seen = new Set<string>();
      const out: Row[] = [];
      for (const r of raw) {
        const cat = classifyAtendimento(r.descricao);
        if (!cat) continue;
        const key = r.agendamento_id ?? `${r.data}|${(r.descricao || "").trim().toUpperCase()}|${r.medico_id ?? ""}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ ...r, cat });
      }
      const medIds = Array.from(new Set(out.map(r => r.medico_id).filter(Boolean))) as string[];
      let nameMap: Record<string, string> = {};
      if (medIds.length > 0) {
        const { data: meds } = await supabase.from("medicos").select("id, nome").in("id", medIds);
        for (const m of (meds ?? []) as Array<{ id: string; nome: string }>) nameMap[m.id] = m.nome;
      }
      if (!active) return;
      setRows(out);
      setMedicos(nameMap);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [pacienteId, clinicaId]);

  // Agrupa por dia
  const porDia = new Map<string, Row[]>();
  for (const r of rows) {
    const arr = porDia.get(r.data) ?? [];
    arr.push(r); porDia.set(r.data, arr);
  }
  const dias = Array.from(porDia.entries()).sort((a, b) => b[0].localeCompare(a[0]));

  // Agrupa por médico
  const porMedico = new Map<string, { nome: string; qtd: number; valor: number; cartao: number; particular: number; exames: number }>();
  for (const r of rows) {
    const key = r.medico_id ?? "_sem";
    const entry = porMedico.get(key) ?? { nome: r.medico_id ? (medicos[r.medico_id] ?? "—") : "Sem médico", qtd: 0, valor: 0, cartao: 0, particular: 0, exames: 0 };
    entry.qtd++;
    entry.valor += Number(r.valor) || 0;
    if (r.cat === "cartao_consulta") entry.cartao++;
    else if (r.cat === "consulta_particular") entry.particular++;
    else entry.exames++;
    porMedico.set(key, entry);
  }
  const medicosLista = Array.from(porMedico.values()).sort((a, b) => b.qtd - a.qtd);

  const total = rows.length;
  const totalCartao = rows.filter(r => r.cat === "cartao_consulta").length;
  const totalPart = rows.filter(r => r.cat === "consulta_particular").length;
  const totalExames = rows.filter(r => r.cat === "exame").length;

  if (loading) {
    return <Card><CardContent className="py-6 text-sm text-muted-foreground">Carregando atendimentos…</CardContent></Card>;
  }
  if (total === 0) {
    return <Card><CardContent className="py-6 text-sm text-muted-foreground">Sem atendimentos registrados.</CardContent></Card>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4 text-primary" /> Resumo de atendimentos — {total} no total
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm grid grid-cols-2 md:grid-cols-4 gap-3">
          <div><span className="text-muted-foreground">Total:</span> <b>{total}</b></div>
          <div><span className="text-muted-foreground">Cartão:</span> <b>{totalCartao}</b></div>
          <div><span className="text-muted-foreground">Particulares:</span> <b>{totalPart}</b></div>
          <div><span className="text-muted-foreground">Exames:</span> <b>{totalExames}</b></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Stethoscope className="h-4 w-4 text-primary" /> Por médico
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Médico</TableHead>
                <TableHead className="text-right">Cartão</TableHead>
                <TableHead className="text-right">Particulares</TableHead>
                <TableHead className="text-right">Exames</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {medicosLista.map((m, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{m.nome}</TableCell>
                  <TableCell className="text-right">{m.cartao || "—"}</TableCell>
                  <TableCell className="text-right">{m.particular || "—"}</TableCell>
                  <TableCell className="text-right">{m.exames || "—"}</TableCell>
                  <TableCell className="text-right font-semibold">{m.qtd}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Calendar className="h-4 w-4 text-primary" /> Por dia ({dias.length} {dias.length === 1 ? "data" : "datas"})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 max-h-[500px] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Atendimentos</TableHead>
                <TableHead className="text-right">Qtd</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dias.map(([dia, lista]) => (
                <TableRow key={dia}>
                  <TableCell className="whitespace-nowrap font-medium">{fmtDt(dia)}</TableCell>
                  <TableCell className="text-xs space-y-0.5">
                    {lista.map(l => (
                      <div key={l.id} className="flex gap-2">
                        <span className="text-[10px] px-1 rounded bg-muted">{catLabel(l.cat)}</span>
                        <span className="text-muted-foreground">{l.medico_id ? (medicos[l.medico_id] ?? "—") : "—"}</span>
                        <span className="truncate">{(l.descricao || "").replace(/^.*?— /, "")}</span>
                      </div>
                    ))}
                  </TableCell>
                  <TableCell className="text-right font-semibold align-top">{lista.length}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}